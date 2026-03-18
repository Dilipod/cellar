/**
 * DOM Extractor — walks the DOM tree including shadow DOMs and iframes.
 *
 * Runs a single Runtime.evaluate call inside the page context to extract
 * all interactive and landmark elements. This avoids N round-trips per
 * element (browser-use's bottleneck) by doing everything in one JS execution.
 *
 * License: MIT
 */

import type { Page, Frame } from "playwright";

/**
 * Raw DOM element descriptor — extracted in the browser context,
 * mapped to ContextElement by element-mapper.ts.
 */
export interface RawDOMElement {
  /** Unique incrementing ID assigned during walk. */
  backendNodeId: number;
  tag: string;
  /** DOM id attribute. */
  id: string;
  /** Computed ARIA role. */
  role: string;
  ariaLabel: string;
  ariaDescription: string;
  /** First 200 chars of innerText. */
  textContent: string;
  /** Current value (inputs, textareas, selects). */
  value: string;
  /** Input type attribute. */
  type: string;
  /** href for links. */
  href: string;
  /** Placeholder text. */
  placeholder: string;
  bounds: { x: number; y: number; width: number; height: number } | null;
  isVisible: boolean;
  isEnabled: boolean;
  isFocused: boolean;
  isChecked: boolean | null;
  isExpanded: boolean | null;
  isSelected: boolean;
  /** CEL ID of the parent element. */
  parentCelId: string;
  /** 0 = main document, 1+ = shadow DOM depth. */
  shadowDepth: number;
  /** Origin of the iframe this element is in, or null for main document. */
  iframeOrigin: string | null;
  /** Filtered attributes: data-*, aria-* only. */
  attributes: Record<string, string>;
}

/**
 * The JS function injected into the page to walk the DOM.
 * Returns a flat array of RawDOMElement descriptors.
 *
 * Key design: everything happens in a single evaluate() call —
 * no round-trips per element.
 */
