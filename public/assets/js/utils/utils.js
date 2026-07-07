// Updated 2026-07-07
/**
 * Frontend utility for HTML escaping and JSON parsing
 * Global utilities for safe data handling in frontend code
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for HTML
 */
const escapeHtml = (text) => {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Safely parse JSON with fallback to null on error
 * @param {string} value - JSON string to parse
 * @returns {any|null} Parsed object or null if invalid
 */
const parseJsonSafely = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

if (typeof window !== "undefined") {
  window.escapeHtml = escapeHtml;
  window.parseJsonSafely = parseJsonSafely;
}


