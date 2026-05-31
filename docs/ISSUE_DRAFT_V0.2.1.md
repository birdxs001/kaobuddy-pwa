# [Fix] v0.2.1 UX 修复批次

## 背景

v0.2.0 已实现项目侧边栏、知识模块看板、错题/薄弱项/模考记录等核心功能。日常使用中发现 4 个 UX 问题需要在 v0.2.1 修复。

---

## Issue 1：PDF / 文档导入体验不舒服

### 现状
上传 PDF 后主要依赖文字层。扫描 PDF、含图片/图表的课件页面文本层为空或极稀疏。资料导入还只能一次选一个文件，误传后不能删除。

### 目标
- 资料导入第一入口改成批量上传 PDF / DOC / DOCX 等课件教材
- PDF 同时读取文字层和页面画面，有 API Key 时用 AI 识别图表、截图、公式和扫描页
- 没有 API Key 时也能先保存文字层，并给出清楚提示
- 资料库支持删除

### 涉及文件
- `src/fileReaders.ts`
- `src/App.tsx`
- `src/storage.ts`

---

## Issue 2：AI 生成计划后结果出现在页面底部

### 现状
点击「调用 AI 生成计划」后，AI 结果追加在计划页底部的「AI 结果」区域。页面很长，用户以为没反应，体验不像产品流程。

### 目标
- 生成成功后自动切换到「计划结果确认」视图
- 该视图展示 AI 计划内容 + 「拆成知识模块」按钮 + 「返回修改」按钮
- 不破坏现有四个主 Tab

### 涉及文件
- `src/App.tsx`

---

## Issue 3：AI 结果直接显示 Markdown 原文

### 现状
AI 返回的 Markdown 文本（`**加粗**`、`### 标题`、`<br>` 等）直接当纯文本显示，对普通用户不友好。

### 目标
- 后端 prompt 明确要求 AI 不输出 Markdown
- 前端保存和展示时做轻量 Markdown 清理
- 不安装第三方 Markdown 库

### 涉及文件
- `backend/app/prompts.py`
- `src/App.tsx`

---

## Issue 4：看板模块卡片太长

### 现状
模块卡片的 `note` 字段完整显示 AI 原文，卡片很长，拖动笨重。学习计划看板应该是简洁的任务卡片。

### 目标
- 卡片只显示：知识点名称（截断）和预计时间
- 手动加模块只保留知识点名称和预计时间两个核心输入
- 拖动时卡片保持短小，不让备注把看板撑长

### 涉及文件
- `src/App.tsx`
- `src/styles.css`

---

## 修改顺序

Issue 4 → Issue 2 → Issue 3 → Issue 1（先修流程和卡片，再补资料识别）

## 验收标准

- [x] `node node_modules/typescript/bin/tsc --noEmit` 通过
- [x] `node node_modules/vite/bin/vite.js build` 通过
- [x] `.venv/bin/pytest -q` 通过
- [x] `python3 -m py_compile backend/app/*.py` 通过
- [ ] GitHub CLI 不可用，待安装后同步为正式 GitHub issue / PR
