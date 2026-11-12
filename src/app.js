// Scroll-driven journey: chapters, camera poses, HUD, satellite scan, sound and settings.
import { createGlobe } from './globe.js';

const doc = document, root = doc.documentElement, body = doc.body;
const $ = (s, c = doc) => c.querySelector(s);
const $$ = (s, c = doc) => Array.from(c.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const store = {
  get(k) { try { return localStorage.getItem('orbit.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('orbit.' + k, v); } catch (e) { /* storage blocked: settings just don't persist */ } },
};

const DATA = JSON.parse($('#chapter-data').textContent);
const chapters = $$('.chapter');
const N = chapters.length;
const mqMobile = window.matchMedia('(max-width: 760px)');
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// camera keyframes per chapter: where the satellite view settles
const POSE = {
  orbit:      { lat: 34, lon: 38, dist: 0, spin: 1 },
  himachal:   { lat: 31.9, lon: 77.2, dist: 2.4, tilt: 7, pitch: 5 },
  kinnaur:    { lat: 31.62, lon: 78.2, dist: 1.78, tilt: 9, pitch: 8 },
  rome:       { lat: 41.9, lon: 12.45, dist: 2.2, tilt: 6, pitch: 4 },
  valencia:   { lat: 39.4, lon: -0.38, dist: 2.15, tilt: 6, pitch: 4 },
  cornwall:   { lat: 50.32, lon: -4.97, dist: 2.0, tilt: 7, pitch: 6 },
  manchester: { lat: 53.48, lon: -2.24, dist: 1.95, tilt: 7, pitch: 6 },
  contact:    { lat: 26, lon: 22, dist: 0, spin: 1 },
};
// illustrative scan effect per study area (see globe.js modes)
const SCAN = {
  orbit: { mode: 0, w: 0.09, l: 0.16, name: 'Vegetation index' },
  himachal: { mode: 0, w: 0.045, l: 0.075, heading: 160, name: 'NDVI change' },
  kinnaur: { mode: 2, w: 0.028, l: 0.05, heading: 150, name: 'Terrain and slope' },
  rome: { mode: 4, w: 0.04, l: 0.07, heading: 192, name: 'Geodesic distance' },
  valencia: { mode: 1, w: 0.04, l: 0.07, heading: 192, name: 'Radar backscatter' },
  cornwall: { mode: 5, w: 0.035, l: 0.06, heading: 192, name: 'UAV orthomosaic' },
  manchester: { mode: 3, w: 0.035, l: 0.06, heading: 192, name: 'Census mosaic' },
  contact: { mode: 0, w: 0.09, l: 0.16, name: 'Vegetation index' },
};

let globe = null;
const canvas = $('#scene');
if (!root.classList.contains('no-webgl')) {
  try { globe = createGlobe(canvas); } catch (e) { globe = null; }
}
if (!globe) root.classList.add('no-webgl');

// ---------------- settings ----------------
let reduced = store.get('motion') ? store.get('motion') === 'reduced' : mqReduce.matches;
let quality = store.get('quality') || 'auto';
let sound = false;
const btnMotion = $('#btn-motion'), btnQuality = $('#btn-quality'), btnSound = $('#btn-sound'), btnScan = $('#btn-scan');
function applyMotion() {
  root.classList.toggle('reduced', reduced);
  btnMotion.setAttribute('aria-pressed', String(reduced));
  btnMotion.querySelector('span').textContent = reduced ? 'reduced' : 'on';
  if (globe) globe.setReduced(reduced);
}
function applyQuality() {
  btnQuality.querySelector('span').textContent = quality;
  if (globe) { globe.setQuality(quality === 'auto' && mqMobile.matches ? 'auto' : quality); if (fullWanted()) loadFull(); }
}
btnMotion.addEventListener('click', () => { reduced = !reduced; store.set('motion', reduced ? 'reduced' : 'full'); applyMotion(); });
btnQuality.addEventListener('click', () => { quality = { auto: 'high', high: 'low', low: 'auto' }[quality]; store.set('quality', quality); applyQuality(); });

// ---------------- sound (generated in the browser, off by default) ----------------
let audio = null;
function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const ctx = new AC(), master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6; lp.connect(master);
  const droneGain = ctx.createGain(); droneGain.gain.value = 0.5; droneGain.connect(lp);
  [[55, 0], [82.4, 4], [110.2, -6], [164.8, 3]].forEach(([f, det], i) => {
    const o = ctx.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = det;
    const g = ctx.createGain(); g.gain.value = [0.5, 0.32, 0.12, 0.05][i];
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.05 + i * 0.031; lg.gain.value = g.gain.value * 0.45;
    lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(droneGain); o.start(); lfo.start();
  });
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  function whoosh(dur = 1.4, from = 300, to = 1800, level = 0.18) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    const g = ctx.createGain(), t = ctx.currentTime;
    bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  function ping(f = 880, level = 0.12) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.25);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 1);
  }
  return { ctx, master, whoosh, ping };
}
function setSound(on) {
  sound = on;
  btnSound.setAttribute('aria-pressed', String(on)); btnSound.querySelector('span').textContent = on ? 'on' : 'off';
  if (on && !audio) audio = initAudio();
  if (!audio) return;
  if (on && audio.ctx.state === 'suspended') audio.ctx.resume();
  const t = audio.ctx.currentTime; audio.master.gain.cancelScheduledValues(t);
  audio.master.gain.setValueAtTime(audio.master.gain.value, t); audio.master.gain.linearRampToValueAtTime(on ? 0.22 : 0, t + 1.2);
}
btnSound.addEventListener('click', () => setSound(!sound));
const sfx = (name, ...a) => { if (sound && audio) audio[name](...a); };

