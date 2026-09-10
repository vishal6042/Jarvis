# Jarvis brand assets

The logo: a friendly assistant with its arm around a rising chart — the two halves of what the
app does (an assistant, and money that grows). Everything here is SVG, and everything else in
the repo (favicons, `.ico` files, the Android vector drawables, the inline React logos) is drawn
from these files.

| File | What it is | Used by |
|---|---|---|
| `jarvis-mark.svg` | The mark alone, transparent | Dark surfaces, `frontend/public/jarvis-mark.svg` |
| `jarvis-icon.svg` | The mark on the navy squircle | App icons: `.ico`, PWA PNGs, apple-touch |
| `jarvis-favicon.svg` | Simplified face + arc, legible at 16px | Browser tabs (`favicon.svg`, `favicon.ico`) |
| `jarvis-logo.svg` | Horizontal lockup, dark text | Light backgrounds, docs |
| `jarvis-logo-dark.svg` | Horizontal lockup, white text | Dark backgrounds |
| `jarvis-banner.svg` | Stacked lockup on its own navy panel | README, splash art |

## Palette

| Role | Colour |
|---|---|
| Tile navy | `#132B4C` → `#0B1B33` → `#060E1C` |
| Robot shell | `#FFFFFF` → `#C7D6E8` |
| Visor | `#16304F` → `#050D1B` |
| Eyes / accents | `#3ED8FF`, `#2FC9F2` |
| Arc | `#2AA6F5` → `#2CC5C8` → `#34D98A` |
| Growth bars | `#5AECAC` → `#12B26F` |

## Regenerating the raster icons

The mark is white-on-dark, so on a light page it needs the navy tile behind it — that is why the
app icons use `jarvis-icon.svg` and not the bare mark. Below 64px the full mark turns to mush, so
the small frames come from `jarvis-favicon.svg` instead.

After editing any SVG here:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\make-icon.ps1
```

That rasterises with headless Chrome (or Edge) and rewrites `assets/jarvis.ico`,
`desktop/build/icon.ico`, `frontend/public/favicon.ico`, the PWA PNGs, and the `favicon.svg`
copies in `frontend/public` and `desktop/public`.

Three places hold hand-maintained copies of the same paths, which have to be edited alongside
the SVG:

- `frontend/src/components/JarvisLogo.tsx` — the web app's inline logo
- `desktop/src/logo.tsx` — the Control Center's inline logo
- `android/app/src/main/res/drawable/ic_jarvis_logo.xml` — the Android vector drawable
  (`ic_launcher_foreground.xml` and `ic_launcher_monochrome.xml` are the same paths scaled into
  the adaptive-icon canvas)
