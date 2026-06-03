# Copy Algo Problems

一个面向 Chromium 浏览器的轻量扩展，用来在在线算法题页面上注入“复制题目”按钮，并将题面整理为 Markdown 后写入剪贴板。

当前仓库基于真实实现状态维护文档：已经可用的平台是 LeetCode、Codeforces 和蓝桥云课；NowCoder、AcWing、洛谷、AtCoder 目前只有占位适配器，还没有完成页面提取与 UI 注入。

## 功能特性

- 在支持的题目页面中注入“复制题目”按钮
- 一键复制整理后的 Markdown 到系统剪贴板
- 自动提取标题、链接、难度、标签和题面正文等信息
- 对常见富文本结构做 Markdown 转换，包括标题、列表、代码块、表格、引用与图片
- 适配单页应用场景下的路由切换与 DOM 变化，尽量保持按钮持续可见

## 当前支持情况

### 已实现并可用

- LeetCode
  - `https://leetcode.com/problems/*`
  - `https://leetcode.com/contest/*`
  - `https://leetcode.cn/problems/*`
  - `https://leetcode.cn/contest/*`
- Codeforces
  - `https://codeforces.com/contest/*/problem/*`
  - `https://codeforces.com/problemset/problem/*`
- 蓝桥云课
  - `https://www.lanqiao.cn/problems/*`
  - 题面通常需要登录后才可见。

### 已有占位适配器，但尚未完成

- NowCoder
- AcWing
- 洛谷
- AtCoder

说明：

- 源码中已经预留了上述平台的 handler 文件，但当前 `ensureUI()` 和 `buildMarkdown()` 仍为空实现。
- `manifest.json` 目前声明了 LeetCode、Codeforces 和蓝桥云课所需的站点权限，因此浏览器实际可加载的范围以这些已实现平台为准。
- 蓝桥云课题目页中，复制按钮位于底部导航栏，并放置在“随机一题”按钮左侧。

## 复制后的 Markdown 内容

在已支持平台上，扩展会尽量生成结构清晰的 Markdown，通常包含：

- 题目标题
- 题目链接
- 难度信息（如页面可提取）
- 标签信息（如页面可提取）
- 提交统计信息（如页面可提取）
- 题面正文
- 当前编辑器代码（如页面可提取）
- 示例、约束、输入输出说明、样例等页面正文中的结构化内容

实际输出会受目标站点 DOM 结构影响。如果题面页面更新了结构，提取结果可能出现缺项或格式偏差。

## 安装方式

### 给普通用户：从 GitHub Releases 安装

