# Static assets (served at the site root by Vite)

Files here are served as-is from `/`. For example `public/login-bg.png` is reachable at
`/login-bg.png`.

## login-bg.png — the login screen background

The login page ([src/pages/Login.tsx](../src/pages/Login.tsx) → `LoginBackdrop`) uses
`url('/login-bg.png')` as its full-screen background — the purple finance illustration.

If the file is missing, the page still renders — you just get the plain theme background behind the
glass sign-in card (no error).

## The icons — generated, do not hand-edit

`favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and
`jarvis-mark.svg` are all produced from [`assets/brand`](../../assets/brand) by
`scripts\make-icon.ps1`. Edit the SVG there and re-run the script; anything changed here by hand
is overwritten on the next run.

`index.html` links the favicon set and `site.webmanifest` (name, theme colour and the two PNG
sizes a phone uses when the app is added to a home screen).

The logo inside the app is **not** loaded from here — it is drawn inline by
[src/components/JarvisLogo.tsx](../src/components/JarvisLogo.tsx), so it is on screen at the first
paint.
