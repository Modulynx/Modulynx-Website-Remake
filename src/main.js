/* ═══════════════════════════════════════════════════════════
   MODULYNX — main
   Boot order: sources → loader → smooth scroll → stage → UI
   ═══════════════════════════════════════════════════════════ */

import Lenis from 'lenis';
import { createStage } from './stage.js';
import { applyLang, currentLang, t } from './i18n.js';

/* ────────────────────────────────────────────────────────────
   CONTACT FORM ENDPOINT — Formspree form "Modulynx Contact".
   Submissions appear at formspree.io/forms/xdenjjyq/submissions

   Posted as JSON over AJAX rather than a native form action, so the
   page never navigates away and the dragon confirmation can take
   over the screen on success.

   Putting a YOUR_FORM_ID placeholder back here returns the form to
   preview mode: it validates and plays the confirmation but sends
   nothing.
   ──────────────────────────────────────────────────────────── */
const FORM_ENDPOINT = 'https://formspree.io/f/xdenjjyq';
const ENDPOINT_IS_PLACEHOLDER = FORM_ENDPOINT.includes('YOUR_FORM_ID');

const VIDEOS = {
  v1: 'assets/videos/main_bg_scrub.mp4',
  v2: 'assets/videos/castle_scrub.mp4',
  v3: 'assets/videos/cave_loop.mp4',
  v4: 'assets/videos/Warior group.mp4',
  vSky: 'assets/videos/Background.mp4',
  vDragon: 'assets/videos/A massive black dragon.mp4'
};

/** Native aspect of the story clips, used to work out how much of each frame
    `object-fit: cover` is currently hiding off the sides. */
const VIDEO_ASPECT = 1284 / 716;

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════ 1. sources ══════════════ */

/* Scene 1 is the only source set now. Everything else is attached after the
   curtain lifts (see `loadRestInOrder`), so the opening frame gets the whole
   connection to itself instead of racing four other downloads. */
document.getElementById('v1').src = encodeURI(VIDEOS.v1);

const scrubVideos = ['v1', 'v2', 'v3', 'v4'].map((id) => document.getElementById(id));
const allVideos = [...scrubVideos, document.getElementById('vSky')];
const skyVideo = $('#vSky');
const dragonVideo = $('#vDragon');

/* ══════════════ 2. loader ══════════════ */

document.body.classList.add('is-loading');

const loaderEl = $('#loader');
const loaderBar = $('#loaderBar');
const loaderPct = $('#loaderPct');

function whenReady(video) {
  return new Promise((resolve) => {
    if (video.readyState >= 2) return resolve();
    const done = () => {
      video.removeEventListener('loadeddata', done);
      video.removeEventListener('error', done);
      resolve();
    };
    video.addEventListener('loadeddata', done);
    video.addEventListener('error', done); // never let a bad asset trap the user
  });
}

/** Warm the decoder so the very first currentTime write paints instantly. */
async function warmUp(video) {
  try {
    video.muted = true;
    const played = video.play();
    if (played) await played;
    video.pause();
    video.currentTime = 0;
  } catch { /* autoplay refused — retried on first gesture */ }
}

const bufferedSeconds = (video) => (video.buffered.length ? video.buffered.end(0) : 0);

/* The remaining scenes load in story order, each waiting for the one before it
   so they never compete for the same bandwidth. A scene that stalls does not
   hold up the rest — the chain moves on after a few seconds either way. If the
   reader outruns the download, the previous layer simply stays on screen. */
async function loadRestInOrder() {
  for (const id of ['v2', 'v3', 'v4', 'vSky']) {
    const video = document.getElementById(id);
    video.preload = 'auto';
    video.src = encodeURI(VIDEOS[id]);
    video.load();
    await Promise.race([whenReady(video), sleep(6000)]);
    warmUp(video);
    if (id === 'vSky') video.play().catch(() => {});
  }
  warmDragon();
}

/* The confirmation clip used to be the last thing in the chain, so submitting
   the form early meant staring at black while 2 MB downloaded. It is now armed
   as soon as the reader shows any sign of heading for it — reaching the contact
   section, or touching a field — which is always many seconds before they can
   press send. Idempotent: whichever signal lands first wins. */
let dragonArmed = false;
function warmDragon() {
  if (dragonArmed) return;
  dragonArmed = true;
  dragonVideo.preload = 'auto';
  if (!dragonVideo.src) dragonVideo.src = encodeURI(VIDEOS.vDragon);
  dragonVideo.load();
}

