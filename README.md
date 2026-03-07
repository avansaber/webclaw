# WebClaw — Turn Any Skill Into a Website

The universal web dashboard for [OpenClaw](https://openclaw.org) skills. One interface for every skill — zero per-skill custom code.

Webclaw reads your installed skills' `SKILL.md` files and automatically renders forms, data tables, charts, and dashboards. Install it once, and every skill you add gets a browser UI instantly.

## Features

- **Schema-driven rendering** — reads SKILL.md metadata to generate forms, tables, and detail views automatically
- **8 generic UI components** — DataTable, FormView, DetailView, ChatPanel, ChartPanel, KanbanBoard, CalendarView, TreeView
- **JWT authentication** — access tokens (15 min) + refresh tokens (7 days, httpOnly cookies)
- **Role-based access control** — permission checks before every skill action
- **AI chat panel** — context-aware assistant that understands which skill you're viewing
- **Mobile responsive** — card-based layouts on small screens
- **HTTPS via Let's Encrypt** — one-command SSL setup
- **Audit logging** — all mutating actions logged

## Architecture

```
Browser → Cloudflare → nginx (80/443)
                         ├── /api/*  → FastAPI (port 8001)
                         └── /*      → Next.js (port 3000)
```

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, shadcn/ui, Tailwind v4 |
| Backend | FastAPI, uvicorn, httpx |
| Auth | JWT (PyJWT), PBKDF2-HMAC-SHA256 passwords |
| Database | SQLite (`~/.openclaw/webclaw/webclaw.sqlite`) |
| Proxy | nginx with rate limiting |
| SSL | Let's Encrypt via certbot |

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 20+
- npm
- nginx
- certbot
- git

### Install via OpenClaw

The easiest way to install Webclaw is through OpenClaw:

```
clawhub install webclaw
```

This runs `scripts/check_deps.sh` (verifies prerequisites) then `scripts/install.sh` (builds everything and starts services).

### Manual Install

```bash
# Clone the repo
git clone https://github.com/avansaber/webclaw.git
cd webclaw

# Backend
python3 -m venv .venv
.venv/bin/pip install -r api/requirements.txt

# Frontend
cd web
npm install
npm run build
cd ..

# Database
.venv/bin/python3 -c "
import sys, os
sys.path.insert(0, 'api')
os.environ['WEBCLAW_DB_PATH'] = os.path.expanduser('~/.openclaw/webclaw/webclaw.sqlite')
os.makedirs(os.path.dirname(os.environ['WEBCLAW_DB_PATH']), exist_ok=True)
from db import get_connection
conn = get_connection(os.environ['WEBCLAW_DB_PATH'])
conn.close()
print('Database initialized')
"

# Start services (development)
.venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8001 &
cd web && npm run dev &
```

Then open http://localhost:3000/setup to create your admin account.

### Production Install

For production, use the install script which also configures nginx and systemd:

```bash
sudo bash scripts/install.sh
```

This will:
1. Create a Python venv and install dependencies
2. Build the Next.js frontend (`npm run build`)
3. Initialize the SQLite database (9 tables)
4. Configure nginx as a reverse proxy
5. Create and enable systemd services (`webclaw-api`, `webclaw-web`)
6. Verify the API health endpoint

## Project Structure

```
webclaw/
├── api/                    # FastAPI backend
│   ├── main.py             # App entry point, route registration
│   ├── db.py               # SQLite connection + table creation
│   ├── rbac.py             # Role-based access control
│   ├── ui_builder.py       # SKILL.md → UI schema converter
│   ├── events.py           # SSE event bus
│   ├── init_webclaw_db.py  # Database initialization
│   ├── auth/               # JWT auth, login, session management
│   ├── chat/               # AI chat endpoints
│   ├── middleware/          # CORS, rate limiting, security headers
│   ├── skills/             # Skill discovery, action execution, SKILL.md parser
│   └── tests/              # API pytest tests (76 tests)
├── web/                    # Next.js 16 frontend
│   ├── src/
│   │   ├── app/            # App router pages (dashboard, login, setup, skills)
│   │   ├── components/     # Reusable UI components (shadcn/ui based)
│   │   └── lib/            # Auto-form-spec, param-schema, API client
│   └── e2e/                # Playwright E2E tests (168 tests)
├── scripts/
│   ├── db_query.py         # OpenClaw action handler (12 actions)
│   ├── install.sh          # Post-install: venv, npm build, nginx, systemd
│   └── check_deps.sh       # Pre-install: verify python3, node, npm, nginx
├── templates/
│   ├── nginx-http.conf     # HTTP nginx config template
│   ├── nginx-https.conf    # HTTPS nginx config template
│   ├── webclaw-api.service # systemd unit for FastAPI
│   └── webclaw-web.service # systemd unit for Next.js
├── SKILL.md                # OpenClaw skill metadata
├── LICENSE                 # MIT License
└── README.md               # This file
```

## Testing

### API Tests (pytest)

```bash
cd api && python3 -m pytest tests/ -v
```

### E2E Tests (Playwright)

```bash
cd web
npx playwright install chromium
E2E_BASE_URL=https://your-server.com E2E_EMAIL=admin@test.com E2E_PASSWORD=yourpass npx playwright test
```

168 E2E tests cover: auth flows, dashboard, navigation, data tables, forms, skill actions, chat, responsive layouts, security headers, and business workflows (O2C, P2P, journals, inventory, HR/payroll, reports).

## Actions

Webclaw exposes 12 actions via `scripts/db_query.py`:

| Action | Description |
|--------|-------------|
| `status` | Service health, SSL status, user count |
| `setup-ssl` | Configure HTTPS with Let's Encrypt |
| `renew-ssl` | Check and renew SSL certificate |
| `list-users` | List all dashboard users |
| `create-user` | Create user with temporary password |
| `reset-password` | Reset a user's password |
| `disable-user` | Disable a user account |
| `list-sessions` | Show active login sessions |
| `clear-sessions` | Invalidate all sessions |
| `maintenance` | Clean expired sessions, check cert |
| `restart-services` | Restart API + frontend services |
| `show-config` | Display current configuration |

## How It Works

1. **Skill discovery** — on startup, the API scans `~/clawd/skills/*/SKILL.md` and parses each skill's actions, parameters, and metadata
2. **Auto form generation** — `ui_builder.py` + `auto-form-spec.ts` convert SKILL.md parameter tables into form schemas (text inputs, selects, date pickers, JSON editors, entity lookups)
3. **Action execution** — forms submit to `POST /api/v1/skills/{skill}/execute`, which calls the skill's `db_query.py` via subprocess
4. **Data rendering** — JSON responses are rendered as DataTables (lists), FormViews (create/edit), or DetailViews (single record)
5. **Cross-skill lookups** — entity fields (customer_id, account_id, etc.) resolve to dropdown menus by calling the owning skill's list action

## Security

- Passwords hashed with PBKDF2-HMAC-SHA256 (600,000 iterations)
- JWT access tokens expire in 15 minutes
- Refresh tokens (httpOnly cookies) expire in 7 days
- All sessions invalidated on password change
- Rate limiting: 5/min auth, 30/min writes, 100/min general
- CORS restricted to configured origins
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- Path traversal protection on skill names
- Audit trail for all mutating operations

## License

MIT License — Copyright (c) 2026 AvanSaber

See [LICENSE](LICENSE) for details.
