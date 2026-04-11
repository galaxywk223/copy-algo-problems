import { copyText } from "../core/clipboard";
import { isVisible, normalizeWhitespace, collapseInlineWhitespace, unique } from "../core/dom";
import { renderChildren, cleanupMarkdown } from "../core/markdown";
import { createCopyButton, showToast } from "../core/ui";
import type { PlatformHandler } from "./index";

const BUTTON_ID = "cap-copy-helper-button";
const APP_FLAG = "__CAP_COPY_HELPER_INSTALLED__";

function isProblemPage() {
  return /\/problems\/[^/]+(?:\/.*)?$/.test(location.pathname);
}

function getProblemSlug() {
  const parts = location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("problems");
  return idx >= 0 ? parts[idx + 1] || "" : "";
}

function getCanonicalProblemUrl() {
  const slug = getProblemSlug();
  if (!slug) return location.href.split("?")[0].split("#")[0];
  return `${location.origin}/problems/${slug}/`;
}

function findTitleElement(): HTMLElement | null {
  const selectors = [
    '[data-cy="question-title"]',
    "div.text-title-large",
    "h1",
  ];

  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el && isVisible(el) && el.textContent?.trim()) {
      return el;
    }
  }

  return null;
}

function getProblemTitle(): string {
  const titleEl = findTitleElement();
  if (titleEl) {
    const text = titleEl.textContent?.trim();
    if (text) return text;
  }

  const meta = document.querySelector('meta[property="og:title"]');
  if (meta) {
    const content = (meta.getAttribute("content") || "").trim();
    if (content) {
      return content.replace(/\s*-\s*LeetCode.*$/i, "").trim();
    }
  }

  const title = document.title.replace(/\s*-\s*LeetCode.*$/i, "").trim();
  if (title) return title;

  return "未识别到题目标题";
}

function getDifficulty(): string {
  const difficultyWords = ["简单", "中等", "困难", "Easy", "Medium", "Hard"];
  const titleEl = findTitleElement();

  const searchRoots: Element[] = [];
  if (titleEl) {
    let p: Element | null = titleEl.parentElement;
    let depth = 0;
    while (p && depth < 5) {
      searchRoots.push(p);
      p = p.parentElement;
      depth += 1;
    }
  }
  searchRoots.push(document.body);

  for (const root of searchRoots) {
    const nodes = root.querySelectorAll("span, div, a, button");
    for (const el of Array.from(nodes)) {
      if (!isVisible(el)) continue;
      const text = (el.textContent || "").trim();
      if (difficultyWords.includes(text)) return text;
    }
  }

  return "";
}

function looksLikeTopicTag(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;

  if (t.length > 12) return false;
  if (/^\d+\.\s/.test(t)) return false;

  if (/^[\d,.]+([kKmMbBwW万亿])?$/.test(t)) return false;
  if (/^[\/%\.\d\s]+$/.test(t)) return false;
  if (/^\d+(\.\d+)?%$/.test(t)) return false;

  if (/[A-Za-z\u4e00-\u9fa5]+\d+$/.test(t)) return false;

  const blocked = new Set([
    "相关标签",
    "Related Topics",
    "标签",
    "Topics",
    "相关企业",
    "Companies",
    "简单",
    "中等",
    "困难",
    "Easy",
    "Medium",
    "Hard",
    "收藏",
    "分享",
  ]);
  if (blocked.has(t)) return false;

  if (/\bI{1,3}\b$/.test(t)) return false;
  if (/[：:]/.test(t)) return false;
  if (/\s-\s/.test(t)) return false;

  return true;
}

