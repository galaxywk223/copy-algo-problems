import { copyText } from "../core/clipboard";
import { collapseInlineWhitespace } from "../core/dom";
import { cleanupMarkdown, renderChildren } from "../core/markdown";
import { showToast } from "../core/ui";
import type { PlatformHandler } from "./index";

const BUTTON_ID = "cap-copy-helper-hdu-button";

type HduPageInfo = {
  problemId: string;
};

type HduMetadata = {
  timeLimit: string;
  memoryLimit: string;
  totalSubmissions: string;
  acceptedSubmissions: string;
};

type HduSection = {
  title: string;
  content: HTMLElement;
};

function getPageInfo(loc: Location = location): HduPageInfo | null {
  if (loc.pathname !== "/showproblem.php") return null;

  const problemId = new URL(loc.href).searchParams.get("pid")?.trim() || "";
  if (!/^\d+$/.test(problemId)) return null;

  return { problemId };
}

function isProblemPage(loc: Location = location): boolean {
  return getPageInfo(loc) !== null;
}

function getCanonicalProblemUrl(): string {
  const problemId = getPageInfo()?.problemId || "";
  return `${location.origin}/showproblem.php?pid=${encodeURIComponent(problemId)}`;
}

function getProblemTitle(): string {
  const title = document.querySelector<HTMLElement>("h1");
  if (!title) return "";

  const clone = title.cloneNode(true) as HTMLElement;
  clone.querySelector(`#${BUTTON_ID}`)?.remove();
  return collapseInlineWhitespace(clone.textContent || "").trim();
}

function getMetadataText(): string {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("h1 ~ font span, h1 ~ span"));
  const metadata = candidates.find((node) => /Time Limit:/i.test(node.textContent || ""));
  return collapseInlineWhitespace(metadata?.textContent || "").trim();
}

function extractMetadataValue(text: string, startLabel: string, endLabel?: string): string {
  const end = endLabel ? `(?=\\s*${endLabel})` : "$";
  const match = text.match(new RegExp(`${startLabel}\\s*(.*?)${end}`, "i"));
  return match?.[1]?.trim() || "";
}

function getProblemMetadata(): HduMetadata {
  const text = getMetadataText();

  return {
    timeLimit: extractMetadataValue(text, "Time Limit:", "Memory Limit:"),
    memoryLimit: extractMetadataValue(text, "Memory Limit:", "Total Submission\\(s\\):"),
    totalSubmissions: extractMetadataValue(
      text,
      "Total Submission\\(s\\):",
      "Accepted Submission\\(s\\):"
    ),
    acceptedSubmissions: extractMetadataValue(text, "Accepted Submission\\(s\\):"),
  };
}

function getProblemSections(): HduSection[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".panel_title"))
    .map((titleNode) => {
      const content = titleNode.nextElementSibling;
      const title = collapseInlineWhitespace(titleNode.textContent || "").trim();

      if (!(content instanceof HTMLElement) || !content.classList.contains("panel_content") || !title) {
        return null;
      }

      return { title, content };
    })
    .filter((section): section is HduSection => section !== null);
}

function replaceMathJaxWithTex(root: HTMLElement): void {
  root.querySelectorAll<HTMLScriptElement>('script[type^="math/tex"]').forEach((script) => {
    const tex = (script.textContent || "").trim();
    if (!tex) {
      script.remove();
      return;
    }

    const code = document.createElement("code");
    code.textContent = tex;
    script.replaceWith(code);
  });

  root.querySelectorAll(
    ".MathJax, .MathJax_Display, .MathJax_Preview, .MJX_Assistive_MathML, mjx-assistive-mml"
  ).forEach((node) => node.remove());
}

function cleanupSectionContent(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;

  replaceMathJaxWithTex(clone);
  clone.querySelectorAll(
    [
      "script",
      "style",
      "noscript",
      "button",
      "form",
      "input",
      "textarea",
      "select",
      ".panel_bottom",
    ].join(",")
  ).forEach((element) => element.remove());

  return clone;
}

function getSectionMarkdown(section: HduSection): string {
  const cleaned = cleanupSectionContent(section.content);
  return cleanupMarkdown(renderChildren(cleaned));
}

function hasProblemContent(): boolean {
  return Boolean(getProblemTitle() && getProblemSections().length);
}

function buildProblemMarkdown(): string {
  const pageInfo = getPageInfo();
  const problemId = pageInfo?.problemId || "";
  const title = getProblemTitle() || `HDU ${problemId}`.trim();
  const metadata = getProblemMetadata();
  const sections = getProblemSections();
  const lines = [`# ${problemId} - ${title}`, "", `链接：${getCanonicalProblemUrl()}`];

  if (metadata.timeLimit) lines.push(`时间限制：${metadata.timeLimit}`);
  if (metadata.memoryLimit) lines.push(`内存限制：${metadata.memoryLimit}`);
  if (metadata.totalSubmissions) lines.push(`总提交数：${metadata.totalSubmissions}`);
  if (metadata.acceptedSubmissions) lines.push(`通过数：${metadata.acceptedSubmissions}`);

  lines.push("", "## 题目内容", "");

  for (const section of sections) {
    lines.push(`### ${section.title}`, "", getSectionMarkdown(section), "");
  }

  return cleanupMarkdown(lines.join("\n"));
}

function ensureButton(): void {
  const oldButton = document.getElementById(BUTTON_ID);

  if (!isProblemPage() || !hasProblemContent()) {
    oldButton?.remove();
    return;
  }

  const title = document.querySelector<HTMLElement>("h1");
  if (!title) {
    oldButton?.remove();
    return;
  }
  if (oldButton && title.contains(oldButton)) return;

  oldButton?.remove();

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "复制题目";
  button.style.marginLeft = "12px";
  button.style.padding = "3px 10px";
  button.style.border = "1px solid #1a5cc8";
  button.style.background = "#fff";
  button.style.color = "#1a5cc8";
  button.style.fontSize = "12px";
  button.style.fontWeight = "400";
  button.style.lineHeight = "18px";
  button.style.cursor = "pointer";
  button.style.verticalAlign = "middle";
  button.addEventListener("click", handleCopy);
  title.appendChild(button);
}

async function handleCopy(): Promise<void> {
  if (!isProblemPage() || !hasProblemContent()) {
    showToast("当前不是有效的 HDU 题目页面", true);
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
    console.log("[Copy Algo Problems] copied HDU markdown:\n", markdown);
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

export const hduHandler: PlatformHandler = {
  matches(loc: Location): boolean {
    return loc.host === "acm.hdu.edu.cn" && isProblemPage(loc);
  },
  ensureUI(): void {
    ensureButton();
  },
  buildMarkdown(): string {
    return buildProblemMarkdown();
  },
};
