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

const VIDEO_FILES = {
  v1: 'main_bg_scrub.mp4',
  v2: 'castle_scrub.mp4',
  v3: 'cave_loop.mp4',
  v4: 'Warior group.mp4',
  vSky: 'Background.mp4',
  vDragon: 'A massive black dragon.mp4'
};

/* Touch devices get 9:16 variants. `object-fit: cover` on a portrait phone
   throws away about 70% of a 16:9 frame — the dragon's wings, the castle
   silhouette, the warrior line-up all fall outside the viewport. The portrait
   files carry the full frame in a sharp centre band with a blurred, darkened
   extension filling the rest, so the screen stays full-bleed and nothing is
   lost. They are also ~45% lighter, which matters more on a phone.

   The geometry holds in landscape too: cropping a 720x1280 file with `cover`
   into a landscape phone viewport lands exactly on the sharp band. */
const screenMin = Math.min(
  window.screen?.width || window.innerWidth,
  window.screen?.height || window.innerHeight
);
const usePortraitMedia =
  window.matchMedia('(pointer: coarse)').matches && screenMin <= 820;

const VIDEO_DIR = usePortraitMedia ? 'assets/videos/portrait/' : 'assets/videos/';
const VIDEOS = Object.fromEntries(
  Object.entries(VIDEO_FILES).map(([id, file]) => [id, VIDEO_DIR + file])
);

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════ 1. sources ══════════════ */

for (const [id, path] of Object.entries(VIDEOS)) {
  const el = document.getElementById(id);
  if (el) el.src = encodeURI(path);
}

const scrubVideos = ['v1', 'v2', 'v3', 'v4'].map((id) => document.getElementById(id));
if (usePortraitMedia) document.getElementById('v1').poster = 'assets/images/poster_hero_portrait.jpg';
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

async function boot() {
  const jobs = [...scrubVideos.map(whenReady), whenReady(skyVideo)];
  if (document.fonts) jobs.push(document.fonts.ready);

  const total = jobs.length;
  let done = 0;
  let shown = 0;

  const paint = () => {
    const target = Math.round((done / total) * 100);
    shown += (target - shown) * 0.35;
    const value = Math.min(99, Math.round(shown));
    loaderBar.style.width = `${value}%`;
    loaderPct.textContent = `${value}%`;
    if (value < 99 && done < total) requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);

  jobs.forEach((job) => Promise.resolve(job).then(() => { done += 1; }));

  // Never hold the curtain for more than 15s, whatever the network does.
  await Promise.race([Promise.all(jobs.map((j) => Promise.resolve(j))), sleep(15000)]);

  await Promise.all(scrubVideos.map(warmUp));
  skyVideo.play().catch(() => {});

  loaderBar.style.width = '100%';
  loaderPct.textContent = '100%';
  await sleep(220);

  loaderEl.classList.add('is-done');
  document.body.classList.remove('is-loading');
  setTimeout(() => { loaderEl.hidden = true; }, 800);
}

// Some browsers refuse the silent warm-up until the user has interacted.
const retryWarmUp = () => {
  scrubVideos.forEach(warmUp);
  skyVideo.play().catch(() => {});
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
  lenis.on('scroll', ({ scroll }) => stage.setScroll(scroll));
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

/* ══════════════ 3b. scroll stations ══════════════

   The film scrubs freely while a finger or wheel is actually moving, but a
   gesture always comes to rest on a station — a frame where a scene's copy is
   fully readable, or a key visual beat. One gesture advances at most one
   station, so no amount of flick force can throw the reader past a block of
   text. Inside the contact section the page scrolls like any normal page.     */

const SETTLE_THRESHOLD = 0.14;   // share of the gap that counts as "moved on"
const GESTURE_IDLE = 160;        // ms of quiet that ends a gesture

let anchorStation = null;
let idleTimer = null;
let snapMutedUntil = 0;

function muteSnap(ms) {
  anchorStation = null;
  clearTimeout(idleTimer);
  snapMutedUntil = performance.now() + ms;
}

function beginGesture() {
  if (document.body.classList.contains('is-loading')) return;
  if (!dragonOverlay.hidden) return;
  if (performance.now() < snapMutedUntil) return;

  if (anchorStation === null) {
    const y = window.scrollY;
    const last = stage.stations[stage.stations.length - 1];
    anchorStation = y > last + 8 ? -1 : stage.nearestStation(y);
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(settleToStation, GESTURE_IDLE);
}

function settleToStation() {
  const index = anchorStation;
  anchorStation = null;
  if (index === null || index < 0) return;

  const stations = stage.stations;
  const from = stations[index];
  const drift = window.scrollY - from;
  let target = index;

  if (drift !== 0) {
    const step = drift > 0 ? 1 : -1;
    const next = stations[index + step];
    if (next !== undefined && Math.abs(drift) / Math.abs(next - from) > SETTLE_THRESHOLD) {
      target = index + step;
    }
  }
  glideTo(stations[target]);
}

function glideTo(y) {
  const distance = Math.abs(window.scrollY - y);
  if (distance < 2) return;
  snapMutedUntil = performance.now() + 90;
  const duration = Math.min(1.9, Math.max(0.55, distance / 1500));
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

  dragonClose.focus({ preventScroll: true });
}

function closeDragon() {
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
