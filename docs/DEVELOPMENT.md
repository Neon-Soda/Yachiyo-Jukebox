# 开发与构建

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

`setup` 安装 Bot 与 Activity 的 JavaScript 依赖。Node、yt-dlp、FFmpeg 和 FFprobe 的可执行文件不提交到 Git，需要按 [工具说明](../tools/README.md) 放入 `tools/win32-x64/`。

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

检查使用真实 WebView2 和 Rust、独立资料目录及测试凭据，不登录真实 Bot。覆盖设置、SSH 导入、主题、预览隔离、语言、关闭窗口释放进程及重开恢复草稿。调试端口与对话框测试入口仅在独立开发测试模式可用。

## 输出与可选维护配置

- `.local/target/`：Rust 与 Tauri 构建中间产物。
- `dist/`、`bot/activity/dist/`：前端构建产物。
- `stage/`：打包所需的干净运行资源。
- `releases/`：默认的最终安装包与 SHA-256 文件。

如需自定义最终发行目录，可创建被 Git 忽略的 `.local/host.json`，设置绝对路径形式的 `releaseDirectory`。不设置时使用仓库内的 `releases/`。以下路径仅为示例：

```json
{
  "releaseDirectory": "C:/Builds/Yachiyo/releases"
}
```

日常启动直接打开安装后的应用。桌面自启、Bot 和 SSH 的生命周期均由应用管理，不要求创建额外的 Windows 计划任务。

发行审计检查资源范围、依赖与校验值，并可在内存中对照构建环境提供的凭据；它不需要任何历史归档或已有用户资料。

## 修改约定

桌面界面位于 `src/`，本机接口位于 `src-tauri/src/`，音乐功能位于 `bot/`。新增 Activity 文案在 `bot/shared/catalog.json` 注册，并保留运行时需要的占位符。

依赖版本由 npm 和 Cargo 锁文件记录。更新外部运行工具时同步更新来源、许可及校验清单。提交前运行与变更相关的测试，避免提交个人资料、生成目录或下载的二进制文件。