function getTags(): string[] {
  const headingWords = ["相关标签", "Related Topics", "标签", "Topics"];
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h2, h3, h4, h5, div, span"));

  for (const heading of headings) {
    const headingText = (heading.textContent || "").trim();
    if (!headingWords.includes(headingText)) continue;

    const scope = heading.parentElement || heading.closest("section, div") || heading;
    if (!scope) continue;

    const candidates = Array.from(scope.querySelectorAll<HTMLElement>("a, button, span"));
    const tags: string[] = [];

    for (const el of candidates) {
      if (!isVisible(el)) continue;

      const text = (el.textContent || "").trim();
      if (!looksLikeTopicTag(text)) continue;

      const href = el.getAttribute("href") || "";
      if (href && /\/problems\//.test(href)) continue;
      if (href && /company|interview|study-plan/i.test(href)) continue;

      if (el.tagName.toLowerCase() === "a") {
        if (!/tag|topic/i.test(href) && href !== "") continue;
      }

      tags.push(text);
    }

    const cleaned = unique(tags).slice(0, 6);
    if (cleaned.length) return cleaned;
  }

  return [];
}

function scoreDescriptionNode(el: HTMLElement): number {
  if (!el || !isVisible(el)) return -Infinity;

  const text = normalizeWhitespace(el.innerText || "").trim();
  if (text.length < 80) return -Infinity;

  let score = text.length;

  const keywords = [
    "示例 1",
    "示例1",
    "Example 1",
    "Example1",
    "约束",
    "Constraints",
    "提示",
    "Hints",
    "输入",
    "Input",
    "输出",
    "Output",
  ];

  for (const keyword of keywords) {
    if (text.includes(keyword)) score += 800;
  }

  if (text.includes("提交记录")) score -= 1500;
  if (text.includes("Submissions")) score -= 1500;
  if (text.includes("题解")) score -= 1500;
  if (text.includes("Solutions")) score -= 1500;

  const blockCount = el.querySelectorAll("p, pre, code, ul, ol, li, table, h1, h2, h3, h4").length;
  score += blockCount * 20;

  return score;
}

function getProblemContentNode(): HTMLElement | null {
  const directSelectors = [
    '[data-track-load="description_content"]',
    '[data-cy="question-content"]',
    'div[data-key="description-content"]',
    "article",
  ];

  for (const selector of directSelectors) {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const node of nodes) {
      if (scoreDescriptionNode(node) > 500) {
        return node;
      }
    }
  }

  const titleEl = findTitleElement();
  if (titleEl) {
    let current: HTMLElement | null = titleEl.parentElement;
    let depth = 0;
    let bestNode: HTMLElement | null = null;
    let bestScore = -Infinity;

    while (current && depth < 6) {
      const candidates = Array.from(current.querySelectorAll<HTMLElement>("div, section, article"));
      for (const node of candidates) {
        const score = scoreDescriptionNode(node);
        if (score > bestScore) {
          bestScore = score;
          bestNode = node;
        }
      }
      current = current.parentElement;
      depth += 1;
    }

    if (bestNode) return bestNode;
  }

  const main = document.querySelector<HTMLElement>("main");
  if (main) {
    let bestNode: HTMLElement | null = null;
    let bestScore = -Infinity;
    const candidates = Array.from(main.querySelectorAll<HTMLElement>("div, section, article"));
    for (const node of candidates) {
      const score = scoreDescriptionNode(node);
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }
    if (bestNode) return bestNode;
  }

  return null;
}

function cleanupDescriptionNode(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;

  const removeSelectors = [
    "button",
    "svg",
    "style",
    "script",
    "noscript",
    "form",
    "textarea",
    "input",
    "video",
    "canvas",
  ];

  clone.querySelectorAll(removeSelectors.join(",")).forEach((el) => el.remove());
  clone.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());

  return clone;
}

function getProblemDescriptionMarkdown(): string {
  const contentNode = getProblemContentNode();
  if (!contentNode) return "";

  const cleaned = cleanupDescriptionNode(contentNode);
  const markdown = cleanupMarkdown(renderChildren(cleaned));

  const title = getProblemTitle();
  const titleRegex = new RegExp(
    "^#{1,6}\\s*" + title.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\s*\\n?",
    "i"
  );

  return markdown.replace(titleRegex, "").trim();
}

function sanitizeCodeText(text: string): string {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*\n/, "")
    .replace(/\n\s*$/, "");
}

function looksLikeCode(text: string): boolean {
  const code = sanitizeCodeText(text);
  if (code.length < 12) return false;
  if (/\n/.test(code)) return true;

  return /[{}();=<>[\]]|=>|\b(class|def|function|return|public|private|static|void|int|string|boolean|vector|ListNode|TreeNode)\b/.test(
    code
  );
}

function scoreCodeCandidate(text: string): number {
  const code = sanitizeCodeText(text);
  if (!looksLikeCode(code)) return -Infinity;

  let score = code.length;
  score += (code.match(/\n/g)?.length || 0) * 40;

  if (/\b(class|function|def|return|public|private|static)\b/.test(code)) score += 300;
  if (/\b(ListNode|TreeNode|Solution)\b/.test(code)) score += 400;
  if (/[{}]/.test(code)) score += 120;
  if (/^\s{2,}\S/m.test(code)) score += 80;
  if (/Input|Output|Example|Constraints|提示|示例|约束/.test(code)) score -= 1500;

  return score;
}

function collectCodeCandidate(candidates: string[], text: string | null | undefined) {
  const code = sanitizeCodeText(text || "");
  if (!code || !looksLikeCode(code)) return;
  candidates.push(code);
}

