import { WebSocketServer, type WebSocket } from "ws";
import * as http from "node:http";
import type { ScreenContext } from "@cellar/agent";

export interface LiveViewConfig {
  /** Port for the HTTP + WebSocket server (default: 6080). */
  port: number;
  /** Bind address (default: "127.0.0.1" for local-only). */
  host: string;
  /** Screen capture interval in ms (default: 200 = 5 FPS). */
  captureIntervalMs: number;
}

const DEFAULT_CONFIG: LiveViewConfig = {
  port: 6080,
  host: "127.0.0.1",
  captureIntervalMs: 200,
};

/** Callback to capture the screen (returns PNG buffer). */
export type CaptureCallback = () => Buffer;

/** Callback to get the current context. */
export type ContextCallback = () => ScreenContext;

/**
 * Live view server.
 * Serves a simple web UI that shows:
 * - The agent's screen (streamed as PNG frames over WebSocket)
 * - A real-time context feed (what the agent sees and decides)
 * - Controls: pause, take over, approve, stop
 *
 * In open source mode, binds to localhost only.
 */
export class LiveViewServer {
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private config: LiveViewConfig;
  private captureTimer: ReturnType<typeof setInterval> | null = null;

  /** Extraction history for the dashboard. */
  private extractionHistory: Array<Record<string, unknown>> = [];

  /** Execution history for the dashboard. */
  private executionHistory: Array<Record<string, unknown>> = [];

