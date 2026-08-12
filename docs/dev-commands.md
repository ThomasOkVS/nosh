# Dev Commands

A cheat sheet for running and testing Nosh locally — the commands you reach
for often enough to forget the exact flags, but not often enough to remember
them. Not a substitute for [architecture.md](architecture.md) (how it's built)
or [decisions.md](decisions.md) (why) — just the "what do I actually type."

All commands assume you're at the repo root unless noted. `docker compose`
commands assume the stack is already up (`docker compose up`).

## First-time setup

```bash
pnpm install
docker compose up -d postgres backend
docker compose exec backend pnpm migrate up
```

## Running the app

Normal — all three services in Docker:

```bash
docker compose up
```

**Windows workaround:** the frontend's Vite dev server is currently unreliable
through Docker Desktop's Windows/WSL2 port-forwarding (see
[decisions.md](decisions.md#2026-08-06-frontend-dev-container-unreliable-on-windows-run-frontend-outside-docker-locally)) —
keep Postgres + backend in Docker, run the frontend directly:

```bash
docker compose up -d postgres backend
pnpm --filter frontend dev
```

Either way: frontend at `http://localhost:5173`, backend at
`http://localhost:3001`.

**Recipe import from a URL** needs a `GEMINI_API_KEY` in your `.env` (free
key from https://aistudio.google.com/apikey). Without it the app runs fine
and `POST /import` just returns 503. Import still works keyless on sites
that publish schema.org JSON-LD recipe data — Gemini is only the fallback
for pages that don't. After adding the key, restart the backend so it picks
it up: `docker compose up -d backend`.

### Testing the LLM fallback specifically

Most recipe sites publish JSON-LD, so a normal import never reaches Gemini.
To exercise the model, import a page that has a real recipe but no recipe
markup — Wikibooks' Cookbook is reliable for this:

```bash
curl -s -X POST http://localhost:3001/import -H "Content-Type: application/json" -d '{"url":"https://en.wikibooks.org/wiki/Cookbook:Guacamole"}'
```

(Or just paste that URL into the import page while logged in.) To check
whether any given page would take the fast path, search its HTML for
`"@type": "Recipe"` — if it's there, JSON-LD handles it and Gemini is never
called.

If import fails with a Gemini error, list what your key can actually call —
model ids get retired for *new* keys while still working for old ones:

```bash
docker compose exec backend node -e "fetch('https://generativelanguage.googleapis.com/v1beta/models?key='+process.env.GEMINI_API_KEY).then(r=>r.json()).then(d=>console.log(d.models.map(m=>m.name).join('\n')))"
```

## Demo data

The backend seeds a demo account automatically on startup
(`SEED_DEMO_DATA=true`, on by default in `docker-compose.yml`):

- **Username:** `Demo`
- **Password:** `123`

5 sample recipes come with it. Seeding is idempotent — safe on every restart,
won't duplicate recipes or overwrite a photo you've added by hand.

## Tests, lint, build

Whole repo:

```bash
pnpm -r test
pnpm -r lint
pnpm -r build
```

One package at a time:

```bash
pnpm --filter backend test
pnpm --filter frontend test
```

Backend tests need a reachable Postgres. If the stack is already up via
Docker, run them inside the container instead of on the host:

```bash
docker compose exec backend pnpm test
```

## Migrations

```bash
docker compose exec backend pnpm migrate up
docker compose exec backend pnpm migrate down   # roll back the last one
docker compose exec backend pnpm migrate create some-migration-name
```

## Database shell

```bash
docker compose exec postgres psql -U nosh -d nosh
```

## Applying a config/env change

Editing source files hot-reloads automatically (bind mount + Vite HMR /
`tsx watch`). Editing `docker-compose.yml` (env vars) or a package's
`package.json` (new dependency) does **not** — the container needs to be
recreated:

```bash
docker compose up -d <service>          # env var changes
docker compose up -d --build <service>  # new/changed dependencies
```

A plain `docker compose restart <service>` reuses the existing container as-is
and picks up neither.

## Troubleshooting

- **Frontend unreachable on Windows** (`ERR_EMPTY_RESPONSE`/connection
  refused hitting `:5173`, even though `docker compose ps` looks healthy) —
  see the Windows workaround above and the linked decision entry.
- **A new dependency doesn't seem to exist inside a container** — rebuild that
  service's image: `docker compose up -d --build <service>`.
- **A service crash-loops on startup with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`**
  — its anonymous `node_modules` volume is out of sync with the lockfile, and
  pnpm can't prompt to purge/reinstall without a TTY. Recreate the containers
  so they get a fresh anonymous volume seeded from the image:
  `docker compose down && docker compose up -d --build`.
