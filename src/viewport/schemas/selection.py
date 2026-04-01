from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator


class SelectionConfigUpdateRequest(BaseModel):
    is_enabled: bool | None = None
    list_title: str | None = Field(None, max_length=127)
    limit_enabled: bool | None = None
    limit_value: int | None = Field(None, ge=1)
    allow_photo_comments: bool | None = None
    require_email: bool | None = None
    require_phone: bool | None = None
    require_client_note: bool | None = None

    @model_validator(mode="after")
    def validate_payload(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided for update")
        if self.limit_enabled is False and "limit_value" in self.model_fields_set and self.limit_value is not None:
            raise ValueError("limit_value must not be set when limit_enabled is false")
        return self


class SelectionConfigResponse(BaseModel):
    is_enabled: bool
    list_title: str
    limit_enabled: bool
    limit_value: int | None
    allow_photo_comments: bool
    require_name: bool
    require_email: bool
    require_phone: bool
    require_client_note: bool
    created_at: datetime
    updated_at: datetime


class SelectionSessionStartRequest(BaseModel):
    client_name: str = Field(..., min_length=1, max_length=127)
    client_email: EmailStr | None = Field(None, max_length=255)
    client_phone: str | None = Field(None, max_length=32)
    client_note: str | None = None


class SelectionSessionUpdateRequest(BaseModel):
    client_note: str | None = None

    @model_validator(mode="after")
    def validate_payload(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided for update")
        return self


class SelectionPhotoCommentRequest(BaseModel):
    comment: str | None = None


class SelectionItemResponse(BaseModel):
    photo_id: str
    comment: str | None
    selected_at: datetime
    updated_at: datetime


class SelectionSessionResponse(BaseModel):
    id: str
    sharelink_id: str
    status: str
    client_name: str
    client_email: str | None
    client_phone: str | None
    client_note: str | None
    selected_count: int
    submitted_at: datetime | None
    last_activity_at: datetime
    created_at: datetime
    updated_at: datetime
    resume_token: str | None = None
    items: list[SelectionItemResponse] = Field(default_factory=list)


class SelectionTogglePhotoResponse(BaseModel):
    selected: bool
    selected_count: int
    limit_enabled: bool
    limit_value: int | None


class SelectionSubmitResponse(BaseModel):
    status: str
    selected_count: int
    submitted_at: datetime
    notification_enqueued: bool


class OwnerSelectionRowResponse(BaseModel):
    sharelink_id: str
    sharelink_label: str | None
    session_id: str | None
    status: str | None
    client_name: str | None
    selected_count: int
    submitted_at: datetime | None
    updated_at: datetime


class OwnerSelectionDetailResponse(BaseModel):
    sharelink_id: str
    sharelink_label: str | None
    config: SelectionConfigResponse
    session: SelectionSessionResponse | None


class BulkSelectionActionResponse(BaseModel):
    affected_count: int
