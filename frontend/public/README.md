# Static assets (served at the site root by Vite)

Files here are served as-is from `/`. For example `public/login-bg.png` is reachable at
`/login-bg.png`.

## login-bg.png — the login screen background

The login page ([src/pages/Login.tsx](../src/pages/Login.tsx) → `LoginBackdrop`) uses
`url('/login-bg.png')` as its full-screen background — the purple finance illustration.

If the file is missing, the page still renders — you just get the plain theme background behind the
glass sign-in card (no error).
