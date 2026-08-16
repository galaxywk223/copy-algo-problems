import { leetcodeHandler } from "./platform/leetcode";
import { codeforcesHandler } from "./platform/codeforces";
import { nowcoderHandler } from "./platform/nowcoder";
import { hduHandler } from "./platform/hdu";
import { acwingHandler } from "./platform/acwing";
import { luoguHandler } from "./platform/luogu";
import { atcoderHandler } from "./platform/atcoder";
import { lanqiaoHandler } from "./platform/lanqiao";
import type { PlatformHandler } from "./platform";

const handlers: PlatformHandler[] = [
  leetcodeHandler,
  codeforcesHandler,
  nowcoderHandler,
  hduHandler,
  acwingHandler,
  luoguHandler,
  atcoderHandler,
  lanqiaoHandler,
];

function pickHandler(): PlatformHandler | null {
  const h = handlers.find((h) => h.matches(window.location));
  return h || null;
}

function init() {
  const handler = pickHandler();
  if (!handler) return;
  handler.ensureUI();
}

window.addEventListener("load", init);
setTimeout(init, 800);