function getCodeTabsetRoot(): HTMLElement | null {
  const directSelectors = ["#code_tabbar_outer", "#code_tab"];

  for (const selector of directSelectors) {
    const el = document.querySelector<HTMLElement>(selector);
    const root = el?.closest<HTMLElement>(".flexlayout__tabset");
    if (root && isVisible(root)) {
      return root;
    }
  }

  const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"], button, div'));
  for (const tab of tabs) {
    if (!isVisible(tab)) continue;
    const text = (tab.textContent || "").trim();
    if (text !== "代码" && text !== "Code") continue;

    const root = tab.closest<HTMLElement>(".flexlayout__tabset");
    if (root && isVisible(root)) {
      return root;
    }
  }

  return null;
}

function getCodeSearchRoots(): HTMLElement[] {
  const roots: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const pushRoot = (root: HTMLElement | null) => {
    if (!root || seen.has(root)) return;
    seen.add(root);
    roots.push(root);
  };

  pushRoot(getCodeTabsetRoot());

  const editorSelectors = [
    ".monaco-editor",
    ".cm-editor",
    ".CodeMirror",
    '[class*="monaco-editor"]',
    '[class*="CodeMirror"]',
  ];

  for (const selector of editorSelectors) {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      pushRoot(node.closest<HTMLElement>(".flexlayout__tabset") || node);
    }
  }

  return roots;
}

function extractMonacoCode(root: ParentNode): string {
  const candidates: string[] = [];

  const textModels = Array.from(
    root.querySelectorAll<HTMLTextAreaElement>('textarea, textarea.inputarea, textarea[aria-label*="Editor"]')
  );
  for (const textarea of textModels) {
    collectCodeCandidate(candidates, textarea.value);
  }

  const renderedBlocks = Array.from(
    root.querySelectorAll<HTMLElement>(
      ".monaco-editor .view-lines, .monaco-editor .view-line, .monaco-editor [data-mprt='6']"
    )
  );
  for (const block of renderedBlocks) {
    if (!isVisible(block)) continue;
    collectCodeCandidate(candidates, block.innerText || block.textContent);
  }

  if (!candidates.length) return "";

  return candidates.sort((a, b) => scoreCodeCandidate(b) - scoreCodeCandidate(a))[0] || "";
}

function extractCodeMirrorCode(root: ParentNode): string {
  const candidates: string[] = [];

  const contentEls = Array.from(
    root.querySelectorAll<HTMLElement>(".cm-editor .cm-content, .CodeMirror-code, .CodeMirror-lines")
  );
  for (const el of contentEls) {
    if (!isVisible(el)) continue;
    collectCodeCandidate(candidates, el.innerText || el.textContent);
  }

  if (!candidates.length) return "";

  return candidates.sort((a, b) => scoreCodeCandidate(b) - scoreCodeCandidate(a))[0] || "";
}

function extractGenericEditorCode(root: ParentNode): string {
  const candidates: string[] = [];

  const genericSelectors = [
    '[contenteditable="true"]',
    "textarea",
    "pre",
    "code",
  ];

  for (const selector of genericSelectors) {
    const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
    for (const el of elements) {
      if (selector !== "textarea" && !isVisible(el)) continue;

      const text =
        el instanceof HTMLTextAreaElement ? el.value : el.innerText || el.textContent || "";
      collectCodeCandidate(candidates, text);
    }
  }

  if (!candidates.length) return "";

  return candidates.sort((a, b) => scoreCodeCandidate(b) - scoreCodeCandidate(a))[0] || "";
}

function getDefaultCodeMarkdown(): string {
  const roots = getCodeSearchRoots();
  if (!roots.length) return "";

  const candidates: string[] = [];

  for (const root of roots) {
    collectCodeCandidate(candidates, extractMonacoCode(root));
    collectCodeCandidate(candidates, extractCodeMirrorCode(root));
    collectCodeCandidate(candidates, extractGenericEditorCode(root));
  }

  if (!candidates.length) return "";

  const code = candidates.sort((a, b) => scoreCodeCandidate(b) - scoreCodeCandidate(a))[0] || "";
  if (!code) return "";

  return `\`\`\`\n${code}\n\`\`\``;
}

function findToolbarContainer(): HTMLElement | null {
  const titleEl = findTitleElement();
  if (!titleEl) return null;

  let current: HTMLElement | null = titleEl.parentElement;
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
    const candidates = current.querySelectorAll<HTMLElement>("div.flex.gap-1, div.flex.flex-wrap.gap-1");

    for (const el of Array.from(candidates)) {
      if (!isVisible(el)) continue;
      if (!el.children.length) continue;

      const text = (el.textContent || "").trim();

      if (
        text.includes("相关标签") ||
        text.includes("Related Topics") ||
        text.includes("提示") ||
        text.includes("Hints") ||
        text.includes("简单") ||
        text.includes("中等") ||
        text.includes("困难") ||
        text.includes("Easy") ||
        text.includes("Medium") ||
        text.includes("Hard") ||
        /\d+\s*分/.test(text)
      ) {
        return el;
      }
    }
  }

  return titleEl.parentElement;
}

