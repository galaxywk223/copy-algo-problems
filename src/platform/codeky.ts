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
    document.querySelectorAll<HTMLElement>(".problem-doc:not(.problem-switch-skeleton)")
  );

  return candidates.find((node) => isVisible(node)) || null;
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

  const visibleHintIndexes = Array.from(root.querySelectorAll<HTMLElement>(".problem-hint-body")).map(
    (hint) => isVisible(hint)
  );

  clone.querySelectorAll<HTMLElement>(".problem-hint-body").forEach((hint, index) => {
    if (!visibleHintIndexes[index]) {
      hint.closest(".problem-hint-row")?.remove();
    }
  });

  clone
    .querySelectorAll(
      [
        ".problem-desc-header",
        ".problem-pass-stats-block",
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

function sanitizeCodeText(text: string): string {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*\n/, "")
    .replace(/\s+$/, "");
}

function looksLikeCode(text: string): boolean {
  if (text.length < 8 || text.length > 100_000) return false;
  if (!text.includes("\n") && !/[;{}()[\]=]/.test(text)) return false;
  return /[;{}()[\]=]|\b(?:class|def|function|import|include|public|private|return|const|let|var|int|string|print)\b/.test(
    text
  );
}

function scoreCodeCandidate(text: string): number {
  let score = text.length;
  if (text.includes("\n")) score += 500;
  if (/[;{}]/.test(text)) score += 300;
  if (/\b(?:class|def|function|import|include|public|return|const|let|var|int|string|print)\b/.test(text)) {
    score += 300;
  }
  return score;
}

function collectCodeCandidate(candidates: string[], rawText: string): void {
  const text = sanitizeCodeText(rawText);
  if (looksLikeCode(text)) candidates.push(text);
}

function getCodePanelRoots(): HTMLElement[] {
  const selectors = [
    ".code-editor-body",
    ".code-panel",
    '[data-wb-pane-id="RT"]',
    ".right-panel",
  ];
  const roots: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const selector of selectors) {
    for (const node of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (!isVisible(node) || seen.has(node)) continue;
      seen.add(node);
      roots.push(node);
    }
  }

  return roots;
}

function getCodeFromRoot(root: HTMLElement): string {
  const candidates: string[] = [];
  const editorRoots = [
    ...(root.matches(".monaco-editor") ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(".monaco-editor")),
  ];

  for (const editor of editorRoots) {
    if (!isVisible(editor)) continue;

    for (const textarea of Array.from(
      editor.querySelectorAll<HTMLTextAreaElement>(
        'textarea[aria-label*="Editor"], textarea.inputarea, textarea'
      )
    )) {
      collectCodeCandidate(candidates, textarea.value);
    }

    for (const lines of Array.from(editor.querySelectorAll<HTMLElement>(".view-lines"))) {
      if (isVisible(lines)) {
        collectCodeCandidate(candidates, lines.innerText || lines.textContent || "");
      }
    }
  }

  if (!candidates.length) {
    for (const textarea of Array.from(root.querySelectorAll<HTMLTextAreaElement>("textarea"))) {
      collectCodeCandidate(candidates, textarea.value);
    }
    for (const node of Array.from(root.querySelectorAll<HTMLElement>("pre, code, [contenteditable=\"true\"]"))) {
      if (isVisible(node)) {
        collectCodeCandidate(candidates, node.innerText || node.textContent || "");
      }
    }
  }

  return candidates.sort((a, b) => scoreCodeCandidate(b) - scoreCodeCandidate(a))[0] || "";
}

function normalizeCodeLanguage(rawLanguage: string): string {
  const language = collapseInlineWhitespace(rawLanguage).trim().toLowerCase();
  if (!language) return "";
  if (/c\+\+|cpp|gnu\s*c/.test(language)) return "cpp";
  if (/python|py\b/.test(language)) return "python";
  if (/javascript|typescript|\bjs\b|\bts\b/.test(language)) {
    return language.includes("type") || /\bts\b/.test(language) ? "typescript" : "javascript";
  }
  if (/java\b/.test(language)) return "java";
  if (/c#|csharp/.test(language)) return "csharp";
  if (/go\b|golang/.test(language)) return "go";
  if (/rust/.test(language)) return "rust";
  return language.replace(/[^a-z0-9+#-]+/g, "").slice(0, 24);
}

function getCurrentCodeLanguage(): string {
  const languageNode = document.querySelector<HTMLElement>(
    '.code-header-ml-lang, .code-panel .language-select, .code-panel [aria-label*="语言"]'
  );
  return normalizeCodeLanguage(languageNode?.textContent || "");
}

function getCurrentCodeMarkdown(): string {
  for (const root of getCodePanelRoots()) {
    const code = getCodeFromRoot(root);
    if (!code) continue;
    const language = getCurrentCodeLanguage();
    return `## 当前代码\n\n\`\`\`${language}\n${code}\n\`\`\``;
  }
  return "";
}

function buildProblemMarkdown(): string {
  const title = getProblemTitle();
  const description = getProblemDescriptionMarkdown();
  const lines = [`# ${title}`, "", `链接：${getCanonicalProblemUrl()}`, "", "## 题目内容", ""];

  lines.push(description || "（未提取到题面正文，可以等待题面加载后重试）");
  const code = getCurrentCodeMarkdown();
  if (code) lines.push("", code);
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
