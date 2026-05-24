from pydantic import BaseModel, EmailStr, Field, field_validator

USER_PASSWORD_MAX_BYTES = 72


def validate_user_password(value: str) -> str:
    """Validate user passwords against bcrypt's UTF-8 byte limit.

    bcrypt only accepts the first 72 bytes of input in older versions and
    rejects overlong inputs in newer versions. Enforce the limit explicitly so
    register/login/change-password all use the same security policy.
    """
    if len(value.encode("utf-8")) > USER_PASSWORD_MAX_BYTES:
        raise ValueError(f"password must be at most {USER_PASSWORD_MAX_BYTES} UTF-8 bytes")
    return value


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    invite_code: str = Field(min_length=1, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return validate_user_password(value)


class RegisterResponse(BaseModel):
    id: str
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return validate_user_password(value)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginResponse(BaseModel):
    id: str
    email: EmailStr
    display_name: str | None = None
    storage_used: int
    storage_quota: int
    tokens: TokenPair


class RefreshRequest(BaseModel):
    refresh_token: str


class MeResponse(BaseModel):
    id: str
    email: EmailStr
    display_name: str | None = None
    storage_used: int
    storage_quota: int


class UpdateMeRequest(BaseModel):
    display_name: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=8)
    new_password: str = Field(min_length=8)
    confirm_password: str = Field(min_length=8)

    @field_validator("current_password", "new_password", "confirm_password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return validate_user_password(value)
