/**
 * Element Mapper — converts RawDOMElement[] into ContextElement[]
 * with confidence scoring calibrated to match the Rust merger.
 *
 * License: MIT
 */

import type { ContextElement, Bounds, ElementState } from "@cellar/agent";
import type { RawDOMElement } from "./dom-extractor.js";

// --- Confidence scoring constants ---
const BASE_CONFIDENCE = 0.7;
const BONUS_HAS_LABEL = 0.08;
const BONUS_HAS_BOUNDS = 0.06;
const BONUS_VISIBLE_ENABLED = 0.04;
const BONUS_ACTIONABLE = 0.04;
const BONUS_EXPLICIT_ROLE = 0.03;
const BONUS_MAIN_DOCUMENT = 0.03;

// --- ARIA role / tag → CEL element_type mapping ---

const ROLE_MAP: Record<string, string> = {
  button: "button",
  link: "link",
  textbox: "input",
  searchbox: "input",
  checkbox: "checkbox",
  radio: "radio_button",
  combobox: "combobox",
  listbox: "combobox",
  menuitem: "menu_item",
  menuitemcheckbox: "menu_item",
  menuitemradio: "menu_item",
  tab: "tab_item",
  slider: "slider",
  spinbutton: "input",
  switch: "checkbox",
  treeitem: "tree_item",
  option: "list_item",
  gridcell: "table_cell",
  dialog: "dialog",
  alertdialog: "dialog",
  menu: "menu",
  menubar: "menu",
  navigation: "toolbar",
  tablist: "group",
  toolbar: "toolbar",
  tree: "tree_view",
  grid: "table",
  table: "table",
  row: "table_row",
  rowheader: "table_cell",
  columnheader: "table_cell",
  cell: "table_cell",
  img: "image",
  figure: "image",
  status: "status_bar",
  progressbar: "slider",
  group: "group",
  region: "group",
  list: "list",
  listitem: "list_item",
  heading: "text",
  banner: "group",
  complementary: "group",
  contentinfo: "group",
  form: "group",
  main: "group",
  search: "group",
  article: "group",
};

const TAG_MAP: Record<string, string> = {
  button: "button",
  a: "link",
  input: "input",
  textarea: "input",
  select: "combobox",
  option: "list_item",
  details: "group",
  summary: "button",
  dialog: "dialog",
  nav: "toolbar",
  menu: "menu",
  table: "table",
  thead: "group",
  tbody: "group",
  tfoot: "group",
  tr: "table_row",
  th: "table_cell",
  td: "table_cell",
  ul: "list",
  ol: "list",
  li: "list_item",
  dl: "list",
  dt: "list_item",
  dd: "list_item",
  img: "image",
  svg: "image",
  video: "image",
  audio: "image",
  canvas: "image",
  h1: "text",
  h2: "text",
  h3: "text",
  h4: "text",
  h5: "text",
  h6: "text",
  label: "text",
  output: "text",
  meter: "slider",
  progress: "slider",
  form: "group",
  fieldset: "group",
  legend: "text",
  section: "group",
  article: "group",
  aside: "group",
  header: "group",
  footer: "group",
  main: "group",
  iframe: "group",
};

/** Input type → element_type overrides. */
const INPUT_TYPE_MAP: Record<string, string> = {
  submit: "button",
  reset: "button",
  button: "button",
  image: "button",
  checkbox: "checkbox",
  radio: "radio_button",
  range: "slider",
  file: "button",
};

const ACTIONABLE_TYPES = new Set([
  "button",
  "input",
  "link",
  "checkbox",
  "radio_button",
  "combobox",
  "slider",
  "menu_item",
  "tab_item",
  "tree_item",
]);

/** Map ARIA role / HTML tag to CEL element_type. */
function mapElementType(raw: RawDOMElement): string {
  // Explicit ARIA role takes precedence
  if (raw.role && ROLE_MAP[raw.role]) {
    return ROLE_MAP[raw.role];
  }

  // Input type overrides
  if (raw.tag === "input" && raw.type && INPUT_TYPE_MAP[raw.type]) {
    return INPUT_TYPE_MAP[raw.type];
  }

  // Tag-based mapping
  if (TAG_MAP[raw.tag]) {
    return TAG_MAP[raw.tag];
  }

  return "text";
}

