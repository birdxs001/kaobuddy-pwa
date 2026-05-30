# 考搭子 KaoBuddy

手机可用的免费备考 PWA。它不是 VSCode 插件，打开网页就能用：建考试项目、导入资料、导入手写笔记和视频字幕，再接入你自己的 DeepSeek、Kimi、OpenAI 或其他 OpenAI-compatible API 来生成计划、讲解、刷题和模考。

## 现在能做什么

- 创建考试项目：科目、考试日期、每日学习时间、目标分数，薄弱项可填可不填。
- 配置自己的 API：支持 DeepSeek、Kimi 国内/国际、OpenAI、自定义 OpenAI-compatible。
- 资料导入：文本、Markdown、TXT、PDF。
- 手写笔记：上传图片/PDF，调用用户自己的视觉模型/OCR API 识别。
- 视频链接：粘贴 B站等公开视频链接，优先抓公开标题、简介和字幕；不下载视频。
- AI 工作流：生成冲刺计划、考点讲解、练习反馈、短模考。
- 本地存储：项目数据存在当前浏览器 IndexedDB，支持 JSON 导出/导入。

## 本地运行

后端：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[test]"
uvicorn backend.app.main:app --reload
```

前端：

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。

## 测试

```bash
pytest
npm run build
```

## API Key 怎么处理

API Key 默认只保存在当前浏览器本地。前端调用后端时会把 Key 随请求发过去，后端只临时转发给用户配置的模型服务，不写入数据库，也不主动打印日志。

## 免费部署建议

第一版可以先用免费额度：

- 前端：Cloudflare Pages 或 Vercel。
- 后端：Render Free、Railway 免费额度，或者 Vercel Python Functions。

如果你只给自己用，最省事的是本地跑后端、前端部署成静态 PWA；如果要给别人用，建议后端单独部署，并提醒用户 API Key 会经过你的后端转发。

## 注意

B站字幕抓取是 best-effort：公开字幕、页面结构、登录状态、反爬策略都会影响成功率。抓不到时，页面会让你手动粘贴字幕或课程重点。