function buildProblemMarkdown(): string {
  const title = getProblemTitle();
  const url = getCanonicalProblemUrl();
  const difficulty = getDifficulty();
  const tags = getTags();
  const description = getProblemDescriptionMarkdown();
  const defaultCode = getDefaultCodeMarkdown();

  const lines = [`# ${title}`, "", `链接：${url}`];

  if (difficulty) {
    lines.push(`难度：${difficulty}`);
  }

  if (tags.length) {
    lines.push(`标签：${tags.join(" / ")}`);
  }

  lines.push("", "## 题目内容", "");

  if (description) {
    lines.push(description);
  } else {
    lines.push("（未提取到题面正文，可以调整选择器后再试）");
  }

  if (defaultCode) {
    lines.push("", "## 默认代码", "", defaultCode);
  }

  return cleanupMarkdown(lines.join("\n"));
}

function ensureButton() {
  const oldButton = document.getElementById(BUTTON_ID);

  if (!isProblemPage()) {
    if (oldButton) oldButton.remove();
    return;
  }

  const toolbar = findToolbarContainer();
  if (!toolbar) return;

  if (oldButton && toolbar.contains(oldButton)) return;
  if (oldButton) oldButton.remove();

  const button = createCopyButton(BUTTON_ID, handleCopy);

  const children = Array.from(toolbar.children);
  const hintItem = children.find((el) => {
    const text = (el.textContent || "").trim();
    return text.includes("提示") || text.includes("Hints");
  });

  if (hintItem && hintItem.nextSibling) {
    toolbar.insertBefore(button, hintItem.nextSibling);
  } else {
    toolbar.appendChild(button);
  }
}

let ensureButtonTimer: number | null = null;
let mutationObserver: MutationObserver | null = null;
let lastUrl = location.href;

function scheduleEnsureButton() {
  if (ensureButtonTimer) window.clearTimeout(ensureButtonTimer);
  ensureButtonTimer = window.setTimeout(() => {
    ensureButton();
  }, 120);
}

function patchHistory() {
  const flag = "__CAP_COPY_HELPER_HISTORY_PATCHED__" as const;
  if ((window as any)[flag]) return;
  (window as any)[flag] = true;

  const rawPushState = history.pushState;
  const rawReplaceState = history.replaceState;

  history.pushState = function (this: any, ...args: any[]) {
    const result = rawPushState.apply(this, args as any);
    window.dispatchEvent(new Event("cap-copy-helper:urlchange"));
    return result;
  } as any;

  history.replaceState = function (this: any, ...args: any[]) {
    const result = rawReplaceState.apply(this, args as any);
    window.dispatchEvent(new Event("cap-copy-helper:urlchange"));
    return result;
  } as any;
}

function watchRouteChange() {
  patchHistory();

  window.addEventListener("popstate", () => {
    scheduleEnsureButton();
  });

  window.addEventListener("cap-copy-helper:urlchange", () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleEnsureButton();
    }
  });

  window.setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleEnsureButton();
    }
  }, 800);
}

function watchDom() {
  if (mutationObserver) return;
  if (!document.body) return;

  mutationObserver = new MutationObserver(() => {
    scheduleEnsureButton();
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

async function handleCopy() {
  if (!isProblemPage()) {
    showToast("当前不是题目页面", true);
    return;
  }

  const button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
    button.textContent = "复制中...";
    button.style.opacity = "0.75";
  }

  try {
    const markdown = buildProblemMarkdown();
    await copyText(markdown);
    console.log("[Copy Algo Problems] copied markdown:\n", markdown);
    showToast("题目已复制为 Markdown");
  } catch (error) {
    console.error("[Copy Algo Problems] copy failed:", error);
    showToast("复制失败，请打开 Console 查看错误", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "复制题目";
      button.style.opacity = "1";
    }
  }
}

function init() {
  if ((window as any)[APP_FLAG]) return;
  (window as any)[APP_FLAG] = true;

  ensureButton();
  watchRouteChange();
  watchDom();
}

export const leetcodeHandler: PlatformHandler = {
  matches(loc: Location): boolean {
    return /leetcode\.(cn|com)/.test(loc.host);
  },
  ensureUI() {
    ensureButton();
  },
  buildMarkdown() {
    return buildProblemMarkdown();
  },
};

window.addEventListener("load", init);
setTimeout(init, 1000);