/** Extract the best label from available sources. */
function extractLabel(raw: RawDOMElement): string | undefined {
  // Priority: aria-label > title > alt > placeholder > textContent > value
  if (raw.ariaLabel) return raw.ariaLabel;
  if (raw.attributes["aria-label"]) return raw.attributes["aria-label"];
  if (raw.attributes["title"]) return raw.attributes["title"];
  if (raw.tag === "img" && raw.attributes["alt"]) return raw.attributes["alt"];
  if (raw.placeholder) return raw.placeholder;
  if (raw.textContent) return raw.textContent;
  if (raw.value) return raw.value;
  return undefined;
}

/** Generate a unique CEL element ID. */
function generateId(raw: RawDOMElement): string {
  if (raw.iframeOrigin && !raw.id.startsWith("iframe:")) {
    const base = raw.id || `${raw.tag}:${raw.backendNodeId}`;
    return `iframe:${raw.iframeOrigin}:${base}`;
  }

  if (raw.shadowDepth > 0) {
    const base = raw.id || `${raw.tag}:${raw.backendNodeId}`;
    return `shadow:${raw.parentCelId || "root"}:${base}`;
  }

  if (raw.id) return `dom:${raw.id}`;
  return `dom:${raw.tag}:${raw.backendNodeId}`;
}

/** Determine available actions for an element type. */
function getActions(elementType: string, raw: RawDOMElement): string[] {
  switch (elementType) {
    case "button":
      return ["click", "press"];
    case "input":
      return ["activate", "set"];
    case "link":
      return ["click", "jump"];
    case "checkbox":
    case "radio_button":
      return ["toggle"];
    case "combobox":
      return ["select", "activate"];
    case "slider":
      return ["set"];
    case "menu_item":
    case "tab_item":
    case "tree_item":
    case "list_item":
      return ["click", "activate"];
    default:
      // If it has a click handler or pointer cursor, it's clickable
      if (raw.attributes["onclick"] || raw.attributes["tabindex"]) {
        return ["click"];
      }
      return [];
  }
}

/** Calculate confidence score for a DOM element. */
function calculateConfidence(
  raw: RawDOMElement,
  elementType: string,
  label: string | undefined,
): number {
  let confidence = BASE_CONFIDENCE;

  // +0.08 for having a label or visible text
  if (label && label.trim().length > 0) {
    confidence += BONUS_HAS_LABEL;
  }

  // +0.06 for having valid bounds
  if (raw.bounds && raw.bounds.width > 0 && raw.bounds.height > 0) {
    confidence += BONUS_HAS_BOUNDS;
  }

  // +0.04 for being visible and enabled
  if (raw.isVisible && raw.isEnabled) {
    confidence += BONUS_VISIBLE_ENABLED;
  }

  // +0.04 for being an actionable type
  if (ACTIONABLE_TYPES.has(elementType)) {
    confidence += BONUS_ACTIONABLE;
  }

  // +0.03 for having an explicit ARIA role
  if (raw.role) {
    confidence += BONUS_EXPLICIT_ROLE;
  }

  // +0.03 for being in the main document
  if (raw.shadowDepth === 0 && !raw.iframeOrigin) {
    confidence += BONUS_MAIN_DOCUMENT;
  }

  return Math.min(confidence, 0.98);
}

/** Map a single RawDOMElement to a ContextElement. */
function mapElement(raw: RawDOMElement): ContextElement {
  const elementType = mapElementType(raw);
  const label = extractLabel(raw);
  const confidence = calculateConfidence(raw, elementType, label);

  const bounds: Bounds | undefined = raw.bounds
    ? {
        x: raw.bounds.x,
        y: raw.bounds.y,
        width: raw.bounds.width,
        height: raw.bounds.height,
      }
    : undefined;

  const state: ElementState = {
    focused: raw.isFocused,
    enabled: raw.isEnabled,
    visible: raw.isVisible,
    selected: raw.isSelected,
    expanded: raw.isExpanded,
    checked: raw.isChecked,
  };

  const actions = getActions(elementType, raw);

  return {
    id: generateId(raw),
    label,
    description: raw.ariaDescription || undefined,
    element_type: elementType,
    value: raw.value || undefined,
    bounds,
    state,
    parent_id: raw.parentCelId || null,
    actions: actions.length > 0 ? actions : undefined,
    confidence,
    source: "native_api",
  };
}

/**
 * Map an array of RawDOMElements to ContextElements.
 * Sorts by confidence (highest first) to match the Rust merger convention.
 */
export function mapElements(rawElements: RawDOMElement[]): ContextElement[] {
  const mapped = rawElements.map(mapElement);

  // Sort by confidence descending (matches Rust merger output convention)
  mapped.sort((a, b) => b.confidence - a.confidence);

  return mapped;
}