async function boot() {
  const hero = document.getElementById('v1');
  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();

  let fontsDone = false;
  fonts.then(() => { fontsDone = true; });

  // An honest bar: it tracks how much of the opening scene has actually
  // arrived, rather than creeping on a timer.
  let shown = 0;
  const paint = () => {
    let target = fontsDone ? 0.12 : 0;
    if (hero.readyState >= 2) target = 1;
    else if (hero.duration) target += 0.88 * Math.min(1, bufferedSeconds(hero) / 2.5);

    shown += (target - shown) * 0.18;
    const value = Math.min(99, Math.round(shown * 100));
    loaderBar.style.width = `${value}%`;
    loaderPct.textContent = `${value}%`;
    if (hero.readyState < 2) requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);

  // Never hold the curtain for more than 15s, whatever the network does.
  /* Fonts get a moment so the headline does not visibly swap, but they never
     hold the curtain: `display=swap` keeps the copy readable either way.

     The whole wait is capped at four seconds. The hero video carries a 36 kB
     poster of its own first frame, so past that point the opening shot is on
     screen and correct even while the video is still arriving — far better
     than staring at a progress bar on a slow connection. */
  await Promise.race([
    Promise.all([whenReady(hero), Promise.race([fonts, sleep(1200)])]),
    sleep(4000)
  ]);
  await warmUp(hero);

  loaderBar.style.width = '100%';
  loaderPct.textContent = '100%';
  await sleep(200);

  loaderEl.classList.add('is-done');
  document.body.classList.remove('is-loading');
  setTimeout(() => { loaderEl.hidden = true; }, 800);
  setTimeout(maybeShowPanHint, 1400);

  loadRestInOrder();
}

// Some browsers refuse the silent warm-up until the user has interacted.
const retryWarmUp = () => {
  for (const video of allVideos) if (video.src) warmUp(video);
  if (skyVideo.src) skyVideo.play().catch(() => {});
};
['pointerdown', 'touchstart', 'keydown'].forEach((evt) =>
  window.addEventListener(evt, retryWarmUp, { once: true, passive: true })
);

/* ══════════════ 3. smooth scroll + stage ══════════════ */

const stage = createStage();

let lenis = null;
if (!prefersReduced) {
  lenis = new Lenis({
    lerp: 0.085,          // momentum — low enough that frames feel hand-pulled
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
    syncTouch: true,      // the same easing on touch drags
    smoothWheel: true
  });
  lenis.on('scroll', ({ scroll }) => { stage.setScroll(scroll); clampScroll(scroll); });
  const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

// Lenis drives the real window scroll position, so the native event is always
// authoritative — and it also covers scrollbar drags, keyboard paging and
// programmatic jumps, which never pass through Lenis's own emitter.
window.addEventListener('scroll', () => stage.setScroll(window.scrollY), { passive: true });

// rAF is suspended while the tab is hidden; re-sync the moment it comes back.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { stage.layout(); stage.setScroll(window.scrollY); }
});
window.addEventListener('pageshow', () => { stage.layout(); stage.setScroll(window.scrollY); });

stage.start();

function jumpTo(key) {
  const y = stage.targets[key] ?? 0;
  muteSnap(1800);
  if (lenis) lenis.scrollTo(y, { duration: 1.5, easing: (x) => 1 - Math.pow(1 - x, 3) });
  else window.scrollTo({ top: y, behavior: 'smooth' });
}

for (const el of document.querySelectorAll('[data-jump]')) {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    jumpTo(el.dataset.jump);
  });
}

/* ============== 3b. scroll stations ==============

   Every scene declares the video times worth resting on: the frames where its
   copy is fully readable, plus its key visual beats.

   While a gesture is live the scroll is clamped to the stations either side of
   where it began, so a violent flick runs *into* the next station and stops
   dead there - it never sails past and get dragged back. Holding the input
   against that edge for a moment re-anchors, so a continuous scroll walks
   station by station. Inside the contact section the page scrolls normally. */

const GESTURE_IDLE = 150;        // ms of quiet that ends a gesture
const EDGE_DWELL = 200;          // ms pinned on a station before re-anchoring

let anchorStation = null;
let clampLow = null;
let clampHigh = null;
let pinnedSince = 0;
let lastInputAt = 0;
let watchLastY = -1;
let watchStillFrames = 0;
let snapMutedUntil = 0;

function releaseClamp() {
  anchorStation = null;
  clampLow = null;
  clampHigh = null;
  pinnedSince = 0;
}

