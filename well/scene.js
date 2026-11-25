/* The Well: a living scene for "Same Well, Same Thirst" (Stage A, Nov 24, 2026).
   The art is painted by our own engine (tpot-encounter-art/engine/well.py): a world, a look down the well and the
   figures, as separate layers. This script moves them in time with the song, using the album's lyric timings
   (/find-me/lyric-cues.json), and the E3b album master. Nothing moves unless the music is playing; with
   Reduced Motion the scene cuts between stills instead of moving.
   On this device only: what a visitor chooses or names at the jar is never stored or sent. The page keeps only
   whether the jar was set down (and the day) and the place in the song, in localStorage "tpot.well.v2". */
(() => {
  'use strict';
  const W = 2880, H = 1440;
  const BOX = { jesus: [1170, 760, 270, 390], woman: [1600, 730, 250, 420] };
  const FEET = [125, 398];                     // the woman's feet inside her sprite
  const STAND = [1725, 1128];                  // where she stands at the well (feet)
  const JAR = { w: 86, h: 110, hands: [1684, 878], down: [1612, 1040] };
  const WATER = { x: 1440, y: 961.5, rx: 170, ry: 38.5 };
  const PEOPLE = { w: 300, h: 170, feet: [150, 162] };
  const FILES = { back: 'back.jpg', water: 'water.jpg', jar: 'jar.webp', jesusRest: 'jesus-rest.webp', jesusSpeak: 'jesus-speak.webp',
    walk: 'woman-walk.webp', stand: 'woman-stand.webp', empty: 'woman-empty.webp', go: 'woman-go.webp', people: 'people.webp' };
  const SONG = '/assets/find-me-e3b/01.mp3';
  const STORE = 'tpot.well.v2';

  const stage = document.querySelector('[data-stage]');
  const canvas = stage && stage.querySelector('canvas');
  const ctx = canvas && canvas.getContext('2d');
  const audio = document.getElementById('well-song');
  if (!stage || !ctx || !audio) return;
  document.documentElement.classList.add('has-stage');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const $ = s => document.querySelector(s);

  /* ---------- the device's own memory (no answers, no text) ---------- */
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { saved = {}; }
  function keep(patch) {
    Object.assign(saved, patch);
    try { localStorage.setItem(STORE, JSON.stringify({ jar: saved.jar || null, t: saved.t || 0, done: !!saved.done })); } catch {}
  }

  /* ---------- images ---------- */
  const img = {};
  function load(name) {
    if (img[name]) return img[name].ready;
    const i = new Image();
    const entry = { i, ok: false };
    entry.ready = new Promise(resolve => {
      i.onload = () => { entry.ok = true; resolve(); request(); };
      i.onerror = () => resolve();
    });
    i.decoding = 'async';
    i.src = 'scene/' + FILES[name];
    img[name] = entry;
    return entry.ready;
  }
  const ok = n => img[n] && img[n].ok;
  load('back'); load('jesusRest');

  /* ---------- the song's own timings ---------- */
  let cues = [];
  const FALLBACK = [[4.829, 11.509, 'I came to the well I already knew']];
  function cueAt(text, fb, nth = 0) {
    const all = cues.filter(c => c[2] === text);
    return all[nth] ? all[nth][0] : fb;
  }
  let T = {};
  function timeline() {
    const last = cues.length ? cues[cues.length - 1] : [300.52, 306.24];
    T = {
      first: cueAt('I came to the well I already knew', 4.83), v1: cueAt('Screen light before the house is awake', 36.86),
      thirsty: cueAt('Then come up thirsty every time', 57.3), sat: cueAt('You sat down tired beside the water', 61.57),
      asked: cueAt('Asked a drink of me', 65.35), laughed: cueAt('I almost laughed', 67.04), bucket: cueAt('You had no bucket', 69.21),
      chorus1: cueAt('Same well', 74.12), v2: cueAt('I knew the chapter, knew the line', 97.22),
      named: cueAt('You named the life I hadn’t mentioned', 119.76), smallest: cueAt('I gave the smallest truth I could', 122.73),
      mountain: cueAt('Then asked which mountain held the Father', 125.63), secrets: cueAt('While You sat where my secrets stood', 128.45),
      chorus2: cueAt('Same well', 133.44, 1), ifYouKnow: cueAt('If You know', 156.29), turnAway: cueAt('You did not turn away', 170.22),
      roadBack: cueAt('And the road back to the well', 181.0), hide: cueAt('With somewhere left to hide', 188.73),
      knowToo: cueAt('You know that too', 196.62), empty: cueAt('Then let me stand here empty', 203.38),
      askingLife: cueAt('And I am asking life of You', 212.39), jarStood: cueAt('The jar stood where I left it', 239.59),
      halfway: cueAt('I was halfway down the road', 242.33), comeSee: cueAt('Come and see', 251.1), waiting: cueAt('He was waiting at the well', 258.59),
      final: cueAt('Same well', 264.62, 2), spring: cueAt('Let the spring You spoke of rise', 280.64),
      jarByWater: cueAt('The jar is by the water', 289.73), people: cueAt('There are people down the road', 296.41),
      lastCome: last[0], end: last[1]
    };
    const ask = cues.find(c => c[2] === 'And I am asking life of You');
    T.breakStart = ask ? ask[1] : 222.48;
    T.auto = T.jarStood - 3.5;                 // if no one sets it down, she still leaves it (John 4:28)
    shots = buildShots();
    notes = buildNotes();
    moments = [[0, 'I came to the well'], [T.sat - 0.6, 'He asks for water'], [T.v2, 'Which mountain'], [T.knowToo, 'Set down the jar'], [T.jarStood - 0.4, 'Come and see']];
    document.dispatchEvent(new CustomEvent('well:timeline', { detail: { moments, end: T.end } }));
  }
  fetch('/find-me/lyric-cues.json').then(r => r.json()).then(j => {
    cues = (j['1'] || []).filter(c => Array.isArray(c) && c.length >= 3 && isFinite(c[0]) && isFinite(c[1]));
    timeline(); request();
  }).catch(() => {});

  /* ---------- Scripture where the song points to it (KJV, quoted exactly from the reading on this page) ---------- */
  let notes = [];
  function buildNotes() {
    return [
      [T.sat, 'John 4:6', 'Jesus therefore, being wearied with his journey, sat thus on the well'],
      [T.asked, 'John 4:7', 'Jesus saith unto her, Give me to drink.'],
      [T.bucket, 'John 4:11', 'Sir, thou hast nothing to draw with, and the well is deep'],
      [T.smallest, 'John 4:17', 'The woman answered and said, I have no husband.'],
      [T.mountain, 'John 4:20', 'Our fathers worshipped in this mountain'],
      [T.askingLife, 'John 4:10', 'he would have given thee living water.'],
      [T.jarStood, 'John 4:28', 'The woman then left her waterpot, and went her way into the city'],
      [T.comeSee, 'John 4:29', 'Come, see a man, which told me all things that ever I did'],
      [T.waiting, 'John 4:30', 'Then they went out of the city, and came unto him.'],
      [T.spring, 'John 4:14', 'the water that I shall give him shall be in him a well of water springing up into everlasting life.']
    ];
  }

  /* ---------- the camera: one shot per moment of the song ([time, move seconds, x, y, view height, min view width]) ---------- */
  let shots = [];
  let moments = [];
  const ARRIVAL = [0, 0, 1430, 880, 1000, 640];
  function buildShots() {
    return [
      [0.2, 4.5, 1560, 820, 1240, 1300],         // the world opens: the mountain, the well, the road, the town
      [T.first, 9, 1720, 900, 960, 960],         // she comes down the road
      [22, 8, 1530, 940, 780, 800],              // to the well
      [T.sat - 0.4, 0.01, 1300, 930, 560, 430],  // He sat down tired beside the water
      [T.laughed, 0.7, 1700, 940, 580, 430],
      [T.bucket, 1.4, 1500, 950, 740, 780],
      [T.chorus1, 7, 1470, 900, 900, 920],
      [T.v2, 5, 1690, 930, 640, 480],            // she knew the chapter
      [T.named, 1.2, 1310, 920, 600, 440],
      [T.smallest, 1.0, 1700, 930, 600, 440],
      [T.mountain, 2.4, 560, 500, 880, 1000],    // which mountain held the Father
      [T.secrets, 2.6, 1450, 930, 760, 800],
      [T.chorus2, 7, 1480, 900, 880, 880],
      [T.ifYouKnow, 10, 1320, 900, 520, 400],    // why are You still here
      [T.turnAway, 3, 1500, 930, 760, 800],
      [T.roadBack, 3, 2000, 820, 900, 1000],     // the road back to the well
      [T.hide, 2.5, 1700, 930, 600, 460],
      [T.knowToo, 3, 1540, 950, 760, 780],       // the jar
      [T.breakStart, 12, 1610, 960, 640, 600],
      [T.auto + 0.5, 3, 1800, 900, 860, 900],
      [T.jarStood, 1.5, 1655, 1065, 440, 380],  // the jar stood where I left it
      [T.halfway, 2, 2020, 860, 820, 760],
      [T.halfway + 4, 5, 2210, 770, 640, 640],
      [T.comeSee, 1.5, 2282, 696, 380, 330],     // at the gate: come and see
      [T.waiting, 6, 1800, 830, 1150, 1500],     // He was waiting at the well
      [T.final, 14, 1640, 860, 1000, 1200],
      [T.spring, 6, 1460, 900, 780, 800],        // the spring rises
      [T.jarByWater, 3, 1530, 990, 640, 620],
      [T.people, 4, 1720, 880, 950, 1100],
      [T.lastCome, 8, 1600, 800, 1250, 1500]
    ];
  }
  timeline();

  const ease = p => p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const lerp = (a, b, p) => a + (b - a) * p;
  const clamp01 = x => Math.max(0, Math.min(1, x));
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

  /* ---------- the people in the scene, as a function of time (so seeking always shows the right moment) ---------- */
  const ROAD_IN = [[2150, 860], [2040, 905], [1930, 962], [1830, 1032], [1760, 1092], STAND];
  const ROAD_OUT = [STAND, [1770, 1060], [1850, 995], [1960, 930], [2080, 860], [2200, 776], [2272, 712]];
  const depth = y => clamp01((y - 670) / (STAND[1] - 670));       // nearer the horizon, smaller
  function along(path, p) {
    const segs = path.length - 1, x = clamp01(p) * segs, k = Math.min(segs - 1, Math.floor(x)), f = x - k;
    return [lerp(path[k][0], path[k + 1][0], f), lerp(path[k][1], path[k + 1][1], f)];
  }
  function jarTime() { return jarDownAt != null ? jarDownAt : T.auto; }
  function cast(t) {
    const out = [];
    const bob = (phase, s) => reduced.matches ? 0 : -Math.abs(Math.sin(phase)) * 5 * s;
    // Jesus: tired at rest, or speaking
    const sp = started ? speakMix(t) : 0;
    out.push({ n: 'jesusRest', box: BOX.jesus, a: 1 - sp });
    if (sp > 0) out.push({ n: 'jesusSpeak', box: BOX.jesus, a: sp });
    if (!started) return out;
    const jd = jarTime();
    const goStart = Math.max(jd + 1.6, T.auto + 1.2);
    // the woman
    const womanAt = (n, feet, s, a, ph) => out.push({ n, box: [feet[0] - FEET[0] * s, feet[1] - FEET[1] * s + (ph != null ? bob(ph, s) : 0), BOX.woman[2] * s, BOX.woman[3] * s], a });
    if (t < T.first + 1) {
      // not yet come
    } else if (t < 30) {
      let p = (t - (T.first + 1)) / (30 - (T.first + 1));
      if (reduced.matches) p = p < 0.5 ? 0 : 1;
      const f = along(ROAD_IN, p);
      womanAt('walk', f, Math.max(0.3, depth(f[1])), clamp01((t - T.first - 1) / 1.2), t * 2.4 * Math.PI);
    } else if (t < jd) {
      const x = clamp01((t - 30) / 0.8);
      if (x < 1) womanAt('walk', STAND, 1, 1 - x);
      womanAt('stand', STAND, 1, x);
    } else if (t < goStart) {
      const x = clamp01((t - jd) / 0.6);
      if (x < 1) womanAt('stand', STAND, 1, 1 - x);
      womanAt('empty', STAND, 1, x);
    } else if (t < goStart + 15) {
      let p = (t - goStart) / 15;
      if (reduced.matches) p = p < 0.5 ? 0.1 : 1;
      const f = along(ROAD_OUT, p);
      womanAt('go', f, Math.max(0.08, depth(f[1])), 1, t * 3.2 * Math.PI);
    } else if (t < T.waiting) {
      womanAt('go', ROAD_OUT[ROAD_OUT.length - 1], depth(712), 1);
    } else {
      // she leads the town back down the road to Him (4:30)
      let p = (t - T.waiting) / 38;
      if (reduced.matches) p = p < 0.5 ? 0 : 1;
      const path = [[2272, 712], [2200, 776], [2080, 860], [1990, 920], [1900, 985]];
      const f = along(path, p);
      womanAt('empty', f, Math.max(0.08, depth(f[1])), 1, p < 1 ? t * 2.2 * Math.PI : null);
    }
    // the jar: in her hands, then set down by the water, and left there
    if (t >= jd) {
      let p = clamp01((t - jd) / 1.4);
      if (reduced.matches) p = 1;
      const e = ease(p);
      const x = lerp(JAR.hands[0], JAR.down[0], e), y = lerp(JAR.hands[1], JAR.down[1], e) - Math.sin(Math.PI * e) * 18;
      out.push({ n: 'jar', box: [x, y, JAR.w, JAR.h], a: 1, label: t - jd < 4.4 ? 1 - clamp01((t - jd - 1.4) / 3) : 0 });
    } else if (t >= 30) {
      out.push({ label: 1, box: [JAR.hands[0], JAR.hands[1], JAR.w, JAR.h] });
    }
    // the people of the town
    if (t >= T.comeSee + 1.2) {
      let p = clamp01((t - T.waiting - 1.5) / 40);
      if (reduced.matches) p = t < T.waiting ? 0 : 1;
      const f = along([[2300, 714], [2210, 780], [2100, 852], [2010, 915], [1960, 960]], p);
      const s = Math.max(0.07, depth(f[1]));
      out.push({ n: 'people', box: [f[0] - PEOPLE.feet[0] * s + 30 * s, f[1] - PEOPLE.feet[1] * s + bob(t * 2 * Math.PI, s * 0.6), PEOPLE.w * s, PEOPLE.h * s],
        a: clamp01((t - T.comeSee - 1.2) / 1.5) });
    }
    return out;
  }
  function speakMix(t) {
    let m = 0;
    for (const [a, b] of [[T.asked, T.chorus1], [T.named, T.smallest], [T.mountain, T.chorus2], [T.knowToo, T.breakStart]]) {
      if (t >= a - 0.1 && t < b + 0.5) m = Math.max(m, Math.min(clamp01((t - a + 0.1) / 0.5), clamp01((b + 0.5 - t) / 0.5)));
    }
    return reduced.matches ? (m > 0.5 ? 1 : 0) : m;
  }

  /* ---------- light: warmth around Him, the hiding, the spring rising ---------- */
  function light(t) {
    if (!started) return { warm: 0.12, dark: 0, spring: 0 };
    let warm = t < T.sat ? 0.05 : 0.28;
    if (t >= T.ifYouKnow && t < T.turnAway + 2) warm = 0.55;
    if (t >= T.hide && t < T.knowToo) warm = 0.12;
    if (t >= jarTime()) warm = Math.max(warm, 0.38);
    const dark = t >= T.hide && t < T.knowToo + 1.5 ? 0.22 * Math.min(clamp01((t - T.hide) / 2), clamp01((T.knowToo + 1.5 - t) / 1.5)) : 0;
    const spring = reduced.matches ? (t >= T.spring ? 1 : 0) : clamp01((t - T.spring) / 5);
    return { warm, dark, spring };
  }
  const waterMix = t => {
    if (!started) return 0;
    const a = clamp01((t - (T.v1 - 1.4)) / 1.2), b = 1 - clamp01((t - (T.sat - 1.1)) / 0.9);
    const m = Math.min(a, b);
    return reduced.matches ? (m > 0.5 ? 1 : 0) : m;
  };

  /* ---------- drawing ---------- */
  let dpr = 1, cw = 0, ch = 0;
  function size() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    cw = w; ch = h;
  }
  let focusY = 0.42;
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

  function drawWorld(t) {
    const v = view(t);
    ctx.setTransform(v.k, 0, 0, v.k, v.ox, v.oy);
    if (ok('back')) ctx.drawImage(img.back.i, 0, 0, W, H);
    const L = light(t);
    // the spring under the water, then everyone in the scene
    if (L.spring > 0) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(WATER.x, WATER.y, WATER.rx, WATER.ry, 0, 0, Math.PI * 2); ctx.clip();
      const g = ctx.createRadialGradient(WATER.x, WATER.y, 4, WATER.x, WATER.y, WATER.rx);
      g.addColorStop(0, `rgba(255,240,196,${0.95 * L.spring})`); g.addColorStop(1, `rgba(214,166,80,${0.6 * L.spring})`);
      ctx.fillStyle = g; ctx.fillRect(WATER.x - WATER.rx, WATER.y - WATER.ry, WATER.rx * 2, WATER.ry * 2);
      ctx.restore();
    }
    ripples(t);
    const label = (window.WellScene && WellScene.answer) || '';
    for (const d of cast(t)) {
      if (d.n && ok(d.n) && d.a > 0.002) {
        ctx.globalAlpha = Math.min(1, d.a);
        ctx.drawImage(img[d.n].i, d.box[0], d.box[1], d.box[2], d.box[3]);
        ctx.globalAlpha = 1;
      }
      if (d.label > 0 && label) {
        ctx.save();
        ctx.globalAlpha = d.label;
        ctx.font = 'italic 21px Georgia, "Times New Roman", serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(20,16,12,.9)'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#f6ead0';
        ctx.fillText(label, d.box[0] + d.box[2] / 2, d.box[1] + d.box[3] + 8);
        ctx.restore();
      }
    }
    // warmth around Him; the spring's light rising; the dark of hiding
    const g = ctx.createRadialGradient(1300, 860, 10, 1300, 860, 330 + 260 * L.warm);
    g.addColorStop(0, `rgba(246,220,152,${0.1 + 0.32 * L.warm})`); g.addColorStop(1, 'rgba(246,220,152,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(900, 420, 800, 900);
    if (L.spring > 0) {
      column(ctx, 0.42 * L.spring);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (L.dark > 0) { ctx.fillStyle = `rgba(12,10,9,${L.dark})`; ctx.fillRect(0, 0, cw, ch); }
    if (L.spring > 0) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(246,220,152,${0.35 * L.spring})`; ctx.fillRect(0, 0, cw, ch); ctx.globalCompositeOperation = 'source-over'; }
  }
  // light rising from the water: layered, each wider and fainter, so the edges stay soft
  function column(c, alpha) {
    for (let i = 0; i < 5; i++) {
      const w = 0.45 + i * 0.22, a = alpha / 3.2;
      const g = c.createLinearGradient(0, WATER.y, 0, 380 - i * 40);
      g.addColorStop(0, `rgba(246,220,152,${a})`); g.addColorStop(1, 'rgba(246,220,152,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(WATER.x - WATER.rx * w, WATER.y); c.lineTo(WATER.x - 60 * w, 380 - i * 40);
      c.lineTo(WATER.x + 60 * w, 380 - i * 40); c.lineTo(WATER.x + WATER.rx * w, WATER.y); c.fill();
    }
  }
  function ripples(t) {
    if (!started || reduced.matches) return;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(WATER.x, WATER.y, WATER.rx, WATER.ry, 0, 0, Math.PI * 2); ctx.clip();
    ctx.lineWidth = 2.2;
    for (const c of cues) {
      const age = t - c[0];
      if (age < 0 || age > 2.8) continue;
      const p = age / 2.8;
      ctx.strokeStyle = `rgba(255,236,190,${0.55 * (1 - p)})`;
      ctx.beginPath(); ctx.ellipse(WATER.x + 20, WATER.y + 4, 8 + WATER.rx * p, 2 + WATER.ry * p, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  /* looking down the well during the first verse: the other wells, reflected in the water */
  function drawWater(t) {
    if (!ok('water')) { load('water'); return; }
    const N = 1440, R = 300;
    const p = clamp01((t - T.v1) / (T.sat - T.v1));
    const z = Math.max(cw, ch) / N * (reduced.matches ? 1.25 : 1.15 + 0.2 * p);
    const ox = cw / 2 - 720 * z, oy = ch * focusY - 720 * z;
    ctx.setTransform(z, 0, 0, z, ox, oy);
    ctx.drawImage(img.water.i, 0, 0, N, N);
    ctx.save();
    ctx.beginPath(); ctx.arc(720, 720, R, 0, Math.PI * 2); ctx.clip();
    const lines = cues.filter(c => c[0] >= T.v1 - 0.1 && c[0] < T.sat - 0.1).map(c => c[0]);
    const fade = 1 - clamp01((t - T.thirsty - 0.6) / 2.2);
    const on = i => lines[i] != null ? clamp01((t - lines[i]) / 0.7) * fade : 0;
    const flick = k => reduced.matches ? 1 : 0.86 + 0.14 * Math.sin(t * k);
    const lasts = lines[6] != null && t >= lines[6] && t < T.thirsty ? 1.25 : 1;
    // 1. screen light before the house is awake
    let a = on(0) * flick(11) * lasts;
    if (a > 0) {
      ctx.save(); ctx.translate(670, 690); ctx.rotate(-0.16);
      ctx.shadowColor = `rgba(150,200,255,${0.9 * a})`; ctx.shadowBlur = 60;
      const g = ctx.createLinearGradient(0, -110, 0, 110); g.addColorStop(0, `rgba(214,236,255,${0.85 * a})`); g.addColorStop(1, `rgba(96,150,214,${0.7 * a})`);
      ctx.fillStyle = g; roundRect(-58, -105, 116, 210, 16); ctx.fill(); ctx.restore();
    }
    // 2. a voice that tells me who to hate
    a = on(1) * lasts;
    if (a > 0) {
      ctx.lineWidth = 4;
      for (let r = 0; r < 3; r++) {
        const q = reduced.matches ? r / 3 : ((t - lines[1]) * 0.45 + r / 3) % 1;
        ctx.strokeStyle = `rgba(190,62,40,${0.8 * a * (1 - q)})`;
        ctx.beginPath(); ctx.arc(780, 780, 40 + q * 220, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // 3. a hundred faces saying see me
    a = on(2) * lasts;
    if (a > 0) {
      const cols = ['#e8d7c0', '#cfc4b0', '#d9b8a0', '#c8d2d8', '#e0c9a8', '#bfb3a2'];
      for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
        const i = r * 8 + c, show = clamp01((t - lines[2] - i * 0.04) / 0.3) * fade;
        if (show <= 0) continue;
        ctx.globalAlpha = 0.8 * show * lasts > 1 ? 1 : 0.8 * show * lasts;
        ctx.fillStyle = cols[(i * 7) % cols.length];
        roundRect(560 + c * 42, 600 + r * 42, 32, 32, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // 4. I watch my own reflection wait
    a = on(3);
    if (a > 0 && ok('stand')) {
      ctx.save(); ctx.globalAlpha = 0.4 * a; ctx.translate(720, 700); ctx.scale(1, -1);
      ctx.drawImage(img.stand.i, -125, -210, 250, 420); ctx.restore();
    }
    // 5. a touch that keeps the silence back  6. something that makes the room feel kind
    for (const [i, x, y, rgb] of [[4, 600, 830, '217,138,138'], [5, 840, 610, '224,160,74']]) {
      a = on(i) * flick(5 + i) * lasts;
      if (a <= 0) continue;
      const g = ctx.createRadialGradient(x, y, 4, x, y, 170);
      g.addColorStop(0, `rgba(${rgb},${0.8 * a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - 170, y - 170, 340, 340);
    }
    // ripples: each line touches the water
    if (!reduced.matches) {
      ctx.lineWidth = 3;
      for (const s of lines.concat([T.thirsty])) {
        const age = t - s; if (age < 0 || age > 3) continue;
        ctx.strokeStyle = `rgba(230,240,245,${0.4 * (1 - age / 3)})`;
        ctx.beginPath(); ctx.arc(720, 720, 20 + age / 3 * 280, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function render() {
    queued = false;
    if (stage.hidden) return;
    size();
    const t = now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#141612'; ctx.fillRect(0, 0, cw, ch);
    const wm = waterMix(t);
    if (wm < 1) drawWorld(t);
    if (wm > 0) { ctx.globalAlpha = wm; drawWater(t); ctx.globalAlpha = 1; }
    if (t > T.v1 - 8 && t < T.sat) load('water');
    if (started) { load('walk'); load('stand'); load('jesusSpeak'); if (t > 150) { load('empty'); load('jar'); load('go'); load('people'); } }
    document.dispatchEvent(new CustomEvent('well:frame', { detail: { t } }));
    if (playing()) request();
  }
  let queued = false;
  function request() { if (!queued) { queued = true; requestAnimationFrame(render); } }
  addEventListener('resize', request);
  reduced.addEventListener?.('change', request);

  /* ---------- the clock: this page's own player, or the album player when The Well is open inside FIND ME ---------- */
  let host = null;
  try {
    if (window.frameElement && window.frameElement.matches('[data-reader-frame]')) host = parent.document.getElementById('album-audio');
  } catch { host = null; }
  const hostOnSong = () => host && /\/find-me-e3b\/01\.mp3$/.test(host.currentSrc || host.src || '');
  const player = () => host ? host : audio;
  let started = false;
  let jarDownAt = null;
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
      if (!hostOnSong()) parent.postMessage({ type: 'tpot:play-track', track: 1 }, location.origin);
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
  function resumeAt() { return saved.t > 10 && saved.t < T.jarStood ? saved.t : 0; }
  function media() {
    if (!navigator.mediaSession || typeof MediaMetadata !== 'function') return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Same Well, Same Thirst', artist: 'The Producer of Tracks', album: 'FIND ME',
      artwork: [{ src: '/assets/find-me-cover.jpg', sizes: '1000x1000', type: 'image/jpeg' }] });
  }
  let lastSave = 0;
  audio.addEventListener('timeupdate', () => {
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); keep({ t: Math.floor(audio.currentTime) }); }
  });
  audio.addEventListener('ended', () => keep({ t: 0 }));
  addEventListener('pagehide', () => { if (!host) audio.pause(); });

  /* ---------- the jar: the one thing the visitor does ---------- */
  function setJarDown() {
    if (jarDownAt != null) return;
    const t = now();
    jarDownAt = started && t >= 0 ? Math.max(t, 30.5) : T.auto;
    keep({ jar: new Date().toLocaleDateString('en-CA') });
    load('empty'); load('jar'); load('go');
    request();
  }

  /* ---------- the keepsake: a card drawn here, from the scene and the line, never uploaded ---------- */
  async function card() {
    await Promise.all(['back', 'jesusRest', 'jar', 'people'].map(load));
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const g = c.getContext('2d');
    g.fillStyle = '#141612'; g.fillRect(0, 0, 1080, 1350);
    const fx = 54, fy = 54, fw = 972, fh = 820;
    // the scene: Jesus at the well, the jar by the water, the town on its way, the spring risen
    g.save(); g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
    const vx = 1500, vy = 860, vw = 1060, k = fw / vw, vh = fh / k;
    g.setTransform(k, 0, 0, k, fx - (vx - vw / 2) * k, fy - (vy - vh / 2) * k);
    if (ok('back')) g.drawImage(img.back.i, 0, 0, W, H);
    g.save(); g.beginPath(); g.ellipse(WATER.x, WATER.y, WATER.rx, WATER.ry, 0, 0, Math.PI * 2); g.clip();
    const sg = g.createRadialGradient(WATER.x, WATER.y, 4, WATER.x, WATER.y, WATER.rx);
    sg.addColorStop(0, 'rgba(255,240,196,.95)'); sg.addColorStop(1, 'rgba(214,166,80,.6)'); g.fillStyle = sg; g.fillRect(WATER.x - WATER.rx, WATER.y - WATER.ry, WATER.rx * 2, WATER.ry * 2); g.restore();
    if (ok('jesusRest')) g.drawImage(img.jesusRest.i, ...BOX.jesus);
    if (ok('jar')) g.drawImage(img.jar.i, JAR.down[0], JAR.down[1], JAR.w, JAR.h);
    if (ok('people')) { const s = depth(915); g.drawImage(img.people.i, 2010 - PEOPLE.feet[0] * s, 915 - PEOPLE.feet[1] * s, PEOPLE.w * s, PEOPLE.h * s); }
    g.globalCompositeOperation = 'lighter';
    column(g, 0.36);
    g.restore();
    // a mosaic frame, gold on lapis, laid tile by tile
    let seed = 4101;
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
    g.fillText('“Sir, give me this water,', 540, 1010);
    g.fillText('that I thirst not”', 540, 1082);
    g.fillStyle = '#e7c480'; g.font = 'bold 26px Arial, sans-serif';
    g.fillText('J O H N   4 : 1 5', 540, 1150);
    g.fillStyle = '#a99c80'; g.font = '24px Arial, sans-serif';
    g.textAlign = 'left'; g.fillText('The Well · FIND ME', 60, 1296);
    g.textAlign = 'right'; g.fillText('theproduceroftracks.com', 1020, 1296);
    return new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'));
  }

  /* ---------- placement helpers for the page ---------- */
  function setFocus(y) { focusY = y; request(); }

  window.WellScene = {
    start, toggle, seek, setJarDown, card, setFocus, request, toScreen, load,
    get started() { return started; }, get playing() { return playing(); }, get time() { return now(); },
    get duration() { return host ? (hostOnSong() && isFinite(host.duration) ? host.duration : 315.5) : (isFinite(audio.duration) ? audio.duration : 315.5); },
    get T() { return T; }, get moments() { return moments; }, get cues() { return cues; }, get notes() { return notes; },
    get jarDown() { return jarDownAt != null; }, get jarDownAt() { return jarDownAt; }, get saved() { return saved; }, get inReader() { return !!host; },
    answer: '', keep
  };
  request();
})();