// ---------------- layout + scroll state ----------------
let tops = [], heights = [], vh = window.innerHeight, journeyEnd = 0;
function measure() {
  vh = window.innerHeight;
  tops = chapters.map((c) => c.offsetTop); heights = chapters.map((c) => c.offsetHeight);
  journeyEnd = $('#journey').offsetTop + $('#journey').offsetHeight;
}
function locate(y) {
  let i = 0; while (i < N - 1 && y >= tops[i + 1]) i++;
  const span = Math.max(1, heights[i] - vh);
  return { i, p: clamp((y - tops[i]) / span, 0, 1) };
}

const isMobile = () => mqMobile.matches;
function framing() {
  // desktop: globe sits right of the text panel; phone: globe in the upper half above the panel
  return isMobile() ? { cx: 0.5, cy: 0.27, far: 1.32 } : { cx: 0.64, cy: 0.5, far: 1 };
}
function poseOf(id, phase) {
  const P = POSE[id], f = framing();
  const base = globe ? globe.fitDist(isMobile() ? 0.74 : 0.82) : 3.4;
  let dist = P.dist ? P.dist * f.far : base;
  if (phase === 'end' && P.dist) dist *= 0.93;
  return { lat: P.lat, lon: P.lon, dist, tilt: P.tilt || 0, pitch: isMobile() ? (P.pitch || 0) * 0.5 : P.pitch || 0, spin: P.spin || 0, cx: id === 'contact' || id === 'orbit' ? (isMobile() ? 0.5 : 0.66) : f.cx, cy: f.cy };
}
function blendPose(a, b, t, bump) {
  const dl = ((b.lon - a.lon + 540) % 360) - 180;
  return {
    lat: lerp(a.lat, b.lat, t), lon: a.lon + dl * t, dist: lerp(a.dist, b.dist, t) + bump * Math.sin(Math.PI * t),
    tilt: lerp(a.tilt, b.tilt, t), pitch: lerp(a.pitch, b.pitch, t), spin: lerp(a.spin, b.spin, t), cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t),
  };
}
function angBetween(a, b) {
  const r = Math.PI / 180, c = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return Math.acos(clamp(c, -1, 1));
}
function cameraFor(i, p) {
  const id = DATA[i].id;
  const arrive = poseOf(id, 'start'), end = poseOf(id, 'end');
  if (i === 0) return arrive;
  const prev = poseOf(DATA[i - 1].id, 'end');
  const tIn = smooth(0, 0.3, p);
  if (tIn < 1) {
    const bump = Math.min(1.5, angBetween(prev, arrive) * 1.1) * (isMobile() ? 1.2 : 1);
    return blendPose(prev, arrive, tIn, bump);
  }
  // after arriving the camera dives a little further as the photograph of the place resolves
  return blendPose(arrive, end, smooth(0.28, 0.4, p), 0);
}

// ---------------- HUD ----------------
const ticks = $$('.tick'), fill = $('#track-fill');
const roPlace = $('#ro-place'), roLat = $('#ro-lat'), roLon = $('#ro-lon'), roAlt = $('#ro-alt'), roScan = $('#ro-scan');
const markers = $$('.marker'), satTag = $('#sat-tag'), veil = $('#veil');
let active = -1, inJourney = true, lastPhase = '';

