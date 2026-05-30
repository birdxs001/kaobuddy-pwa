from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ApiConfig(BaseModel):
    provider_name: str = Field(min_length=1, max_length=60)
    base_url: str = Field(min_length=8)
    api_key: str = Field(min_length=1)
    model: str = Field(min_length=1, max_length=120)
    temperature: float = Field(default=0.4, ge=0, le=2)
    max_tokens: int = Field(default=1800, ge=128, le=12000)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        cleaned = value.strip().rstrip("/")
        if not cleaned.startswith(("https://", "http://")):
            raise ValueError("base_url 必须以 http:// 或 https:// 开头")
        return cleaned


class StudyProject(BaseModel):
    subject: str
    exam_date: str
    daily_minutes: int = Field(ge=10, le=1440)
    target_score: Optional[str] = None
    weak_points: Optional[str] = None


class MaterialSummary(BaseModel):
    title: str
    kind: Literal["text", "file", "handwriting", "video", "pdf", "markdown"]
    content: str = ""


class AiRequest(BaseModel):
    api_config: ApiConfig
    project: StudyProject
    materials: List[MaterialSummary] = []
    extra: Optional[str] = None


class PracticeAnswer(BaseModel):
    question: str
    answer: str


class PracticeRequest(AiRequest):
    answers: List[PracticeAnswer] = []


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: Any


class ChatCompletionRequest(BaseModel):
    api_config: ApiConfig
    messages: List[ChatMessage]


class HandwritingRequest(BaseModel):
    api_config: ApiConfig
    image_data_urls: List[str] = Field(min_length=1, max_length=6)
    note_hint: Optional[str] = None


class VideoImportRequest(BaseModel):
    url: HttpUrl


class VideoImportResponse(BaseModel):
    title: str
    description: str = ""
    subtitles: str = ""
    source_url: str
    warnings: List[str] = []
    metadata: Dict[str, Any] = {}


class AiResponse(BaseModel):
    content: str

