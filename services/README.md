# Jarvis — Backend Microservices

True microservice architecture: each service is an independently deployable Spring Boot app with
its own database, all discovered via **Netflix Eureka** and fronted by a **Spring Cloud Gateway**.

```
                         React PWA (:5173)
                               │  JWT Bearer
                               ▼
                     ┌───────────────────┐
                     │   api-gateway      │  :8080  (only exposed port)
                     │  routes · JWT · CORS│
                     └─────────┬──────────┘
            lb:// (Eureka) ────┼───────────────┬───────────────┬─────────────┐
                     ▼         ▼               ▼               ▼             ▼
              auth-service  expense-service  ingestion-svc  ai-orchestrator  │
                 :8081         :8082            :8083           :8084         │
              jarvis_auth   jarvis_expense   jarvis_ingestion  (stateless)    │
                     └───────────────── all register with ───────────────────┘
                                  discovery-service (Eureka) :8761
```

All services share the single **`jarvis`** database; each owns its own tables and a private Flyway
history table (`flyway_history_<service>`) so migrations stay independent.

| Module | Port | Tables (in `jarvis`) | Responsibility |
|---|---|---|---|
| `discovery-service` | 8761 | — | Eureka service registry |
| `api-gateway` | 8080 | — | Edge routing (`lb://`), JWT fast-reject, CORS |
| `auth-service` | 8081 | `app_user`, `user_profile` | Users + profile; issues JWTs at login |
| `expense-service` | 8082 | `account`, `category`, `transaction` | Accounts/transactions, analytics, dedup |
| `ingestion-service` | 8083 | `raw_message` | `/api/ingest` pipeline: raw alert → parse → persist |
| `ai-orchestrator-service` | 8084 | — | Spring AI agents (parser + query); **only** service that talks to Ollama |
| `finance-service` | 8085 | `member`, `investment`, `loan`, `reminder`, `category_threshold` | Family members, investments, loans, reminders, spend thresholds |
| `common-security` | — | — | Shared library: JWT token service, request filter, stateless security auto-config |

## Prerequisites

- **JDK 21** (Liberica). Build via the bundled `./mvnw` (no host Maven needed).
- **PostgreSQL 18** on `:5432`, role `jarvis`/`jarvis`, with the single database `jarvis`
  (already created). Every service migrates into it via Flyway (`V1__init.sql`), using its own
  `flyway_history_<service>` history table so the migrations don't conflict.
- **Ollama** on `:11434` with the models pulled (only needed for the AI service):
  ```bash
  ollama pull qwen3.5:9b
  ollama pull qwen3.5:27b
  ```

## Build & run

```powershell
# build everything
./mvnw -DskipTests install

# launch the whole stack (each service in its own window)
./start-all.ps1
```

Or run a single service: `./mvnw -pl expense-service spring-boot:run`.

- Eureka dashboard: <http://localhost:8761>
- All client traffic goes through the gateway: <http://localhost:8080> (e.g. `POST /api/auth/login`).

## Security model

- **JWT (HS256)** with a shared secret across all services (`JARVIS_JWT_SECRET`). auth-service issues;
  the gateway fast-rejects bad tokens; every downstream service re-validates (defence in depth) via
  the `common-security` auto-config.
- **Service-to-service** calls (ingestion → ai/expense, ai → expense) use a shared
  `X-Internal-Key` header on `/internal/**` endpoints (not exposed through the gateway).

## Configuration (env overrides)

`JARVIS_JWT_SECRET` · `JARVIS_INTERNAL_KEY` · `DB_USER` / `DB_PASSWORD` · `OLLAMA_BASE_URL` ·
`EUREKA_URL` · `JARVIS_CORS_ORIGINS` · `JARVIS_PARSER_MODEL` / `JARVIS_AGENT_MODEL`.

> These services are the canonical backend. (They were split out of an earlier single-module spike,
> which has since been removed.)
