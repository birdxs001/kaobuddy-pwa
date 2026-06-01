# 考搭子 KaoBuddy

考搭子是一款专注于临时抱佛脚的本地备考工具。

我做它不是想再造一个复杂学习系统，而是想要一个临近考试时真的能马上用起来的工作台：把课件、教材、笔记、PDF、Word、手写照片和视频字幕放进来，再用自己的 AI API 帮忙拆知识点、讲重点、生成模块练习和模拟考。

当前发布版就是 KaoBuddy 的第一版：本地运行、单人使用、数据存在自己的浏览器里，Mac 和 Windows 都可以双击启动。

## 它适合什么场景

- 课件、教材、往年题和笔记太散，想先收进一个项目里。
- 离考试没多久了，需要知道先学哪些知识点更划算。
- 想让 AI 按自己上传的资料生成计划，而不是泛泛讲一堆通用内容。
- 想按知识模块推进，学完一个勾一个。
- 想快速生成模拟考、导出 PDF 打印，或者做最后几天的速背。
- 想用自己的 API Key，不想做账号和云同步。

## 现在有什么

- **初始化流程**：第一次打开会先介绍考搭子的用途，再连接 AI，最后创建第一个项目。
- **项目侧边栏**：不同科目可以分开建项目，支持切换、编辑基本信息和删除项目。
- **资料库**：支持批量上传 PDF、DOCX、RTF、TXT、Markdown，也可以导入手写图片/PDF 和 B站等视频链接。
- **资料解析**：PDF 会读取文字层；DOCX/RTF 会提取正文；旧 `.doc` 建议另存为 DOCX 或 PDF 后再上传。
- **知识模块计划**：AI 根据导入资料拆出“进程、线程、死锁”这类具体知识点，而不是一串日期任务。
- **计划看板**：模块按待学习、学习中、已学习排列；待学习会按重要程度排序，也可以拖拽调整。
- **模块详情**：每个知识点都有“会考什么”、单独讲解和模块模拟题；已有题目时可以换一批。
- **模拟考**：可以填写考试时长和题型要求，生成短模考；历史记录只显示名称和生成时间，点进去看结果。
- **PDF 导出**：生成的模拟考可以导出成可打印 PDF。
- **临考速背**：把知识点压缩成速背卡片，支持生成、斩掉、撤销和重置。
- **本地存储**：项目、资料、计划和 AI 结果默认存在浏览器 IndexedDB 里。

## 自己的 API

考搭子按 OpenAI-compatible 的 `/chat/completions` 接口来接模型。内置预设：

- DeepSeek
- Kimi 国内
- Kimi 国际
- OpenAI
- 自定义 OpenAI-compatible

日常只需要选择平台、填写 `API Key`。`Base URL` 和 `Model` 放在高级设置里，默认 DeepSeek 会自动使用：

```text
https://api.deepseek.com
deepseek-chat
```

API Key 只保存在当前浏览器本地。请求 AI 时，本地 FastAPI 服务只负责临时转发，不写数据库。

如果还没有 DeepSeek API Key，可以去 DeepSeek 开放平台创建一个。复制后只粘到自己的本地浏览器里，不要发到群里或截图里。

## Mac 使用

双击项目里的：

```text
open-kaobuddy.command
```

它会启动本地服务，并打开：

```text
http://127.0.0.1:8000
```

## Windows 使用

双击项目里的：

```text
open-kaobuddy.bat
```

它会自动创建 `.venv`、安装依赖、启动服务并打开浏览器。

## 使用流程

1. 连接自己的 AI API。
2. 创建一个考试项目，比如操作系统、高数、英语。
3. 把 PDF、DOCX、笔记、手写图片或视频字幕放进资料库。
4. 生成知识模块计划，确认后拆成模块卡片。
5. 按模块学习，拖动顺序，学完后标记完成。
6. 针对具体模块生成讲解或模拟题。
7. 考前用模拟考和临考速背查漏补缺。

## 手动运行

后端：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[test]"
uvicorn backend.app.main:app --reload
```

前端开发：

```bash
npm install
npm run dev
```

生产页面由 FastAPI 托管 `backend/static/index.html`，平时双击启动脚本就够了。

## 测试

```bash
.venv/bin/pytest -q
python3 -m py_compile backend/app/*.py
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

## 当前边界

- 这是本地单人版，不做账号、云同步和多人协作。
- B站视频只做公开信息和公开字幕的 best-effort 读取，不下载视频。
- PDF 扫描页、图表和公式的效果取决于文字层质量和你接入的模型能力。
- 旧版 `.doc` 在浏览器端不好稳定解析，建议另存为 `.docx` 或 PDF。
