from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Dict, List, Tuple


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_INVITE_STORE = ROOT_DIR / "work" / "invites.json"
MAX_INVITE_USES = 50
MAX_INVITE_BUDGET_CNY = 10.0
DEFAULT_EXPIRES_AT = "2026-12-31"


def _invite_codes_from_env() -> list[str]:
    """Read invite codes from KAOBUDDY_INVITE_CODES (comma-separated).

    No default codes — every deployment must explicitly configure its own
    codes via environment variables.  This keeps codes out of source control.
    """
    raw = (os.getenv("KAOBUDDY_INVITE_CODES") or "").strip()
    if not raw:
        return []
    return [code.strip() for code in raw.split(",") if code.strip()]


class InviteError(RuntimeError):
    pass


@dataclass
class InviteStatus:
    valid: bool
    remaining: int
    remaining_budget_cny: float
    message: str


def invite_store_path() -> Path:
    return Path(os.getenv("KAOBUDDY_INVITE_STORE_PATH") or DEFAULT_INVITE_STORE)


def default_store() -> Dict[str, List[Dict[str, Any]]]:
    return {"codes": [_code_entry(code) for code in _invite_codes_from_env()]}


def _code_entry(code: str) -> Dict[str, Any]:
    """Build a single invite-code entry with the same defaults as default_store."""
    unlimited = "UNLIMITED" in code.upper()
    return {
        "code": code,
        "maxUses": MAX_INVITE_USES,
        "usedCount": 0,
        "budgetCny": MAX_INVITE_BUDGET_CNY,
        "estimatedCostCny": 0,
        "enabled": True,
        "expiresAt": "" if unlimited else DEFAULT_EXPIRES_AT,
        **({"unlimited": True} if unlimited else {}),
    }


def load_store() -> Dict[str, List[Dict[str, Any]]]:
    path = invite_store_path()
    if not path.exists():
        data = default_store()
        save_store(data)
        return data
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {"codes": []}
    if not isinstance(data, dict) or not isinstance(data.get("codes"), list):
        data = {"codes": []}

    # Sync env-var codes into the store so new codes appear on next deploy.
    env_codes = _invite_codes_from_env()
    existing = {normalize_code(str(entry.get("code", ""))) for entry in data["codes"]}
    new_entries = [_code_entry(c) for c in env_codes if normalize_code(c) not in existing]
    if new_entries:
        data["codes"].extend(new_entries)
        save_store(data)

    return data


def save_store(data: Dict[str, List[Dict[str, Any]]]) -> None:
    path = invite_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(payload)
        temp_name = handle.name
    Path(temp_name).replace(path)


def normalize_code(code: str) -> str:
    return code.strip().upper()


def find_invite(data: Dict[str, List[Dict[str, Any]]], code: str) -> Dict[str, Any] | None:
    normalized = normalize_code(code)
    for item in data.get("codes", []):
        if normalize_code(str(item.get("code", ""))) == normalized:
            return item
    return None


def capped_max_uses(item: Dict[str, Any]) -> int:
    try:
        value = int(item.get("maxUses", MAX_INVITE_USES))
    except (TypeError, ValueError):
        value = MAX_INVITE_USES
    return max(0, min(value, MAX_INVITE_USES))


def capped_budget(item: Dict[str, Any]) -> float:
    try:
        value = float(item.get("budgetCny", MAX_INVITE_BUDGET_CNY))
    except (TypeError, ValueError):
        value = MAX_INVITE_BUDGET_CNY
    return max(0.0, min(value, MAX_INVITE_BUDGET_CNY))


def used_count(item: Dict[str, Any]) -> int:
    try:
        return max(0, int(item.get("usedCount", 0)))
    except (TypeError, ValueError):
        return 0


def estimated_cost(item: Dict[str, Any]) -> float:
    try:
        return max(0.0, float(item.get("estimatedCostCny", 0)))
    except (TypeError, ValueError):
        return 0.0


def is_unlimited(item: Dict[str, Any]) -> bool:
    return bool(item.get("unlimited", False))


def is_expired(item: Dict[str, Any]) -> bool:
    if is_unlimited(item):
        return False
    expires_at = str(item.get("expiresAt", "")).strip()
    if not expires_at:
        return False
    try:
        return date.fromisoformat(expires_at) < date.today()
    except ValueError:
        return True


def status_for_item(item: Dict[str, Any] | None) -> InviteStatus:
    if not item:
        return InviteStatus(False, 0, 0.0, "邀请码无效或已过期")
    if not bool(item.get("enabled", False)) or is_expired(item):
        return InviteStatus(False, 0, 0.0, "邀请码无效或已过期")
    if is_unlimited(item):
        return InviteStatus(True, -1, -1.0, "邀请码有效（无限额）")
    max_uses = capped_max_uses(item)
    budget = capped_budget(item)
    remaining = max(0, max_uses - used_count(item))
    remaining_budget = round(max(0.0, budget - estimated_cost(item)), 2)
    if remaining <= 0:
        return InviteStatus(False, 0, remaining_budget, "体验次数已用完，请切换到自带 API Key")
    if remaining_budget <= 0:
        return InviteStatus(False, remaining, 0.0, "体验预算已用完，请切换到自带 API Key")
    return InviteStatus(True, remaining, remaining_budget, "邀请码有效")


def verify_invite(code: str) -> InviteStatus:
    data = load_store()
    return status_for_item(find_invite(data, code))


def ensure_invite_can_call(code: str, estimated_cost_cny: float) -> InviteStatus:
    data = load_store()
    item = find_invite(data, code)
    status = status_for_item(item)
    if not status.valid:
        raise InviteError(status.message)
    if is_unlimited(item or {}):
        return status
    if estimated_cost_cny > status.remaining_budget_cny:
        raise InviteError("这次请求预计会超过体验预算，请缩短资料或切换到自带 API Key")
    return status


def record_invite_usage(code: str, cost_cny: float) -> InviteStatus:
    data = load_store()
    item = find_invite(data, code)
    if not item:
        raise InviteError("邀请码无效或已过期")
    if is_unlimited(item):
        return status_for_item(item)
    item["usedCount"] = used_count(item) + 1
    item["estimatedCostCny"] = round(estimated_cost(item) + max(0.0, cost_cny), 6)
    save_store(data)
    return status_for_item(item)


def invite_limits() -> Tuple[int, int]:
    try:
        max_chars = int(os.getenv("KAOBUDDY_INVITE_MAX_INPUT_CHARS", "80000"))
    except ValueError:
        max_chars = 80000
    try:
        max_tokens = int(os.getenv("KAOBUDDY_INVITE_MAX_TOKENS", "6000"))
    except ValueError:
        max_tokens = 6000
    return max(1000, max_chars), max(128, min(max_tokens, 12000))
