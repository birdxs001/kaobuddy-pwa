from typing import Any, Dict, List

import httpx

from .schemas import ApiConfig, ChatMessage


class AiClientError(RuntimeError):
    pass


def redact_secret(value: str) -> str:
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}...{value[-4:]}"


async def chat_completion(api_config: ApiConfig, messages: List[ChatMessage]) -> str:
    endpoint = f"{api_config.base_url}/chat/completions"
    payload: Dict[str, Any] = {
        "model": api_config.model,
        "messages": [message.model_dump() for message in messages],
        "temperature": api_config.temperature,
        "max_tokens": api_config.max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {api_config.api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:400]
        raise AiClientError(f"AI 服务返回错误：{exc.response.status_code} {detail}") from exc
    except httpx.HTTPError as exc:
        raise AiClientError(f"AI 服务连接失败：{exc}") from exc

    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AiClientError("AI 服务响应格式不是 OpenAI-compatible chat completions。") from exc

    if not isinstance(content, str) or not content.strip():
        raise AiClientError("AI 服务返回了空内容。")
    return content.strip()

