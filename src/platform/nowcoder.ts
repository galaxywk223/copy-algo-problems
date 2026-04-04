export const nowcoderHandler = {
  matches(loc: Location): boolean {
    return loc.host.includes("nowcoder.com");
  },
  ensureUI() {},
  buildMarkdown() { return ""; },
};
