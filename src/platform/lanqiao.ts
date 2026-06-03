import { copyText } from "../core/clipboard";
import { isVisible, normalizeWhitespace, unique } from "../core/dom";
import { cleanupMarkdown, renderChildren } from "../core/markdown";
import { showToast } from "../core/ui";
import type { PlatformHandler } from "./index";

const BUTTON_ID = "cap-copy-helper-lanqiao-button";
const APP_FLAG = "__CAP_COPY_HELPER_LANQIAO_INSTALLED__";

function isProblemPage(loc: Location = location): boolean {
  return loc.host === "www.lanqiao.cn" && /^\/problems\/\d+\/learning\/?$/.test(loc.pathname);
}

function getCanonicalProblemUrl(): string {
  return `${location.origin}${location.pathname.replace(/\/?$/, "/")}`;
}

function getProblemTitle(): string {
  const title = document.title.replace(/\s*-\s*蓝桥云课\s*$/i, "").trim();
  if (title) return title;

  const heading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3"))
    .find((el) => isVisible(el) && (el.textContent || "").trim());
  const headingText = heading?.textContent?.trim();
  if (headingText) return headingText;

  return "未识别到题目标题";
}

function getProblemContentNode(): HTMLElement | null {
  const selectors = [
    ".markdown-container.doc-content.is-contest",
    ".content.guide-content .markdown-container",
    ".markdown-body",
  ];

  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node && isVisible(node) && normalizeWhitespace(node.innerText || "").length > 40) {
      return node;
    }
  }

  return null;
}

function replaceKatexWithPlainText(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".katex").forEach((katex) => {
    const tex = katex.querySelector<HTMLElement>('annotation[encoding="application/x-tex"]')
      ?.textContent
      ?.trim();

    if (tex) {
      katex.replaceWith(document.createTextNode(tex));
      return;
    }

    katex.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
  });
}

function cleanupProblemContentNode(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;

  replaceKatexWithPlainText(clone);

  clone.querySelectorAll(
    [
      "script",
      "style",
      "noscript",
      "button",
      "svg",
      "form",
      "input",
      "textarea",
      "canvas",
      ".katex-html",
      ".katex-mathml",
      '[aria-hidden="true"]',
    ].join(",")
  ).forEach((el) => el.remove());

  return clone;
}

function getProblemDescriptionMarkdown(): string {
  const contentNode = getProblemContentNode();
  if (!contentNode) return "";

  const cleaned = cleanupProblemContentNode(contentNode);
  return cleanupMarkdown(renderChildren(cleaned));
}

function getStatisticsParagraphs(): string[] {
  const stats = document.querySelector<HTMLElement>(".problem-statistics");
  if (!stats) return [];

  return Array.from(stats.querySelectorAll<HTMLElement>("p"))
    .map((el) => normalizeWhitespace(el.innerText || el.textContent || "").trim())
    .filter(Boolean);
}

