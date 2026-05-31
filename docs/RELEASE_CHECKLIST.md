# v0.2.0 发布检查

发布日期：2026-05-31

## 发布目标

第二版把考搭子从单页工具推进到项目化学习工作台：Mac / Windows 都能双击启动，首页连接 AI 和创建项目，进入项目后用总览、资料、计划、复盘分页推进。

## 已完成

- [x] FastAPI 后端接口可启动。
- [x] FastAPI 可直接托管 React/Vite 构建后的页面。
- [x] `open-kaobuddy.command` 可作为 macOS 本地启动入口。
- [x] `open-kaobuddy.bat` 可作为 Windows 本地启动入口。
- [x] API 设置默认只显示平台和 API Key。
- [x] 首页标题保留“考搭子”，并提供 AI 连接和创建项目入口。
- [x] 支持左侧项目侧边栏。
- [x] 支持项目内总览、资料、计划、复盘分页。
- [x] 支持 AI 计划拆成知识点模块。
- [x] 支持模块在待学、学习中、已完成之间拖拽。
- [x] 支持错题、薄弱项和模考记录。
- [x] IndexedDB v2 本地保存项目、资料、AI 输出和学习闭环数据。
- [x] JSON v2 导出导入，并兼容 v1 导入。
- [x] README、Roadmap、Changelog 已准备。

## 验证记录

- [x] `.venv/bin/pytest -q`
- [x] `node node_modules/typescript/bin/tsc --noEmit`
- [x] `python3 -m py_compile backend/app/*.py`
- [x] `node node_modules/vite/bin/vite.js build`
- [ ] Windows 双击 `open-kaobuddy.bat` 可见验收

## 已知限制

- Windows 启动脚本已写好，但当前这台机器无法真实双击验证 Windows。
- B站字幕导入仍依赖公开字幕和页面可访问性，失败时需要手动粘贴字幕或重点。
- PDF 页面视觉识别已经接入 AI，但效果会受模型能力、课件清晰度和页数影响。
- 手机端拖拽不如桌面端顺手，移动端先用延期和容量提示辅助调整。

## v0.2.0 发布口径

考搭子 v0.2.0 开始像一个每天能打开用的备考工作台：不同科目在侧边栏里切换，每个项目都有自己的资料、模块计划和复盘记录。
