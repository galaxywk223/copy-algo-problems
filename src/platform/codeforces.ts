export const codeforcesHandler = {
  matches(loc: Location): boolean {
    return loc.host.includes("codeforces.com");
  },
  ensureUI() {},
  buildMarkdown() { return ""; },
};
