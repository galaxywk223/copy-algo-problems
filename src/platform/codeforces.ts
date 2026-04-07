import { copyText } from "../core/clipboard";
import { cleanupMarkdown, renderChildren } from "../core/markdown";
import { showToast } from "../core/ui";
import type { PlatformHandler } from "./index";

const BUTTON_ID = "cap-copy-helper-codeforces-button";

type ProblemPathInfo = {
  contestId: string;
  index: string;
};

function getProblemPathInfo(loc: Location = location): ProblemPathInfo | null {
  const contestMatch = loc.pathname.match(/^\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)\/?$/);
  if (contestMatch) {
    return {
      contestId: contestMatch[1],
      index: contestMatch[2],
    };
  }

  const problemsetMatch = loc.pathname.match(/^\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)\/?$/);
  if (problemsetMatch) {
    return {
      contestId: problemsetMatch[1],
      index: problemsetMatch[2],
    };
  }

  return null;
}

function isProblemPage(loc: Location = location): boolean {
  return getProblemPathInfo(loc) !== null;
}

function getProblemIndex(): string {
  return getProblemPathInfo()?.index || "";
}

function getCanonicalProblemUrl(): string {
  const canonicalHref = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href?.trim();
  if (canonicalHref) return canonicalHref;

  const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute("content")?.trim();
  if (ogUrl) return ogUrl;

  return `${location.origin}${location.pathname.replace(/\/+$/, "")}`;
}

function getProblemHolder(): HTMLElement | null {
  const index = getProblemIndex();
  if (!index) return null;

  return document.querySelector<HTMLElement>(`.problemindexholder[problemindex="${CSS.escape(index)}"]`);
}

function getProblemStatement(): HTMLElement | null {
  return getProblemHolder()?.querySelector<HTMLElement>(".problem-statement")
    || document.querySelector<HTMLElement>(".problem-statement");
}

function getProblemTitle(): string {
  const titleEl = document.querySelector<HTMLElement>(".problem-statement .header .title");
  const text = titleEl?.textContent?.trim();
  if (text) return text;

  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
  if (ogTitle) return ogTitle.replace(/\s*-\s*Codeforces$/i, "").trim();

  return `Codeforces ${getProblemIndex()}`.trim();
}

function getContestTitle(): string {
  const pathInfo = getProblemPathInfo();
  if (pathInfo) {
    const contestLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(`a[href^="/contest/${pathInfo.contestId}"]`)
    )
      .map((el) => el.textContent?.trim() || "")
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    if (contestLinks.length) return contestLinks[0];
  }

  const contestLink = document.querySelector<HTMLElement>("#sidebar .sidebox .rtable th.left a");
  const text = contestLink?.textContent?.trim();
  if (text) return text;

  const pageTitle = document.title.replace(/\s*-\s*Codeforces$/i, "").trim();
  const problemTitle = getProblemTitle();
  if (pageTitle && problemTitle) {
    const contestTitle = pageTitle.replace(new RegExp(`^${problemTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-\\s*`, "i"), "").trim();
    if (contestTitle && contestTitle !== pageTitle) return contestTitle;
  }

  return "Codeforces Contest";
}

function getProblemTags(): string[] {
  const tags = Array.from(document.querySelectorAll<HTMLElement>(".tag-box"))
    .map((el) => (el.textContent || "").trim())
    .filter(Boolean);

  return [...new Set(tags)];
}

function cleanupProblemStatement(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;

  clone.querySelectorAll(
    "script, style, .input-output-copier, .diff-notifier, .diff-popup, .testCaseMarker"
  ).forEach((el) => el.remove());

  const title = clone.querySelector<HTMLElement>(".header .title");
  if (title) {
    const h2 = document.createElement("h2");
    h2.textContent = (title.textContent || "").trim();
    title.replaceWith(h2);
  }

  clone.querySelectorAll<HTMLElement>(".header .time-limit, .header .memory-limit, .header .input-file, .header .output-file")
    .forEach((el) => {
      const label = (el.querySelector<HTMLElement>(".property-title")?.textContent || "").trim();
      const value = Array.from(el.childNodes)
        .filter((child) => !(child instanceof HTMLElement && child.classList.contains("property-title")))
        .map((child) => child.textContent || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const p = document.createElement("p");
      p.textContent = label && value ? `${label}: ${value}` : value || label;
      el.replaceWith(p);
    });

  clone.querySelectorAll<HTMLElement>(".section-title").forEach((el) => {
    const h3 = document.createElement("h3");
    h3.textContent = (el.textContent || "").trim();
    el.replaceWith(h3);
  });

  clone.querySelectorAll<HTMLElement>(".sample-test .input > .title, .sample-test .output > .title").forEach((el) => {
    const h4 = document.createElement("h4");
    h4.textContent = (el.textContent || "").trim();
    el.replaceWith(h4);
  });

  clone.querySelectorAll<HTMLElement>("pre").forEach((pre) => {
    pre.textContent = pre.innerText || pre.textContent || "";
  });

  return clone;
}

function getProblemDescriptionMarkdown(): string {
  const statement = getProblemStatement();
  if (!statement) return "";

  const cleaned = cleanupProblemStatement(statement);
  const markdown = cleanupMarkdown(renderChildren(cleaned));
  const title = getProblemTitle().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return markdown.replace(new RegExp(`^##?\\s*${title}\\n+`, "i"), "").trim();
}

function buildProblemMarkdown(): string {
  const title = getProblemTitle();
  const contest = getContestTitle();
  const url = getCanonicalProblemUrl();
  const tags = getProblemTags();
  const description = getProblemDescriptionMarkdown();

  const lines = [`# ${title}`, "", `链接：${url}`, `比赛：${contest}`];

  if (tags.length) {
    lines.push(`标签：${tags.join(" / ")}`);
  }

  lines.push("", "## 题目内容", "");
  lines.push(description || "（未提取到题面正文，可以调整选择器后再试）");

  return cleanupMarkdown(lines.join("\n"));
}

function findToolbarList(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".second-level-menu .second-level-menu-list");
}

function ensureButton(): void {
  const oldButton = document.getElementById(BUTTON_ID);

  if (!isProblemPage()) {
    oldButton?.closest("li")?.remove();
    oldButton?.remove();
    return;
  }

  const menuList = findToolbarList();
  if (!menuList) return;
  if (oldButton && menuList.contains(oldButton)) return;

  oldButton?.closest("li")?.remove();
  oldButton?.remove();

  const item = document.createElement("li");
  item.style.float = "right";
  item.style.cursor = "pointer";

  const link = document.createElement("a");
  link.id = BUTTON_ID;
  link.textContent = "复制题目";
  link.style.cursor = "pointer";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    handleCopy();
  });

  item.appendChild(link);
  menuList.appendChild(item);
}

async function handleCopy(): Promise<void> {
  if (!isProblemPage()) {
    showToast("当前不是 Codeforces 题目页面", true);
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
    console.log("[Copy Algo Problems] copied Codeforces markdown:\n", markdown);
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

export const codeforcesHandler: PlatformHandler = {
  matches(loc: Location): boolean {
    return loc.host === "codeforces.com" && isProblemPage(loc);
  },
  ensureUI(): void {
    ensureButton();
  },
  buildMarkdown(): string {
    return buildProblemMarkdown();
  },
};
