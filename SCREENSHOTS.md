# 📸 Screenshot & GIF Guide

How to produce clean, demo-data-only media for the README and GitHub Release,
using the isolated demo stack in [`docker-compose.demo.yml`](docker-compose.demo.yml).

> Goal: a few high-quality shots that show the product in 5 seconds. One good
> hero GIF beats ten static screenshots.

---

## 1. Start the demo stack

```bash
docker compose -f docker-compose.demo.yml up -d
```

| Service | URL |
|---------|-----|
| Jellyfin | http://localhost:8097 |
| Jellyseerr | http://localhost:5056 |
| Questorr dashboard | http://localhost:8283 |

Tear down when done (`-v` also wipes the demo data):

```bash
docker compose -f docker-compose.demo.yml down -v
```

## 2. One-time wiring

1. **Media** — drop a few public-domain clips into `./demo-data/media/movies` and
   `./demo-data/media/shows` (e.g. *Big Buck Bunny*, *Sintel*, *Tears of Steel*
   from peach.blender.org). Name folders like real titles so embeds look real.
2. **Jellyfin** (8097) — finish the wizard, add a *Movies* and a *Shows* library
   pointing at `/media/movies` and `/media/shows`, create a fake user.
3. **Jellyseerr** (5056) — sign in with the Jellyfin demo account, connect it to
   Jellyfin, enable it.
4. **Questorr** (8283) — run the setup wizard. Inside the demo network the other
   services are reachable by container name, **not** `localhost`:

   | Field | Value |
   |-------|-------|
   | Jellyfin URL | `http://jellyfin-demo:8096` |
   | Jellyseerr / Seerr URL | `http://jellyseerr-demo:5055` |
   | Discord token | a throwaway bot in a throwaway server |

   (Use `localhost:8097` / `localhost:5056` only in your browser, not in the
   Questorr config.)

## 3. What to capture (priority order)

**High impact (do these first):**
- [ ] **Hero GIF** — `/search` → click *Request* → the Discord embed appears.
      5–8 s, this is the README banner.
- [ ] Dashboard **setup wizard** (one clean step, e.g. the Discord/Jellyfin step).
- [ ] A rich **Discord notification embed** (available / approved) with buttons.
- [ ] **Weekly digest** embed (run the *Send test digest now* button).

**Nice to have:**
- [ ] `/subscribe` flow + the new-season DM.
- [ ] `/queue` grouped request status.
- [ ] Health-check bar + statistics panel.
- [ ] Mobile dashboard view (DevTools device mode, ~390 px wide).

## 4. Recommended settings

| Thing | Setting |
|-------|---------|
| Browser window | 1280×800 or 1440×900 — consistent across all shots |
| Theme | pick one (dark recommended) and keep it for every shot |
| Discord | use a dedicated test server, neutral channel names, fake usernames |
| Screenshots | `Win+Shift+S` (Snipping Tool), crop tight, no taskbar/personal tabs |
| GIFs | **ScreenToGif** — 15 fps, trim dead frames, keep under ~5 MB for GitHub |
| Video | **OBS Studio** for demos; `Win+G` for quick clips |

## 5. Where files go

- Put images/GIFs in [`assets/`](assets/) (e.g. `assets/hero.gif`,
  `assets/dashboard.png`).
- Reference them in `README.md` / `README.de.md`:
  ```markdown
  <p align="center"><img src="./assets/hero.gif" alt="Questorr demo" width="800"/></p>
  ```
- The README already carries a "screenshots are from a demo environment with no
  real user data" notice — keep that true by using only demo/fake data here.

## 6. Checklist before committing

- [ ] No real usernames, emails, server names, IPs or tokens visible
- [ ] Consistent theme + window size across the set
- [ ] GIFs trimmed and reasonably sized (< ~5 MB each)
- [ ] Images placed in `assets/` and linked from both READMEs
