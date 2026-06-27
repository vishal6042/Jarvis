# Jarvis — Personal Assistant

A self-hosted "Jarvis"-style assistant. **Phase 1: expense tracking** across multiple Indian
credit cards and savings accounts, fully local and ₹0 to run.

Full plan: `~/.claude/plans/i-want-to-create-stateful-papert.md`.

## Stack

- **Backend:** Spring Boot 3.5 (Java 21), Spring Data JPA, Flyway, Spring Security.
- **AI:** Spring AI → local **Ollama** (parser `qwen3.5:9b`, agent `qwen3.5:27b`). Provider is a
  Spring profile (`local` default), so a stronger/cloud model is a config swap, not a rewrite.
- **DB:** PostgreSQL 18 (local install, not Docker).
- **Frontend:** React + Vite PWA (`frontend/`).
- **Phone:** Kotlin SMS-forwarder app (`android/`) + Telegram bot.

## Repo layout

```
backend/    Spring Boot API + AI services (this is the core)
frontend/   React PWA dashboard           (later milestone)
android/    SMS-forwarder app             (later milestone)
```

## Prerequisites

- **PostgreSQL 18** (local, running on `:5432`) — installed.
- Ollama serving on `:11434` with models pulled:
  `ollama pull qwen3.5:9b` (done) and `ollama pull qwen3.5:27b`.
- JDK 21 (Liberica at `C:\Users\bhart\.jdks\liberica-full-21.0.10`). No host Maven needed —
  use the bundled `mvnw`.

## One-time DB setup

Create the app's database + role (run as the `postgres` superuser):

```sql
CREATE ROLE jarvis WITH LOGIN PASSWORD 'jarvis';
CREATE DATABASE jarvis OWNER jarvis;
```

(psql lives at `C:\Program Files\PostgreSQL\18\bin\psql.exe`.)

## Run (dev)

```bash
cp .env.example .env            # adjust secrets
cd backend
JAVA_HOME="C:/Users/bhart/.jdks/liberica-full-21.0.10" ./mvnw spring-boot:run
# API on http://localhost:8080  (actuator health at /actuator/health)
```
