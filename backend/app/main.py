from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .ai_client import AiClientError, chat_completion
from .prompts import (
    MOCK_SYSTEM_PROMPT,
    OCR_SYSTEM_PROMPT,
    PLAN_SYSTEM_PROMPT,
    PRACTICE_SYSTEM_PROMPT,
    TEACH_SYSTEM_PROMPT,
    format_materials,
    format_project,
)
from .schemas import (
    AiRequest,
    AiResponse,
    ChatCompletionRequest,
    ChatMessage,
    HandwritingRequest,
    PracticeRequest,
    VideoImportRequest,
    VideoImportResponse,
)
from .video import import_video_metadata


ROOT_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT_DIR / "backend" / "static"
DIST_DIR = ROOT_DIR / "dist"
PUBLIC_DIR = ROOT_DIR / "public"


app = FastAPI(title="KaoBuddy API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
ASSETS_DIR = DIST_DIR / "assets" if (DIST_DIR / "assets").exists() else STATIC_DIR / "assets"
ICONS_DIR = DIST_DIR / "icons" if (DIST_DIR / "icons").exists() else STATIC_DIR / "icons"
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
if ICONS_DIR.exists():
    app.mount("/icons", StaticFiles(directory=ICONS_DIR), name="icons")


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    dist_index = DIST_DIR / "index.html"
    return FileResponse(dist_index if dist_index.exists() else STATIC_DIR / "index.html")


@app.get("/manifest.webmanifest", include_in_schema=False)
async def manifest() -> FileResponse:
    dist_manifest = DIST_DIR / "manifest.webmanifest"
    static_manifest = STATIC_DIR / "manifest.webmanifest"
    if dist_manifest.exists():
        return FileResponse(dist_manifest)
    return FileResponse(static_manifest if static_manifest.exists() else PUBLIC_DIR / "manifest.webmanifest")


@app.get("/sw.js", include_in_schema=False)
async def service_worker() -> FileResponse:
    dist_worker = DIST_DIR / "sw.js"
    static_worker = STATIC_DIR / "sw.js"
    if dist_worker.exists():
        return FileResponse(dist_worker)
    return FileResponse(static_worker if static_worker.exists() else PUBLIC_DIR / "sw.js")


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


async def _run_ai(request: AiRequest, system_prompt: str, task_prompt: str) -> AiResponse:
    user_content = (
        f"{task_prompt}\n\n"
        f"【考试项目】\n{format_project(request.project)}\n\n"
        f"【资料】\n{format_materials(request.materials)}\n\n"
        f"【补充要求】\n{request.extra or '无'}"
    )
    messages = [
        ChatMessage(role="system", content=system_prompt),
        ChatMessage(role="user", content=user_content),
    ]
    try:
        content = await chat_completion(request.api_config, messages)
    except AiClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return AiResponse(content=content)


@app.post("/api/ai/test", response_model=AiResponse)
async def test_ai(request: ChatCompletionRequest) -> AiResponse:
    messages = request.messages or [
        ChatMessage(role="user", content="请回复：连接成功"),
    ]
    try:
        content = await chat_completion(request.api_config, messages)
    except AiClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return AiResponse(content=content)


@app.post("/api/ai/plan", response_model=AiResponse)
async def make_plan(request: AiRequest) -> AiResponse:
    return await _run_ai(
        request,
        PLAN_SYSTEM_PROMPT,
        "请输出一组知识点模块计划，不按日期排。每个模块用独立小节呈现，包含模块名、优先级、预计学习时间、为什么重要、建议练习方式和完成标准。",
    )


@app.post("/api/ai/teach", response_model=AiResponse)
async def teach(request: AiRequest) -> AiResponse:
    return await _run_ai(
        request,
        TEACH_SYSTEM_PROMPT,
        "请围绕资料里的核心考点进行讲解，按零基础解释、高频考点、例题、易错点组织。",
    )


@app.post("/api/ai/practice", response_model=AiResponse)
async def practice(request: PracticeRequest) -> AiResponse:
    answer_text = "\n".join(f"题目：{item.question}\n作答：{item.answer}" for item in request.answers) or "用户还没有提交答案，请先生成练习题。"
    enriched = AiRequest(
        api_config=request.api_config,
        project=request.project,
        materials=request.materials,
        extra=f"{request.extra or ''}\n\n【用户作答】\n{answer_text}",
    )
    return await _run_ai(
        enriched,
        PRACTICE_SYSTEM_PROMPT,
        "请生成或批改一组练习题，给出答案、解析、薄弱项和下一步建议。",
    )


@app.post("/api/ai/mock-exam", response_model=AiResponse)
async def mock_exam(request: AiRequest) -> AiResponse:
    return await _run_ai(
        request,
        MOCK_SYSTEM_PROMPT,
        "请生成一套手机上可完成的短模考卷，包含题目、分值、答题提示和考后查漏清单。",
    )


@app.post("/api/ocr/handwriting", response_model=AiResponse)
async def handwriting_ocr(request: HandwritingRequest) -> AiResponse:
    content = [
        {
            "type": "text",
            "text": f"请识别这些手写笔记。补充说明：{request.note_hint or '无'}",
        }
    ]
    for image_data_url in request.image_data_urls:
        content.append({"type": "image_url", "image_url": {"url": image_data_url}})

    messages = [
        ChatMessage(role="system", content=OCR_SYSTEM_PROMPT),
        ChatMessage(role="user", content=content),
    ]
    try:
        result = await chat_completion(request.api_config, messages)
    except AiClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return AiResponse(content=result)


@app.post("/api/video/import", response_model=VideoImportResponse)
async def import_video(request: VideoImportRequest) -> VideoImportResponse:
    try:
        return await import_video_metadata(str(request.url))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"视频信息读取失败：{exc}") from exc
