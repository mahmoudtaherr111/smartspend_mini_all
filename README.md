# SmartSpend AI

An Arabic-first personal finance app for Egypt. People record spending by typing or speaking Egyptian
Arabic, forward bank SMS from their phone, and ask an AI Center questions about their money.

> دليل المشروع بالعربي: [docs/ar/README.md](docs/ar/README.md)

## Run it locally
```bash
npm ci
cp .env.example .env              # fill in the database URL, Google OAuth, JWT_SECRET and GEMINI_API_KEY
docker compose up -d mysql redis  # local MySQL and Redis
npm run db:push                   # local development database only
npm run dev                       # Vite and the API together on http://localhost:3000
```

The variables the server requires at boot are listed in [docs/atlas/env.md](docs/atlas/env.md).

## Find your way
| You want | Go to |
| --- | --- |
| Rules and commands for contributors, human or AI | [AGENTS.md](AGENTS.md) |
| Facts generated from the code: API, database, routes, pages, modules | [docs/atlas/](docs/atlas/README.md) |
| The architecture as an interactive map | `npm run arch:install`, then `npm run arch`; see [docs/architecture/](docs/architecture/README.md) |
| Deploy with Docker or to a server | [docs/guides/deploy.md](docs/guides/deploy.md) |
| How the documentation is organised | [docs/README.md](docs/README.md) |

## Repository layout
- `src/` web app (React, Vite, PWA)
- `api/` server (Hono and tRPC)
- `db/` Drizzle schema, relations and migrations for MySQL
- `contracts/` code shared by the web app and the server
- `android/`, `ios/` Capacitor shells of the web app
- `android-app/` native companion that forwards bank and wallet notifications
- `scripts/` tooling, including the atlas generator
- `tests/` cross-cutting tests
