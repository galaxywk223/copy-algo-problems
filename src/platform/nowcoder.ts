import { copyText } from "../core/clipboard";
import { collapseInlineWhitespace } from "../core/dom";
import { cleanupMarkdown, renderChildren } from "../core/markdown";
import { showToast } from "../core/ui";
import type { PlatformHandler } from "./index";

const BUTTON_ID = "cap-copy-helper-nowcoder-button";
const APP_FLAG = "__CAP_COPY_HELPER_NOWCODER_INSTALLED__";

type NowCoderPageInfo =
  | { kind: "contest"; contestId: string; problemIndex: string }
  | { kind: "problem"; problemId: string };

function getPageInfo(loc: Location = location): NowCoderPageInfo | null {
  const contestMatch = loc.pathname.match(/^\/acm\/contest\/(\d+)\/([A-Za-z0-9_-]+)\/?$/);
  if (contestMatch) {
    return {
      kind: "contest",
      contestId: contestMatch[1],
      problemIndex: contestMatch[2],
    };
  }

  const problemMatch = loc.pathname.match(/^\/acm\/problem\/(\d+)\/?$/);
  if (problemMatch) {
    return {
      kind: "problem",
      problemId: problemMatch[1],
    };
  }

  return null;
}

function isProblemPage(loc: Location = location): boolean {
  return getPageInfo(loc) !== null;
}

function getCanonicalProblemUrl(): string {
  return `${location.origin}${location.pathname.replace(/\/+$/, "")}`;
}

function getQuestionTitleText(): string {
  const titleEl = document.querySelector<HTMLElement>(".question-title");
  if (!titleEl) return "";

  const clone = titleEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("i, a, button").forEach((el) => el.remove());
  return collapseInlineWhitespace(clone.textContent || "").trim();
}

function getProblemTitle(): string {
  const pageInfo = getPageInfo();
  const questionTitle = getQuestionTitleText();
  const documentTitle = document.title.trim();

  if (pageInfo?.kind === "contest") {
    const titlePrefix = documentTitle.split("_")[0]?.trim();
    if (titlePrefix && !/报名后才能查看题目/.test(titlePrefix)) return titlePrefix;
    if (questionTitle) return `${pageInfo.problemIndex}-${questionTitle}`;
  }

  if (questionTitle) return questionTitle;
  if (documentTitle && !/报名后才能查看题目/.test(documentTitle)) return documentTitle;

  if (pageInfo?.kind === "problem") return `NC${pageInfo.problemId}`;
  return "牛客题目";
}

function getContestTitle(): string {
  const pageInfo = getPageInfo();
  if (pageInfo?.kind !== "contest") return "";

  const titleParts = document.title.split("_");
  if (titleParts.length > 1) {
    const contestTitle = titleParts.slice(1).join("_").trim();
    if (contestTitle) return contestTitle;
  }

  return `牛客比赛 ${pageInfo.contestId}`;
}

function getLimitLines(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".question-intr .subject-item-wrap > span"))
    .map((el) => collapseInlineWhitespace(el.textContent || "").trim())
    .filter(Boolean);
}

function getFormulaSource(node: HTMLElement): string {
  const annotation = node.querySelector<HTMLElement>('annotation[encoding="application/x-tex"]');
  const source = (annotation?.textContent || node.getAttribute("alt") || node.textContent || "").trim();

  return source
    .replace(/^\\\((.*)\\\)$/s, "$1")
    .replace(/^\$\$(.*)\$\$$/s, "$1")
    .replace(/^\$(.*)\$$/s, "$1")
    .trim();
}

function replaceFormula(node: HTMLElement, text: string): void {
  if (!text || /^\\(?:hspace|vspace)\{[^}]*\}$/.test(text)) {
    node.replaceWith(document.createTextNode(""));
    return;
  }

  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    node.replaceWith(document.createTextNode(text));
    return;
  }

  const code = document.createElement("code");
  code.textContent = text;
  node.replaceWith(code);
}

function replaceElementTag(element: HTMLElement, tagName: string): HTMLElement {
  const replacement = document.createElement(tagName);
  while (element.firstChild) replacement.appendChild(element.firstChild);
  element.replaceWith(replacement);
  return replacement;
}

