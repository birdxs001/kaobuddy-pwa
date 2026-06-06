"""Structured JSON logging for KaoBuddy.

Writes one JSON object per line to stdout so Railway / Fly.io capture every
event as a structured log entry.  Uses Python stdlib only — no extra deps.

Key design:
- Every log line is a flat JSON dict (easy to query in log viewers).
- A ``request_id`` is attached to every log via ``contextvars``, so all
  events belonging to the same HTTP request can be grouped.
- API keys and invite codes are automatically redacted.
- ``log_timing`` is a context-manager that emits a ``duration_ms`` entry.
"""

from __future__ import annotations

import contextvars
import json
import logging
import sys
import time
import traceback
import uuid
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional

_request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")

# ---------------------------------------------------------------------------
# JSON formatter
# ---------------------------------------------------------------------------

# Standard LogRecord attributes — these are internal and should NOT appear in output.
_STD_LOG_FIELDS: set[str] = {
    "args", "asctime", "created", "exc_info", "exc_text",
    "filename", "funcName", "levelname", "levelno", "lineno",
    "module", "msecs", "message", "msg", "name", "pathname",
    "process", "processName", "relativeCreated", "stack_info",
    "thread", "threadName", "taskName",
}

_FIXED_FIELDS = {"timestamp", "level", "logger", "message", "request_id", "duration_ms", "exc"}


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": self.formatTime(record, datefmt="%Y-%m-%dT%H:%M:%S.%fZ"),
            "level": record.levelname,
            "msg": record.getMessage(),
        }
        rid = _request_id_var.get()
        if rid:
            payload["rid"] = rid
        duration = getattr(record, "duration_ms", None)
        if duration is not None:
            payload["duration_ms"] = duration
        if record.exc_info and record.exc_info[1]:
            payload["exc"] = _format_exc(record.exc_info)
        # carry extra fields (passed via `extra`) — skip stdlib internals
        for key, value in record.__dict__.items():
            if key in _STD_LOG_FIELDS or key in _FIXED_FIELDS or key.startswith("_"):
                continue
            payload[key] = value
        return json.dumps(payload, ensure_ascii=False, default=str)


def _format_exc(exc_info: Any) -> str:
    return "".join(traceback.format_exception(*exc_info)).strip()


# ---------------------------------------------------------------------------
# Logger setup
# ---------------------------------------------------------------------------

_logger = logging.getLogger("kaobuddy")
_logger.setLevel(logging.DEBUG)

_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(_JsonFormatter())
_handler.setLevel(logging.DEBUG)
_logger.addHandler(_handler)
_logger.propagate = False  # don't duplicate to root logger


class _StructuredLogger:
    """Thin wrapper that routes **kwargs into ``extra`` so callers can write
    ``log.info("msg", method="GET", status=200)`` instead of the more verbose
    ``log.info("msg", extra={"method": "GET", "status": 200})``."""

    def __init__(self, logger: logging.Logger) -> None:
        self._logger = logger

    def _log(self, level: int, msg: str, args: Any = None, **kwargs: Any) -> None:
        extra: Dict[str, Any] = {}
        reserved = {"exc_info", "stack_info", "stacklevel"}
        for key, value in kwargs.items():
            if key in reserved:
                continue
            extra[key] = value
        exc_info = kwargs.get("exc_info")
        stack_info = kwargs.get("stack_info", False)
        stacklevel = kwargs.get("stacklevel", 1)
        self._logger._log(level, msg, args or (), exc_info=exc_info, extra=extra, stack_info=stack_info, stacklevel=stacklevel)

    def debug(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self._log(logging.DEBUG, msg, args, **kwargs)

    def info(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self._log(logging.INFO, msg, args, **kwargs)

    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self._log(logging.WARNING, msg, args, **kwargs)

    def error(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self._log(logging.ERROR, msg, args, **kwargs)


def get_logger() -> _StructuredLogger:
    return _StructuredLogger(_logger)


# ---------------------------------------------------------------------------
# Request ID
# ---------------------------------------------------------------------------

def set_request_id(rid: Optional[str] = None) -> str:
    """Set and return the request_id for the current async context."""
    if rid is None:
        rid = uuid.uuid4().hex[:12]
    _request_id_var.set(rid)
    return rid


def get_request_id() -> str:
    return _request_id_var.get() or "-"


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------

def redact(text: str, visible: int = 4) -> str:
    """Redact a secret so it is safe to log.  ``sk-a1b2c3d4`` → ``sk-a...3d4``."""
    if not text:
        return "***"
    if len(text) <= 8:
        return text[:2] + "***"
    return f"{text[:visible]}...{text[-4:]}"


# ---------------------------------------------------------------------------
# Timing helper
# ---------------------------------------------------------------------------

@contextmanager
def log_timing(logger: _StructuredLogger, message: str, **extra: Any) -> Iterator[None]:
    """Context-manager that logs *message* at INFO with a ``duration_ms`` field.

    Usage::

        with log_timing(log, "ai call", model="deepseek-chat"):
            result = await chat_completion(...)
    """
    t0 = time.monotonic()
    try:
        yield
    finally:
        duration_ms = round((time.monotonic() - t0) * 1000)
        logger.info(message, duration_ms=duration_ms, **extra)