function muteSnap(ms) {
  releaseClamp();
  snapMutedUntil = performance.now() + ms;
}

function armGesture() {
  const y = window.scrollY;
  const stations = stage.stations;

  // From the last station onward the contact section scrolls like any normal
  // page: no clamp, no settling, nothing to fight the form.
  if (y >= stations[stations.length - 1] - 8) {
    anchorStation = -1;
    clampLow = null;
    clampHigh = null;
    return;
  }

  anchorStation = stage.nearestStation(y);
  clampLow = stations[anchorStation - 1] ?? 0;
  clampHigh = stations[anchorStation + 1] ?? Number.POSITIVE_INFINITY;
  pinnedSince = 0;
}

function beginGesture() {
  if (document.body.classList.contains('is-loading')) return;
  if (!dragonOverlay.hidden) return;
  if (performance.now() < snapMutedUntil) return;

  lastInputAt = performance.now();

  if (anchorStation === null) {
    armGesture();
    watchLastY = -1;
    watchStillFrames = 0;
    requestAnimationFrame(watchGesture);
  } else if (pinnedSince && performance.now() - pinnedSince > EDGE_DWELL) {
    armGesture();                                 // walked on to the next station
  }
}

/** Stops momentum exactly on the neighbouring station, so nothing overshoots. */
function clampScroll(scroll) {
  if (clampLow === null) return;

  if (scroll > clampHigh) {
    lenis.scrollTo(clampHigh, { immediate: true, force: true });
    if (!pinnedSince) pinnedSince = performance.now();
  } else if (scroll < clampLow) {
    lenis.scrollTo(clampLow, { immediate: true, force: true });
    if (!pinnedSince) pinnedSince = performance.now();
  } else if (Math.abs(scroll - clampHigh) > 1 && Math.abs(scroll - clampLow) > 1) {
    pinnedSince = 0;
  }
}

/** A gesture is over once the input has stopped *and* the page has stopped. */
function watchGesture() {
  if (anchorStation === null) return;

  const y = window.scrollY;
  watchStillFrames = Math.abs(y - watchLastY) < 0.5 ? watchStillFrames + 1 : 0;
  watchLastY = y;

  if (performance.now() - lastInputAt > GESTURE_IDLE && watchStillFrames >= 3) {
    settleToStation();
    return;
  }
  requestAnimationFrame(watchGesture);
}

function settleToStation() {
  const index = anchorStation;
  releaseClamp();
  if (index === null || index < 0) return;

  const stations = stage.stations;
  const from = stations[index];
  const y = window.scrollY;
  const drift = y - from;

  if (Math.abs(drift) < 2) return;                      // never really left

  const next = stations[index + (drift > 0 ? 1 : -1)];
  if (next === undefined) return;                       // edge of the story: let it be
  if (Math.abs(y - next) < 2) return;                   // the clamp already landed it

  // Commit on any deliberate movement. A proportional threshold alone made a
  // short swipe across a long gap read as "no", which pulled the page back the
  // way it came — the one motion that always feels broken.
  const gap = Math.abs(next - from);
  const committed = Math.abs(drift) >= Math.min(48, gap * 0.08);
  glideTo(committed ? next : from);
}

function glideTo(y) {
  const distance = Math.abs(window.scrollY - y);
  if (distance < 2) return;
  snapMutedUntil = performance.now() + 90;
  // Short text beats snap; long passages between scenes get time to play as
  // a shot rather than a jump cut.
  const duration = Math.min(1.6, Math.max(0.45, distance / 1900));
  if (lenis) lenis.scrollTo(y, { duration, easing: (x) => 1 - Math.pow(1 - x, 3) });
  else window.scrollTo({ top: y, behavior: 'smooth' });
}

for (const evt of ['wheel', 'touchstart', 'touchmove', 'touchend']) {
  window.addEventListener(evt, beginGesture, { passive: true });
}
window.addEventListener('keydown', (event) => {
  if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) {
    beginGesture();
  }
});

/* ============== 3c. horizontal pan ==============

   On a narrow screen `object-fit: cover` hides the sides of a 16:9 frame.
   Dragging left or right slides the visible window across the footage while
   every caption stays exactly where it is. The axis is decided in the first
   few pixels of a drag and never changes mid-gesture, so vertical intent
   still scrolls the story. */

const PAN_AXIS_LOCK = 10;        // px of travel before the axis is committed

let panPercent = 50;
let panOriginX = 0;
let panOriginY = 0;
let panFromPercent = 50;
let panAxis = null;
let panRange = 0;

