import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.schemas import ApiConfig


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_api_config_requires_http_base_url():
    with pytest.raises(ValueError):
        ApiConfig(
            provider_name="DeepSeek",
            base_url="api.deepseek.com",
            api_key="sk-test",
            model="deepseek-chat",
        )


def test_plan_allows_empty_weak_points(monkeypatch):
    async def fake_chat_completion(api_config, messages):
        assert "已知薄弱项：未填写" in messages[1].content
        return "第 1 天：建立计划。"

    monkeypatch.setattr("backend.app.main.chat_completion", fake_chat_completion)
    response = client.post(
        "/api/ai/plan",
        json={
            "api_config": {
                "provider_name": "DeepSeek",
                "base_url": "https://api.deepseek.com",
                "api_key": "sk-test",
                "model": "deepseek-chat",
            },
            "project": {
                "subject": "高数",
                "exam_date": "2026-06-10",
                "daily_minutes": 120,
                "target_score": "80",
            },
            "materials": [],
        },
    )
    assert response.status_code == 200
    assert response.json()["content"] == "第 1 天：建立计划。"


def test_plan_prompt_is_material_driven_module_cards(monkeypatch):
    captured = {}

    async def fake_chat_completion(api_config, messages):
        captured["system"] = messages[0].content
        captured["user"] = messages[1].content
        return "模块名称：进程；预计时间：45分钟；难度：中；重要排名：1；考察内容：PCB、状态转换、调度。"

    monkeypatch.setattr("backend.app.main.chat_completion", fake_chat_completion)
    response = client.post(
        "/api/ai/plan",
        json={
            "api_config": {
                "provider_name": "DeepSeek",
                "base_url": "https://api.deepseek.com",
                "api_key": "sk-test",
                "model": "deepseek-chat",
            },
            "project": {
                "subject": "操作系统",
                "exam_date": "2026-06-30",
                "daily_minutes": 120,
            },
            "materials": [
                {
                    "title": "进程课件",
                    "kind": "pdf",
                    "content": "进程是资源分配的基本单位。PCB 记录进程状态。线程是 CPU 调度的基本单位。",
                }
            ],
        },
    )

    assert response.status_code == 200
    assert "只根据导入资料" in captured["system"]
    assert "不要按每天学习时长" in captured["system"]
    assert "知识点名称" in captured["user"]
    assert "预计完成时间" in captured["user"]
    assert "难度" in captured["user"]
    assert "重要程度排名" in captured["user"]
    assert "考察内容" in captured["user"]


def test_module_practice_prompt_focuses_on_current_module(monkeypatch):
    captured = {}

    async def fake_chat_completion(api_config, messages):
        captured["user"] = messages[1].content
        return "1. 进程有哪些基本状态？\n参考答案：就绪、运行、阻塞。"

    monkeypatch.setattr("backend.app.main.chat_completion", fake_chat_completion)
    response = client.post(
        "/api/ai/module-practice",
        json={
            "api_config": {
                "provider_name": "DeepSeek",
                "base_url": "https://api.deepseek.com",
                "api_key": "sk-test",
                "model": "deepseek-chat",
            },
            "project": {
                "subject": "操作系统",
                "exam_date": "2026-06-30",
                "daily_minutes": 120,
            },
            "materials": [
                {
                    "title": "进程课件",
                    "kind": "pdf",
                    "content": "PCB 记录进程状态，进程有就绪、运行、阻塞等状态。",
                }
            ],
            "module_title": "进程",
            "exam_points": "PCB、进程状态、状态转换",
        },
    )

    assert response.status_code == 200
    assert "当前知识点：进程" in captured["user"]
    assert "只围绕这个知识点" in captured["user"]
    assert "PCB、进程状态、状态转换" in captured["user"]
