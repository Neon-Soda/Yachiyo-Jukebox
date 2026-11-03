# Repository guidance / 仓库约定

- Treat this checkout as the source of truth. Make source, test, and documentation changes here; do not maintain a second public-source mirror. / 以当前仓库为唯一源码，代码、测试和文档均在这里修改，不维护另一份公开源码镜像。
- Keep `README.md` / `README.en.md`, every document in `docs/`, and both tool guides aligned. / 保持 README、docs 和工具说明的中英文版本同步。
- Keep credentials, personal settings, local deployment notes, caches, downloaded executables, and build output out of Git and installer resources. Never print tokens, cookies, SSH private keys, or raw credential-bearing logs. / 个人数据与构建产物不得提交或打包，不输出凭据及含凭据的原始日志。
- Use `project.json` for repository identity and keep npm, Cargo, and Tauri versions consistent. Application download links belong to this repository's Releases; media-tool links go to upstream providers. / 项目地址集中在 project.json，保持版本一致，应用下载指向本仓库 Releases，媒体工具指向上游。
- Follow `docs/DEVELOPMENT.md` or `docs/DEVELOPMENT.en.md` for builds and relevant validation. Do not restart a running bot for documentation-only edits. / 构建和验证参考开发指南，仅改文档时无需重启 Bot。
- If `.local/MAINTENANCE.md` exists, read it for private host context. It is optional, ignored by Git, and must never be copied into public documentation. / 若存在 .local/MAINTENANCE.md，可读取本机维护上下文；它是可选的私有文件，不得复制到公开文档。

- Archive every release under `releases/<version>/` (or the configured release root), keeping the installer, checksum, and release record. Preserve previous versions; never overwrite an archived version with different contents. / 每个版本都在 releases 的独立版本目录留档，保留安装包、校验和版本记录；保留所有旧版本，不用不同内容覆盖已归档版本。

- Use “Yachiyo Jukebox” as the product name in public documentation. Preserve technical filenames, commands, identifiers, and URLs. Omit documentation-layout inspiration credits while retaining required third-party notices. / 对外文档使用完整产品名“Yachiyo Jukebox”；保留技术文件名、命令、标识和链接，不添加文档布局灵感致谢，保留必要的第三方许可声明。
