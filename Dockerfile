# Dockerfile for FastAPI app (Python 3.13)
FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml uv.lock ./

RUN pip install uv==0.8.0
RUN uv sync
RUN uv pip install --system .
RUN uv pip install --system uvicorn

COPY . .

EXPOSE 8000

CMD ["uvicorn", "src.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
