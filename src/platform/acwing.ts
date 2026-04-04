export const acwingHandler = {
  matches(loc: Location): boolean {
    return loc.host.includes("acwing.com");
  },
  ensureUI() {},
  buildMarkdown() { return ""; },
};
