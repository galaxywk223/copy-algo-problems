export const atcoderHandler = {
  matches(loc: Location): boolean {
    return loc.host.includes("atcoder.jp");
  },
  ensureUI() {},
  buildMarkdown() { return ""; },
};
