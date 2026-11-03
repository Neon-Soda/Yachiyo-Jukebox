# 开发与构建

**简体中文** · [English](DEVELOPMENT.en.md) · [文档目录](README.md)

## 环境

当前桌面代码使用 Windows API，目标为 Windows 10/11 x64。需要：

- Node.js 24+ 与 npm。
- Rust 稳定版 MSVC 工具链与 Cargo。
- Visual Studio 的「使用 C++ 的桌面开发」组件及 Windows SDK。
- Microsoft Edge WebView2 运行时。

平台环境说明见 [Tauri Windows 前置条件](https://v2.tauri.app/start/prerequisites/)。构建脚本通过 `vswhere` 定位 C++ 工具，优先使用 `.local/toolchains` 中的 Rust；该目录不存在时使用 PATH 中的 Cargo。

## 安装依赖与运行工具

在仓库根目录运行：

```powershell
npm ci
npm run setup
```

`setup` 安装 Bot 与 Activity 的 JavaScript 依赖。构建前按 [工具说明](../tools/README.md) 将 Node.js 的 `node.exe` 放入 `tools/win32-x64/`。FFmpeg、FFprobe 和 yt-dlp 由使用者在应用中选择，不进入构建资源；任何下载的二进制均不提交到 Git。

```powershell
npm run stage
npm start
```

`stage` 构建 Activity 并生成运行资源；`start` 启动 Tauri 开发环境。开发模式默认使用项目内的独立 `user-data/`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run build:ui` | Vue 类型检查与桌面界面构建 |
| `npm run activity:build` | 构建 Discord Activity |
| `npm run stage` | 准备允许打包的运行资源 |
| `npm test` | Node Bot 与兼容性测试 |
| `npm run test:rust` | Rust 配置、凭据和进程生命周期测试 |
| `npm run dist` | 构建 Windows NSIS 安装包并进行发行审计 |

Rust 构建包装脚本 `windows/tauri-build.ps1` 支持 `dev`、`debug`、`test`、`check` 和 `release`。

## 界面集成检查

先准备 `stage`，停止同应用标识的运行实例，然后执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows/tauri-build.ps1 -Mode debug
npm run test:ui
```

检查使用真实 WebView2 和 Rust、独立资料目录及测试凭据，不登录真实 Bot。覆盖首次工具引导、设置、SSH 导入、主题、预览隔离、语言、关闭窗口释放进程及重开恢复草稿。设置 `YACHIYO_TOOL_TEST_DIR` 为含三个媒体工具的目录，可额外验证原生文件选择、自动配对、音频检查、错误文件及路径失效；测试会将工具复制到独立测试资料目录。调试端口与对话框测试入口仅在独立开发测试模式可用。

## 输出与可选维护配置

- `.local/target/`：Rust 与 Tauri 构建中间产物。
- `dist/`、`bot/activity/dist/`：前端构建产物。
- `stage/`：打包所需的干净运行资源。
- `releases/<版本>/`：每个版本独立保存安装包、SHA-256 校验文件和 `release.json` 归档记录。

如需自定义最终发行目录，可创建被 Git 忽略的 `.local/host.json`，设置绝对路径形式的 `releaseDirectory`。不设置时使用仓库内的 `releases/`。以下路径仅为示例：

```json
{
  "releaseDirectory": "C:/Builds/Yachiyo/releases"
}
```

日常启动直接打开安装后的应用。桌面自启、Bot 和 SSH 的生命周期均由应用管理，不要求创建额外的 Windows 计划任务。

发行审计拒绝 FFmpeg、FFprobe、yt-dlp 可执行文件及个人工具配置进入安装资源，并检查资源范围、依赖与校验值，并可在内存中对照构建环境提供的凭据；它不需要任何历史归档或已有用户资料。

## 项目元信息

`project.json` 记录公开仓库地址与版权署名，由 Vue 信息页和 Rust 链接入口共同使用。项目信息页内置根目录 `LICENSE` 及第三方总声明；安装资源中同时保留 `runtime/licenses/Yachiyo-LICENSE.txt`。应用版本以 npm / Cargo / Tauri 清单为准，发行时保持一致。

## 修改约定

桌面界面位于 `src/`，本机接口位于 `src-tauri/src/`，音乐功能位于 `bot/`。新增 Activity 文案在 `bot/shared/catalog.json` 注册，并保留运行时需要的占位符。

依赖版本由 npm 和 Cargo 锁文件记录。更新外部运行工具时同步更新来源、许可及校验清单。提交前运行与变更相关的测试，避免提交个人资料、生成目录或下载的二进制文件。

## 源码目录

| 路径 | 内容 |
| --- | --- |
| `src/` | Vue / TypeScript 桌面界面 |
| `src-tauri/src/` | Rust 窗口、托盘、进程、凭据和本机接口 |
| `bot/src/` | Node Bot、媒体解析、搜索、缓存和 Activity API |
| `bot/activity/` | Discord Activity 前端 |
| `bot/shared/` | 共享主题与文案定义 |
| `core/` | SSH 解析与兼容性校验 |
| `test/`、`bot/test/` | Node 测试；Rust 测试位于相应模块中 |
| `scripts/`、`windows/` | 构建与测试脚本 |
| `assets/`、`licenses/`、`tools/` | 图标、许可、工具清单与说明 |

## 参与贡献

问题反馈和 Pull Request 使用[本项目仓库](https://github.com/Neon-Soda/Yachiyo-Jukebox)。说明要解决的具体问题、复现步骤和验证结果；界面变化可附不含个人资料的截图。

保持中文与英文 README、docs 以及工具说明同步，使用相对文档链接，下载入口指向本项目 Releases。修改文档无需重新安装运行中的 Bot。功能变更运行对应的测试；不要提交 `user-data/`、`.local/`、构建产物、Cookie、凭据或下载的可执行文件。

贡献的项目代码与文档沿用 [MIT](../LICENSE)，引用或新增第三方内容时保留其许可与来源。不要把私有部署记录混入公共文档。

## 发行归档

每次 `npm run dist` 在发行审计通过后自动创建版本子目录，保留安装包、同名 `.sha256` 和 `release.json`（版本、归档时间、文件大小与摘要）。发布新版本时保留所有旧版本。

再次归档相同版本且文件一致时复用现有记录；同版本安装包不同或归档不完整时停止，不覆盖旧文件。修改发行内容请递增版本号后重新构建。归档先写入临时子目录，验证完成后再移动到最终版本目录。

`.local/host.json` 中的 `releaseDirectory` 配置的是归档根目录，版本子目录由脚本创建。安装包与本机记录不提交到 Git；对外发行仍通过本项目 GitHub Releases。
