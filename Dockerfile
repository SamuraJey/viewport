# Dockerfile for FastAPI app (Python 3.13)
FROM python:3.13-slim

WORKDIR /app


COPY pyproject.toml uv.lock ./
COPY src/ src/

RUN pip install uv==0.8.13
RUN uv sync

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "src.viewport.main:app", "--host", "0.0.0.0", "--port", "8000"]
