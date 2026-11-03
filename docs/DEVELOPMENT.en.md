# Development and builds

[简体中文](DEVELOPMENT.md) · **English** · [Documentation](README.en.md)

## Environment

Native desktop components use Windows APIs and target Windows 10 / 11 x64. You need:

- Node.js 24+ and npm.
- Stable Rust MSVC and Cargo.
- Visual Studio's Desktop development with C++ workload and the Windows SDK.
- Microsoft Edge WebView2 Runtime.

See [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/). The build wrapper locates C++ tools through `vswhere`, prefers Rust under `.local/toolchains`, and otherwise uses Cargo from PATH.

## Dependencies and runtime tools

From the repository root:

```powershell
npm ci
npm run setup
```

`setup` installs Bot and Activity JavaScript dependencies. Before staging, provision `node.exe` in `tools/win32-x64/` according to the [tool guide](../tools/README.en.md). FFmpeg, FFprobe, and yt-dlp are selected by users in the application and are not build resources. Do not commit downloaded binaries.

```powershell
npm run stage
npm start
```

`stage` builds the Activity and prepares runtime resources. `start` launches the Tauri development environment, using a separate `user-data/` directory in this checkout by default.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build:ui` | Vue type checking and desktop UI build |
| `npm run activity:build` | Build the Discord Activity |
| `npm run stage` | Prepare allowed installer resources |
| `npm test` | Node Bot and compatibility tests |
| `npm run test:rust` | Rust configuration, credentials, and process lifecycle tests |
| `npm run dist` | Build a Windows NSIS installer and audit release resources |

The Rust wrapper, `windows/tauri-build.ps1`, accepts `dev`, `debug`, `test`, `check`, and `release`.

## UI integration checks

Prepare `stage`, stop running instances with the same application identity, then execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows/tauri-build.ps1 -Mode debug
npm run test:ui
```

Checks use real WebView2 and Rust with an isolated profile and test credentials, without logging in a real bot. They cover initial tool guidance, settings, SSH import, themes, preview isolation, language, process release on window close, and draft restoration. Set `YACHIYO_TOOL_TEST_DIR` to a directory with all three media executables to additionally validate native selection, pairing, audio checks, invalid files, and moved paths. Tests copy tools into the isolated test profile. Debug ports and dialog test entry points are available only in the separate development test mode.

## Outputs and optional local configuration

- `.local/target/`: Rust and Tauri build intermediates.
- `dist/`, `bot/activity/dist/`: frontend build output.
- `stage/`: clean runtime resources for packaging.
- `releases/<version>/`: a separate folder for each installer, its SHA-256 checksum, and a `release.json` archive record.

To change the final release directory, create a Git-ignored `.local/host.json` with an absolute `releaseDirectory`. Without it, the project uses its own `releases/`. This path is only an example:

```json
{
  "releaseDirectory": "C:/Builds/Yachiyo/releases"
}
```

For normal use, open the installed application. The application manages login startup, the bot, and SSH lifetimes; extra Windows scheduled tasks are not required.

The release audit rejects FFmpeg, FFprobe, yt-dlp executables, and personal tool settings in installer resources. It also checks the resource scope, dependencies, and checksums, and can compare against build-environment credentials in memory. It does not require historical archives or an existing user profile.

## Project metadata

`project.json` records the public repository and copyright holder, shared by the Vue Info page and Rust link handlers. The root `LICENSE` and third-party overview are embedded for offline viewing. Installer resources also include `runtime/licenses/Yachiyo-LICENSE.txt`. Keep npm, Cargo, and Tauri application versions consistent.

## Change conventions

Desktop UI lives in `src/`, native interfaces in `src-tauri/src/`, and music features in `bot/`. Register new Activity copy in `bot/shared/catalog.json` and preserve required placeholders.

npm and Cargo lockfiles record dependency versions. When changing bundled tools, update their source, license, and checksum records. Run relevant checks before submitting changes, and exclude personal profiles, generated directories, and downloaded binaries.

## Source layout

| Path | Contents |
| --- | --- |
| `src/` | Vue / TypeScript desktop UI |
| `src-tauri/src/` | Rust windows, tray, processes, credentials, and native interfaces |
| `bot/src/` | Node bot, media parsing, search, cache, and Activity API |
| `bot/activity/` | Discord Activity frontend |
| `bot/shared/` | Shared themes and copy catalog |
| `core/` | SSH parsing and compatibility validation |
| `test/`, `bot/test/` | Node tests; Rust tests live with their modules |
| `scripts/`, `windows/` | Build and test scripts |
| `assets/`, `licenses/`, `tools/` | Icons, licenses, tool manifest, and guides |

## Contributing

Use [this repository](https://github.com/Neon-Soda/Yachiyo-Jukebox) for issues and pull requests. Describe the concrete problem, reproduction steps, and validation. UI changes can include screenshots with personal information removed.

Keep Chinese and English READMEs, docs, and tool guides in sync. Use relative documentation links and this project's Releases for application downloads. Documentation edits do not require reinstalling a running bot. Run relevant tests for code changes. Never commit `user-data/`, `.local/`, build output, cookies, credentials, or downloaded executables.

Project code and documentation contributions use [MIT](../LICENSE). Preserve licensing and attribution for third-party additions. Keep private deployment notes out of public documentation.

## Release archives

After a successful release audit, `npm run dist` creates a version folder containing the installer, matching `.sha256`, and `release.json` (version, archive time, size, and checksum). Keep earlier versions when publishing a new one.

An identical installer for the same version reuses the existing record. A different installer or incomplete existing archive stops the operation without overwriting it. Increment the version before distributing changed release contents. Files are prepared and verified in a temporary child directory before it is moved into the final version location.

The `releaseDirectory` setting in `.local/host.json` names the archive root; the script creates version subfolders. Do not commit installers or local records to Git. Public distribution still uses this project's GitHub Releases.
