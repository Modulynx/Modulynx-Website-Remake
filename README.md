# Modulynx — Cinematic Scroll Site

> لا نكتب أكواداً — نبني أنظمة تهيمن.

A scroll-driven storytelling site for **Modulynx**. Six video scenes are scrubbed
frame-by-frame by the scroll position, so the story runs forward when you scroll
down and backward when you scroll up — like pulling film through a gate by hand.

Fully bilingual (Arabic RTL / English LTR) with a single toggle.

| | |
|---|---|
| **Stack** | Vanilla JS · [Vite](https://vite.dev) · [Lenis](https://lenis.darkroom.engineering) |
| **Runtime deps** | one (`lenis`) |
| **Bundle** | ~36 kB JS · ~17 kB CSS (12 kB / 4 kB gzipped) |
| **Media** | ~51 MB of video — the experience *is* the video |

---

## Running it

```bash
npm install
npm run dev
```

Opens on <http://localhost:5173>. Other machines on the LAN can reach it too
(the dev server binds to all interfaces).

```bash
npm run build     # -> dist/  (Vite bundle + assets copied verbatim)
npm run preview   # serve the production build locally
```

`dist/` is a plain static folder — drop it on Netlify, Vercel, Cloudflare Pages,
GitHub Pages or any static host. `base: './'` in `vite.config.js` keeps it
working from a sub-path, so a GitHub Pages project URL needs no rebuild.

---

## How the scroll engine works

There is no scroll-jacking, no pinning and no animation library.

```
┌─ #sky      fixed, z0   looping sky video (scene 5 background)
├─ #stage    fixed, z1   video layers 1-4, crossfaded by opacity
├─ #overlays fixed, z2   scene copy, driven by each video's currentTime
└─ #scroller       z3    empty spacers that define scroll distance
                         + the real contact section
```

A single `requestAnimationFrame` loop in [`src/stage.js`](src/stage.js) maps the
(Lenis-smoothed) scroll position onto three things:

1. **`video.currentTime`** — frame scrubbing. `play()` is never called on a
   scroll-driven video, which is what makes the whole thing immune to browser
   autoplay policies.
2. **layer opacity** — crossfades between scenes.
3. **overlay opacity** — text is tied to its scene's `currentTime`, not to wall
   clock time, so copy fades in and out at exactly the same frame in both scroll
   directions. Even the per-line stagger of the hero headline is scroll-driven.

Geometry is measured once per layout pass; the scroll handler only caches a
number. Nothing reads layout during scroll.

Scene lengths, fade windows and jump targets all live in the `scenes` array at
the top of `stage.js`. Per-overlay timing lives in `data-in` / `data-out` /
`data-rise` attributes in `index.html`, so retiming a scene is a data edit.

The one `video.play()` in the project is the dragon confirmation overlay, which
fires from a click — a user gesture — so it is never blocked.

---

## Video encoding

Scroll scrubbing lives or dies on seek latency. A normal H.264 clip carries a
keyframe every few seconds, so every `currentTime` write makes the decoder walk
forward from the last one — which reads as stutter under the finger.

The four scroll-driven clips are therefore re-encoded **all-intra**
(`x264 keyint=1`): every frame is a keyframe, so every seek is a direct hit. It
costs file size and buys frame-exact scrubbing.

| clip | encode | why |
|---|---|---|
| `main_bg_scrub`, `castle_scrub`, `cave_loop`, `Warior group` | all-intra, CRF 20 | scrubbed by scroll |
| `A massive black dragon` | GOP 48, CRF 21 | plays once, on click |
| `Background` | stream copy | loops, never seeked |

All clips are muted and stripped of audio, and written with `+faststart` so the
first frame is available before the file finishes downloading. Unprocessed
masters stay in `assets/videos/_originals/` (git-ignored).

---

## Contact form

Posts JSON to Formspree over `fetch`, deliberately *not* through a native form
`action` — a real form submit navigates away from the page and would kill the
confirmation scene.

The endpoint lives at the top of [`src/main.js`](src/main.js). Replacing it with
a `YOUR_FORM_ID` placeholder puts the form into preview mode: it still
validates, still shows the loading state and still plays the dragon, but sends
nothing.

---

## Layout

```
index.html                 markup + per-scene timing attributes
src/
  main.js                  boot, loader, smooth scroll, i18n wiring, form, overlay
  stage.js                 the scroll → currentTime engine
  i18n.js                  every user-facing string, AR + EN
  styles.css               design tokens and all styling
scripts/
  copy-assets.mjs          copies assets/ into dist/ after a build
assets/
  videos/                  six scenes (originals kept locally, git-ignored)
  images/                  logo, founder portrait
```

---

## Browser support

Chrome / Edge / Safari / Firefox, current versions. Touch scrubbing works on
phones and tablets. `prefers-reduced-motion` disables the smooth-scroll easing
and decorative animation while keeping the scenes usable.
