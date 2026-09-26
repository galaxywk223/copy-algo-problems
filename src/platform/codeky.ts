import { copyText } from "../core/clipboard";
import { collapseInlineWhitespace, isVisible, normalizeWhitespace } from "../core/dom";
import { cleanupMarkdown, renderChildren } from "../core/markdown";
import { showToast } from "../core/ui";
import type { PlatformHandler } from "./index";

const BUTTON_ID = "cap-copy-helper-codeky-button";
const APP_FLAG = "__CAP_COPY_HELPER_CODEKY_INSTALLED__";

function getProblemId(loc: Location = location): string | null {
  const match = loc.pathname.match(/^\/problem\/(\d+)\/?$/);
  return match?.[1] || null;
}

function isProblemPage(loc: Location = location): boolean {
  return loc.host === "codeky.online" && getProblemId(loc) !== null;
}

function getCanonicalProblemUrl(): string {
  const id = getProblemId() || "";
  return `${location.origin}/problem/${encodeURIComponent(id)}`;
}

function getProblemRoot(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(".problem-doc .problem-desc-block")
  );

  return candidates.find((node) => isVisible(node)) || candidates[0] || null;
}

function getProblemTitle(): string {
  const title = getProblemRoot()?.querySelector<HTMLElement>(".problem-desc-title");
  const titleText = collapseInlineWhitespace(title?.textContent || "").trim();
  if (titleText) return titleText;

  const pageTitle = document.title.replace(/\s*-\s*CodeKy.*$/i, "").trim();
  return pageTitle || `CodeKy ${getProblemId() || "Problem"}`;
}

function getFormulaSource(node: HTMLElement): string {
  const annotation = node.querySelector<HTMLElement>('annotation[encoding="application/x-tex"]');
  const source = (annotation?.textContent || node.getAttribute("aria-label") || node.textContent || "")
    .trim();

  return source
    .replace(/^\\\((.*)\\\)$/s, "$1")
    .replace(/^\\\[(.*)\\\]$/s, "$1")
    .replace(/^\$\$(.*)\$\$$/s, "$1")
    .replace(/^\$(.*)\$$/s, "$1")
    .trim();
}

function replaceMathWithSource(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".katex, .MathJax, mjx-container").forEach((formula) => {
    const source = getFormulaSource(formula);
    if (!source) {
      formula.remove();
      return;
    }

    const code = document.createElement("code");
    code.textContent = source;
    formula.replaceWith(code);
  });

  root
    .querySelectorAll(
      ".katex-html, .katex-mathml, .MathJax_Preview, .MJX_Assistive_MathML, mjx-assistive-mml"
    )
    .forEach((node) => node.remove());
}

function cleanupProblemRoot(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll(
      [
        ".problem-desc-header",
        ".problem-pass-stats-block",
        ".problem-meta-accordions",
        ".similar-problems-block",
        ".related-enterprises-block",
        ".trajectory-doc-block",
        ".problem-doc-footer",
        ".problem-comments-block",
        ".acm-beginner-tip-line",
        ".problem-kp-tip-line",
        ".problem-hash-tpl-line",
        ".sample-copy-btn",
        "button",
        "form",
        "input",
        "textarea",
        "select",
        "script",
        "style",
        "noscript",
        "svg",
      ].join(",")
    )
    .forEach((element) => element.remove());

  replaceMathWithSource(clone);
  return clone;
}

function getProblemDescriptionMarkdown(): string {
  const root = getProblemRoot();
  if (!root) return "";

  const cleaned = cleanupProblemRoot(root);
  return cleanupMarkdown(renderChildren(cleaned));
}

function hasProblemContent(): boolean {
  const root = getProblemRoot();
  if (!root) return false;

  return Array.from(
    root.querySelectorAll<HTMLElement>(".problem-field-md, .sample-examples-section")
  ).some((body) => normalizeWhitespace(body.textContent || "").trim().length > 20);
}

function buildProblemMarkdown(): string {
  const title = getProblemTitle();
  const description = getProblemDescriptionMarkdown();
  const lines = [`# ${title}`, "", `链接：${getCanonicalProblemUrl()}`, "", "## 题目内容", ""];

  lines.push(description || "（未提取到题面正文，可以等待题面加载后重试）");
  return cleanupMarkdown(lines.join("\n"));
}

function ensureButton(): void {
  const oldButton = document.getElementById(BUTTON_ID);

  if (!isProblemPage() || !hasProblemContent()) {
    oldButton?.remove();
    return;
  }

  const titleRow = getProblemRoot()?.querySelector<HTMLElement>(".problem-desc-title-row");
  if (!titleRow) {
    oldButton?.remove();
    return;
  }

  if (oldButton && titleRow.contains(oldButton)) return;
  oldButton?.remove();

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "复制题目";
  button.style.marginLeft = "10px";
  button.style.padding = "3px 10px";
  button.style.border = "1px solid #2563eb";
  button.style.borderRadius = "5px";
  button.style.background = "transparent";
  button.style.color = "#2563eb";
  button.style.fontSize = "12px";
  button.style.cursor = "pointer";
  button.style.verticalAlign = "middle";
  button.addEventListener("click", handleCopy);
  titleRow.appendChild(button);
}

let ensureButtonTimer: number | null = null;
let mutationObserver: MutationObserver | null = null;
let lastUrl = location.href;

function scheduleEnsureButton(): void {
  if (ensureButtonTimer !== null) window.clearTimeout(ensureButtonTimer);
  ensureButtonTimer = window.setTimeout(() => {
    ensureButtonTimer = null;
    ensureButton();
  }, 120);
}

function patchHistory(): void {
  const historyObject = window.history;
  const rawPushState = historyObject.pushState;
  const rawReplaceState = historyObject.replaceState;

  historyObject.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
    const result = rawPushState.apply(this, args);
    window.dispatchEvent(new Event("cap-copy-helper-codeky:urlchange"));
    return result;
  };

  historyObject.replaceState = function (
    this: History,
    ...args: Parameters<History["replaceState"]>
  ) {
    const result = rawReplaceState.apply(this, args);
    window.dispatchEvent(new Event("cap-copy-helper-codeky:urlchange"));
    return result;
  };
}

function watchPage(): void {
  patchHistory();
  window.addEventListener("popstate", scheduleEnsureButton);
  window.addEventListener("cap-copy-helper-codeky:urlchange", () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    scheduleEnsureButton();
  });

  window.setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    scheduleEnsureButton();
  }, 800);

  if (!document.body || mutationObserver) return;
  mutationObserver = new MutationObserver(scheduleEnsureButton);
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

async function handleCopy(): Promise<void> {
  if (!isProblemPage() || !hasProblemContent()) {
    showToast("当前 CodeKy 题面尚未加载或不可复制", true);
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
    console.log("[Copy Algo Problems] copied CodeKy markdown:\n", markdown);
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
  watchPage();
}

export const codekyHandler: PlatformHandler = {
  matches(loc: Location): boolean {
    return isProblemPage(loc);
  },
  ensureUI(): void {
    init();
  },
  buildMarkdown(): string {
    return buildProblemMarkdown();
  },
};
