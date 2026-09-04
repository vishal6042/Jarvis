# Jarvis Sync — Android SMS forwarder

A companion Android app for [Jarvis](../). It captures bank/UPI **transaction SMS** in real time and
forwards them to your self-hosted Jarvis backend (`POST /api/ingest`), where the existing AI pipeline
parses and stores each one. It also shows a **minimal current-month dashboard** mirroring the web app.

Everything is stored in an on-device **SQLite (Room) database**, so the app **works offline** and
**never loses a captured SMS** — messages queue durably (surviving app kill and reboot) and sync
automatically once the phone can reach the server again.

## What it does

- **Real-time forwarding** — a captured transaction SMS is queued instantly and delivered by a
  WorkManager job (network-constrained, exponential backoff, plus a 15-min safety net and a
  boot-time re-arm).
- **Durable, offline-safe queue** — a message leaves the queue only on a definitive server response;
  network/server outages just keep it queued until it succeeds.
- **Stays logged in** — the session (server URL + JWT) is stored in the DB; the app opens straight to
  the dashboard, even offline. The password is kept in EncryptedSharedPreferences so the background
  worker can silently re-login when the 24h JWT expires.
- **Dashboard** — Net worth, this-month spend, last-month earning, savings rate, and top categories,
  rendered from a local cache (offline) and refreshed when online.
- **History** — every forwarded SMS with the server's verdict (PARSED / DUPLICATE / IGNORED / FAILED)
  and a live count of anything still queued.

## Requirements

- Android Studio (Ladybug / 2024.2+), JDK 17 (bundled with Android Studio).
- A device or emulator on **API 26+ (Android 8.0+)**.
- The Jarvis stack running (`services/start-all.ps1`) and reachable from the phone on the LAN,
  e.g. `http://<your-PC-LAN-IP>:8080` (same Wi-Fi network).

## Build & install

1. Open the `android/` folder in **Android Studio** → let Gradle sync (it resolves all pinned
   dependencies and generates the Gradle wrapper). *(CLI alternative: run `gradle wrapper` once in
   `android/`, then `./gradlew assembleDebug`.)*
2. **Run** onto a device/emulator. This is a **sideload** app — the SMS permissions it needs aren't
   grantable through the Play Store, which is fine for a personal self-hosted tool.
3. On first launch, grant **SMS** (and notifications on Android 13+) when prompted.
4. Enter your **Server URL** (`http://<PC-LAN-IP>:8080`) and your Jarvis **username/password**, then
   sign in.

Plain HTTP on the LAN is enabled deliberately (`network_security_config.xml`). If you later expose the
gateway over HTTPS, just enter the `https://…` URL.

## Testing the flow

- Trigger a bank-style SMS (real, or on an emulator: extended controls → Phone → SMS, or
  `adb emu sms send BANKID "Rs 500 debited from a/c XX1234 to SWIGGY UPI"`). It should appear in
  **History** as **PARSED**, and show up in the web app.
- **Offline test:** turn off Wi-Fi (or stop the backend), trigger an SMS → it's queued; force-stop the
  app or reboot → still queued; restore the network → it syncs automatically.

## Project layout

```
app/src/main/java/com/jarvis/sync/
  data/            DTOs, OkHttp ApiClient, Credentials (encrypted), SyncRepository, db/ (Room)
  sms/             SmsReceiver (SMS_RECEIVED), SmsFilter (heuristic), BootReceiver
  work/            SyncWorker + SyncScheduler (WorkManager)
  ui/              AppViewModel, Screens (Login / Dashboard / History / Settings), theme/
  MainActivity.kt, JarvisSyncApp.kt
```

## Notes

- The SMS heuristic (`SmsFilter`) only trims obvious noise (OTPs/promos); the backend AI parser is the
  real classifier and marks non-transactions as IGNORED, so occasional over-forwarding is harmless.
- No backend changes are required — the app uses the existing `/api/auth/login`, `/api/ingest`,
  `/api/analytics/summary`, `/api/analytics/by-category`, and `/api/accounts` endpoints.
