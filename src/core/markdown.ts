import { collapseInlineWhitespace, escapeInlineCode, normalizeWhitespace } from "./dom";

function renderCodeInline(node: Node): string {
  let out = "";

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += collapseInlineWhitespace(child.textContent || "");
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "sup") {
      out += "^" + renderCodeInline(child).trim();
      continue;
    }

    if (tag === "sub") {
      out += "_" + renderCodeInline(child).trim();
      continue;
    }

    out += renderCodeInline(child);
  }

  return out;
}

function renderInline(node: Node): string {
  if (!node) return "";

  if (node.nodeType === Node.TEXT_NODE) {
    return collapseInlineWhitespace(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") return "\n";
  if (tag === "code") {
    return "`" + escapeInlineCode(renderCodeInline(node).trim()) + "`";
  }
  if (tag === "sup") {
    const text = renderChildrenInline(node).trim();
    return text ? `^${text}` : "";
  }

  if (tag === "sub") {
    const text = renderChildrenInline(node).trim();
    return text ? `~${text}~` : "";
  }
  if (tag === "strong" || tag === "b") {
    const text = renderChildrenInline(node).trim();
    if (!text) return "";
    if (text.includes("`") || text.includes("**") || text.includes("*")) {
      return text;
    }
    return `**${text}**`;
  }

  if (tag === "em" || tag === "i") {
    const text = renderChildrenInline(node).trim();
    if (!text) return "";
    if (text.includes("`") || text.includes("**") || text.includes("*")) {
      return text;
    }
    return `*${text}*`;
  }
  if (tag === "a") {
    const text = renderChildrenInline(node).trim() || (node.textContent || "").trim();
    const href = el.getAttribute("href") || "";
    if (!href) return text;
    const fullHref = href.startsWith("http") ? href : new URL(href, location.origin).href;
    return `[${text}](${fullHref})`;
  }
  if (tag === "img") {
    const alt = (el.getAttribute("alt") || "").trim();
    const src = el.getAttribute("src") || "";
    if (!src) return alt || "";
    const fullSrc = src.startsWith("http") ? src : new URL(src, location.origin).href;
    return `![${alt}](${fullSrc})`;
  }

  return renderChildrenInline(node);
}

function renderChildrenInline(node: Node): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    out += renderInline(child);
  }
  return out.replace(/ *\n */g, "\n");
}

function renderList(listEl: HTMLElement, depth: number = 0): string {
  const ordered = listEl.tagName.toLowerCase() === "ol";
  const items = Array.from(listEl.children).filter(
    (el) => el.tagName && el.tagName.toLowerCase() === "li"
  );

  let out = "";
  items.forEach((li, index) => {
    let main = "";
    let nested = "";

    for (const child of Array.from(li.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        ["ul", "ol"].includes((child as HTMLElement).tagName.toLowerCase())
      ) {
        nested += renderList(child as HTMLElement, depth + 1);
      } else {
        main += renderNode(child, depth + 1, true);
      }
    }

    const prefix = ordered ? `${index + 1}. ` : "- ";
    const indent = "  ".repeat(depth);
    out += `${indent}${prefix}${main.trim()}\n`;
    if (nested.trim()) out += nested;
  });

  return out + "\n";
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"))
    .map((tr) =>
      Array.from(tr.children)
        .filter((cell) => /^(td|th)$/i.test(cell.tagName))
        .map((cell) => renderChildrenInline(cell).replace(/\|/g, "\\|").trim())
    )
    .filter((row) => row.length);

  if (!rows.length) return "";

  const colCount = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) =>
    Array.from({ length: colCount }, (_, i) => row[i] || "")
  );

  const header = normalized[0];
  const separator = Array.from({ length: colCount }, () => "---");

  const lines = [`| ${header.join(" | ")} |`, `| ${separator.join(" | ")} |`];

  normalized.slice(1).forEach((row) => {
    lines.push(`| ${row.join(" | ")} |`);
  });

  return lines.join("\n");
}

function renderBlockquote(node: Node, depth: number = 0): string {
  const inner = renderChildren(node, depth).trim();
  if (!inner) return "";

  return (
    inner
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n") + "\n\n"
  );
}

export function renderNode(node: Node, depth: number = 0, inlineOnly: boolean = false): string {
  if (!node) return "";

  if (node.nodeType === Node.TEXT_NODE) {
    return collapseInlineWhitespace(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (inlineOnly) {
    return renderInline(node);
  }

  if (tag === "pre") {
    const code = (el.innerText || el.textContent || "").replace(/\n+$/, "");
    return code ? `\n\`\`\`\n${code}\n\`\`\`\n\n` : "";
  }

  if (tag === "code") {
    return "`" + escapeInlineCode((el.textContent || "").trim()) + "`";
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    const text = renderChildrenInline(node).trim();
    return text ? `\n${"#".repeat(level)} ${text}\n\n` : "";
  }

  if (tag === "p") {
    const text = renderChildrenInline(node).trim();
    return text ? `\n${text}\n\n` : "";
  }

  if (tag === "ul" || tag === "ol") {
    return "\n" + renderList(el, depth);
  }

  if (tag === "blockquote") {
    return "\n" + renderBlockquote(node, depth);
  }

  if (tag === "table") {
    const text = tableToMarkdown(el);
    return text ? `\n${text}\n\n` : "";
  }

  if (tag === "hr") {
    return "\n---\n\n";
  }

  if (tag === "br") {
    return "\n";
  }

  return renderChildren(node, depth);
}

export function renderChildren(node: Node, depth: number = 0): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    out += renderNode(child, depth);
  }
  return out;
}

export function cleanupMarkdown(markdown: string): string {
  let text = normalizeWhitespace(markdown);

  text = text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/`(\d{2,})(\d)`/g, (m, a, b) => {
      if (/^10$/.test(a)) return "`10^" + b + "`";
      return m;
    })
    .replace(/`O\(([^`()]*)n(\d)\)`/g, "`O($1n^$2)`")
    .replace(/\*\*\*`([^`]+)`\*/g, "`$1`")
    .replace(/\*`([^`]+)`\*/g, "`$1`")
    .replace(/\*\*`([^`]+)`\*\*/g, "`$1`")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");

  return text.trim();
}