/** How many px of frame `cover` is currently hiding off the two sides. */
function hiddenFrameWidth() {
  return Math.max(0, window.innerHeight * VIDEO_ASPECT - window.innerWidth);
}

function applyPan() {
  const position = panPercent + '% center';
  for (const video of allVideos) video.style.objectPosition = position;
}

function onPanStart(event) {
  if (event.touches.length !== 1) { panAxis = 'skip'; return; }
  if (event.target.closest('#contact, button, a, input, textarea')) { panAxis = 'skip'; return; }

  panRange = hiddenFrameWidth();
  if (panRange < 24) { panAxis = 'skip'; return; }

  panAxis = null;
  panOriginX = event.touches[0].clientX;
  panOriginY = event.touches[0].clientY;
  panFromPercent = panPercent;
}

function onPanMove(event) {
  if (panAxis === 'skip' || event.touches.length !== 1) return;
  const touch = event.touches[0];

  if (panAxis === null) {
    const dx = Math.abs(touch.clientX - panOriginX);
    const dy = Math.abs(touch.clientY - panOriginY);
    if (Math.max(dx, dy) < PAN_AXIS_LOCK) return;
    panAxis = dx > dy * 1.3 ? 'x' : 'y';
    // Hand the gesture entirely to the pan so the story does not drift.
    if (panAxis === 'x') { lenis?.stop(); dismissPanHint(); }
  }
  if (panAxis !== 'x') return;

  event.preventDefault();
  const travel = touch.clientX - panOriginX;
  panPercent = Math.min(100, Math.max(0, panFromPercent - (travel / panRange) * 100));
  applyPan();
}

function onPanEnd() {
  if (panAxis === 'x') lenis?.start();
  panAxis = null;
}

window.addEventListener('touchstart', onPanStart, { passive: true });
window.addEventListener('touchmove', onPanMove, { passive: false });
window.addEventListener('touchend', onPanEnd, { passive: true });
window.addEventListener('touchcancel', onPanEnd, { passive: true });

window.addEventListener('resize', () => {
  if (hiddenFrameWidth() < 24 && panPercent !== 50) { panPercent = 50; applyPan(); }
});

/* One-time affordance: a hidden gesture nobody knows about is no feature. */
const panHint = $('#panHint');
let panHintTimer = null;

function dismissPanHint() {
  if (!panHint || panHint.hidden) return;
  panHint.classList.remove('is-on');
  clearTimeout(panHintTimer);
  panHintTimer = setTimeout(() => { panHint.hidden = true; }, 400);
  try { sessionStorage.setItem('modulynx-pan-hint', '1'); } catch { /* ignore */ }
}

function maybeShowPanHint() {
  if (!panHint) return;
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  if (hiddenFrameWidth() < 60) return;
  try { if (sessionStorage.getItem('modulynx-pan-hint')) return; } catch { /* ignore */ }

  panHint.hidden = false;
  requestAnimationFrame(() => panHint.classList.add('is-on'));
  panHintTimer = setTimeout(dismissPanHint, 5200);
}

/* ══════════════ 4. language ══════════════ */

applyLang(currentLang());

$('#langToggle').addEventListener('click', () => {
  applyLang(currentLang() === 'ar' ? 'en' : 'ar');
  stage.layout();          // copy length changes the contact section's height
  stage.setScroll(window.scrollY);
  stage.invalidate();
});

$('#year').textContent = String(new Date().getFullYear());

/* ══════════════ 5. contact form ══════════════ */

const form = $('#contactForm');
const submitBtn = $('#submitBtn');
const formStatus = $('#formStatus');

const fieldError = (input, message) => {
  const wrap = input.closest('.field');
  const slot = wrap.querySelector('.field__err');
  wrap.classList.toggle('is-invalid', Boolean(message));
  if (slot) slot.textContent = message || '';
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate() {
  const name = $('#f-name');
  const email = $('#f-email');
  let firstBad = null;

  if (!name.value.trim()) { fieldError(name, t('form.errName')); firstBad ??= name; }
  else fieldError(name, '');

  if (!EMAIL_RE.test(email.value.trim())) { fieldError(email, t('form.errEmail')); firstBad ??= email; }
  else fieldError(email, '');

  return firstBad;
}

/* Touching the form is the earliest reliable signal that the confirmation clip
   will be needed. The section coming into view is the other: an observer is
   used rather than a scroll threshold because Lenis owns the scroll position,
   and a programmatic jump can be pulled back before a threshold check sees it. */
form.addEventListener('focusin', warmDragon, { once: true });
form.addEventListener('pointerdown', warmDragon, { once: true });

if ('IntersectionObserver' in window) {
  const contactWatcher = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      warmDragon();
      contactWatcher.disconnect();
    }
  }, { rootMargin: '300px' });
  contactWatcher.observe(document.getElementById('contact'));
}

