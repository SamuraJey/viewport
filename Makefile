VENV ?= .venv
PYTHON_VERSION ?= 3.13
PROJECT_NAME ?= viewport

.PHONY: init clean pretty lint mypy ruff-lint test test-cov

.create-venv:
	test -d $(VENV) || python$(PYTHON_VERSION) -m venv $(VENV)
	$(VENV)/bin/python -m pip install --upgrade pip
	$(VENV)/bin/python -m pip install uv

.install-deps:
	$(VENV)/bin/uv sync

.install-pre-commit:
	$(VENV)/bin/pre-commit install

init:
	@echo "Creating virtual environment..."
	@$(MAKE) .create-venv
	@echo "Installing dependencies..."
	@$(MAKE) .install-deps
	@echo "Installing pre-commit hooks..."
	@$(MAKE) .install-pre-commit

clean:
	rm -rf .venv
	rm -rf __pycache__
	rm -rf .pytest_cache
	rm -rf .coverage
	rm -rf .mypy_cache
	rm -rf dist
	rm -rf *.egg-info

pretty:
	$(VENV)/bin/ruff check --fix-only .
	$(VENV)/bin/ruff format .

ruff-lint:
	$(VENV)/bin/ruff check .

mypy:
	$(VENV)/bin/mypy .


lint: ruff-lint mypy

test:
	$(VENV)/bin/pytest -n 4 ./tests

test-cov:
	$(VENV)/bin/pytest -n 4 ./tests --cov=$(PROJECT_NAME) --cov=src --cov-branch --cov-fail-under=85