const EXTRACTION_SCRIPT = `(() => {
  const MAX_TEXT_LENGTH = 200;
  const MAX_DEPTH = 20;
  const MAX_ELEMENTS = 5000;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD', 'BR', 'HR', 'WBR',
    'TEMPLATE', 'SLOT', 'BASE', 'COL', 'COLGROUP', 'SOURCE', 'TRACK', 'PARAM',
  ]);

  const INTERACTIVE_TAGS = new Set([
    'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY',
    'LABEL', 'OPTION', 'FIELDSET', 'LEGEND', 'OUTPUT', 'METER', 'PROGRESS',
  ]);

  const LANDMARK_TAGS = new Set([
    'NAV', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER', 'SECTION', 'ARTICLE',
    'FORM', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
    'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'DIALOG', 'MENU',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS',
    'IFRAME', 'SVG',
  ]);

  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'slider',
    'spinbutton', 'switch', 'tab', 'treeitem', 'searchbox', 'gridcell',
  ]);

  let nodeCounter = 0;
  const results = [];

  function isVisible(el) {
    if (el.offsetWidth === 0 && el.offsetHeight === 0 && !el.getClientRects().length) {
      return false;
    }
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }

  function getRole(el) {
    return el.getAttribute('role') || '';
  }

  function isInteractive(el, role) {
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
    if (el.getAttribute('contenteditable') === 'true') return true;
    const cursor = getComputedStyle(el).cursor;
    if (cursor === 'pointer') return true;
    return false;
  }

  function shouldExtract(el, role) {
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    if (LANDMARK_TAGS.has(el.tagName)) return true;
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    if (el.hasAttribute('role')) return true;
    if (el.hasAttribute('aria-label')) return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
    if (el.getAttribute('contenteditable') === 'true') return true;
    const cursor = getComputedStyle(el).cursor;
    if (cursor === 'pointer') return true;
    return false;
  }

  function getText(el) {
    // For inputs, don't use textContent
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return '';
    const text = (el.innerText || el.textContent || '').trim();
    return text.slice(0, MAX_TEXT_LENGTH);
  }

  function getFilteredAttributes(el) {
    const attrs = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') || attr.name.startsWith('aria-')) {
        attrs[attr.name] = attr.value.slice(0, 100);
      }
    }
    return attrs;
  }

  function getBounds(el) {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return null;
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    } catch {
      return null;
    }
  }

  function walkDOM(root, parentCelId, shadowDepth, iframeOrigin, depth) {
    if (depth > MAX_DEPTH || results.length >= MAX_ELEMENTS) return;

    const children = root.children || root.childNodes;
    for (let i = 0; i < children.length; i++) {
      if (results.length >= MAX_ELEMENTS) return;
      const el = children[i];
      if (el.nodeType !== 1) continue; // Element nodes only
      if (SKIP_TAGS.has(el.tagName)) continue;

      const role = getRole(el);
      const visible = isVisible(el);

      // Skip invisible subtrees — but still check shadow roots
      if (!visible && !el.shadowRoot) {
        continue;
      }

      const extract = visible && shouldExtract(el, role);
      let celId = parentCelId;

      if (extract) {
        nodeCounter++;
        const id = el.id
          ? 'dom:' + el.id
          : 'dom:' + el.tagName.toLowerCase() + ':' + nodeCounter;

        celId = id;

        const checked = el.type === 'checkbox' || el.type === 'radio'
          ? el.checked
          : el.getAttribute('aria-checked') === 'true'
            ? true
            : el.getAttribute('aria-checked') === 'false'
              ? false
              : null;

        const expanded = el.hasAttribute('aria-expanded')
          ? el.getAttribute('aria-expanded') === 'true'
          : el.tagName === 'DETAILS'
            ? el.open
            : null;

        results.push({
          backendNodeId: nodeCounter,
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          role: role,
          ariaLabel: el.getAttribute('aria-label') || '',
          ariaDescription: el.getAttribute('aria-description') || el.getAttribute('aria-describedby') || '',
          textContent: getText(el),
          value: el.value !== undefined ? String(el.value || '') : '',
          type: el.type || '',
          href: el.href || el.getAttribute('href') || '',
          placeholder: el.placeholder || '',
          bounds: getBounds(el),
          isVisible: visible,
          isEnabled: !el.disabled && !el.hasAttribute('aria-disabled'),
          isFocused: document.activeElement === el,
          isChecked: checked,
          isExpanded: expanded,
          isSelected: el.selected || el.getAttribute('aria-selected') === 'true',
          parentCelId: parentCelId,
          shadowDepth: shadowDepth,
          iframeOrigin: iframeOrigin,
          attributes: getFilteredAttributes(el),
        });
      }

      // Recurse into shadow DOM
      if (el.shadowRoot) {
        walkDOM(el.shadowRoot, celId, shadowDepth + 1, iframeOrigin, depth + 1);
      }

      // Recurse into same-origin iframes
      if (el.tagName === 'IFRAME') {
        try {
          const iframeDoc = el.contentDocument;
          if (iframeDoc) {
            const origin = el.src ? new URL(el.src, location.href).origin : location.origin;
            walkDOM(iframeDoc.body || iframeDoc, celId, shadowDepth, origin, depth + 1);
          }
        } catch {
          // Cross-origin iframe — can't access contentDocument
        }
      }

      // Recurse into children
      walkDOM(el, celId, shadowDepth, iframeOrigin, depth + 1);
    }
  }

  walkDOM(document.body || document.documentElement, '', 0, null, 0);
  return results;
})()`;

/**
 * Extract DOM elements from a page or frame.
 * Returns a flat array of raw element descriptors.
 */
export async function extractDOM(
  pageOrFrame: Page | Frame,
): Promise<RawDOMElement[]> {
  try {
    const elements = await pageOrFrame.evaluate(EXTRACTION_SCRIPT);
    return elements as RawDOMElement[];
  } catch (error) {
    // Page may have navigated, been closed, or thrown
    console.warn("DOM extraction failed:", error);
    return [];
  }
}

/**
 * Extract DOM from all frames (main + iframes).
 * Cross-origin iframes are accessed via Playwright's frame API.
 */
export async function extractDOMAllFrames(
  page: Page,
): Promise<RawDOMElement[]> {
  // Extract from main frame
  const mainElements = await extractDOM(page);

  // Extract from child frames (handles cross-origin)
  const frames = page.frames();
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    try {
      const url = frame.url();
      if (!url || url === "about:blank") continue;

      const origin = new URL(url).origin;
      const frameElements = await extractDOM(frame);

      // Prefix IDs to avoid collision and mark iframe origin
      for (const el of frameElements) {
        el.backendNodeId += mainElements.length + 10000;
        if (!el.id.startsWith("iframe:")) {
          const baseId = el.id || `dom:${el.tag}:${el.backendNodeId}`;
          el.id = `iframe:${origin}:${baseId}`;
        }
        el.iframeOrigin = el.iframeOrigin || origin;
      }

      mainElements.push(...frameElements);
    } catch {
      // Frame may have been removed or is inaccessible
    }
  }

  return mainElements;
}
