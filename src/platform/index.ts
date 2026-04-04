export interface PlatformHandler {
  matches(loc: Location): boolean;
  ensureUI(): void;
  buildMarkdown(): string;
}
