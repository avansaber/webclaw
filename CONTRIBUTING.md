# Contributing to Webclaw

Thank you for your interest in contributing to Webclaw! This guide will help you get set up for local development.

## Development Setup

### Prerequisites

- Python 3.10+
- Node.js 20+ and npm
- Git

### Clone and Install

```bash
git clone https://github.com/avansaber/webclaw.git
cd webclaw

# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt

# Frontend
cd web
npm install
cd ..
```

### Run in Development Mode

```bash
# Terminal 1: API server (auto-reload)
source .venv/bin/activate
cd api
uvicorn main:app --host 127.0.0.1 --port 8001 --reload

# Terminal 2: Next.js dev server (hot reload)
cd web
npm run dev
```

Open http://localhost:3000 in your browser.

### Initialize the Database

The database is auto-created on first API request at `~/.openclaw/webclaw/webclaw.sqlite`. To reset it:

```bash
rm -f ~/.openclaw/webclaw/webclaw.sqlite
# Restart the API server — tables will be recreated
```

## Project Layout

| Directory | What | Language |
|-----------|------|---------|
| `api/` | FastAPI backend | Python |
| `api/auth/` | JWT authentication, session management | Python |
| `api/chat/` | AI chat endpoints | Python |
| `api/middleware/` | CORS, rate limiting, security headers | Python |
| `api/skills/` | Skill discovery, action execution, SKILL.md parser | Python |
| `api/tests/` | Backend pytest tests | Python |
| `web/src/app/` | Next.js app router pages | TypeScript/React |
| `web/src/components/` | Reusable UI components (shadcn/ui) | TypeScript/React |
| `web/src/lib/` | Auto-form-spec, param-schema, API client | TypeScript |
| `web/e2e/` | Playwright E2E tests | TypeScript |
| `templates/` | nginx and systemd config templates | Config |
| `scripts/` | OpenClaw integration scripts | Bash/Python |

## Running Tests

### Backend (pytest)

```bash
source .venv/bin/activate
cd api
python3 -m pytest tests/ -v
```

### Frontend E2E (Playwright)

```bash
cd web
npx playwright install chromium

# Against local dev server
E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=admin@test.com E2E_PASSWORD=yourpass npx playwright test

# Against production
E2E_BASE_URL=https://your-server.com E2E_EMAIL=admin@test.com E2E_PASSWORD=yourpass npx playwright test
```

### Run a specific test file

```bash
npx playwright test e2e/auth.spec.ts
npx playwright test e2e/dashboard.spec.ts --headed  # Watch it run
```

## Code Style

- **Python**: Follow PEP 8. Use type hints where practical. Keep functions focused.
- **TypeScript**: Follow the existing patterns in `web/src/`. Use TypeScript strict mode.
- **Commits**: Clear, concise messages. One logical change per commit.
- **Tests**: Every new feature or bug fix should include tests.

## Key Design Principles

1. **Zero per-skill code** — Webclaw must work for any OpenClaw skill automatically. No hardcoded skill names or custom components.
2. **Schema-driven** — All UI rendering derives from SKILL.md metadata. If a skill has a valid SKILL.md, it gets a working UI.
3. **Progressive enhancement** — Skills can optionally add a `webclaw` section to their SKILL.md for custom entity lookups and domain configuration.
4. **Security first** — JWT auth, RBAC, rate limiting, audit logging, parameterized queries. No shortcuts.

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes with tests
4. Run the test suite to verify nothing is broken
5. Commit with a clear message
6. Open a pull request against `master`

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Browser/OS/Node/Python versions if relevant

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
