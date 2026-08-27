/* ═══════════════════════════════════════════════════════════
   stage.js — the scroll-driven film engine

   Model
   ─────
   A single fixed "stage" holds every scroll-driven video layer.
   The document itself contains only empty spacers whose heights
   define how much scroll distance each scene owns, plus the real
   contact section at the end.

   One rAF loop maps the (smoothed) scroll position onto:
     • video.currentTime      — frame scrubbing, never play()
     • layer opacity          — crossfades between scenes
     • overlay text opacity   — tied to the VIDEO's currentTime,
                                so text mirrors the scroll exactly
                                in both directions.

   Nothing here reads layout inside a scroll handler: the scroll
   value is cached from the scroll event, geometry is measured
   once per layout pass (load / resize).
   ═══════════════════════════════════════════════════════════ */

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const ramp = (v, from, to) => (to === from ? (v >= to ? 1 : 0) : clamp01((v - from) / (to - from)));

/** How long (in video seconds) a staggered element takes to fade in. */
const RISE = 0.6;
/** Vertical travel of a staggered element, in px. */
const RISE_Y = 16;
/** Scroll distance (in viewport heights) used to fade the stage out into the sky. */
const EXIT_VH = 1.0;

export function createStage() {
  const scenes = [
    // `stops` are the video times a scroll gesture is allowed to settle on:
    // the moments where a scene's copy is fully readable, plus its key visual
    // beats. Nothing ever comes to rest between two of them.
    { key: 's1', video: document.getElementById('v1'), layer: document.getElementById('layer1'), dur: 11.041667, vh: 2.6, crossPrevSec: 0,   stops: [0, 3.4] },
    { key: 's2', video: document.getElementById('v2'), layer: document.getElementById('layer2'), dur: 11.041667, vh: 2.6, crossPrevSec: 2.0, stops: [0.8, 6, 9.4] },
    { key: 's3', video: document.getElementById('v3'), layer: document.getElementById('layer3'), dur: 24.0,      vh: 6.0, crossPrevSec: 2.0, stops: [1.2, 6, 18] },
    // Spec: this crossfade is pinned to cave t=21s→24s, the last 3s of scene 3.
    { key: 's4', video: document.getElementById('v4'), layer: document.getElementById('layer4'), dur: 11.041667, vh: 3.0, crossPrevSec: 3.0, stops: [8.0] }
  ];

  const stageEl = document.getElementById('stage');
  const spacers = [...document.querySelectorAll('.spacer')];
  const contactEl = document.getElementById('contact');
  const progressBar = document.getElementById('progressBar');
  const headerEl = document.getElementById('header');

  // Overlays, pre-parsed once so the frame loop stays allocation-free.
  const overlays = [...document.querySelectorAll('.ov')].map((el) => {
    const items = [...el.querySelectorAll('[data-in]')].map((node) => ({
      node,
      in: parseFloat(node.dataset.in)
    }));
    return {
      el,
      scene: parseInt(el.dataset.scene, 10),
      out: parseFloat(el.dataset.out),
      outEnd: parseFloat(el.dataset.outEnd),
      minIn: items.length ? Math.min(...items.map((i) => i.in)) : 0,
      // Spec: the cave panels fade over 0.5s; everything else uses RISE.
      rise: parseFloat(el.dataset.rise) || RISE,
      items,
      on: false
    };
  });

  const geo = { exitStart: 0, exitLen: 1, scrollable: 1 };
  const targets = { top: 0, services: 0, work: 0, team: 0, contact: 0 };
  /** Scroll offsets a gesture may settle on, ascending. */
  const stations = [];

  let scrollY = 0;
  let dirty = true;
  /* Which scene is carrying the picture. Budget phones expose only a handful
     of hardware video decoders, so the loader uses this to keep the ones far
     from the reader detached rather than all six alive at once. */
  let activeScene = 0;

  /* ── geometry ─────────────────────────────────────────── */

  function layout() {
    const H = window.innerHeight;
    // A hidden/zero-height viewport (background tab, pane not yet composited)
    // would collapse every scene to zero length and saturate the whole timeline.
    if (H < 1) { requestAnimationFrame(layout); return; }
    let acc = 0;

    scenes.forEach((s, i) => {
      s.len = Math.round(s.vh * H);
      s.start = acc;
      s.end = acc + s.len;
      const prev = scenes[i - 1];
      // Crossfade length is expressed in seconds of the PREVIOUS video,
      // converted into scroll pixels of that scene.
      s.crossLen = prev ? Math.max(1, (s.crossPrevSec / prev.dur) * prev.len) : 0;
      acc = s.end;
    });

    geo.exitStart = acc;
    geo.exitLen = Math.round(EXIT_VH * H);

    spacers.forEach((el, i) => {
      const extra = i === scenes.length - 1 ? geo.exitLen : 0;
      el.style.height = `${scenes[i].len + extra}px`;
    });

    /* The contact section has to be at least a full viewport tall, or the page
       cannot scroll far enough to put its top at the top of the screen and a
       jump there clamps to the end of the document — landing on the footer.
       CSS says 100svh, which is the viewport with the browser's toolbars
       showing; Safari retracts them as you scroll and the viewport grows past
       it. Pinning it here, in pixels from the live viewport on every layout
       pass, holds whatever the toolbars are doing. */
    contactEl.style.minHeight = `${H}px`;

    const s3 = scenes[2];
    const s4 = scenes[3];
    targets.top = 0;
    targets.services = Math.round(s3.start + (6 / s3.dur) * s3.len);   // services panel, cave t=6s
    targets.work = Math.round(s3.start + (18 / s3.dur) * s3.len);      // work panel, cave t=18s
    targets.team = Math.round(s4.start + (8 / s4.dur) * s4.len);       // warriors closing in, team copy up
    targets.contact = Math.round(contactEl.offsetTop);

    geo.scrollable = Math.max(1, document.documentElement.scrollHeight - H);

    stations.length = 0;
    for (const s of scenes) {
      for (const t of s.stops) stations.push(Math.round(s.start + (t / s.dur) * s.len));
    }
    stations.push(targets.contact);
    stations.sort((a, b) => a - b);

    // A nav jump must land on a station, not beside one — otherwise the next
    // gesture anchors somewhere the reader never chose.
    for (const key of Object.keys(targets)) {
      targets[key] = stations[nearestStation(targets[key])];
    }

    dirty = true;
  }

  /** Index of the station closest to a scroll offset. */
  function nearestStation(y) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < stations.length; i++) {
      const d = Math.abs(stations[i] - y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  /* ── per-frame video seeking ──────────────────────────── */

  function seek(video, time) {
    if (video.readyState < 1) return;
    // Skip sub-frame corrections and pile-ups while a seek is in flight.
    const delta = Math.abs(video.currentTime - time);
    if (delta < 0.01) return;
    if (video.seeking && delta < 0.06) return;
    video.currentTime = time;
  }

  /* ── the frame ────────────────────────────────────────── */

  function render() {
    const y = scrollY;

    // 1. progress + header chrome
    progressBar.style.width = `${clamp01(y / geo.scrollable) * 100}%`;
    headerEl.classList.toggle('is-stuck', y > 40);

    // 2. stage exit — layers 1-4 dissolve, revealing the looping sky behind
    const stageAlpha = 1 - ramp(y, geo.exitStart, geo.exitStart + geo.exitLen);
    stageEl.style.opacity = stageAlpha;
    stageEl.style.visibility = stageAlpha < 0.002 ? 'hidden' : 'visible';

    // 3. scene progress + layer crossfades
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      s.p = clamp01((y - s.start) / s.len);
      s.alpha = i === 0 ? 1 : ramp(y, s.start - s.crossLen, s.start);
      if (i > 0) s.layer.style.opacity = s.alpha;
    }

    activeScene = 0;
    for (let i = scenes.length - 1; i >= 0; i--) {
      if (scenes[i].alpha > 0.5) { activeScene = i; break; }
    }

    // 4. scrub — only for layers actually contributing pixels
    if (stageAlpha > 0.002) {
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        const next = scenes[i + 1];
        const covered = next ? next.alpha > 0.999 : false;
        if (s.alpha > 0.002 && !covered) {
          seek(s.video, Math.min(s.p * s.dur, s.dur - 0.02));
        }
      }
    }

    // 5. overlay text — driven by each scene's video currentTime
    for (const ov of overlays) {
      const s = scenes[ov.scene];
      const t = s.p * s.dur;
      const alpha = (1 - ramp(t, ov.out, ov.outEnd)) * stageAlpha;
      const on = alpha > 0.002 && t >= ov.minIn - 0.05;

      if (on !== ov.on) {
        ov.el.classList.toggle('is-on', on);
        ov.on = on;
      }
      if (!on) continue;

      ov.el.style.opacity = alpha;
      for (const item of ov.items) {
        const a = ramp(t, item.in, item.in + ov.rise);
        item.node.style.opacity = a;
        item.node.style.transform = a === 1 ? 'none' : `translate3d(0, ${(1 - a) * RISE_Y}px, 0)`;
      }
    }
  }

  function frame() {
    if (dirty) {
      dirty = false;
      render();
    }
    requestAnimationFrame(frame);
  }

  /* ── wiring ───────────────────────────────────────────── */

  function setScroll(value) {
    if (value === scrollY) return;
    scrollY = value;
    dirty = true;
  }

  function start() {
    layout();
    setScroll(window.scrollY);
    render();
    requestAnimationFrame(frame);

    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        layout();
        setScroll(window.scrollY);
      }, 120);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // The contact section is content-sized; its height changes with fonts,
    // language and validation messages — all of which move `targets.contact`.
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(contactEl);
    if (document.fonts) document.fonts.ready.then(onResize);
  }

  return {
    start, layout, setScroll, targets, scenes, stations, nearestStation,
    activeScene: () => activeScene,
    invalidate: () => { dirty = true; }
  };
}
