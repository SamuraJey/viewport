# Dockerfile for FastAPI app (Python 3.13)
FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml uv.lock ./

RUN pip install uv
RUN uv pip install --system --no-deps .

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