  constructor(config: Partial<LiveViewConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** SSE clients for the dashboard. */
  private sseClients: Set<http.ServerResponse> = new Set();

  /** Last snapshot for new SSE connections. */
  private lastSnapshot: Record<string, unknown> | null = null;

  /** Record an extraction snapshot for history. */
  recordExtraction(snapshot: Record<string, unknown>): void {
    this.extractionHistory.push({
      ...snapshot,
      _index: this.extractionHistory.length,
      _recordedAt: Date.now(),
    });
    // Keep last 100
    if (this.extractionHistory.length > 100) {
      this.extractionHistory = this.extractionHistory.slice(-100);
    }
  }

  /** Record an execution run for history. */
  recordExecution(run: Record<string, unknown>): void {
    this.executionHistory.push(run);
    if (this.executionHistory.length > 100) {
      this.executionHistory = this.executionHistory.slice(-100);
    }
  }

  /** Broadcast a snapshot to all SSE clients. */
  broadcastSSE(data: Record<string, unknown>): void {
    this.lastSnapshot = data;
    const payload = `data: ${JSON.stringify({ type: "snapshot", data })}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /** Start the live view server with capture and context callbacks. */
  start(captureScreen?: CaptureCallback, getContext?: ContextCallback): void {
    // HTTP server with REST API + WebSocket
    this.httpServer = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${this.config.port}`);

      // CORS headers for dashboard
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // SSE endpoint for live updates
      if (url.pathname === "/api/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        this.sseClients.add(res);
        if (this.lastSnapshot) {
          res.write(`data: ${JSON.stringify({ type: "snapshot", data: this.lastSnapshot })}\n\n`);
        }
        req.on("close", () => this.sseClients.delete(res));
        return;
      }

      // Stats endpoint (returns last snapshot)
      if (url.pathname === "/api/stats" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.lastSnapshot || {}));
        return;
      }

      // Extraction history
      if (url.pathname === "/api/extractions" && req.method === "GET") {
        const summary = this.extractionHistory.map((e, i) => ({
          index: i,
          url: e.url,
          timestamp: e._recordedAt,
          totalElements: (e.stats as Record<string, unknown>)?.totalElements ?? 0,
          extractionMs: (e.stats as Record<string, unknown>)?.extractionMs ?? 0,
          sources: {
            dom: ((e.sources as Record<string, Record<string, unknown>>)?.dom?.elements as unknown[])?.length ?? 0,
            a11y: ((e.sources as Record<string, Record<string, unknown>>)?.accessibility?.elements as unknown[])?.length ?? 0,
            vision: ((e.sources as Record<string, Record<string, unknown>>)?.vision?.elements as unknown[])?.length ?? 0,
            network: ((e.sources as Record<string, Record<string, unknown>>)?.network?.events as unknown[])?.length ?? 0,
          },
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(summary.reverse()));
        return;
      }

      // Single extraction detail
      const extractMatch = url.pathname.match(/^\/api\/extractions\/(\d+)$/);
      if (extractMatch && req.method === "GET") {
        const idx = parseInt(extractMatch[1]);
        const extraction = this.extractionHistory[idx];
        res.writeHead(extraction ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify(extraction || { error: "Not found" }));
        return;
      }

      // Execution history
      if (url.pathname === "/api/runs" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.executionHistory.slice().reverse()));
        return;
      }

      // Single run
      const runMatch = url.pathname.match(/^\/api\/runs\/(\d+)$/);
      if (runMatch && req.method === "GET") {
        const id = parseInt(runMatch[1]);
        const run = this.executionHistory.find((r) => r.id === id);
        res.writeHead(run ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify(run || { error: "Not found" }));
        return;
      }

      // Steps for a run
      const stepsMatch = url.pathname.match(/^\/api\/runs\/(\d+)\/steps$/);
      if (stepsMatch && req.method === "GET") {
        const id = parseInt(stepsMatch[1]);
        const run = this.executionHistory.find((r) => r.id === id);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(run ? (run.steps as unknown[]) || [] : []));
        return;
      }

      // Store summary
      if (url.pathname === "/api/store/summary" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          runs: this.executionHistory.length,
          extractions: this.extractionHistory.length,
          knowledge: 0,
          observations: 0,
        }));
        return;
      }

      // Default: serve embedded HTML
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(LIVE_VIEW_HTML);
    });

    // WebSocket server
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
      ws.on("message", (data) => this.handleMessage(ws, data.toString()));
    });

    this.httpServer.listen(this.config.port, this.config.host, () => {
      console.log(
        `Live view: http://${this.config.host}:${this.config.port}`
      );
    });

    // Start screen streaming if capture callback provided
    if (captureScreen) {
      this.captureTimer = setInterval(() => {
        try {
          const png = captureScreen();
          this.broadcastBinary(png);
        } catch {
          // Skip frame on error
        }
        if (getContext) {
          try {
            const ctx = getContext();
            this.broadcastContext(ctx);
          } catch {
            // Skip context on error
          }
        }
      }, this.config.captureIntervalMs);
    }
  }

  /** Stop the server. */
  stop(): void {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    for (const client of this.clients) {
      client.close();
    }
    this.wss?.close();
    this.httpServer?.close();
    this.wss = null;
    this.httpServer = null;
    this.clients.clear();
  }

  /** Broadcast a PNG frame to all connected clients. */
  private broadcastBinary(data: Buffer): void {
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  /** Broadcast a context update to all connected clients. */
  broadcastContext(context: ScreenContext): void {
    const message = JSON.stringify({ type: "context", data: context });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  /** Broadcast an agent intent/decision to all connected clients. */
  broadcastIntent(intent: string, details: Record<string, unknown>): void {
    const message = JSON.stringify({
      type: "intent",
      data: { intent, details },
    });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case "pause":
          this.broadcastIntent("paused", { by: "user" });
          break;
        case "resume":
          this.broadcastIntent("resumed", { by: "user" });
          break;
        case "takeover":
          this.broadcastIntent("takeover", { by: "user" });
          break;
        case "stop":
          this.broadcastIntent("stopped", { by: "user" });
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  }
}

/** Embedded HTML for the live view web UI. */
const LIVE_VIEW_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Dilipod Live View</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; }
    .header { padding: 12px 20px; background: #16213e; border-bottom: 1px solid #0f3460; display: flex; align-items: center; gap: 16px; }
    .header h1 { font-size: 18px; font-weight: 600; }
    .header .status { font-size: 13px; color: #4ecca3; }
    .main { display: flex; height: calc(100vh - 49px); }
    .screen-panel { flex: 1; display: flex; align-items: center; justify-content: center; background: #000; }
    .screen-panel img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .side-panel { width: 350px; border-left: 1px solid #0f3460; display: flex; flex-direction: column; }
    .controls { padding: 12px; display: flex; gap: 8px; border-bottom: 1px solid #0f3460; }
    .controls button { padding: 6px 14px; border: 1px solid #0f3460; background: #16213e; color: #e0e0e0; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .controls button:hover { background: #0f3460; }
    .controls button.danger { border-color: #e94560; color: #e94560; }
    .context-feed { flex: 1; overflow-y: auto; padding: 12px; font-size: 13px; font-family: monospace; }
    .context-feed .entry { margin-bottom: 8px; padding: 6px; border-radius: 4px; background: #16213e; }
    .context-feed .entry.intent { border-left: 3px solid #4ecca3; }
    .context-feed .confidence-high { color: #4ecca3; }
    .context-feed .confidence-medium { color: #e2b93d; }
    .context-feed .confidence-low { color: #e94560; }
    #no-connection { color: #e94560; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Dilipod Live View</h1>
    <span class="status" id="status">Connecting...</span>
  </div>
  <div class="main">
    <div class="screen-panel">
      <img id="screen" alt="Agent screen" />
    </div>
    <div class="side-panel">
      <div class="controls">
        <button onclick="send('pause')">Pause</button>
        <button onclick="send('resume')">Resume</button>
        <button onclick="send('takeover')">Take Over</button>
        <button class="danger" onclick="send('stop')">Stop</button>
      </div>
      <div class="context-feed" id="feed"></div>
    </div>
  </div>
  <script>
    const screen = document.getElementById('screen');
    const status = document.getElementById('status');
    const feed = document.getElementById('feed');
    let ws;

    function connect() {
      ws = new WebSocket('ws://' + location.host);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => { status.textContent = 'Connected'; status.style.color = '#4ecca3'; };
      ws.onclose = () => { status.textContent = 'Disconnected'; status.style.color = '#e94560'; setTimeout(connect, 2000); };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Binary = PNG frame
          const blob = new Blob([event.data], { type: 'image/png' });
          screen.src = URL.createObjectURL(blob);
        } else {
          // JSON = context or intent
          try {
            const msg = JSON.parse(event.data);
            addFeedEntry(msg);
          } catch {}
        }
      };
    }

    function send(type) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type })); }

    function addFeedEntry(msg) {
      const div = document.createElement('div');
      div.className = 'entry' + (msg.type === 'intent' ? ' intent' : '');
      if (msg.type === 'context') {
        const els = msg.data.elements || [];
        div.textContent = els.length + ' elements — ' + (msg.data.app || '?');
      } else if (msg.type === 'intent') {
        div.textContent = msg.data.intent + ': ' + JSON.stringify(msg.data.details);
      }
      feed.prepend(div);
      while (feed.children.length > 100) feed.removeChild(feed.lastChild);
    }

    connect();
  </script>
</body>
</html>`;