function cleanupProblemStatement(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;

  clone.querySelectorAll<HTMLElement>(".katex").forEach((formula) => {
    replaceFormula(formula, getFormulaSource(formula));
  });

  clone
    .querySelectorAll<HTMLElement>('img[src*="/equation?tex="], img[src*="nowcoder.com/equation"]')
    .forEach((formula) => {
      replaceFormula(formula, getFormulaSource(formula));
    });

  clone.querySelectorAll(
    [
      "script",
      "style",
      "noscript",
      "textarea",
      "button",
      "form",
      "input",
      "select",
      ".code-copy-btn",
      ".icon-fullscreen",
      ".js-full-question",
      ".js-small-question",
      ".katex-html",
      ".katex-mathml",
      ".MathJax_Preview",
      ".MJX_Assistive_MathML",
      "mjx-assistive-mml",
      "script[type='math/tex']",
      "script[type='math/tex; mode=display']",
    ].join(",")
  ).forEach((el) => el.remove());

  clone.querySelectorAll<HTMLElement>(":scope > h2").forEach((heading) => {
    replaceElementTag(heading, "h3");
  });

  clone.querySelectorAll<HTMLElement>(".question-oi-hd").forEach((heading) => {
    replaceElementTag(heading, "h3");
  });

  clone.querySelectorAll<HTMLElement>(".question-oi-mod > h2").forEach((heading) => {
    replaceElementTag(heading, "h4");
  });

  clone.querySelectorAll<HTMLElement>(":scope > .subject-question").forEach((description) => {
    replaceElementTag(description, "p");
  });

  clone.querySelectorAll<HTMLElement>(":scope > pre").forEach((pre) => {
    replaceElementTag(pre, pre.querySelector("blockquote") ? "div" : "p");
  });

  return clone;
}

function getProblemDescriptionMarkdown(): string {
  const statement = document.querySelector<HTMLElement>(".subject-describe");
  if (!statement) return "";

  const cleaned = cleanupProblemStatement(statement);
  return cleanupMarkdown(renderChildren(cleaned));
}

function buildProblemMarkdown(): string {
  const title = getProblemTitle();
  const contest = getContestTitle();
  const url = getCanonicalProblemUrl();
  const limits = getLimitLines();
  const description = getProblemDescriptionMarkdown();

  const lines = [`# ${title}`, "", `链接：${url}`];

  if (contest) lines.push(`比赛：${contest}`);
  if (limits.length) lines.push(...limits);

  lines.push("", "## 题目内容", "");
  lines.push(description || "（未提取到题面正文，请确认已登录并具备题目访问权限）");

  return cleanupMarkdown(lines.join("\n"));
}

function findActionList(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".header-right .code-list-box");
}

function ensureButton(): void {
  const oldButton = document.getElementById(BUTTON_ID);

  if (!isProblemPage() || !document.querySelector(".subject-describe")) {
    oldButton?.closest("li")?.remove();
    oldButton?.remove();
    return;
  }

  const actionList = findActionList();
  if (!actionList) return;
  if (oldButton && actionList.contains(oldButton)) return;

  oldButton?.closest("li")?.remove();
  oldButton?.remove();

  const item = document.createElement("li");
  const link = document.createElement("a");
  link.id = BUTTON_ID;
  link.href = "javascript:void(0);";
  link.title = "复制题目";
  link.textContent = "复制题目";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    handleCopy();
  });

  item.appendChild(link);
  actionList.appendChild(item);
}

let ensureButtonTimer: number | null = null;
let mutationObserver: MutationObserver | null = null;
let lastUrl = location.href;

function scheduleEnsureButton(): void {
  if (ensureButtonTimer) window.clearTimeout(ensureButtonTimer);
  ensureButtonTimer = window.setTimeout(ensureButton, 120);
}

function watchPage(): void {
  window.addEventListener("popstate", scheduleEnsureButton);

  window.setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    scheduleEnsureButton();
  }, 800);

  if (mutationObserver || !document.body) return;
  mutationObserver = new MutationObserver(scheduleEnsureButton);
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

async function handleCopy(): Promise<void> {
  if (!isProblemPage()) {
    showToast("当前不是牛客题目页面", true);
    return;
  }

  const button = document.getElementById(BUTTON_ID) as HTMLAnchorElement | null;
  if (button) {
    button.style.pointerEvents = "none";
    button.textContent = "复制中...";
    button.style.opacity = "0.75";
  }

  try {
    const markdown = buildProblemMarkdown();
    await copyText(markdown);
    console.log("[Copy Algo Problems] copied NowCoder markdown:\n", markdown);
    showToast("题目已复制为 Markdown");
  } catch (error) {
    console.error("[Copy Algo Problems] copy failed:", error);
    showToast("复制失败，请打开 Console 查看错误", true);
  } finally {
    if (button) {
      button.style.pointerEvents = "";
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

export const nowcoderHandler: PlatformHandler = {
  matches(loc: Location): boolean {
    return loc.host === "ac.nowcoder.com" && isProblemPage(loc);
  },
  ensureUI(): void {
    init();
  },
  buildMarkdown(): string {
    return buildProblemMarkdown();
  },
};
