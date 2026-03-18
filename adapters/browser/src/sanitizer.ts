/**
 * Sanitizer — prevents prompt injection by cleaning element labels and values.
 *
 * Runs as a post-processing step on every ContextElement[] before
 * it leaves the browser adapter.
 *
 * License: MIT
 */

import type { ContextElement } from "@cellar/agent";

const MAX_LABEL_LENGTH = 200;
const MAX_VALUE_LENGTH = 500;
const SUSPICIOUS_CONFIDENCE_PENALTY = 0.1;

/** Known LLM instruction injection patterns. */
const INJECTION_PATTERNS = [
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /<<SYS>>/gi,
  /<<\/SYS>>/gi,
  /<\/s>/gi,
  /\[SYSTEM\]/gi,
  /\[\/SYSTEM\]/gi,
  /```\s*(?:system|ignore|override|forget|disregard)/gi,
  /IMPORTANT:\s*ignore\s*(?:previous|above|all)/gi,
  /you\s+are\s+now\s+(?:a|an|in)\s+/gi,
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/gi,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)/gi,
];

/** Strip control characters except tab and newline. */
function stripControlChars(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/** Collapse multiple whitespace characters into single spaces. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Check if text contains injection patterns. Returns true if suspicious. */
function containsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/** Remove injection patterns from text. */
function removeInjectionPatterns(text: string): string {
  let cleaned = text;
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned;
}

/** Escape backticks to prevent markdown code injection. */
function escapeBackticks(text: string): string {
  return text.replace(/`/g, "'");
}

/** Sanitize a single text field. Returns [cleanedText, isSuspicious]. */
function sanitizeText(
  text: string,
  maxLength: number,
): [string, boolean] {
  let suspicious = false;

  // Check for injection before cleaning
  if (containsInjection(text)) {
    suspicious = true;
  }

  let cleaned = stripControlChars(text);
  cleaned = removeInjectionPatterns(cleaned);
  cleaned = collapseWhitespace(cleaned);
  cleaned = escapeBackticks(cleaned);

  // Truncate
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength - 3) + "...";
  }

  return [cleaned, suspicious];
}

/** Sanitize an array of ContextElements in-place. */
export function sanitizeElements(elements: ContextElement[]): ContextElement[] {
  for (const el of elements) {
    let suspicious = false;

    if (el.label) {
      const [cleaned, isSuspicious] = sanitizeText(el.label, MAX_LABEL_LENGTH);
      el.label = cleaned || undefined;
      suspicious = suspicious || isSuspicious;
    }

    if (el.value) {
      const [cleaned, isSuspicious] = sanitizeText(el.value, MAX_VALUE_LENGTH);
      el.value = cleaned || undefined;
      suspicious = suspicious || isSuspicious;
    }

    if (el.description) {
      const [cleaned, isSuspicious] = sanitizeText(
        el.description,
        MAX_LABEL_LENGTH,
      );
      el.description = cleaned || undefined;
      suspicious = suspicious || isSuspicious;
    }

    if (suspicious) {
      el.confidence = Math.max(0, el.confidence - SUSPICIOUS_CONFIDENCE_PENALTY);
    }
  }

  return elements;
}