function setActive(i) {
  if (i === active) return;
  const prevActive = active; active = i;
  chapters.forEach((c, k) => c.classList.toggle('is-active', k === i));
  ticks.forEach((t, k) => { if (k === i) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current'); t.classList.toggle('is-past', k < i); });
  markers.forEach((m) => m.classList.toggle('is-active', m.dataset.site === DATA[i].id));
  roPlace.textContent = DATA[i].place;
  const sc = SCAN[DATA[i].id];
  if (globe) {
    const site = i === 0 || i === N - 1 ? null : { lat: DATA[i].lat, lon: DATA[i].lon, heading: sc.heading };
    globe.setSite(site, { mode: sc.mode, halfW: sc.w, halfL: sc.l });
  }
  roScan.textContent = 'Satellite idle';
  body.dataset.chapter = DATA[i].id;
  preloadPhoto(i); preloadPhoto(i + 1); if (i > 0) preloadPhoto(i - 1);
  if (prevActive >= 0) sfx('whoosh', 1.6, 220, 1400, 0.14);
}

// place photographs load just ahead of need; a chapter only switches to its photo once it has decoded
function preloadPhoto(i) {
  const ch = chapters[i]; if (!ch || ch._loading) return;
  const img = ch.querySelector('.ground-img img'); if (!img) return;
  ch._loading = true;
  const done = () => { ch._ready = true; ch.querySelector('.ground-img').classList.add('is-loaded'); dirty = true; requestAnimationFrame(update); };
  img.addEventListener('load', () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(done); }, { once: true });
  img.addEventListener('error', () => { ch._loading = false; }, { once: true });
  img.sizes = '100vw'; img.srcset = img.dataset.srcset; img.src = img.dataset.src;
}

function phaseOf(i, p) {
  const ch = chapters[i];
  if (i === 0 || i === N - 1) return 'intro';
  const hasGround = ch.hasAttribute('data-ground');
  if (hasGround && !ch._ready) return p < 0.5 ? 'intro' : 'work';
  if (ch.hasAttribute('data-radar')) return p < 0.3 ? 'intro' : p < 0.5 ? 'ground' : p < 0.7 ? 'radar' : 'work';
  if (hasGround) return p < 0.32 ? 'intro' : p < 0.6 ? 'ground' : 'work';
  return p < 0.48 ? 'intro' : 'work';
}

let scrollY = window.scrollY, dirty = true;
function update() {
  dirty = false;
  const y = window.scrollY; scrollY = y;
  const { i, p } = locate(y);
  setActive(i);
  const phase = phaseOf(i, p), ch = chapters[i];
  if (ch.dataset.phase !== phase) { ch.dataset.phase = phase; }
  for (let k = 0; k < N; k++) chapters[k].classList.toggle('is-in', y > tops[k] - vh * 0.62 && y < tops[k] + heights[k] - vh * 0.38);
  const key = i + phase; if (key !== lastPhase) { lastPhase = key; }
  // overall progress along the journey
  const total = (tops[N - 1] + heights[N - 1] - vh) || 1;
  fill.style.transform = `scaleX(${clamp(y / total, 0, 1)})`;
  // dim the globe behind full-bleed ground imagery
  const radar = ch.hasAttribute('data-radar');
  const ground = ch.hasAttribute('data-ground') && ch._ready ? smooth(0.29, 0.34, p) * (1 - smooth(radar ? 0.7 : 0.6, radar ? 0.76 : 0.66, p)) : 0;
  const workDim = i > 0 && i < N - 1 ? smooth(0.5, 0.7, p) * (isMobile() ? 0.25 : 0.12) : 0;
  veil.style.opacity = String(Math.max(ground * 0.9, workDim));
  body.classList.toggle('is-ground', ground > 0.5);
  // leave the journey: the archive covers the screen, so stop drawing
  const nowIn = y < journeyEnd - vh * 0.15;
  if (nowIn !== inJourney) { inJourney = nowIn; body.classList.toggle('in-dossier', !inJourney); }
  if (globe) {
    globe.setPose(cameraFor(i, p));
    globe.setPaused(!inJourney || doc.hidden || ground > 0.985);
  }
  body.classList.toggle('scrolled', y > 40);
}
window.addEventListener('scroll', () => { if (!dirty) { dirty = true; requestAnimationFrame(update); } }, { passive: true });
document.addEventListener('visibilitychange', () => { if (globe) globe.setPaused(doc.hidden || !inJourney); });
let rz = 0;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { measure(); if (globe) globe.resize(); update(); }, 120); }, { passive: true });

