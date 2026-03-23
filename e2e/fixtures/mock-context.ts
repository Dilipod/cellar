/**
 * Realistic mock screen contexts for E2E testing.
 * These simulate what CEL's unified context API returns for real applications.
 */
import type { ScreenContext, ContextElement } from "@cellar/agent";

/** Create a 1x1 red PNG buffer (valid PNG for screen streaming tests). */
export function createTestPng(): Buffer {
  // Minimal valid PNG: 1x1 red pixel
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64",
  );
  return png;
}

/** Text editor with a file open, buttons, and an input field. */
export function editorContext(
  opts: { filename?: string; modified?: boolean } = {},
): ScreenContext {
  const filename = opts.filename ?? "main.py";
  const modified = opts.modified ?? false;
  return {
    app: "VS Code",
    window: `${filename}${modified ? " *" : ""} — VS Code`,
    // Confidence scoring: 0.60 base + 0.10 label + 0.10 bounds + 0.05 visible+enabled + 0.05 actionable = 0.90
    // Non-actionable (menu, tree_view, status_bar): 0.85. Actionable (button, input, link, tab_item): 0.90
    elements: [
      el("menu-bar", "Menu Bar", "menu", 0.85, "accessibility_tree", { x: 0, y: 0, width: 200, height: 30 }),
      el("menu-file", "File", "menu", 0.85, "accessibility_tree", { x: 0, y: 0, width: 40, height: 30 }, { parent_id: "menu-bar", actions: ["click"] }),
      el("menu-edit", "Edit", "menu", 0.85, "accessibility_tree", { x: 40, y: 0, width: 40, height: 30 }, { parent_id: "menu-bar", actions: ["click"] }),
      el("menu-view", "View", "menu", 0.85, "accessibility_tree", { x: 80, y: 0, width: 40, height: 30 }, { parent_id: "menu-bar", actions: ["click"] }),
      el("btn-run", "Run", "button", 0.90, "accessibility_tree", { x: 500, y: 0, width: 60, height: 30 }, { actions: ["click", "press"] }),
      el("btn-debug", "Debug", "button", 0.90, "accessibility_tree", { x: 560, y: 0, width: 60, height: 30 }, { actions: ["click", "press"] }),
      el("editor-area", filename, "input", 0.90, "accessibility_tree", { x: 0, y: 50, width: 1200, height: 700 }, { focused: true, actions: ["activate", "set"] }),
      el("sidebar-explorer", "Explorer", "tree_view", 0.85, "accessibility_tree", { x: 0, y: 50, width: 250, height: 700 }),
      el("tab-main", filename, "tab_item", 0.90, "accessibility_tree", { x: 250, y: 30, width: 120, height: 25 }, { parent_id: "editor-area", actions: ["click"] }),
      el("status-bar", "Ln 42, Col 12", "status_bar", 0.85, "accessibility_tree", { x: 0, y: 770, width: 1200, height: 30 }),
      el("terminal", "Terminal", "input", 0.90, "accessibility_tree", { x: 0, y: 550, width: 1200, height: 200 }, { actions: ["activate", "set"] }),
    ],
    timestamp_ms: Date.now(),
  };
}

/** Web browser with a form, links, and navigation. */
export function browserContext(
  opts: { url?: string; formVisible?: boolean } = {},
): ScreenContext {
  const url = opts.url ?? "https://example.com/login";
  const formVisible = opts.formVisible ?? true;
  const elements: ContextElement[] = [
    el("nav-bar", "Navigation", "toolbar", 0.85, "accessibility_tree", { x: 0, y: 0, width: 800, height: 40 }),
    el("nav-back", "Back", "button", 0.90, "accessibility_tree", { x: 10, y: 5, width: 30, height: 30 }, { parent_id: "nav-bar", actions: ["click", "press"] }),
    el("nav-forward", "Forward", "button", 0.90, "accessibility_tree", { x: 45, y: 5, width: 30, height: 30 }, { parent_id: "nav-bar", actions: ["click", "press"] }),
    el("url-bar", url, "input", 0.90, "accessibility_tree", { x: 100, y: 5, width: 600, height: 30 }, { parent_id: "nav-bar", focused: true, actions: ["activate", "set"] }),
    el("link-home", "Home", "link", 0.90, "accessibility_tree", { x: 50, y: 60, width: 60, height: 20 }, { actions: ["jump"] }),
    el("link-about", "About", "link", 0.90, "accessibility_tree", { x: 130, y: 60, width: 60, height: 20 }, { actions: ["jump"] }),
    el("link-contact", "Contact", "link", 0.90, "accessibility_tree", { x: 210, y: 60, width: 80, height: 20 }, { actions: ["jump"] }),
  ];

  if (formVisible) {
    elements.push(
      el("form-login", "Login Form", "group", 0.85, "accessibility_tree", { x: 400, y: 180, width: 300, height: 240 }),
      el("input-username", "Username", "input", 0.90, "accessibility_tree", { x: 400, y: 200, width: 300, height: 35 }, { parent_id: "form-login", actions: ["activate", "set"] }),
      el("input-password", "Password", "input", 0.90, "accessibility_tree", { x: 400, y: 250, width: 300, height: 35 }, { parent_id: "form-login", actions: ["activate", "set"] }),
      el("btn-login", "Log In", "button", 0.90, "accessibility_tree", { x: 400, y: 300, width: 300, height: 40 }, { parent_id: "form-login", actions: ["click", "press"] }),
      el("link-forgot", "Forgot password?", "link", 0.90, "accessibility_tree", { x: 400, y: 350, width: 150, height: 20 }, { parent_id: "form-login", actions: ["jump"] }),
      el("chk-remember", "Remember me", "checkbox", 0.90, "accessibility_tree", { x: 400, y: 380, width: 150, height: 20 }, { parent_id: "form-login", actions: ["toggle"] }),
    );
  }

  return {
    app: "Firefox",
    window: `Login — Firefox`,
    elements,
    timestamp_ms: Date.now(),
  };
}

