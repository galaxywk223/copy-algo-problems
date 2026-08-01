import { copyText } from "../core/clipboard";
import { isVisible } from "../core/dom";
import { cleanupMarkdown, renderChildren } from "../core/markdown";
import { showToast } from "../core/ui";
import type { PlatformHandler } from "./index";

const BUTTON_ID = "cap-copy-helper-atcoder-button";

type TaskPathInfo = {
  contestSlug: string;
  taskSlug: string;
};

function getTaskPathInfo(loc: Location = location): TaskPathInfo | null {
  const match = loc.pathname.match(/^\/contests\/([^/]+)\/tasks\/([^/]+)\/?$/);
  if (!match) return null;

  return {
    contestSlug: match[1],
    taskSlug: match[2],
  };
}

function isProblemPage(loc: Location = location): boolean {
  return getTaskPathInfo(loc) !== null;
}

function getCanonicalProblemUrl(): string {
  return `${location.origin}${location.pathname.replace(/\/+$/, "")}`;
}

function getProblemTitle(): string {
  const pageTitle = document.title.replace(/\s*-\s*AtCoder.*$/i, "").trim();
  if (pageTitle && !/^404\b/i.test(pageTitle)) return pageTitle;

  const titleEl = document.querySelector<HTMLElement>("span.h2");
  if (titleEl) {
    const clone = titleEl.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("a, button").forEach((el) => el.remove());
    const title = (clone.textContent || "").trim();
    if (title) return title;
  }

  return getTaskPathInfo()?.taskSlug || "AtCoder Problem";
}

function getContestTitle(): string {
  const title = document.querySelector<HTMLElement>("a.contest-title")?.textContent?.trim();
  if (title) return title;

  return getTaskPathInfo()?.contestSlug || "AtCoder Contest";
}

function getRequestedLanguage(): "ja" | "en" {
  const queryLanguage = new URL(location.href).searchParams.get("lang")?.toLowerCase();
  if (queryLanguage === "ja" || queryLanguage === "en") return queryLanguage;

  const pageLanguage = document
    .querySelector('meta[http-equiv="Content-Language"]')
    ?.getAttribute("content")
    ?.toLowerCase();
  return pageLanguage === "ja" ? "ja" : "en";
}

function getProblemStatement(): HTMLElement | null {
  const root = document.querySelector<HTMLElement>("#task-statement");
  if (!root) return null;

  const languageNodes = Array.from(
    root.querySelectorAll<HTMLElement>("span.lang > span.lang-ja, span.lang > span.lang-en")
  );
  const visibleNode = languageNodes.find((node) => isVisible(node));
  if (visibleNode) return visibleNode;

  const requestedLanguage = getRequestedLanguage();
  const requestedNode = root.querySelector<HTMLElement>(`span.lang-${requestedLanguage}`);
  return requestedNode || languageNodes[0] || root;
}

function getFormulaSource(node: HTMLElement): string {
  const annotation = node.querySelector<HTMLElement>('annotation[encoding="application/x-tex"]');
  const source = (annotation?.textContent || node.textContent || "").trim();

  return source
    .replace(/^\\\((.*)\\\)$/s, "$1")
    .replace(/^\$\$(.*)\$\$$/s, "$1")
    .replace(/^\$(.*)\$$/s, "$1")
    .trim();
}

function replaceFormula(node: HTMLElement, text: string): void {
  if (!text) return;

  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    node.replaceWith(document.createTextNode(text));
    return;
  }

  const code = document.createElement("code");
  code.textContent = text;
  node.replaceWith(code);
}

function cleanupProblemStatement(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;

  clone.querySelectorAll<HTMLElement>("var").forEach((formula) => {
    replaceFormula(formula, getFormulaSource(formula));
  });

  clone.querySelectorAll<HTMLElement>(".katex").forEach((formula) => {
    replaceFormula(formula, getFormulaSource(formula));
  });

  clone.querySelectorAll(
    [
      "script",
      "style",
      "noscript",
      "button",
      "form",
      "textarea",
      "input",
      "select",
      ".btn-copy",
      ".div-btn-copy",
      ".katex-html",
      ".katex-mathml",
      ".MathJax_Preview",
      ".MJX_Assistive_MathML",
      "mjx-assistive-mml",
      "script[type='math/tex']",
      "script[type='math/tex; mode=display']",
    ].join(",")
  ).forEach((el) => el.remove());

  return clone;
}

function getProblemDescriptionMarkdown(): string {
  const statement = getProblemStatement();
  if (!statement) return "";

  const cleaned = cleanupProblemStatement(statement);
  return cleanupMarkdown(renderChildren(cleaned));
}

function buildProblemMarkdown(): string {
  const title = getProblemTitle();
  const contest = getContestTitle();
  const url = getCanonicalProblemUrl();
  const description = getProblemDescriptionMarkdown();

  const lines = [
    `# ${title}`,
    "",
    `链接：${url}`,
    `比赛：${contest}`,
    "",
    "## 题目内容",
    "",
    description || "（未提取到题面正文，可以调整选择器后再试）",
  ];

  return cleanupMarkdown(lines.join("\n"));
}

function findTitleContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>("span.h2");
}

function ensureButton(): void {
  const oldButton = document.getElementById(BUTTON_ID);

  if (!isProblemPage()) {
    oldButton?.remove();
    return;
  }

  const titleContainer = findTitleContainer();
  if (!titleContainer) {
    oldButton?.remove();
    return;
  }
  if (oldButton && titleContainer.contains(oldButton)) return;

  oldButton?.remove();

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = "btn btn-default btn-sm";
  button.textContent = "复制题目";
  button.style.marginLeft = "8px";
  button.style.verticalAlign = "middle";
  button.addEventListener("click", handleCopy);
  titleContainer.appendChild(button);
}

async function handleCopy(): Promise<void> {
  if (!isProblemPage()) {
    showToast("当前不是 AtCoder 题目页面", true);
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
    console.log("[Copy Algo Problems] copied AtCoder markdown:\n", markdown);
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

export const atcoderHandler: PlatformHandler = {
  matches(loc: Location): boolean {
    return loc.host === "atcoder.jp" && isProblemPage(loc);
  },
  ensureUI(): void {
    ensureButton();
  },
  buildMarkdown(): string {
    return buildProblemMarkdown();
  },
};
