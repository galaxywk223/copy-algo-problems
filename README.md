# Copy Algo Problems

[中文文档](./README.zh-CN.md)

Copy Algo Problems is a lightweight Chromium browser extension that injects a copy button into online programming problem pages and writes cleaned Markdown problem statements to the system clipboard.

The current implementation supports LeetCode, Codeforces, and Lanqiao. NowCoder, AcWing, Luogu, and AtCoder have placeholder adapters in the source tree, but page extraction and UI injection are not implemented for those platforms yet.

## Features

- Injects a copy button into supported problem pages.
- Copies cleaned Markdown to the system clipboard.
- Extracts title, URL, difficulty, tags, and statement body where available.
- Converts common rich-text structures to Markdown, including headings, lists, code blocks, tables, blockquotes, and images.
- Handles route changes and DOM updates in single-page application environments.

## Support Status

### Available

- LeetCode
  - `https://leetcode.com/problems/*`
  - `https://leetcode.com/contest/*`
  - `https://leetcode.cn/problems/*`
  - `https://leetcode.cn/contest/*`
- Codeforces
  - `https://codeforces.com/contest/*/problem/*`
  - `https://codeforces.com/problemset/problem/*`
- Lanqiao
  - `https://www.lanqiao.cn/problems/*`
  - Login may be required before the problem statement is visible.

### Placeholder Adapters

- NowCoder
- AcWing
- Luogu
- AtCoder

Notes:

- The source tree already contains handler files for the placeholder platforms, but `ensureUI()` and `buildMarkdown()` remain empty implementations.
- `manifest.json` currently declares host permissions for LeetCode, Codeforces, and Lanqiao, so the loaded browser extension is limited to those implemented platforms.
- On Lanqiao problem pages, the copy button is placed in the bottom navigation bar before the random-problem action.

## Markdown Output

The generated Markdown usually includes:

- Problem title
- Problem URL
- Difficulty, when available
- Tags, when available
- Submission statistics, when available
- Statement body
- Current editor code, when available
- Examples, constraints, input/output descriptions, samples, and other structured page content

The exact output depends on the target site's DOM structure. Site layout changes can cause missing fields or formatting deviations.

## Installation

### Install From GitHub Releases

1. Open the [Releases](https://github.com/galaxywk223/copy-algo-problems/releases) page.
2. Download the latest `copy-algo-problems-<version>.zip` extension archive.
3. Extract the archive to a local directory.
4. Open the Chrome or Edge extensions management page.
5. Enable developer mode.
6. Select "Load unpacked".
7. Select the extracted extension directory.

The release archive contains the required `manifest.json`, `assets/`, and `dist/` files. Node.js and local build commands are not required for normal installation from a release archive.

### Build From Source

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

The build generates the content script:

- `dist/content.js`

For Chrome or Edge, the extension management page loads the project root directory `copy-algo-problems`. The browser reads the root `manifest.json` file and injects `dist/content.js` into matching pages.

## Usage

1. Open a supported problem page.
2. Wait for the page to finish loading.
3. Click the injected copy button.
4. The extension writes the cleaned Markdown to the clipboard.
5. The copied content can be pasted into a Markdown editor, Obsidian, note software, or a local file.

Copy failures are usually caused by one of the following conditions:

- The browser developer console contains a runtime error.
- The current page is outside the supported platform and URL range.
- Clipboard permission is blocked by the browser or page environment.
- The target site changed its page structure and the platform selectors need an update.

## Development

### Commands

```bash
npm install
npm run build
npm run dev
npm run package
```

Command meanings:

- `npm run build`: runs a one-time extension build.
- `npm run dev`: runs esbuild in watch mode for content-script debugging.
- `npm run package`: builds the extension and creates a release archive under `release/`.

### Release Workflow

GitHub Actions can generate a downloadable extension archive after a version tag is pushed:

1. Update the version in [manifest.json](./manifest.json).
2. Commit and push the change.
3. Create and push a tag such as `v0.2.0`.
4. GitHub Actions builds the extension and uploads `release/*.zip` to GitHub Releases.

The workflow file is located at:

- `.github/workflows/release.yml`

### Project Structure

```text
copy-algo-problems/
|-- assets/              extension icon assets
|-- dist/                build output directory
|-- src/
|   |-- core/            clipboard, DOM, Markdown, and UI helpers
|   |-- platform/        online judge platform adapters
|   `-- content.ts       content script entry point
|-- esbuild.config.mjs   build configuration
|-- manifest.json        browser extension manifest
`-- package.json         project scripts and dependencies
```

### Tech Stack

- TypeScript
- esbuild
- Manifest V3 browser extension

### Implementation Notes

- The entry point is `src/content.ts`.
- Platform handlers determine whether the current page is supported.
- The extension injects a copy button on matching pages.
- The page DOM is converted to Markdown before the clipboard API is called.
- The current build targets are `chrome120` and `edge120`.

## Permissions And Privacy

The extension declares a small permission surface:

- `clipboardWrite`
  - Writes cleaned Markdown to the system clipboard.
- `host_permissions`
  - Limits content-script access to LeetCode, Codeforces, and Lanqiao problem pages.
  - Allows the content script to read visible problem content on those pages.

The project is designed for local page extraction and clipboard copying. The codebase does not include remote upload logic or built-in server communication.

Important boundaries:

- Original problem content still comes from third-party online judge platforms.
- Login state, visible problem content, and page availability are controlled by the target platform.
- Platform terms of service, copyright rules, and usage limits remain applicable to copied problem content.

## Limitations

- The extension currently targets Chromium-based browsers such as Chrome and Edge.
- Page extraction depends on target-site DOM structures. Selector updates may be required after site redesigns.
- Placeholder platforms have source files but are not implemented and should not be treated as supported.
- The repository currently has no automated tests. Functional verification is mainly manual on real problem pages.
- When `navigator.clipboard` is blocked by the browser or page environment, the implementation falls back to `document.execCommand("copy")`.

## Roadmap

- Complete platform adapters for NowCoder, AcWing, Luogu, and AtCoder.
- Add more resilient selectors and fallback strategies for each platform.
- Add more Markdown cleanup rules to reduce formatting noise.
- Add automated tests or minimal regression checks.
- Add demo screenshots or sample Markdown output to the README.

## License And Copyright

Project code is released under the [MIT License](./LICENSE).

Additional boundaries:

- Source code, build scripts, and documentation in this repository follow the MIT License.
- Original problem statements, examples, descriptions, tags, and related content from online judge platforms remain owned by the corresponding platforms and rights holders.
- This project only provides page-content cleanup and Markdown copy assistance. It does not transfer or grant copyright for original problem content.

## Contribution Notes

Recommended contribution areas:

- Complete page matching, button injection, and Markdown extraction for placeholder platforms.
- Keep `manifest.json` host permissions aligned with actually supported platforms.
- Add robust fallback logic for target-site DOM changes.
- Include target page links, failure descriptions, and expected Markdown output in issues or pull requests.
