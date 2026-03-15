import { WebSocketServer, type WebSocket } from "ws";
import type { ScreenContext } from "@cellar/agent";

export interface LiveViewConfig {
  /** Port for the WebSocket server (default: 6080). */
  port: number;
  /** Bind address (default: "127.0.0.1" for local-only). */
  host: string;
}

const DEFAULT_CONFIG: LiveViewConfig = {
  port: 6080,
  host: "127.0.0.1",
};

/**
 * Live view server.
 * Streams the agent's screen (via noVNC/WebSocket) and a real-time context feed.
 * In open source mode, binds to localhost only.
 */
export class LiveViewServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private config: LiveViewConfig;

  constructor(config: Partial<LiveViewConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Start the live view server. */
  start(): void {
    this.wss = new WebSocketServer({
      port: this.config.port,
      host: this.config.host,
    });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
      ws.on("message", (data) => this.handleMessage(ws, data.toString()));
    });

    console.log(
      `Live view server started at ws://${this.config.host}:${this.config.port}`
    );
  }

  /** Stop the server. */
  stop(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.wss?.close();
    this.wss = null;
    this.clients.clear();
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
    const message = JSON.stringify({ type: "intent", data: { intent, details } });
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
          // TODO: Signal engine to pause
          break;
        case "resume":
          // TODO: Signal engine to resume
          break;
        case "takeover":
          // TODO: Lock CEL, hand over to user
          break;
        case "stop":
          // TODO: Signal engine to stop
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  }
}
