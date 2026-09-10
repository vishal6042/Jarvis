# Jarvis — Self-Hosted Personal Finance Assistant

A "Jarvis"-style personal finance assistant for India: track expenses across multiple credit cards
and savings accounts, manage investments/loans/reminders, and ask a local AI agent about your
money. Fully self-hosted on your own PC, **₹0 to run** (local Ollama inference, no cloud APIs).

> Status: **Phase 1 — expense tracking + finance dashboard.** Web app (React PWA) on a true
> Spring Boot **microservices** backend. Android SMS ingestion is a later phase.

---

## Architecture

True microservices behind a single API gateway, discovered via Netflix Eureka. The browser only
ever talks to the gateway (`:8080`); the gateway routes by path to the right service over `lb://`.

```
                         React PWA (:5173)
                               │  JWT Bearer
                               ▼
                     ┌────────────────────┐
                     │     api-gateway     │  :8080  (only exposed port)
                     │  routes · JWT · CORS │
                     └──────────┬──────────┘
        lb:// (Eureka) ─────────┼───────────┬───────────┬───────────┬──────────┐
              ▼          ▼                  ▼           ▼           ▼          ▼
        auth-service  expense-service  ingestion   ai-orchestrator finance   (…)
           :8081         :8082          :8083          :8084        :8085
              └──────────── all register with ─────────────────────────┘
                         discovery-service (Eureka) :8761
                                    │
                         PostgreSQL `jarvis` DB        Ollama :11434
                    (schema per service)        (ai-orchestrator only)
```

### Services

| Service | Port | DB schema | Responsibility |
|---|---|---|---|
| **discovery-service** | 8761 | — | Netflix Eureka registry |
| **api-gateway** | 8080 | — | Edge routing (`lb://`), JWT fast-reject, **sole CORS owner** |
| **auth-service** | 8081 | `auth` | Users + profile; **signup/login → JWT** |
| **expense-service** | 8082 | `expense` | Accounts, transactions, categories, analytics, dedup |
| **ingestion-service** | 8083 | `ingestion` | `/api/ingest` pipeline: raw alert → parse → persist |
| **ai-orchestrator-service** | 8084 | — | Spring AI agents (parser + Q&A); **only** service that calls Ollama |
| **finance-service** | 8085 | `finance` | Members, investments, loans, reminders, spend thresholds |
| **common-security** | — | — | Shared library: JWT token service, request filter, stateless security auto-config |

All services share the **single `jarvis` database**; each migrates into its **own Postgres schema**
(via Flyway + `hibernate.default_schema`) so their schemas never collide. See
[`services/README.md`](services/README.md) for the backend deep-dive.

---

## Tech stack

- **Backend:** Spring Boot 3.5 (Java 21), Spring Cloud 2025.0.0 (Gateway + Eureka + LoadBalancer),
  Spring Data JPA, Flyway, Spring Security (stateless JWT, BCrypt, jjwt 0.12).
- **AI:** Spring AI 1.1.8 → local **Ollama**. Parser `qwen3.5:9b` (structured output, thinking off);
  Q&A agent `qwen3.5:27b` with `@Tool` functions that call expense analytics over `WebClient`.
  Provider is a Spring profile (`local` default), so a cloud/bigger model is a config swap.
- **DB:** PostgreSQL 18 (local install, no Docker), one `jarvis` database, schema per service.
- **Frontend:** React 19 + Vite + TypeScript, Tailwind v4, shadcn/ui (base-ui "nova"), Recharts,
  react-router, axios. Installable PWA.
- **Auth:** HS256 JWT issued by auth-service, validated at the gateway and re-validated by each
  service (defence in depth) with a shared secret. Service-to-service calls use an `X-Internal-Key`.
- **Android (later):** Kotlin SMS-forwarder posting to `/api/ingest`.

---

## Repo layout

```
services/    Spring Boot microservices (parent POM, mvnw, start-all.ps1, service-list.ps1)
  common-security/      shared JWT lib
  discovery-service/    Eureka server
  api-gateway/          Spring Cloud Gateway
  auth-service/         users + profile + signup/login
  expense-service/      accounts/transactions/analytics
  ingestion-service/    /api/ingest pipeline
  ai-orchestrator-service/  Spring AI agents (Ollama)
  finance-service/      members/investments/loans/reminders/thresholds
  notification-service/ alerts + delivery
frontend/    React PWA dashboard
android/     SMS-forwarder app (later phase)
desktop/     Windows Control Center (Electron): start, watch and restart the stack
corpus/      financial guidance the assistant can quote (manifest + extracted text; see below)
scripts/     one-off setup helpers (desktop shortcut, icon generation, phone battery exemption, corpus extraction)
assets/      jarvis.ico for the shortcut
start-jarvis.ps1 / .cmd   one-window launcher for the whole stack (what the shortcut runs)
```

