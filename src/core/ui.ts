const TOAST_ID = "cap-copy-helper-toast";

export function showToast(message: string, isError: boolean = false): void {
  const oldToast = document.getElementById(TOAST_ID);
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.top = "60px";
  toast.style.right = "16px";
  toast.style.zIndex = "999999";
  toast.style.padding = "8px 12px";
  toast.style.background = isError ? "#cf1322" : "#222";
  toast.style.color = "#fff";
  toast.style.fontSize = "14px";
  toast.style.borderRadius = "8px";
  toast.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.2)";
  toast.style.maxWidth = "360px";
  toast.style.wordBreak = "break-word";

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

export function createCopyButton(buttonId: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = buttonId;
  button.type = "button";
  button.textContent = "复制题目";
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.gap = "6px";
  button.style.padding = "4px 10px";
  button.style.border = "none";
  button.style.borderRadius = "9999px";
  button.style.background = "var(--fill-secondary, #f3f4f6)";
  button.style.color = "var(--text-secondary-foreground, #262626)";
  button.style.fontSize = "12px";
  button.style.lineHeight = "20px";
  button.style.cursor = "pointer";
  button.style.whiteSpace = "nowrap";

  button.addEventListener("mouseenter", () => {
    button.style.filter = "brightness(0.96)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.filter = "none";
  });

  button.addEventListener("click", onClick);

  return button;
}
