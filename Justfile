# Variables

VENV := ".venv"
PYTHON_VERSION := "3.14"
PROJECT_NAME := "viewport"

# Create virtual environment and install uv
create-venv:
    test -d {{ VENV }} || python{{ PYTHON_VERSION }} -m venv {{ VENV }} --upgrade-deps
    {{ VENV }}/bin/python -m ensurepip --upgrade
    {{ VENV }}/bin/python -m pip install uv==0.9.18

# Sync dependencies with uv
install-deps:
    {{ VENV }}/bin/uv sync

# Install pre-commit hooks
install-pre-commit:
    {{ VENV }}/bin/pre-commit install


# Initialize project environment
init:
    @echo "Creating virtual environment..."
    @just create-venv
    @echo "Installing dependencies..."
    @just install-deps
    @echo "Installing pre-commit hooks..."
    @just install-pre-commit


# Clean build and cache artifacts
clean:
    rm -rf .venv
    rm -rf __pycache__
    rm -rf .pytest_cache
    rm -rf .coverage
    rm -rf .mypy_cache
    rm -rf dist
    rm -rf *.egg-info

# Auto-fix and format code with Ruff
pretty:
    {{ VENV }}/bin/ruff check --fix-only .
    {{ VENV }}/bin/ruff format .

# Lint with Ruff
ruff-lint:
    {{ VENV }}/bin/ruff check .

# Type-check with mypy
mypy:
    {{ VENV }}/bin/mypy .

# Run both linters
lint: ruff-lint mypy

# Run tests
test:
    {{ VENV }}/bin/pytest -n 4 ./tests

# Run tests with coverage
test-cov:
    {{ VENV }}/bin/pytest -n 4 ./tests --cov={{ PROJECT_NAME }} --cov-branch --cov-fail-under=85
