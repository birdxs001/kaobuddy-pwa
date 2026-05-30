# v0.1.0 发布检查

发布日期：2026-05-30

## 发布目标

第一版先让考搭子具备完整的单人备考闭环：创建项目、导入资料、接入自己的 API、生成计划、学习讲解、刷题、短模考和本地备份。

## 已完成

- [x] FastAPI 后端接口可启动。
- [x] React PWA 前端主流程已完成。
- [x] 支持 OpenAI-compatible API 配置。
- [x] 支持文本、Markdown、TXT、PDF、手写资料和视频链接导入。
- [x] IndexedDB 本地保存项目、资料和 AI 输出。
- [x] JSON 导出导入。
- [x] README、Roadmap、Changelog 已准备。

## 验证记录

- [x] `.venv/bin/pytest -q`
- [x] `node node_modules/typescript/bin/tsc --noEmit`
- [ ] `npm run build`

## 已知限制

- 当前本机 `npm run build` 卡在 macOS 对 Rollup 原生包的签名校验，TypeScript 检查已通过。
- B站字幕导入依赖公开字幕和页面可访问性，失败时需要手动粘贴字幕或重点。
- 扫描 PDF 的逐页转图 OCR 还没有做。

## v0.1.0 发布口径

考搭子 v0.1.0 是一个可以在手机上试用的备考 PWA MVP，重点不是功能堆满，而是先把资料、计划、学习、练习和模考串成一个能跑通的工作流。

