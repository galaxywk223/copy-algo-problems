export const luoguHandler = {
  matches(loc: Location): boolean {
    return loc.host.includes("luogu.com.cn");
  },
  ensureUI() {},
  buildMarkdown() { return ""; },
};