/** Sparse context — few elements, should trigger vision fallback. */
export function sparseContext(): ScreenContext {
  return {
    app: "Legacy App",
    window: "MainForm",
    elements: [
      el("title", "Legacy Application", "text", 0.85, "accessibility_tree", { x: 0, y: 0, width: 400, height: 30 }),
    ],
    timestamp_ms: Date.now(),
  };
}

/** Vision-enriched context — what gets returned after vision fallback triggers. */
export function visionEnrichedContext(): ScreenContext {
  return {
    app: "Legacy App",
    window: "MainForm",
    elements: [
      el("title", "Legacy Application", "text", 0.85, "accessibility_tree", { x: 0, y: 0, width: 400, height: 30 }),
      el("vision:0", "Submit", "button", 0.82, "vision", { x: 200, y: 400, width: 100, height: 35 }),
      el("vision:1", "Cancel", "button", 0.78, "vision", { x: 320, y: 400, width: 100, height: 35 }),
      el("vision:2", "Name", "input", 0.75, "vision", { x: 100, y: 200, width: 300, height: 30 }),
      el("vision:3", "Email", "input", 0.73, "vision", { x: 100, y: 250, width: 300, height: 30 }),
    ],
    timestamp_ms: Date.now(),
  };
}

/** Empty context — no app detected. */
export function emptyContext(): ScreenContext {
  return { app: "", window: "", elements: [], timestamp_ms: Date.now() };
}

/** SAP GUI context — enterprise app with adapter elements. */
export function sapContext(): ScreenContext {
  return {
    app: "SAP Logon",
    window: "SAP Easy Access",
    elements: [
      // Native API elements get 0.98 confidence (direct COM/API access, near-perfect)
      el("sap-menu", "Menu", "menu", 0.98, "native_api", { x: 0, y: 0, width: 80, height: 25 }),
      el("sap-tcode", "Transaction Code", "input", 0.98, "native_api", { x: 100, y: 30, width: 200, height: 25 }),
      el("sap-execute", "Execute", "button", 0.98, "native_api", { x: 310, y: 30, width: 60, height: 25 }),
      el("sap-tree", "SAP Menu", "tree_view", 0.98, "native_api", { x: 0, y: 60, width: 300, height: 600 }),
      el("sap-favorites", "Favorites", "tree_item", 0.98, "native_api", { x: 20, y: 80, width: 200, height: 20 }),
      el("sap-status", "System: PRD | Client: 100", "status_bar", 0.98, "native_api", { x: 0, y: 680, width: 800, height: 25 }),
    ],
    timestamp_ms: Date.now(),
  };
}

// --- Workflow fixtures ---

export function loginWorkflow() {
  return {
    name: "web-login",
    description: "Log into the web application",
    app: "Firefox",
    version: "1.0.0",
    steps: [
      { id: "s1", description: "Click username field", action: { type: "click" as const, target: "input-username" } },
      { id: "s2", description: "Type username", action: { type: "type" as const, target: "input-username", text: "admin" } },
      { id: "s3", description: "Click password field", action: { type: "click" as const, target: "input-password" } },
      { id: "s4", description: "Type password", action: { type: "type" as const, target: "input-password", text: "secret" } },
      { id: "s5", description: "Click login button", action: { type: "click" as const, target: "btn-login" }, min_confidence: 0.8 },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function multiStepWorkflow() {
  return {
    name: "sap-transaction",
    description: "Execute an SAP transaction",
    app: "SAP Logon",
    version: "1.0.0",
    steps: [
      { id: "s1", description: "Enter transaction code", action: { type: "click" as const, target: "sap-tcode" } },
      { id: "s2", description: "Type transaction", action: { type: "type" as const, target: "sap-tcode", text: "VA01" } },
      { id: "s3", description: "Execute transaction", action: { type: "click" as const, target: "sap-execute" } },
      { id: "s4", description: "Wait for screen", action: { type: "wait" as const, ms: 2000 } },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function failingWorkflow() {
  return {
    name: "fails-at-step-2",
    description: "Workflow that fails on the second step",
    app: "Test",
    version: "1.0.0",
    steps: [
      { id: "s1", description: "Step one (succeeds)", action: { type: "click" as const, target: "btn-ok" } },
      { id: "s2", description: "Step two (fails)", action: { type: "click" as const, target: "nonexistent" } },
      { id: "s3", description: "Step three (never reached)", action: { type: "click" as const, target: "btn-done" } },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// --- Helpers ---

type Source = ContextElement["source"];

function el(
  id: string,
  label: string,
  element_type: string,
  confidence: number,
  source: Source,
  bounds?: { x: number; y: number; width: number; height: number },
  opts?: { parent_id?: string; actions?: string[]; focused?: boolean },
): ContextElement {
  return {
    id,
    label,
    element_type,
    confidence,
    source,
    bounds,
    description: undefined,
    state: {
      focused: opts?.focused ?? false,
      enabled: true,
      visible: true,
      selected: false,
    },
    parent_id: opts?.parent_id,
    actions: opts?.actions,
  };
}