// Validate on blur, not on every keystroke.
for (const input of form.querySelectorAll('input')) {
  input.addEventListener('blur', () => { if (input.value.trim()) validate(); });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.textContent = '';

  const firstBad = validate();
  if (firstBad) { firstBad.focus(); return; }

  const payload = {
    name: $('#f-name').value.trim(),
    email: $('#f-email').value.trim(),
    goal: $('#f-goal').value.trim(),
    _subject: 'Modulynx — new project enquiry'
  };

  submitBtn.disabled = true;
  submitBtn.classList.add('is-busy');
  const label = submitBtn.querySelector('.btn__label');
  const idleLabel = label.textContent;
  label.textContent = t('form.sending');

  try {
    if (ENDPOINT_IS_PLACEHOLDER) {
      console.warn(
        '[Modulynx] Contact form is in preview mode — nothing was sent.\n' +
        'Set FORM_ENDPOINT in src/main.js to your real Formspree endpoint to go live.'
      );
      await sleep(750);
    } else {
      const response = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }

    form.classList.add('is-sent');
    showSentNote();
    openDragon();
  } catch (error) {
    console.error('[Modulynx] Form submission failed:', error);
    formStatus.textContent = t('form.errGeneric');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('is-busy');
    label.textContent = idleLabel;
  }
});

/** Leaves a confirmation in the form's place once the overlay is dismissed. */
function showSentNote() {
  if ($('#sentNote')) return;
  const note = document.createElement('div');
  note.id = 'sentNote';
  note.className = 'form';
  note.style.textAlign = 'center';
  note.innerHTML =
    '<p class="eyebrow" data-i18n="s6.title"></p>' +
    '<p class="contact__sub" style="margin-inline:auto" data-i18n="s6.sub"></p>';
  form.insertAdjacentElement('afterend', note);
  applyLang(currentLang());
}

/* ══════════════ 6. dragon confirmation overlay ══════════════ */

const dragonOverlay = $('#dragonOverlay');
const dragonClose = $('#dragonClose');
let lastFocused = null;
let dragonStallTimer = null;

function openDragon() {
  lastFocused = document.activeElement;
  dragonOverlay.hidden = false;
  dragonOverlay.classList.remove('is-out', 'is-ended');
  void dragonOverlay.offsetWidth;        // commit the pre-transition state
  dragonOverlay.classList.add('is-in');

  lenis?.stop();
  document.body.style.overflow = 'hidden';

  dragonVideo.currentTime = 0;
  // The only play() in the project — triggered by a click, so it is never blocked.
  dragonVideo.play().catch(() => dragonOverlay.classList.add('is-ended'));

  // If the clip cannot start within a couple of seconds — a cold cache on a
  // slow link — the poster is already showing the right frame, so promote the
  // way out rather than leaving the reader waiting on a video that may not come.
  clearTimeout(dragonStallTimer);
  dragonStallTimer = setTimeout(() => {
    if (dragonVideo.paused || dragonVideo.readyState < 3) {
      dragonOverlay.classList.add('is-ended');
    }
  }, 2500);

  dragonClose.focus({ preventScroll: true });
}

function closeDragon() {
  clearTimeout(dragonStallTimer);
  dragonOverlay.classList.remove('is-in');
  dragonOverlay.classList.add('is-out');
  dragonVideo.pause();

  setTimeout(() => {
    dragonOverlay.hidden = true;
    dragonOverlay.classList.remove('is-out', 'is-ended');
    dragonVideo.currentTime = 0;
    document.body.style.overflow = '';
    lenis?.start();
    lastFocused?.focus?.({ preventScroll: true });
  }, 520);
}

dragonVideo.addEventListener('ended', () => dragonOverlay.classList.add('is-ended'));
dragonClose.addEventListener('click', closeDragon);

document.addEventListener('keydown', (event) => {
  if (dragonOverlay.hidden) return;
  if (event.key === 'Escape') closeDragon();
  if (event.key === 'Tab') { event.preventDefault(); dragonClose.focus(); } // single-stop focus trap
});

/* ══════════════ go ══════════════ */

boot();