function parseDifficultyAndTags(): { difficulty: string; level: string; tags: string[] } {
  const text = getStatisticsParagraphs().find((line) => line.includes("难度")) || "";
  const difficulty = text.match(/难度[:：]\s*([^\s]+)/)?.[1]?.trim() || "";
  const level = text.match(/\bLV\.\d+\b/i)?.[0]?.trim() || "";
  const tagsText = text.match(/标签[:：]\s*(.+)$/)?.[1]?.trim() || "";
  const tags = unique(
    tagsText
      .split(/[,，/]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  );

  return { difficulty, level, tags };
}

function getSubmissionStats(): string {
  return getStatisticsParagraphs().find((line) => line.includes("总通过次数")) || "";
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

  return /[{}();=<>[\]#]|\/\/|\b(class|def|function|return|public|private|static|void|int|string|using|include|main)\b/.test(
    code
  );
}

function scoreCodeCandidate(text: string): number {
  const code = sanitizeCodeText(text);
  if (!looksLikeCode(code)) return -Infinity;

  let score = code.length;
  score += (code.match(/\n/g)?.length || 0) * 40;
  if (/\b(main|return|class|def|function)\b/.test(code)) score += 300;
  if (/[{}]/.test(code)) score += 120;
  if (/^\s{2,}\S/m.test(code)) score += 80;
  if (/编译语言|打开控制台|调试|提交检测|测试用例|代码执行结果/.test(code)) score -= 1500;

  return score;
}

function getCurrentLanguage(): string {
  const directHeader = Array.from(document.querySelectorAll<HTMLElement>(".header-panel, .header-content"))
    .map((el) => normalizeWhitespace(el.innerText || el.textContent || "").trim())
    .find((text) => /^编译语言[:：]/.test(text) && text.length <= 80);

  if (directHeader) {
    return directHeader.replace(/^编译语言[:：]\s*/, "").trim();
  }

  const fallbackHeader = Array.from(document.querySelectorAll<HTMLElement>("div, span"))
    .map((el) => normalizeWhitespace(el.innerText || el.textContent || "").trim())
    .find((text) => /^编译语言[:：]/.test(text) && text.length <= 80);

  if (!fallbackHeader) return "";
  return fallbackHeader.replace(/^编译语言[:：]\s*/, "").trim();
}

function getEditorCode(): string {
  const candidates: string[] = [];

  const textareas = Array.from(
    document.querySelectorAll<HTMLTextAreaElement>(
      ".monaco-editor textarea[aria-label*='Editor'], #monaco-editor textarea[aria-label*='Editor'], textarea[aria-label*='Editor']"
    )
  );
  for (const textarea of textareas) {
    const code = sanitizeCodeText(textarea.value);
    if (looksLikeCode(code)) candidates.push(code);
  }

  const viewLineRoots = Array.from(
    document.querySelectorAll<HTMLElement>(".monaco-editor .view-lines, #monaco-editor .view-lines")
  );
  for (const root of viewLineRoots) {
    if (!isVisible(root)) continue;
    const lines = Array.from(root.querySelectorAll<HTMLElement>(".view-line"))
      .map((line) => line.textContent || "")
      .join("\n");
    const code = sanitizeCodeText(lines);
    if (looksLikeCode(code)) candidates.push(code);
  }

  return candidates.sort((a, b) => scoreCodeCandidate(b) - scoreCodeCandidate(a))[0] || "";
}

function getDefaultCodeMarkdown(): string {
  const code = getEditorCode();
  if (!code) return "";

  return `\`\`\`\n${code}\n\`\`\``;
}

function buildProblemMarkdown(): string {
  const title = getProblemTitle();
  const url = getCanonicalProblemUrl();
  const { difficulty, level, tags } = parseDifficultyAndTags();
  const submissionStats = getSubmissionStats();
  const description = getProblemDescriptionMarkdown();
  const language = getCurrentLanguage();
  const defaultCode = getDefaultCodeMarkdown();

  const lines = [`# ${title}`, "", `链接：${url}`];

  if (difficulty) {
    lines.push(`难度：${level ? `${difficulty} ${level}` : difficulty}`);
  }

  if (tags.length) {
    lines.push(`标签：${tags.join(" / ")}`);
  }

  if (submissionStats) {
    lines.push(`统计：${submissionStats}`);
  }

  lines.push("", "## 题目内容", "");
  lines.push(description || "（未提取到题面正文，可以调整选择器后再试）");

  if (defaultCode) {
    lines.push("", "## 默认代码", "");
    if (language) {
      lines.push(`语言：${language}`, "");
    }
    lines.push(defaultCode);
  }

  return cleanupMarkdown(lines.join("\n"));
}

function findActionByText(text: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button'], div, span"));

  for (const node of nodes) {
    if (!isVisible(node)) continue;

    const nodeText = normalizeWhitespace(node.innerText || node.textContent || "").trim();
    if (nodeText !== text) continue;

    return node.closest<HTMLElement>("button, a, [role='button']") || node;
  }

  return null;
}

function findBottomButtonTarget(): { container: HTMLElement; randomButton: HTMLElement } | null {
  const randomButton = findActionByText("随机一题");
  const container = randomButton?.parentElement;

  if (!randomButton || !container) return null;
  return { container, randomButton };
}

function applyBottomButtonFallbackStyle(button: HTMLButtonElement): void {
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.height = "36px";
  button.style.minWidth = "96px";
  button.style.padding = "0 16px";
  button.style.margin = "0 8px 0 0";
  button.style.border = "1px solid #dcdfe6";
  button.style.borderRadius = "4px";
  button.style.background = "#fff";
  button.style.color = "#606266";
  button.style.fontSize = "14px";
  button.style.fontWeight = "400";
  button.style.lineHeight = "1";
  button.style.cursor = "pointer";
  button.style.whiteSpace = "nowrap";
  button.style.boxSizing = "border-box";
  button.style.verticalAlign = "middle";
}

function createLanqiaoBottomButton(randomButton: HTMLElement): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "复制题目";
  button.addEventListener("click", handleCopy);

  if (randomButton.className) {
    button.className = String(randomButton.className);
  }

  applyBottomButtonFallbackStyle(button);

  const randomStyle = window.getComputedStyle(randomButton);
  button.style.height = randomStyle.height;
  button.style.minWidth = randomStyle.width === "auto" ? button.style.minWidth : randomStyle.width;
  button.style.borderRadius = randomStyle.borderRadius;
  button.style.border = randomStyle.border;
  button.style.background = randomStyle.background;
  button.style.color = randomStyle.color;
  button.style.fontSize = randomStyle.fontSize;
  button.style.fontWeight = randomStyle.fontWeight;

  button.addEventListener("mouseenter", () => {
    button.style.filter = "brightness(0.98)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.filter = "none";
  });

  return button;
}

