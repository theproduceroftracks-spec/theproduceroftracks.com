/* TPoT scene player: the kit every living encounter shares (Nov 25, 2026).
   A song's own scene file describes its world: the painted layers (made by our engine, tpot-encounter-art/engine),
   the camera shots keyed to lyric lines by their words, how the people move, the Scripture notes, the one act and the
   keepsake card. This file plays it: it reads the album's lyric timings (/find-me/lyric-cues.json), follows the E3b album
   master on the page (or the album player when the page is open inside FIND ME), moves the camera, and draws.
   Nothing moves unless the music is playing; with Reduced Motion the scene cuts between stills instead of moving.
   On this device only: what a visitor chooses or names is never stored or sent. A song keeps only whether its act
   was done (and the day), the place in the song and whether it was finished, in its own localStorage key. */
(() => {
  'use strict';
  const ease = p => p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const lerp = (a, b, p) => a + (b - a) * p;
  const clamp01 = x => Math.max(0, Math.min(1, x));
  // 2-D affine matrices in canvas order [a, b, c, d, e, f]; mul(A, B) applies B first
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const Tr = (x, y) => [1, 0, 0, 1, x, y], Sc = (x, y) => [x, 0, 0, y, 0, 0];
  const Rd = d => { const r = d * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; };
  /* poses for jointed figures: {part: degrees (clockwise +), _x, _y (root offset, part px), _face: {part: face},
     _detach: {part: [world x, world y, degrees]} (a prop set down), _hide: {part: true}} */
  function mixPose(a, b, p) {
    if (p <= 0) return a;
    if (p >= 1) return b;
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (k === '_face' || k === '_hide') out[k] = (p < 0.5 ? a : b)[k];
      else if (k === '_detach') {
        const A = a._detach || {}, B = b._detach || {}, d = {};
        for (const n of new Set([...Object.keys(A), ...Object.keys(B)])) d[n] = A[n] && B[n] ? A[n].map((v, i) => lerp(v, B[n][i], p)) : (p < 0.5 ? A[n] : B[n]);
        out._detach = Object.fromEntries(Object.entries(d).filter(([, v]) => v));
      } else out[k] = lerp(a[k] || 0, b[k] || 0, p);
    }
    return out;
  }
  // poses keyed through the song: [[time, pose, seconds to move into it], ...]; with Reduced Motion it cuts
  function poseAt(keys, t, still) {
    let i = -1;
    for (let k = 0; k < keys.length; k++) if (keys[k][0] <= t) i = k;
    if (i < 0) return keys.length ? keys[0][1] : {};
    const [t0, pose, secs = 0.8] = keys[i];
    return mixPose(i > 0 ? keys[i - 1][1] : pose, pose, still ? 1 : ease(clamp01((t - t0) / secs)));
  }
  // a cycle (walk, run) at a phase: its keys, smoothly in turn
  function cyclePose(cycle, phase) {
    const K = cycle.keys, n = K.length, x = (((phase % 1) + 1) % 1) * n, i = Math.floor(x) % n;
    return mixPose(K[i], K[(i + 1) % n], (1 - Math.cos(Math.PI * (x - Math.floor(x)))) / 2);
  }
  function along(path, p) {
    const segs = path.length - 1, x = clamp01(p) * segs, k = Math.min(segs - 1, Math.floor(x)), f = x - k;
    return [lerp(path[k][0], path[k + 1][0], f), lerp(path[k][1], path[k + 1][1], f)];
  }

  function create(spec) {
    const [W, H] = spec.size;
    const stage = document.querySelector('[data-stage]');
    const canvas = stage && stage.querySelector('canvas');
    const ctx = canvas && canvas.getContext('2d');
    const audio = document.getElementById(spec.audio);
    if (!stage || !ctx || !audio) return null;
    document.documentElement.classList.add('has-stage');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const ACT = spec.act.key;

    /* ---------- the device's own memory (no answers, no text) ---------- */
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(spec.store) || '{}') || {}; } catch { saved = {}; }
    function keep(patch) {
      Object.assign(saved, patch);
      try { localStorage.setItem(spec.store, JSON.stringify({ [ACT]: saved[ACT] || null, t: saved.t || 0, done: !!saved.done })); } catch {}
    }

    /* ---------- images ---------- */
    const img = {};
    function load(name) { return loadUrl(name, (spec.dir || 'scene/') + spec.files[name]); }
    function loadUrl(name, src) {
      if (img[name]) return img[name].ready;
      const i = new Image();
      const entry = { i, ok: false };
      entry.ready = new Promise(resolve => {
        i.onload = () => { entry.ok = true; resolve(); request(); };
        i.onerror = () => resolve();
      });
      i.decoding = 'async';
      i.src = src;
      img[name] = entry;
      return entry.ready;
    }

    /* ---------- jointed figures: parts painted by the engine (engine/rig.py) and a rig file per figure ---------- */
    const rigs = {};
    function loadRig(name) {
      if (rigs[name]) return rigs[name].ready;
      const r = rigs[name] = { ok: false };
      const dir = spec.rigDir || 'rig/';
      r.ready = fetch(dir + name + '.rig.json').then(x => x.json()).then(J => {
        r.json = J;
        const P = J.parts, names = Object.keys(P);
        // parents before children; then the drawing order
        const order = [], seen = new Set();
        const visit = n => { if (seen.has(n)) return; if (P[n].parent) visit(P[n].parent); seen.add(n); order.push(n); };
        names.forEach(visit);
        r.order = order;
        r.byZ = names.map((n, i) => [n, P[n].z || 0, i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
        const all = [];
        for (const n of names) {
          all.push(loadUrl(name + '.' + n, dir + P[n].file));
          for (const [f, file] of Object.entries(P[n].faces || {})) all.push(loadUrl(name + '.' + n + '.' + f, dir + file));
        }
        return Promise.all(all).then(() => { r.ok = names.every(n => ok(name + '.' + n)); request(); });
      }).catch(() => {});
      return r.ready;
    }
    // draw a figure in the current (world) transform with its feet at (x, y); returns each part's matrix
    function rigMats(name, pose, x, y, o = {}) {
      const r = rigs[name];
      if (!r || !r.ok) return null;
      const J = r.json, P = J.parts, px = J.px * (o.scale || 1), ang = n => pose[n] || 0, mats = {};
      for (const n of r.order) {
        const p = P[n], det = pose._detach && pose._detach[n];
        if (det) mats[n] = mul(mul(mul(Tr(det[0], det[1]), Sc(J.px, J.px)), Rd(det[2] || 0)), Tr(-p.pivot[0], -p.pivot[1]));   // a prop left in the world keeps its own size
        else if (!p.parent) mats[n] = mul(mul(mul(mul(Tr(x, y), Sc(px * (o.flip ? -1 : 1), px)), Rd(ang(n))), Tr(-J.ground[0], -J.ground[1])), Tr(pose._x || 0, pose._y || 0));
        else mats[n] = mul(mul(mul(mats[p.parent], Tr(p.at[0], p.at[1])), Rd(ang(n))), Tr(-p.pivot[0], -p.pivot[1]));
      }
      return mats;
    }
    // where a point of a part is in the world, and the part's angle there (to hand a prop over, or place a label)
    function rigPoint(mats, part, x, y) { const m = mats[part]; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], Math.atan2(m[1], m[0]) * 180 / Math.PI]; }
    function drawRig(c, name, pose, x, y, o = {}) {
      const mats = rigMats(name, pose, x, y, o);
      if (!mats) return null;
      const r = rigs[name];
      const a0 = c.globalAlpha;
      if (o.alpha != null) c.globalAlpha = a0 * o.alpha;
      for (const n of r.byZ) {
        if (pose._hide && pose._hide[n]) continue;
        const face = pose._face && pose._face[n], im = (face && img[name + '.' + n + '.' + face]) || img[name + '.' + n];
        if (!im || !im.ok) continue;
        const m = mats[n];
        c.save(); c.transform(m[0], m[1], m[2], m[3], m[4], m[5]); c.drawImage(im.i, 0, 0); c.restore();
      }
      c.globalAlpha = a0;
      return mats;
    }
    const ok = n => img[n] && img[n].ok;
    (spec.first || []).forEach(load);

    /* ---------- the song's own timings: shots and notes are keyed to lyric lines by their words ---------- */
    let cues = [];
    function cueAt(text, fb, nth = 0) {
      const all = cues.filter(c => c[2] === text);
      return all[nth] ? all[nth][0] : fb;
    }
    let T = {}, shots = [], notes = [], moments = [], missing = [];
    function timeline() {
      const last = cues.length ? cues[cues.length - 1] : spec.lastCue;
      T = {};
      missing = [];
      for (const k of Object.keys(spec.lines)) {
        const [text, fb, nth] = spec.lines[k];
        T[k] = cueAt(text, fb, nth || 0);
        if (cues.length && cues.filter(c => c[2] === text).length <= (nth || 0)) missing.push(k);
      }
      T.lastCome = last[0]; T.end = last[1];
      if (spec.times) spec.times(T, cues);
      shots = spec.shots(T);
      notes = spec.notes(T);
      moments = spec.moments(T);
      document.dispatchEvent(new CustomEvent(spec.events + ':timeline', { detail: { moments, end: T.end } }));
    }
    fetch('/find-me/lyric-cues.json').then(r => r.json()).then(j => {
      cues = (j[String(spec.track)] || []).filter(c => Array.isArray(c) && c.length >= 3 && isFinite(c[0]) && isFinite(c[1]));
      timeline(); request();
    }).catch(() => {});

    /* ---------- the camera: one shot per moment of the song ([time, move seconds, x, y, view height, min view width]) ---------- */
    const ARRIVAL = spec.arrival;
    function camera(t) {
      if (!started) return ARRIVAL.slice(2);
      let i = -1;
      for (let k = 0; k < shots.length; k++) if (shots[k][0] <= t) i = k;
      const cur = i < 0 ? [0, 0, ...ARRIVAL.slice(2)] : shots[i];
      const prev = i <= 0 ? [0, 0, ...ARRIVAL.slice(2)] : shots[i - 1];
      let p = cur[1] > 0.02 ? (t - cur[0]) / cur[1] : 1;
      p = reduced.matches ? (p > 0 ? 1 : 0) : ease(p);
      const v = [2, 3, 5].map(j => lerp(prev[j], cur[j], p));
      const vh = Math.exp(lerp(Math.log(prev[4]), Math.log(cur[4]), p));
      if (!reduced.matches && p >= 1) {                            // a slow drift while a shot holds
        const next = shots[i + 1];
        const hold = (next ? next[0] : T.end + 10) - (cur[0] + cur[1]);
        const q = hold > 0 ? clamp01((t - cur[0] - cur[1]) / hold) : 0;
        return [v[0], v[1], vh * (1 - 0.04 * q), v[2]];
      }
      return [v[0], v[1], vh, v[2]];
    }

    /* ---------- drawing ---------- */
    let dpr = 1, cw = 0, ch = 0;
    function size() {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      cw = w; ch = h;
    }
    let focusY = spec.focus == null ? 0.42 : spec.focus;
    function view(t) {
      const [cx, cy, vh0, minW] = camera(t);
      const aspect = cw / ch;
      let vh = Math.max(vh0, minW / aspect);
      vh = Math.min(vh, H, W / aspect);
      const k = ch / vh;
      let ox = cw / 2 - cx * k, oy = ch * focusY - cy * k;
      ox = Math.min(0, Math.max(cw - W * k, ox));
      oy = Math.min(0, Math.max(ch - H * k, oy));
      return { k, ox, oy };
    }
    function toScreen(x, y, t) {
      const v = view(t == null ? now() : t);
      return [(x * v.k + v.ox) / dpr, (y * v.k + v.oy) / dpr];
    }
    function inWorld(c, t) { const v = view(t); c.setTransform(v.k, 0, 0, v.k, v.ox, v.oy); }

    function render() {
      queued = false;
      if (stage.hidden || stage.dataset.idle === '1') return;   // a page may mark the painting as out of view
      size();
      const t = now();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = spec.ground; ctx.fillRect(0, 0, cw, ch);
      spec.paint(ctx, t, S);
      if (spec.preload) spec.preload(t, S);
      document.dispatchEvent(new CustomEvent(spec.events + ':frame', { detail: { t } }));
      if (playing()) request();
    }
    let queued = false;
    function request() { if (!queued) { queued = true; requestAnimationFrame(render); } }
    addEventListener('resize', request);
    reduced.addEventListener?.('change', request);

    /* ---------- the clock: this page's own player, or the album player when the page is open inside FIND ME ---------- */
    let host = null;
    try {
      if (window.frameElement && window.frameElement.matches('[data-reader-frame]')) host = parent.document.getElementById('album-audio');
    } catch { host = null; }
    const onTrack = new RegExp('/find-me-e3b/' + String(spec.track).padStart(2, '0') + '\\.mp3$');
    const hostOnSong = () => host && onTrack.test(host.currentSrc || host.src || '');
    const player = () => host ? host : audio;
    let started = false;
    let actAt = null;
    function now() {
      if (!started) return -1;
      if (host) return hostOnSong() ? host.currentTime : (lastHostT > 30 ? T.end + 2 : 0);
      return audio.currentTime || 0;
    }
    let lastHostT = 0;
    function playing() { const p = player(); return started && (!host || hostOnSong()) && !p.paused && !p.ended; }
    if (host) host.addEventListener('timeupdate', () => { if (hostOnSong()) lastHostT = host.currentTime; request(); });
    ['play', 'pause', 'seeked', 'timeupdate', 'ended'].forEach(e => audio.addEventListener(e, request));
    if (host) ['play', 'pause', 'seeked', 'ended'].forEach(e => host.addEventListener(e, request));

    function start(from) {
      started = true;
      stage.classList.add('is-started');
      if (host) {
        if (!hostOnSong()) parent.postMessage({ type: 'tpot:play-track', track: spec.track }, location.origin);
        else host.play().catch(() => {});
        request();
        return Promise.resolve();
      }
      if (from != null && isFinite(from)) {
        const go = () => { try { audio.currentTime = from; } catch {} };
        if (audio.readyState >= 1) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
      }
      media();
      request();
      return audio.play().catch(err => { request(); throw err; });
    }
    function toggle() {
      const p = player();
      if (!started) return start(resumeAt());
      if (host && !hostOnSong()) return start();
      if (p.paused) return p.play().catch(() => {});
      p.pause();
    }
    function seek(sec) {
      const p = player();
      if (!started) { start(sec); return; }
      if (host && !hostOnSong()) { start(); return; }
      try { p.currentTime = Math.max(0, sec); } catch {}
      if (p.paused) p.play().catch(() => {});
      request();
    }
    function resumeAt() { return saved.t > 10 && saved.t < spec.resumeBefore(T) ? saved.t : 0; }
    function media() {
      if (!navigator.mediaSession || typeof MediaMetadata !== 'function') return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: spec.title, artist: 'The Producer of Tracks', album: 'FIND ME',
        artwork: [{ src: '/assets/find-me-cover.jpg', sizes: '1000x1000', type: 'image/jpeg' }] });
    }
    let lastSave = 0;
    audio.addEventListener('timeupdate', () => {
      if (Date.now() - lastSave > 5000) { lastSave = Date.now(); keep({ t: Math.floor(audio.currentTime) }); }
    });
    audio.addEventListener('ended', () => keep({ t: 0 }));
    addEventListener('pagehide', () => { if (!host) audio.pause(); });

    /* ---------- the one act: the visitor does it, or the story does it anyway at its own moment ---------- */
    function act() {
      if (actAt != null) return;
      const t = now();
      const min = typeof spec.act.min === 'function' ? spec.act.min(T) : spec.act.min;
      actAt = started && t >= 0 ? Math.max(t, min) : spec.act.auto(T);
      keep({ [ACT]: new Date().toLocaleDateString('en-CA') });
      (spec.act.load || []).forEach(load);
      request();
    }

    /* ---------- the keepsake: a card drawn here, from the scene and the line, never uploaded ---------- */
    async function card() {
      const K = spec.card;
      await Promise.all(K.layers.map(load));
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
      const g = c.getContext('2d');
      g.fillStyle = spec.ground; g.fillRect(0, 0, 1080, 1350);
      const fx = 54, fy = 54, fw = 972, fh = 820;
      g.save(); g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
      const [vx, vy, vw] = K.view, k = fw / vw, vh = fh / k;
      g.setTransform(k, 0, 0, k, fx - (vx - vw / 2) * k, fy - (vy - vh / 2) * k);
      K.paint(g, S);
      g.restore();
      // a mosaic frame, gold on lapis, laid tile by tile
      let seed = K.seed;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const tiles = (x0, y0, x1, y1) => {
        for (let y = y0; y < y1; y += 9) for (let x = x0; x < x1; x += 9) {
          const edge = Math.min(Math.abs(x - fx + 9), Math.abs(y - fy + 9), Math.abs(fx + fw + 9 - x), Math.abs(fy + fh + 9 - y));
          const gold = edge < 9;
          const v = 0.8 + rnd() * 0.35;
          g.fillStyle = gold ? `rgb(${214 * v | 0},${166 * v | 0},${80 * v | 0})` : `rgb(${22 * v | 0},${37 * v | 0},${74 * v | 0})`;
          g.fillRect(x + rnd() * 1.6, y + rnd() * 1.6, 7 + rnd(), 7 + rnd());
        }
      };
      tiles(fx - 27, fy - 27, fx + fw + 27, fy); tiles(fx - 27, fy + fh, fx + fw + 27, fy + fh + 27);
      tiles(fx - 27, fy, fx, fy + fh); tiles(fx + fw, fy, fx + fw + 27, fy + fh);
      // the line to carry
      g.textAlign = 'center'; g.fillStyle = '#f3e8cf';
      g.font = '400 58px Georgia, "Times New Roman", serif';
      K.lines.forEach((line, i) => g.fillText(line, 540, 1010 + 72 * i));
      g.fillStyle = '#e7c480'; g.font = 'bold 26px Arial, sans-serif';
      g.fillText(K.ref, 540, 1010 + 72 * (K.lines.length - 1) + 68);
      g.fillStyle = '#a99c80'; g.font = '24px Arial, sans-serif';
      g.textAlign = 'left'; g.fillText(K.footer, 60, 1296);
      g.textAlign = 'right'; g.fillText('theproduceroftracks.com', 1020, 1296);
      return new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'));
    }

    function setFocus(y) { focusY = y; request(); }

    const S = {
      start, toggle, seek, act, card, setFocus, request, toScreen, load, keep, inWorld, ok, img, along, loadRig, drawRig, rigMats, rigPoint, rig: n => rigs[n] && rigs[n].ok ? rigs[n].json : null,
      get started() { return started; }, get playing() { return playing(); }, get time() { return now(); },
      get duration() { return host ? (hostOnSong() && isFinite(host.duration) ? host.duration : spec.duration) : (isFinite(audio.duration) ? audio.duration : spec.duration); },
      get T() { return T; }, get moments() { return moments; }, get cues() { return cues; }, get notes() { return notes; },
      get acted() { return actAt != null; }, get actAt() { return actAt; }, get saved() { return saved; }, get inReader() { return !!host; },
      get still() { return reduced.matches; }, get missing() { return missing; }, get cw() { return cw; }, get ch() { return ch; }, get focusY() { return focusY; }
    };
    timeline();
    request();
    window.TPoTScene.current = S;
    return S;
  }

  /* a value that changes through the song: [[time, value], ...] eased between keys; with Reduced Motion it steps */
  function env(keys, t, still) {
    if (!keys.length || t <= keys[0][0]) return keys.length ? keys[0][1] : 0;
    for (let i = 1; i < keys.length; i++) {
      if (t < keys[i][0]) {
        const [a, va] = keys[i - 1], [b, vb] = keys[i];
        return still ? va : lerp(va, vb, ease((t - a) / (b - a)));
      }
    }
    return keys[keys.length - 1][1];
  }

  /* ---------- the song's controls on the page (for encounters built on the kit; The Well keeps its own) ----------
     Markup: [data-song-toggle] [data-song-track] [data-song-fill] [data-song-time] [data-line-now] [data-line-next]
     [data-note] [data-note-ref] [data-note-text] [data-song-end] [data-song-mini], the act [data-act-ask] [data-act-done]
     [data-act-choice] [data-act-hold] [data-act-hold-label], the keepsake [data-keepsake] [data-keepsake-img]
     [data-keepsake-save] [data-keepsake-status], and [data-return]. Choices are never stored or sent. */
  function controls(S, o) {
    const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
    const audio = document.getElementById(o.audio);
    const toggles = $$('[data-song-toggle]'), track = $('[data-song-track]'), fill = $('[data-song-fill]'), timeLabel = $('[data-song-time]');
    const lineNow = $('[data-line-now]'), lineNext = $('[data-line-next]'), note = $('[data-note]'), noteRef = $('[data-note-ref]'), noteText = $('[data-note-text]');
    const songEnd = $('[data-song-end]'), mini = $('[data-song-mini]');
    const ask = $('[data-act-ask]'), done = $('[data-act-done]'), hold = $('[data-act-hold]'), holdLabel = $('[data-act-hold-label]'), choices = $$('[data-act-choice]');
    const returnNote = $('[data-return]');
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const end = () => S.duration || o.duration;
    toggles.forEach(b => b.addEventListener('click', () => { const r = S.toggle(); if (r && r.catch) r.catch(() => {}); }));

    function buildMoments() {
      if (!track) return;
      track.querySelectorAll('.song-moment').forEach(m => m.remove());
      S.moments.forEach(([at, label]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'song-moment'; b.dataset.track = o.name + '-moment';
        b.style.left = `${Math.max(0, Math.min(100, at / end() * 100))}%`;
        b.setAttribute('aria-label', `Go to: ${label}`);
        b.dataset.label = label;
        b.addEventListener('click', () => S.seek(at));
        track.appendChild(b);
      });
    }
    document.addEventListener(o.name + ':timeline', buildMoments);
    buildMoments();
    if (track) track.addEventListener('click', e => {
      if (e.target.closest('.song-moment')) return;
      const r = track.getBoundingClientRect();
      S.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * end());
    });

    let lastLine = '', lastNote = '', asking = false;
    function update() {
      const t = S.time, playing = S.playing, started = S.started, T = S.T;
      toggles.forEach(b => { b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); b.classList.toggle('is-playing', playing); });
      if (mini) mini.hidden = !(started && t > 0 && t < end() - 0.5 && !o.inSong() && playing);
      if (!o.inSong()) return;
      fill.style.width = `${Math.max(0, Math.min(100, (t < 0 ? (S.saved.t || 0) : t) / end() * 100))}%`;
      timeLabel.textContent = fmt(Math.max(0, t));
      // the line being sung, and the next one, faintly
      const cues = S.cues;
      let now = '', next = '';
      for (let i = 0; i < cues.length; i++) {
        if (t >= cues[i][0] && t < cues[i][1]) { now = cues[i][2]; next = cues[i + 1] && cues[i + 1][0] - cues[i][1] < 4 ? cues[i + 1][2] : ''; break; }
        if (t < cues[i][0]) { if (cues[i][0] - t < 1.2) next = cues[i][2]; break; }
      }
      if (!started) now = S.saved.t > 10 ? `Continue from ${fmt(S.saved.t)}` : '';
      if (now !== lastLine) {
        lastLine = now;
        lineNow.textContent = now;
        lineNow.classList.remove('is-new'); void lineNow.offsetWidth; lineNow.classList.add('is-new');
      }
      lineNext.textContent = next;
      // Scripture (and quotations, labelled as such) where the song points to them
      let n = null;
      const notes = S.notes;
      for (let i = 0; i < notes.length; i++) {
        const until = Math.min(notes[i][0] + 9, notes[i + 1] ? notes[i + 1][0] - 0.3 : Infinity);
        if (t >= notes[i][0] && t < until) n = notes[i];
      }
      const key = n ? n[1] : '';
      if (key !== lastNote) {
        lastNote = key;
        note.hidden = !n;
        if (n) {
          noteRef.textContent = n[3] === 'quote' ? `Quotation · ${n[1]}` : `${n[1]} · King James Version`;
          note.classList.toggle('is-quote', n[3] === 'quote');
          noteText.textContent = `“${n[2]}”`;
        }
      }
      // the act: offered in its window, until the story does it anyway
      const [from, to] = o.actWindow(T);
      const offer = started && !S.acted && t >= from && t < to;
      if (ask) ask.hidden = !offer;
      if (done) done.hidden = !(S.acted && t >= S.actAt && t < S.actAt + 8);
      if (asking !== offer) { asking = offer; document.body.classList.toggle('is-asking', offer); setTimeout(() => S.request(), 520); }
      songEnd.hidden = !(started && (t >= T.end - 0.5 || t >= end() - 1));
    }
    document.addEventListener(o.name + ':frame', update);
    ['play', 'pause', 'ended', 'timeupdate'].forEach(e => audio.addEventListener(e, update));
    audio.addEventListener('ended', () => { songEnd.hidden = false; if (o.onEnd) o.onEnd(); });

    // choosing is optional and stays on this page; holding opens
    choices.forEach(b => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      choices.forEach(c => c.setAttribute('aria-pressed', String(c === b && on)));
    }));
    const HOLD_MS = 1200, idle = holdLabel ? holdLabel.textContent : '';
    let holdTimer = null, holdStart = 0, raf = 0;
    function progress() {
      const p = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
      hold.style.setProperty('--p', p.toFixed(3));
      if (p < 1) raf = requestAnimationFrame(progress);
    }
    function begin(e) {
      if (holdTimer || S.acted) return;
      if (e && e.pointerId != null) { try { hold.setPointerCapture(e.pointerId); } catch {} }
      holdStart = performance.now();
      hold.classList.add('is-holding'); holdLabel.textContent = 'Keep holding';
      raf = requestAnimationFrame(progress);
      holdTimer = setTimeout(complete, HOLD_MS);
    }
    function cancel() {
      if (!holdTimer) return;
      clearTimeout(holdTimer); holdTimer = null; cancelAnimationFrame(raf);
      hold.classList.remove('is-holding'); hold.style.setProperty('--p', '0'); holdLabel.textContent = idle;
    }
    function complete() {
      holdTimer = null; cancelAnimationFrame(raf);
      hold.style.setProperty('--p', '1'); hold.classList.remove('is-holding');
      S.act();
      // counted once with the site's own measurement (a long press may not fire a click); never the answer
      try { window.tpotMeasure && window.tpotMeasure.track('click', o.name + '-act', null, { in: 'song' }); } catch {}
      ask.hidden = true; done.hidden = false; document.body.classList.remove('is-asking'); asking = false;
      holdLabel.textContent = idle;
      if (returnNote) returnNote.hidden = false;
    }
    if (hold) {
      hold.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); begin(e); } });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => hold.addEventListener(n, () => { if (holdTimer) cancel(); }));
      hold.addEventListener('contextmenu', e => e.preventDefault());
      hold.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin(); } });
      hold.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (holdTimer) cancel(); } });
      // assistive technology activates with a plain click (no pointer press): open at once
      hold.addEventListener('click', e => { if (e.detail === 0 && !holdTimer && !S.acted) complete(); });
    }
    if (returnNote) returnNote.hidden = !(S.saved && S.saved[o.actKey]);

    // the keepsake card: drawn on this device, saved or shared from here, never uploaded
    const keepsake = $('[data-keepsake]'), keepImg = $('[data-keepsake-img]'), keepBtn = $('[data-keepsake-save]'), keepStatus = $('[data-keepsake-status]');
    let keepFile = null, keepUrl = null;
    async function prepareKeepsake() {
      if (!keepsake || keepFile) return;
      try {
        const blob = await S.card();
        if (!blob) return;
        keepFile = new File([blob], o.cardName, { type: 'image/png' });
        keepUrl = URL.createObjectURL(blob);
        keepImg.src = keepUrl;
        keepsake.hidden = false;
        S.keep({ done: true });
      } catch { keepsake.hidden = true; }
    }
    if (keepBtn) keepBtn.addEventListener('click', async () => {
      if (!keepFile) return;
      keepStatus.textContent = '';
      if (navigator.canShare && navigator.canShare({ files: [keepFile] })) {
        try { await navigator.share({ files: [keepFile] }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a');
      a.href = keepUrl; a.download = keepFile.name;
      document.body.appendChild(a); a.click(); a.remove();
      keepStatus.textContent = 'Saved. You can also press and hold the card to save it.';
    });
    return { update, prepareKeepsake };
  }

  window.TPoTScene = { create, controls, env, ease, lerp, clamp01, along, pose: { mix: mixPose, at: poseAt, cycle: cyclePose }, matrix: { mul, T: Tr, S: Sc, R: Rd } };
})();
