export function isVisible(el: Element | null): boolean {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return el.getClientRects().length > 0;
}

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function normalizeWhitespace(text: string): string {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

export function collapseInlineWhitespace(text: string): string {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

export function escapeInlineCode(text: string): string {
  return String(text || "").replace(/`/g, "\\`");
}