function ensureButton(): void {
  const oldButton = document.getElementById(BUTTON_ID);

  if (!isProblemPage()) {
    oldButton?.remove();
    return;
  }

  const target = findBottomButtonTarget();
  if (!target) {
    oldButton?.remove();
    return;
  }

  const { container, randomButton } = target;
  if (oldButton && oldButton.parentElement === container && oldButton.nextSibling === randomButton) return;
  oldButton?.remove();

  const button = createLanqiaoBottomButton(randomButton);
  container.insertBefore(button, randomButton);
}

let ensureButtonTimer: number | null = null;
let mutationObserver: MutationObserver | null = null;
let lastUrl = location.href;

function scheduleEnsureButton(): void {
  if (ensureButtonTimer) window.clearTimeout(ensureButtonTimer);
  ensureButtonTimer = window.setTimeout(() => {
    ensureButton();
  }, 120);
}

function patchHistory(): void {
  const flag = "__CAP_COPY_HELPER_LANQIAO_HISTORY_PATCHED__" as const;
  if ((window as any)[flag]) return;
  (window as any)[flag] = true;

  const rawPushState = history.pushState;
  const rawReplaceState = history.replaceState;

  history.pushState = function (this: any, ...args: any[]) {
    const result = rawPushState.apply(this, args as any);
    window.dispatchEvent(new Event("cap-copy-helper-lanqiao:urlchange"));
    return result;
  } as any;

  history.replaceState = function (this: any, ...args: any[]) {
    const result = rawReplaceState.apply(this, args as any);
    window.dispatchEvent(new Event("cap-copy-helper-lanqiao:urlchange"));
    return result;
  } as any;
}

function watchRouteChange(): void {
  patchHistory();

  window.addEventListener("popstate", () => {
    scheduleEnsureButton();
  });

  window.addEventListener("cap-copy-helper-lanqiao:urlchange", () => {
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

function watchDom(): void {
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

async function handleCopy(): Promise<void> {
  if (!isProblemPage()) {
    showToast("当前不是蓝桥题目页面", true);
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
    console.log("[Copy Algo Problems] copied Lanqiao markdown:\n", markdown);
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

function init(): void {
  if ((window as any)[APP_FLAG]) {
    ensureButton();
    return;
  }
  (window as any)[APP_FLAG] = true;

  ensureButton();
  watchRouteChange();
  watchDom();
}

export const lanqiaoHandler: PlatformHandler = {
  matches(loc: Location): boolean {
    return loc.host === "www.lanqiao.cn" && isProblemPage(loc);
  },
  ensureUI(): void {
    init();
  },
  buildMarkdown(): string {
    return buildProblemMarkdown();
  },
};
