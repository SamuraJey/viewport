# Development Guide

This folder contains guides for setting up development environment, contributing to the project, and best practices.

## Contents

### 🚀 [Local Setup Guide](./local-setup.md)
Step-by-step guide for setting up development environment locally.

### 🤝 [Contributing Guide](./contributing.md)
Guidelines for contributing to the project, code standards, and pull request process.

### 🧪 [Testing Guide](./testing.md)
Unit tests, integration tests, test utilities, and coverage requirements.

### 📝 [Database Migrations](./migrations.md)
Creating and managing database migrations with Alembic.

### 🔄 [Git Workflow](./git-workflow.md)
Branch naming, commit conventions, and pull request process.

### 🛠️ [Common Tasks](./common-tasks.md)
How to perform common development tasks.

### 🐛 [Troubleshooting](./troubleshooting.md)
Troubleshooting common issues during development.

### 📚 [Code Standards](./code-standards.md)
Python and JavaScript/TypeScript code style guidelines.

## Quick Start

1. **Clone repository**
   ```bash
   git clone https://github.com/SamuraJey/viewport.git
   cd viewport
   ```

2. **Set up environment**
   ```bash
   # Backend
   python -m venv venv
   source venv/bin/activate
   pip install -e ".[dev]"
   
   # Frontend
   cd frontend
   npm install
   ```

3. **Start development**
   ```bash
   # Backend (in main directory)
   docker-compose up -d  # Start services
   uvicorn viewport.main:app --reload
   
   # Frontend (in frontend directory)
   npm run dev
   ```

4. **Access application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Development Environment

### Required Tools
- Python 3.13+
- Node.js 18+
- Docker & Docker Compose
- Git
- PostgreSQL (or use Docker)
- Redis (or use Docker)
- MinIO (or use S3 credentials)

### Recommended IDE Extensions
- **VS Code:**
  - Python (Microsoft)
  - Pylance
  - ESLint
  - Prettier
  - Thunder Client or REST Client (for API testing)

## Project Structure

```
viewport/
├── src/viewport/          # Backend source code
├── frontend/              # Frontend source code
├── tests/                 # Backend tests
├── docs/                  # This documentation
├── docker-compose.yml     # Development services
└── pyproject.toml         # Python dependencies
```

## Development Workflow

1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make changes**
   - Backend: Edit files in `src/viewport/`
   - Frontend: Edit files in `frontend/src/`

3. **Run tests**
   ```bash
   pytest                           # Backend
   cd frontend && npm test          # Frontend
   ```

4. **Commit changes**
   ```bash
   git commit -m "feat: add new feature"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature
   ```

## Common Commands

### Backend
```bash
# Install dependencies
pip install -e ".[dev]"

# Run development server
uvicorn viewport.main:app --reload

# Run tests
pytest
pytest --cov=src/viewport  # With coverage

# Create migration
alembic revision --autogenerate -m "Add new column"

# Format code
ruff format src/

# Lint code
ruff check src/
```

### Frontend
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Format code
npm run lint -- --fix
```

## Debugging

### Backend
```python
# Add breakpoint
import pdb; pdb.set_trace()

# Or use debugpy for remote debugging
import debugpy
debugpy.listen(("0.0.0.0", 5678))
debugpy.wait_for_client()
```

### Frontend
- Use Chrome DevTools (F12)
- Add `debugger;` statements
- Use VS Code debugger

## Performance Tips

### Backend
- Use `--reload` during development (disables in production)
- Profile with Python's cProfile
- Monitor with Prometheus metrics

### Frontend
- Use Vite's built-in optimizations
- Enable sourcemaps for debugging
- Monitor bundle size

## Useful Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [SQLAlchemy ORM](https://docs.sqlalchemy.org/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [Tailwind CSS](https://tailwindcss.com/)

---

For detailed guides on specific topics:
- [Local Setup](./local-setup.md)
- [Contributing](./contributing.md)
- [Testing](./testing.md)
- [Migrations](./migrations.md)
- [Git Workflow](./git-workflow.md)

Ready to contribute? Check out the [Contributing Guide](./contributing.md).
