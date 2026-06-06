from __future__ import annotations

import os
from typing import Any, Dict, List, Tuple

import httpx

from .schemas import ApiConfig, ChatMessage


class AiClientError(RuntimeError):
    pass


def redact_secret(value: str) -> str:
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}...{value[-4:]}"


def server_api_config(max_tokens: int = 1800, model: str | None = None) -> ApiConfig:
    base_url = (os.getenv("KAOBUDDY_AI_BASE_URL") or "").strip()
    api_key = (os.getenv("KAOBUDDY_AI_API_KEY") or "").strip()
    configured_model = (model or os.getenv("KAOBUDDY_AI_MODEL") or "").strip()
    if not base_url or not api_key or not configured_model:
        raise AiClientError("邀请码已验证，但服务器 AI 还没配置好。请先切换到自带 API Key，或让管理员在 Railway 配置 KAOBUDDY_AI_BASE_URL、KAOBUDDY_AI_MODEL 和 KAOBUDDY_AI_API_KEY。")
    return ApiConfig(
        provider_name="KaoBuddy Invite",
        base_url=base_url,
        api_key=api_key,
        model=configured_model,
        temperature=0.4,
        max_tokens=max_tokens,
    )


def invite_pricing() -> Tuple[float, float]:
    raw_input_price = os.getenv("KAOBUDDY_AI_INPUT_CNY_PER_MILLION")
    raw_output_price = os.getenv("KAOBUDDY_AI_OUTPUT_CNY_PER_MILLION")
    if raw_input_price is None or raw_output_price is None:
        raise AiClientError("服务器 AI 价格配置未完成，请联系管理员或使用自己的 API Key。")
    try:
        input_price = float(raw_input_price)
    except ValueError:
        raise AiClientError("服务器 AI 价格配置未完成，请联系管理员或使用自己的 API Key。")
    try:
        output_price = float(raw_output_price)
    except ValueError:
        raise AiClientError("服务器 AI 价格配置未完成，请联系管理员或使用自己的 API Key。")
    return max(0.0, input_price), max(0.0, output_price)


def estimate_tokens_from_chars(char_count: int) -> int:
    return max(1, char_count)


def estimate_cost_cny(prompt_tokens: int, completion_tokens: int) -> float:
    input_price, output_price = invite_pricing()
    return round((prompt_tokens / 1_000_000 * input_price) + (completion_tokens / 1_000_000 * output_price), 6)


async def chat_completion(api_config: ApiConfig, messages: List[ChatMessage]) -> str:
    content, _usage = await chat_completion_with_usage(api_config, messages)
    return content


async def chat_completion_with_usage(api_config: ApiConfig, messages: List[ChatMessage]) -> Tuple[str, Dict[str, Any]]:
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
    usage = data.get("usage")
    return content.strip(), usage if isinstance(usage, dict) else {}


async def chat_completion_stream(api_config: ApiConfig, messages: List[ChatMessage]):
    """Stream tokens from AI provider, yielding SSE content chunks."""
    from typing import AsyncGenerator

    endpoint = f"{api_config.base_url}/chat/completions"
    payload: Dict[str, Any] = {
        "model": api_config.model,
        "messages": [message.model_dump() for message in messages],
        "temperature": api_config.temperature,
        "max_tokens": api_config.max_tokens,
        "stream": True,
    }
    headers = {
        "Authorization": f"Bearer {api_config.api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", endpoint, json=payload, headers=headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            import json as _json
                            chunk = _json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except Exception:
                            continue
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:400]
        raise AiClientError(f"AI 服务返回错误：{exc.response.status_code} {detail}") from exc
    except httpx.HTTPError as exc:
        raise AiClientError(f"AI 服务连接失败：{exc}") from exc
