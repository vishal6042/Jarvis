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
services/    Spring Boot microservices (parent POM, mvnw, start-all.ps1)
  common-security/      shared JWT lib
  discovery-service/    Eureka server
  api-gateway/          Spring Cloud Gateway
  auth-service/         users + profile + signup/login
  expense-service/      accounts/transactions/analytics
  ingestion-service/    /api/ingest pipeline
  ai-orchestrator-service/  Spring AI agents (Ollama)
  finance-service/      members/investments/loans/reminders/thresholds
frontend/    React PWA dashboard
android/     SMS-forwarder app (later phase)
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

## Roadmap (later phases)

- **Android app** — native SMS reader → `/api/ingest` for real-time capture.
- **Gmail ingestion** — OAuth read-only poller for bank-alert emails.
- **Telegram bot** — push alerts + conversational queries.
- **Statement import** (PDF/CSV), **voice** (Whisper + Piper), **smart-home** (Home Assistant),
  **Account Aggregator** (Finvu/Setu).

> Full design + decision history: `~/.claude/plans/i-want-to-create-stateful-papert.md`.