---

## Prerequisites

- **JDK 21** (Liberica at `C:\Users\bhart\.jdks\liberica-full-21.0.10`). No host Maven — use the
  bundled `services/mvnw`.
- **PostgreSQL 18** on `:5432` with role + database (run once as the `postgres` superuser;
  `psql` lives at `C:\Program Files\PostgreSQL\18\bin\psql.exe`):
  ```sql
  CREATE ROLE jarvis WITH LOGIN PASSWORD 'jarvis';
  CREATE DATABASE jarvis OWNER jarvis;
  ```
  Each service creates and migrates its own schema on first start — no manual schema setup.
- **Ollama** on `:11434` with models pulled (only needed for the AI service):
  ```bash
  ollama pull qwen3.5:9b
  ollama pull qwen3.5:27b
  ```
- **Node 20+** for the frontend.

---

## Run (dev)

**One click** - a Desktop shortcut that does everything (build, all 8 services, the web app) in a
single window, with each service's logs colour-coded behind a `[name]` prefix. Create it once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-shortcut.ps1
```

After that, double-click **Jarvis** on the Desktop. Ctrl+C in that window shuts the whole stack
down. The same logs are written to `logs\<service>.log`. Flags, if you run it from a terminal:
`-NoBuild` skips the Maven build, `-NoBrowser` leaves the browser alone.


### Control Center (Windows desktop app)

A window that starts, watches and restarts the whole stack, in `desktop/`. Build the installer:

```powershell
cd desktop
npm install
npm run dist        # release\Jarvis Control Center Setup 1.0.0.exe
```

`npm start` runs it without installing.

- **Opening it starts the stack**, but only what is not already listening -- glancing at a healthy
  stack never restarts it.
- **PostgreSQL and Ollama are watched, not managed.** Postgres down blocks starting at all, because
  every service would otherwise die on its first migration; Ollama down is only a warning.
- **Logs come from `logs\`**, the same files the scripts write, so they show up whoever started the
  services.
- **Close minimises to the tray** and leaves everything running; the minimise button behaves
  normally. Quit from the tray menu, or turn the tray behaviour off in Settings.
- Services, ports and start order come from `services/services.json` -- the same file the PowerShell
  launchers read, so there is one list to keep right.

The manual route, when you want each service in its own window:

**Backend** — build all modules and launch the stack (each service in its own window):
```powershell
cd services
./start-all.ps1
```
- Eureka dashboard: <http://localhost:8761>
- Gateway (all client traffic): <http://localhost:8080>
- Run a single service: `./mvnw -pl expense-service spring-boot:run`

**Frontend:**
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (talks to the gateway via VITE_API_BASE)
```

### First-run / auth flow

The app is **single-user**. On a fresh database there is no account, so the login page opens on
**Sign up** — enter your personal details (name/email/phone/city) + username/password; that creates
your account **and** profile. You're then dropped to **Sign in** to log in. After that it's always
sign-in. (`GET /api/auth/exists` drives signup-first; register returns 409 once an account exists.)

---

## Security model

- **JWT (HS256)** with one shared secret (`JARVIS_JWT_SECRET`, ≥32 bytes) across all services.
  auth-service issues it at login; the gateway fast-rejects bad/absent tokens at the edge; every
  downstream service re-validates via `common-security`.
- **CORS is owned only by the gateway.** Downstream services do **not** add CORS headers (two
  `Access-Control-Allow-Origin` values would make the browser reject the response).
- **Service-to-service** calls (ingestion → ai/expense, ai → expense) hit `/internal/**` endpoints
  guarded by a shared `X-Internal-Key`; these are never exposed through the gateway.

---

## Configuration (env overrides)

Copy `.env.example` → `.env`. Common overrides (all have dev defaults):