// ---------------- markers, readout, satellite tag (every frame) ----------------
const pt = {};
let roTick = 0;
function frame() {
  if (!globe) return;
  for (const m of markers) {
    const d = DATA.find((x) => x.id === m.dataset.site);
    globe.project(d.lat, d.lon, pt);
    m.style.transform = `translate3d(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px,0)`;
    m.classList.toggle('is-hidden', !pt.visible);
  }
  globe.satScreen(pt);
  satTag.style.transform = `translate3d(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px,0)`;
  satTag.classList.toggle('is-hidden', !pt.visible);
  if (++roTick % 6 === 0) {
    const v = globe.view();
    roLat.textContent = `${Math.abs(v.lat).toFixed(2)}° ${v.lat >= 0 ? 'N' : 'S'}`;
    roLon.textContent = `${Math.abs(v.lon).toFixed(2)}° ${v.lon >= 0 ? 'E' : 'W'}`;
    roAlt.textContent = `${Math.round(v.alt).toLocaleString('en-GB')} km`;
  }
}

// ---------------- satellite scan ----------------
function task() {
  if (!globe) return;
  if (globe.capture()) { sfx('ping', 660, 0.1); }
}
if (globe) {
  globe.onStatus((s) => {
    const name = SCAN[DATA[Math.max(0, active)].id].name;
    const txt = { task: 'Satellite tasked · slewing', scan: `Scanning · ${name}`, done: `Scan complete · ${name} (illustrative)`, idle: 'Satellite idle' }[s];
    roScan.textContent = txt; body.classList.toggle('scanning', s === 'task' || s === 'scan');
    if (s === 'scan') sfx('whoosh', 3.2, 900, 2600, 0.08); else if (s === 'done') sfx('ping', 990, 0.08);
  });
  globe.onFrame(frame);
}
btnScan.addEventListener('click', task);
satTag.addEventListener('click', task);

// drag to turn the Earth, click the satellite to scan
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!globe || e.button > 0) return;
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: e.pointerId, moved: false, touch: e.pointerType === 'touch' };
});
window.addEventListener('pointermove', (e) => {
  if (finePointer) cursorMove(e);
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
    // on touch, mostly-vertical gestures belong to page scrolling
    if (drag.touch && Math.abs(e.clientY - drag.sy) > Math.abs(e.clientX - drag.sx)) { drag = null; return; }
    drag.moved = true; globe.hold(true); body.classList.add('dragging');
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  if (drag.moved) { globe.drag(dx, drag.touch ? 0 : dy); }
  drag.x = e.clientX; drag.y = e.clientY;
}, { passive: true });
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && globe.hitSatellite(e.clientX, e.clientY)) task();
  globe.hold(false); body.classList.remove('dragging'); drag = null;
}
window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);

// ---------------- reticle cursor (mouse only, over the globe) ----------------
const reticle = doc.createElement('div'); reticle.className = 'reticle'; reticle.setAttribute('aria-hidden', 'true');
reticle.innerHTML = '<i></i><span></span>'; body.appendChild(reticle);
let curT = 0;
function cursorMove(e) {
  const overCanvas = e.target === canvas;
  body.classList.toggle('cursor-globe', overCanvas && inJourney);
  if (!overCanvas) return;
  reticle.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
  const now = performance.now(); if (now - curT < 60) return; curT = now;
  const onSat = globe && globe.hitSatellite(e.clientX, e.clientY);
  reticle.classList.toggle('is-sat', !!onSat);
  reticle.querySelector('span').textContent = onSat ? 'Scan' : body.classList.contains('dragging') ? '' : 'Drag';
}
doc.addEventListener('pointerleave', () => body.classList.remove('cursor-globe'));