1. 打开仓库的 [Releases](https://github.com/galaxywk223/copy-algo-problems/releases) 页面
2. 下载最新版本的扩展压缩包 `copy-algo-problems-<version>.zip`
3. 将压缩包解压到本地任意目录
4. 打开 Chrome / Edge 扩展管理页
5. 开启“开发者模式”
6. 选择“加载已解压的扩展程序”
7. 选择解压后的扩展目录

说明：

- Release 压缩包中已经包含运行所需的 `manifest.json`、`assets/` 和 `dist/`
- 普通使用者不需要安装 Node.js，也不需要自己执行构建命令

### 给开发者：从源码构建后加载

#### 1. 安装依赖

```bash
npm install
```

#### 2. 构建扩展

```bash
npm run build
```

构建完成后，会生成内容脚本：

- `dist/content.js`

#### 3. 在浏览器中加载

以 Chrome / Edge 为例：

1. 打开扩展管理页
2. 开启“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选择当前项目根目录 `copy-algo-problems`

加载成功后，浏览器会读取根目录下的 `manifest.json`，并在匹配页面注入 `dist/content.js`。

## 使用说明

1. 进入已支持平台的题目页面
2. 等待页面加载完成
3. 点击页面中注入的复制按钮
4. 扩展会将整理后的 Markdown 写入剪贴板
5. 将内容粘贴到 Markdown 编辑器、Obsidian、笔记软件或本地文件中

复制失败通常对应以下情况：

- 浏览器开发者工具的 Console 中存在报错
- 当前页面不属于支持的平台和 URL 范围
- 浏览器阻止剪贴板权限
- 目标站点页面结构发生变化，需要更新对应平台选择器

## 开发说明

### 常用命令

```bash
npm install
npm run build
npm run dev
npm run package
```

说明：

- `npm run build`：执行一次性构建
- `npm run dev`：以 watch 模式运行 esbuild，便于调试内容脚本
- `npm run package`：先构建，再生成可上传到 GitHub Releases 的扩展压缩包

### 发布 Release

GitHub 可通过 tag 自动生成可下载的扩展包：

1. 更新 [manifest.json](./manifest.json) 中的版本号
2. 提交并推送代码
3. 创建并推送形如 `v0.2.0` 的 tag
4. GitHub Actions 会自动执行构建，并在 Releases 中上传 `release/*.zip`

本仓库中的工作流文件位于：

- `.github/workflows/release.yml`

### 项目结构

```text
copy-algo-problems/
├─ assets/              # 扩展图标资源
├─ dist/                # 构建输出目录
├─ src/
│  ├─ core/             # 剪贴板、DOM、Markdown、UI 基础能力
│  ├─ platform/         # 各 OJ 平台适配器
│  └─ content.ts        # 内容脚本入口
├─ esbuild.config.mjs   # 构建配置
├─ manifest.json        # 浏览器扩展清单
└─ package.json         # 项目脚本与依赖
```

### 技术栈

- TypeScript
- esbuild
- Manifest V3 浏览器扩展

### 当前实现要点

- 入口文件为 `src/content.ts`
- 通过平台 handler 判断当前页面是否匹配
- 在匹配页面中注入复制按钮
- 将页面 DOM 转换为 Markdown 后调用剪贴板 API 写入
- 当前构建目标为 `chrome120` 与 `edge120`

## 权限与隐私

当前扩展声明的权限很少，主要用于完成复制能力：

- `clipboardWrite`
  - 用于将整理后的 Markdown 写入系统剪贴板
- `host_permissions`
  - 仅声明 LeetCode、Codeforces 与蓝桥云课的题目页访问范围
  - 目的是允许内容脚本在这些页面运行并读取可见题面内容

本项目的设计目标是本地执行页面提取与剪贴板复制，不包含远程上传逻辑，也没有内置服务端通信代码。

但请注意：

- 题面原始内容仍然来自第三方 OJ 平台
- 是否登录、是否能看到完整题面、页面里展示什么内容，都由目标平台决定
- 使用者应自行遵守目标平台的服务条款、版权规则与使用限制

## 限制与兼容性

- 当前仅适用于 Chromium 内核浏览器扩展环境，例如 Chrome、Edge
- 页面提取依赖目标站点的 DOM 结构，站点改版后可能需要更新选择器
- 占位平台虽然有源码文件，但尚未真正实现，不应视为已支持
- 当前仓库没有自动化测试；功能验证主要依赖手动在真实页面中检查
- 如果浏览器或页面环境阻止 `navigator.clipboard`，代码会退回到 `document.execCommand("copy")` 方案

## Roadmap

后续可继续补齐以下方向：

- 完成 NowCoder、AcWing、洛谷、AtCoder 的平台适配
- 为不同平台补充更稳定的 DOM 选择器和回退策略
- 增加更多 Markdown 清洗规则，减少格式噪声
- 补充自动化测试或最小化回归检查
- 在 README 中加入演示截图或示例输出

## 许可证与版权说明

本项目代码基于 [MIT License](./LICENSE) 开源。

补充说明：

- 本仓库中的源代码、构建脚本与文档遵循 MIT License
- 各 OJ 平台上的题面、样例、描述、标签等原始内容，其版权归对应平台及其权利人所有
- 本项目只提供页面内容整理与 Markdown 复制辅助，不转移、不授予原题面内容的版权

## 贡献建议

建议优先完善以下方向：

- 为占位平台补全页面匹配、按钮注入和 Markdown 提取逻辑
- 在 `manifest.json` 中补充与实际支持平台一致的站点权限
- 针对不同平台的 DOM 改版增加更稳健的容错逻辑
- 提交 issue 或 PR 时附上目标页面链接、失败现象和预期 Markdown 结果，便于复现与修复
