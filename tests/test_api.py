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