// ---------------- navigation: smooth for neighbours, a quick cut for long jumps ----------------
const cut = $('#cut');
function targetY(el) {
  const i = chapters.indexOf(el);
  if (i < 0) return el.getBoundingClientRect().top + window.scrollY;
  if (i === 0) return 0;
  const p = i === N - 1 ? 0.02 : 0.31;
  return tops[i] + p * Math.max(0, heights[i] - vh) + 1;
}
function goTo(el) {
  const y = targetY(el), dist = Math.abs(y - window.scrollY);
  if (reduced || dist < vh * 2.4) { window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' }); return; }
  cut.classList.add('on');
  setTimeout(() => {
    window.scrollTo({ top: y, behavior: 'auto' });
    update(); if (globe) globe.snap();
    requestAnimationFrame(() => requestAnimationFrame(() => cut.classList.remove('on')));
  }, 380);
  sfx('whoosh', 1.2, 400, 2200, 0.12);
}
doc.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.hasAttribute('data-case') || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
  if (a.closest('dialog')) return;
  const id = a.getAttribute('href').slice(1); if (!id) return;
  let el = a.hasAttribute('data-jump') ? chapters[+a.dataset.jump] : doc.getElementById(id);
  if (el && el.closest('.chapter') && !el.classList.contains('chapter')) el = el.closest('.chapter');
  if (!el) return;
  e.preventDefault(); closeIndex(); goTo(el);
  try { history.replaceState(null, '', '#' + (el.classList.contains('chapter') ? el.id : id)); } catch (err) { /* ignore */ }
});
markers.forEach((m) => m.addEventListener('click', () => goTo(chapters[+m.dataset.jump])));

// index menu
const menuBtn = $('#menu-toggle'), panel = $('#index-panel');
function closeIndex() { if (panel.hidden) return; panel.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); body.classList.remove('index-open'); }
menuBtn.addEventListener('click', () => {
  const open = panel.hidden; panel.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); body.classList.toggle('index-open', open);
  if (open) { const a = $('a', panel); if (a) a.focus(); }
});
doc.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeIndex();
  if (doc.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
  if (!inJourney) return;
  if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowUp' || e.key === 'PageUp') {
    // step through chapters with the keyboard
    const { i, p } = locate(window.scrollY);
    const down = e.key === 'ArrowDown' || e.key === 'PageDown';
    if (e.key.startsWith('Page')) { e.preventDefault(); const j = clamp(down ? i + 1 : (p > 0.35 ? i : i - 1), 0, N - 1); goTo(chapters[j]); }
  }
  if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) task();
});

// ---------------- Valencia before/after radar slider ----------------
const sarRange = $('#sar-range');
if (sarRange) {
  const after = $('#sar-after'), handle = $('.sar-handle');
  const set = () => { const v = +sarRange.value; after.style.clipPath = `inset(0 0 0 ${v}%)`; handle.style.left = v + '%'; };
  sarRange.addEventListener('input', set); set();
}

// ---------------- loading ----------------
const loader = $('#loader'), bar = $('#loader-bar'), pct = $('#loader-pct');
let loaded = false, fullLoading = false;
function setProgress(f) { const v = Math.round(f * 100); bar.style.transform = `scaleX(${f})`; pct.textContent = String(v); }
function reveal() {
  if (loaded) return; loaded = true;
  setProgress(1); body.classList.add('is-ready');
  setTimeout(() => { loader.hidden = true; }, 900);
}
function fullWanted() { return globe && (quality === 'high' || (quality === 'auto' && !isMobile() && Math.min(screen.width, screen.height) >= 700)); }
function loadFull() { if (fullLoading || !globe) return; fullLoading = true; globe.loadTextures('full'); }

measure(); applyMotion(); update();
if (globe) {
  applyQuality(); globe.start();
  const t0 = performance.now();
  const fallbackTimer = setTimeout(reveal, 9000);
  globe.loadTextures('base', setProgress).then(() => {
    clearTimeout(fallbackTimer);
    const wait = Math.max(0, 500 - (performance.now() - t0));
    setTimeout(reveal, wait);
    if (fullWanted()) setTimeout(loadFull, 1800);
  });
} else {
  reveal();
}
// fonts change layout heights
if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => { measure(); update(); });
window.addEventListener('load', () => { measure(); update(); });
// a chapter link in the address bar lands on that chapter
if (/^#ch-/.test(location.hash)) { const el = doc.getElementById(location.hash.slice(1)); if (el) setTimeout(() => { window.scrollTo(0, targetY(el)); update(); if (globe) globe.snap(); }, 50); }
// reduced-motion preference changes while the page is open
mqReduce.addEventListener && mqReduce.addEventListener('change', (e) => { if (!store.get('motion')) { reduced = e.matches; applyMotion(); } });

// on phones the settings live in the index menu
const utils = $('.utils'), hudEl = $('#hud'), idxUtils = $('#index-utils');
function placeUtils() { const host = isMobile() ? idxUtils : hudEl; if (utils.parentNode !== host) host.appendChild(utils); }
placeUtils(); mqMobile.addEventListener && mqMobile.addEventListener('change', () => { placeUtils(); measure(); update(); });
