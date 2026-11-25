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
    /* the scene's light on a figure (kit v2): o.shadow = [rx, ry, alpha] (world px), a soft shadow on the ground at its feet;
       o.light = { dir: [dx, dy] (the way the light travels), warm: 'r,g,b,a', shade: 'r,g,b,a' }: the figure is drawn on its
       own, then its lit side is warmed and its far side shaded, on the figure only, and laid into the scene. */
    let fx = null;
    function drawRig(c, name, pose, x, y, o = {}) {
      if (!o.light && !o.shadow) return drawParts(c, name, pose, x, y, o);
      const mats = rigMats(name, pose, x, y, o);
      if (!mats) return null;
      const al = o.alpha == null ? 1 : o.alpha;
      if (o.shadow && al > 0) {
        const [rx, ry, sa] = o.shadow;
        c.save(); c.translate(x, y); c.scale(1, ry / rx);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, `rgba(30,20,10,${sa * al})`); g.addColorStop(0.6, `rgba(30,20,10,${0.5 * sa * al})`); g.addColorStop(1, 'rgba(30,20,10,0)');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore();
      }
      if (!o.light || !c.getTransform) return drawParts(c, name, pose, x, y, o, mats);
      // where the figure falls on the screen
      const M = c.getTransform(), M0 = [M.a, M.b, M.c, M.d, M.e, M.f], r = rigs[name];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of r.byZ) {
        const im = img[name + '.' + n]; if (!im || !im.ok) continue;
        const m = mul(M0, mats[n]), w = im.i.width, h = im.i.height;
        for (const [u, v] of [[0, 0], [w, 0], [0, h], [w, h]]) {
          const px = m[0] * u + m[2] * v + m[4], py = m[1] * u + m[3] * v + m[5];
          x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
        }
      }
      const cv = c.canvas;
      x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2); x1 = Math.min(cv.width, Math.ceil(x1) + 2); y1 = Math.min(cv.height, Math.ceil(y1) + 2);
      if (x1 <= x0 || y1 <= y0) return mats;
      if (!fx) fx = document.createElement('canvas');
      const bw = x1 - x0, bh = y1 - y0;
      if (fx.width < bw || fx.height < bh) { fx.width = Math.max(fx.width, bw); fx.height = Math.max(fx.height, bh); }
      const f = fx.getContext('2d');
      f.setTransform(1, 0, 0, 1, 0, 0); f.globalAlpha = 1; f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, bw, bh);
      f.setTransform(M0[0], M0[1], M0[2], M0[3], M0[4] - x0, M0[5] - y0);
      drawParts(f, name, pose, x, y, Object.assign({}, o, { alpha: 1 }), mats);
      // warm on the side the light comes from, shade on the far side
      const [dx, dy] = o.light.dir, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, cx = bw / 2, cy = bh / 2, R = Math.hypot(bw, bh) / 2;
      const g = f.createLinearGradient(cx - ux * R, cy - uy * R, cx + ux * R, cy + uy * R);
      g.addColorStop(0, `rgba(${o.light.warm})`); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(${o.light.shade})`);
      f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'source-atop'; f.fillStyle = g; f.fillRect(0, 0, bw, bh);
      f.globalCompositeOperation = 'source-over';
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = c.globalAlpha * al; c.drawImage(fx, 0, 0, bw, bh, x0, y0, bw, bh); c.restore();
      return mats;
    }
    function drawParts(c, name, pose, x, y, o = {}, given) {
      const mats = given || rigMats(name, pose, x, y, o);
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

    /* ---------- the camera (v2, Nov 25): a few calm framings, and never a zoom in or out.
       shots: [time, transition seconds, x, y, view height, min view width], in the painting's own pixels; x and y may be
       functions of time (the camera following someone along the road).
       The size of the picture only changes by a cross-fade (a dissolve, as a film cuts) or a cut (under 0.05 s). Between
       two framings of about the same size on this screen (within 8%), or near each other, the camera glides sideways and
       keeps the size it has. While a framing holds, it drifts a little sideways. With Reduced Motion every change is a
       cut and nothing drifts. ---------- */
    const ARRIVAL = spec.arrival;
    const soft = p => p <= 0 ? 0 : p >= 1 ? 1 : p * p * p * (p * (p * 6 - 15) + 10);
    const val = (v, t) => typeof v === 'function' ? v(t) : v;
    const SAME = Math.log(1.08);
    function shotAt(i) { return i < 0 ? [0, 0, ...ARRIVAL.slice(2)] : shots[i]; }
    function seen(vh, minW) {                                     // the view height this screen will really show
      const fh = Math.max(ch, refH || ch);
      if (!cw || !fh) return vh;
      const aspect = cw / fh;
      // on a tall screen (a phone) a framing needs less of its width: the people come closer instead of shrinking
      const need = aspect < 1.1 ? 0.7 : 1;
      return Math.min(Math.max(vh, need * minW / aspect), H, W / aspect);
    }
    // for each framing on this screen: how the camera gets there and the size it then holds (a glide keeps its size)
    let planned = null, plannedFor = '';
    function plan() {
      const key = cw + 'x' + Math.max(ch, refH || ch);
      if (planned && plannedFor === key && planned.shots === shots) return planned;
      const steps = [];
      let size = seen(ARRIVAL[4], ARRIVAL[5]);
      for (let i = 0; i < shots.length; i++) {
        const cur = shots[i], prev = shotAt(i - 1), target = seen(cur[4], cur[5]), t = cur[0];
        const far = Math.hypot(val(cur[2], t) - val(prev[2], t), val(cur[3], t) - val(prev[3], t)) / (1.5 * size);
        if (cur[1] < 0.05) { steps.push(['cut', 0, target]); size = target; }
        else if (Math.abs(Math.log(target / size)) > SAME || far > 0.6) { steps.push(['dissolve', Math.min(2.4, Math.max(1.2, cur[1])), target]); size = target; }
        else steps.push(['glide', Math.max(2.5, cur[1]), size]);
      }
      planned = { shots, steps }; plannedFor = key;
      return planned;
    }
    function drift(i, t) {                                        // sideways, 1.6% of the view's height over the whole hold
      if (reduced.matches || i < 0) return 0;
      const sh = shots[i], next = shots[i + 1], hold = (next ? next[0] : T.end + 10) - sh[0];
      return (i % 2 ? -1 : 1) * 0.016 * sh[4] * clamp01((t - sh[0]) / Math.max(1, hold));
    }
    function framing(i, t) {
      const sh = shotAt(i), size = i < 0 ? seen(sh[4], sh[5]) : plan().steps[i][2], at = reduced.matches ? sh[0] : t;   // with Reduced Motion it does not follow
      return [val(sh[2], at) + drift(i, t), val(sh[3], at), size, 0];
    }
    const progress = (i, t) => { const s = plan().steps[i]; return s[1] > 0 ? (t - shots[i][0]) / s[1] : 1; };
    // the framing now: { a: [x, y, view height, 0] } and, during a dissolve, b (the framing it leaves) and mix
    function camera(t) {
      if (!started) return { a: ARRIVAL.slice(2) };
      let i = -1;
      for (let k = 0; k < shots.length; k++) if (shots[k][0] <= t) i = k;
      const A = framing(i, t);
      if (i < 0) return { a: A };
      const kind = plan().steps[i][0], p = progress(i, t);
      if (kind === 'cut' || p >= 1 || reduced.matches) return { a: A };
      // where it leaves from: the framing before, live; or, if that move had not finished, wherever the camera was
      const t0 = shots[i][0], B = i > 0 && progress(i - 1, t0) < 1 ? camera(t0 - 1e-4).a : framing(i - 1, t);
      if (kind === 'dissolve') return { a: A, b: B, mix: soft(p) };
      const q = soft(p);
      return { a: [lerp(B[0], A[0], q), lerp(B[1], A[1], q), A[2], 0] };
    }

    /* ---------- drawing ---------- */
    let dpr = 1, cw = 0, ch = 0, refW = 0, refH = 0;
    function size() {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      cw = w; ch = h;
      // the painting keeps its size when a page makes the stage shorter (a question opening below it): it is cropped,
      // never zoomed. The size is measured again when the window itself changes.
      if (w !== refW) { refW = w; refH = h; } else refH = Math.max(refH, h);
    }
    addEventListener('resize', () => { refW = 0; });
    let focusY = spec.focus == null ? 0.42 : spec.focus;
    let forced = null;                                            // the framing being painted (two during a dissolve)
    function frame(F) {
      const [cx, cy, vh0, minW] = F, fh = Math.max(ch, refH || ch);
      const aspect = cw / fh;
      let vh = Math.max(vh0, minW / aspect);
      vh = Math.min(vh, H, W / aspect);
      const k = fh / vh;
      let ox = cw / 2 - cx * k, oy = ch * focusY - cy * k;
      ox = Math.min(0, Math.max(cw - W * k, ox));
      oy = Math.min(0, Math.max(ch - H * k, oy));
      return { k, ox, oy };
    }
    function view(t) { return frame(forced || camera(t).a); }
    function toScreen(x, y, t) {
      const v = view(t == null ? now() : t);
      return [(x * v.k + v.ox) / dpr, (y * v.k + v.oy) / dpr];
    }
    function inWorld(c, t) { const v = view(t); c.setTransform(v.k, 0, 0, v.k, v.ox, v.oy); }

    let buf = null;
    function paintAt(c, t, F) {
      forced = F;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.fillStyle = spec.ground; c.fillRect(0, 0, cw, ch);
      try { spec.paint(c, t, S); } finally { forced = null; }
    }
    function render() {
      queued = false;
      if (stage.hidden || stage.dataset.idle === '1') return;   // a page may mark the painting as out of view
      size();
      const t = now(), cam = camera(t);
      if (cam.b) {                                                // a dissolve: the framing it leaves, then the new one over it
        paintAt(ctx, t, cam.b);
        if (!buf) buf = document.createElement('canvas');
        if (buf.width !== cw || buf.height !== ch) { buf.width = cw; buf.height = ch; }
        paintAt(buf.getContext('2d'), t, cam.a);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = cam.mix; ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(buf, 0, 0); ctx.globalAlpha = 1;
      } else paintAt(ctx, t, cam.a);
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
      start, toggle, seek, act, card, setFocus, request, toScreen, camera: t => camera(t == null ? now() : t), load, keep, inWorld, ok, img, along, loadRig, drawRig, rigMats, rigPoint, rig: n => rigs[n] && rigs[n].ok ? rigs[n].json : null,
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
