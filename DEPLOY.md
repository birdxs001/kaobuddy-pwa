# KaoBuddy 云端预览版部署指南

## ⚠️ 重要说明

**当前部署目标：preview / staging（预览版），不是正式公开版。**

本部署方案严格遵守以下原则：
- ❌ **不做账号系统** — 无用户注册、无登录
- ❌ **不做数据库** — 不引入任何数据库依赖
- ❌ **不做云同步** — 用户数据仅保存在浏览器 IndexedDB
- ❌ **不做付费系统** — 邀请码仅用于演示，不涉及真实付费
- ✅ **保留 BYOK 模式** — 用户自己在浏览器里填写 AI API Key
- ✅ **API Key 不落盘** — 后端仅做临时请求转发，不保存、不记日志、不在错误信息里完整回显

---

## Render 部署步骤

### 1. 前置条件
- GitHub 仓库已推送
- Render 账号已注册（https://render.com）

### 2. 创建 Web Service

1. 登录 Render Dashboard
2. 点击 **New +** → **Web Service**
3. 连接 GitHub，选择 KaoBuddy 仓库
4. 选择分支：`chore/cloud-preview-deploy`

### 3. 配置参数

| 配置项 | 值 |
|--------|-----|
| **Runtime** | Python 3 |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT` |

> 注意：Render 的 Python 环境会自动读取 `.python-version` 文件选择 Python 3.11。
> 前端已经预构建在 `backend/static/` 中，无需在 Render 上运行 `npm install` 或 `npm run build`。

### 4. 环境变量（Environment Variables）

所有环境变量都是**可选的**。基础使用不需要任何环境变量。

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `ALLOWED_ORIGINS` | CORS 允许的跨域来源（逗号分隔） | `https://xxx.onrender.com` |
| `KAOBUDDY_AI_BASE_URL` | 邀请码模式 AI 接口地址 | `https://api.deepseek.com` |
| `KAOBUDDY_AI_API_KEY` | 邀请码模式 AI Key | `sk-xxx` |
| `KAOBUDDY_AI_MODEL` | 邀请码模式模型名 | `deepseek-chat` |
| `KAOBUDDY_AI_INPUT_CNY_PER_MILLION` | 输入定价（元/百万token） | `2` |
| `KAOBUDDY_AI_OUTPUT_CNY_PER_MILLION` | 输出定价（元/百万token） | `8` |
| `KAOBUDDY_INVITE_STORE_PATH` | 邀请码数据文件路径 | `/opt/render/project/data/invites.json` |
| `KAOBUDDY_INVITE_MAX_INPUT_CHARS` | 邀请码输入上限 | `80000` |
| `KAOBUDDY_INVITE_MAX_TOKENS` | 邀请码输出上限 | `6000` |

**预览版最低配置：留空所有环境变量即可。** 用户通过浏览器 UI 填写自己的 API Key。

### 5. 部署后

部署成功后，Render 会显示一个临时域名，格式如：
`https://kaobuddy-xxxx.onrender.com`

---

## Railway 部署步骤（备选）

### 1. 前置条件
- GitHub 仓库已推送
- Railway 账号已注册（https://railway.app）

### 2. 创建服务

1. 登录 Railway Dashboard
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 选择 KaoBuddy 仓库和分支 `chore/cloud-preview-deploy`

### 3. 配置参数

| 配置项 | 值 |
|--------|-----|
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT` |

Railway 会自动检测 `.python-version` 选择 Python 版本。

### 4. 环境变量

与 Render 相同，见上方环境变量表。预览版最低配置留空即可。

---

## 部署后测试清单

部署成功后，逐项检查：

- [ ] 首页能打开（`https://<域名>` 正常加载）
- [ ] 手机浏览器能打开
- [ ] `/health` 返回 `{"ok":true}`
- [ ] `/manifest.webmanifest` 正常返回 PWA 清单
- [ ] `/sw.js` 正常返回 Service Worker
- [ ] `/assets/` 下的 JS/CSS 文件不 404
- [ ] 页面刷新不白屏、不 404
- [ ] 浏览器 Console 没有红色错误
- [ ] Network 面板里没有请求 `localhost` 或 `127.0.0.1`
- [ ] 能创建第一个考试项目
- [ ] 能填写自己的 AI API Key 并测试连接成功
- [ ] 能上传 TXT 文件作为资料
- [ ] 能生成一次知识模块计划
- [ ] 能生成一次模拟考
- [ ] 浏览器 IndexedDB 中有 `kaobuddy-db` 数据库
- [ ] Render/Railway 日志中没有出现用户的 API Key（明文）

---

## 常见报错处理

| 报错 | 原因 | 处理 |
|------|------|------|
| `python: command not found` | Runtime 选错 | 确认 Render 选了 Python 3 |
| `ModuleNotFoundError: No module named 'backend'` | Start Command 路径不对 | 确认 `uvicorn backend.app.main:app` |
| `Application failed to respond` | 端口绑定错误 | 确认用了 `--port $PORT`（不是 `--port 8000`） |
| 前端 404 | 静态文件没构建 | 在本地先 `npm run build`，确保 `backend/static/` 有内容，再提交 |
| `CORS error` | `ALLOWED_ORIGINS` 没配 | 同源部署一般不需要 CORS。如果跨域，添加 Render 域名到 `ALLOWED_ORIGINS` |
| 页面空白 | SPA 路由 fallback 缺失 | 检查 catch-all 路由是否在 `main.py` 最后 |

---

## API Key 安全注意事项

1. **用户的 API Key 只存在浏览器 localStorage**，后端不持久化
2. **后端只做临时转发**：收到请求 → 调用 AI API → 返回结果 → 丢弃 Key
3. **日志中不能出现 API Key**：检查 `AiClientError` 的错误信息不完整回显 Key
4. **邀请码模式的 server API Key** 通过环境变量注入，不写入代码、不提交到 Git
5. 验证命令：部署后在 Render 日志里搜索 `sk-` 确认没有 Key 泄露