| Var | Purpose |
|---|---|
| `JARVIS_DB_URL` / `DB_USER` / `DB_PASSWORD` | Postgres connection (default `jdbc:postgresql://localhost:5432/jarvis`, `jarvis`/`jarvis`) |
| `JARVIS_JWT_SECRET` | Shared HS256 secret (≥32 bytes) — **set a real one** |
| `JARVIS_INTERNAL_KEY` | Shared service-to-service key for `/internal/**` |
| `OLLAMA_BASE_URL` · `JARVIS_PARSER_MODEL` · `JARVIS_AGENT_MODEL` · `JARVIS_PROFILE` | Local AI |
| `EUREKA_URL` | Eureka registry URL (default `http://localhost:8761/eureka/`) |
| `JARVIS_CORS_ORIGINS` | Allowed browser origin(s) (default `http://localhost:5173`) |
| `VITE_API_BASE` (frontend) | Gateway base URL (default `http://localhost:8080`) |

---

## Frontend behaviour

- All data domains are **backend-persisted** (no `localStorage` data): profile/accounts via
  expense+auth, and members/investments/loans/reminders/thresholds via finance-service. Only the
  JWT token, theme, and small UI flags live client-side.
- The **Assistant** calls the real `/api/ai/chat` agent (falls back to a local heuristic if the AI
  service is offline). **Analytics** and the dashboard summary read real `/api/analytics/*` and
  gracefully fall back to sample data when the backend is unavailable.

---

## Financial guidance corpus (RAG)

The assistant answers "what did I spend on food?" from your own data, and "how much can I claim
under 80C?" from published guidance. The second half is a small Qdrant collection the agent can
search through a `searchFinancialGuidance` tool.

**Sources are regulators only** — SEBI, RBI and the Income Tax Department — so the material stays
neutral and citable rather than promotional. `corpus/manifest.json` lists each document with its
URL and what extraction it needs; `corpus/text/` holds the extracted text and is committed;
`corpus/sources/` holds the originals and is gitignored.

Retrieval is a **tool, not a pipeline stage**. Spending questions need your figures and nothing
else, rule questions need only guidance, and "I have ₹20,000 spare — save or invest?" needs both.
Letting the agent choose means there is no query router to keep correct.

```
Qdrant       localhost:6334 (gRPC)   collection jarvis_financial_guidance, 1024-dim, Cosine
Embeddings   bge-large via Ollama    same model for indexing and querying, or the vectors are meaningless
Filters      country=IN, audience=individual
```

The `audience` filter earns its place: barely half the rows in the Income Tax deductions table
apply to individuals, and the rest are for companies and co-operative societies. Without it, a
question about personal deductions can retrieve cattle insurance for federal milk co-operatives.

**Qdrant is started for you.** It is a bare executable with no service wrapper, so nothing brings it
back after a reboot — the Control Center starts it (path in `services.json`) when you start the
stack, and never stops it again, because a store outlives the stack that reads it and this one also
holds collections belonging to other projects.

The dependency strip reports what it is actually doing rather than just that the port is open:
**"311 guidance chunks indexed"** when healthy, or an amber **"Collection is empty — run the
indexer"** when not. That distinction matters: an empty Qdrant answers every lookup with no hits,
so the assistant quietly stops citing sources with nothing anywhere reporting an error.

**Re-index** after changing the corpus (indexing never happens on a normal startup):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\rag\extract.ps1   # only if sources changed
cd services; .\mvnw -pl ai-orchestrator-service spring-boot:run `
  -Dspring-boot.run.arguments=--jarvis.rag.index-on-start=true
```

Two things to know when working on this:

- **Tax figures date.** Chunks carry an `as_of` (currently Finance Act 2026 / AY 2026-27), and the
  same document holds both old- and new-regime figures for the same relief, so the agent is
  instructed to always say which regime it means.
- **The Income Tax site blocks scripted fetching**, and its own PDFs are truncated screenshots of
  its web pages. Save those pages from a browser by hand; that is why the extracted text is
  committed rather than regenerated from a download.

---

## Roadmap (later phases)

- **Android app** — native SMS reader → `/api/ingest` for real-time capture.
- **Gmail ingestion** — OAuth read-only poller for bank-alert emails.
- **Telegram bot** — push alerts + conversational queries.
- **Statement import** (PDF/CSV), **voice** (Whisper + Piper), **smart-home** (Home Assistant),
  **Account Aggregator** (Finvu/Setu).

> Full design + decision history: `~/.claude/plans/i-want-to-create-stateful-papert.md`.
