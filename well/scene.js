/* The Well: the scene file for "Same Well, Same Thirst" (Stage A, Nov 24, 2026; on the shared kit Nov 25).
   The art is painted by our own engine (tpot-encounter-art/engine/well.py): a world, a look down the well and the
   figures, as separate layers. The shared player (/assets/tpot-scene.js) moves them in time with the song, using the
   album's lyric timings and the E3b album master. This file says what happens and when.
   On this device only: what a visitor chooses or names at the jar is never stored or sent. The page keeps only
   whether the jar was set down (and the day) and the place in the song, in localStorage "tpot.well.v2". */
(() => {
  'use strict';
  if (!window.TPoTScene) return;
  const { ease, lerp, clamp01, along } = TPoTScene;
  const BOX = { jesus: [1170, 760, 270, 390], woman: [1600, 730, 250, 420] };
  const FEET = [125, 398];                     // the woman's feet inside her sprite
  const STAND = [1725, 1128];                  // where she stands at the well (feet)
  const JAR = { w: 86, h: 110, hands: [1684, 878], down: [1612, 1040] };
  const WATER = { x: 1440, y: 961.5, rx: 170, ry: 38.5 };
  const PEOPLE = { w: 300, h: 170, feet: [150, 162] };
  const W = 2880, H = 1440;
  let S = null, T = {};

  /* ---------- the people in the scene, as a function of time (so seeking always shows the right moment) ---------- */
  const ROAD_IN = [[2150, 860], [2040, 905], [1930, 962], [1830, 1032], [1760, 1092], STAND];
  const ROAD_OUT = [STAND, [1770, 1060], [1850, 995], [1960, 930], [2080, 860], [2200, 776], [2272, 712]];
  const depth = y => clamp01((y - 670) / (STAND[1] - 670));       // nearer the horizon, smaller
  /* Shorter Well (Nov 27): a few brief beats with still compositions between them, instead of long walks and a long run.
     She arrives from the near bend of the road (was the whole road, about 24 s); she sets off for the town and is next seen
     at the gate (was a 15 s run up the whole road); at "He was waiting" she and the town are seen on the last bend only
     (was 38 s and 40 s down the whole road). Walking pace is the same as before; the song, its words and cues are unchanged. */
  const ARRIVE = 6, GO = 4, DIP = 0.8, BACK = 9, TOWN = 8;
  const ROAD_NEAR = ROAD_IN.slice(3), GATE = ROAD_OUT[ROAD_OUT.length - 1], OUT_NEAR = ROAD_OUT.slice(0, 3);
  const BACK_NEAR = [[1990, 920], [1900, 985]], TOWN_GATE = [2300, 714], TOWN_NEAR = [[2010, 915], [1960, 960]];
  const arriveEnd = () => T.first + 1 + ARRIVE;
  const fadeOut = x => S.still ? (x < 1 ? 1 : 0) : 1 - x, fadeIn = x => S.still ? 1 : x;   // Reduced Motion: a cut
  function jarTime() { return S.actAt != null ? S.actAt : T.auto; }
  function herAt(t) {                                                            // where she is on the road (the camera follows)
    const jd = jarTime(), goStart = Math.max(jd + 1.6, T.auto + 1.2);
    if (t < arriveEnd()) return along(ROAD_NEAR, clamp01((t - (T.first + 1)) / ARRIVE));
    if (t < goStart) return STAND;
    if (t < goStart + GO) return along(OUT_NEAR, clamp01((t - goStart) / GO));
    if (t < T.waiting + DIP) return GATE;
    return along(BACK_NEAR, clamp01((t - T.waiting - DIP) / BACK));
  }
  function cast(t) {
    const out = [], still = S.still, started = S.started;
    const bob = (phase, s) => still ? 0 : -Math.abs(Math.sin(phase)) * 5 * s;
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
    } else if (t < arriveEnd()) {
      let p = (t - (T.first + 1)) / ARRIVE;
      if (still) p = p < 0.5 ? 0 : 1;
      const f = along(ROAD_NEAR, p);
      womanAt('walk', f, Math.max(0.3, depth(f[1])), clamp01((t - T.first - 1) / 1.2), t * 2.4 * Math.PI);
    } else if (t < jd) {
      const x = clamp01((t - arriveEnd()) / 0.8);
      if (x < 1) womanAt('walk', STAND, 1, 1 - x);
      womanAt('stand', STAND, 1, x);
    } else if (t < goStart) {
      const x = clamp01((t - jd) / 0.6);
      if (x < 1) womanAt('stand', STAND, 1, 1 - x);
      womanAt('empty', STAND, 1, x);
    } else if (t < goStart + GO) {
      let p = (t - goStart) / GO;
      if (still) p = 0.1;
      const f = along(OUT_NEAR, p);
      womanAt('go', f, Math.max(0.08, depth(f[1])), fadeOut(clamp01((t - goStart - GO + DIP) / DIP)), t * 3.2 * Math.PI);
    } else if (t < T.waiting + DIP) {
      womanAt('go', GATE, depth(712), Math.min(fadeIn(clamp01((t - goStart - GO) / DIP)), fadeOut(clamp01((t - T.waiting) / DIP))));
    } else {
      // she leads the town back to Him (4:30), seen on the last bend of the road
      let p = (t - T.waiting - DIP) / BACK;
      if (still) p = 1;
      const f = along(BACK_NEAR, p);
      womanAt('empty', f, Math.max(0.08, depth(f[1])), fadeIn(clamp01((t - T.waiting - DIP) / DIP)), p < 1 ? t * 2.2 * Math.PI : null);
    }
    // the jar: in her hands, then set down by the water, and left there
    if (t >= jd) {
      let p = clamp01((t - jd) / 1.4);
      if (still) p = 1;
      const e = ease(p);
      const x = lerp(JAR.hands[0], JAR.down[0], e), y = lerp(JAR.hands[1], JAR.down[1], e) - Math.sin(Math.PI * e) * 18;
      out.push({ n: 'jar', box: [x, y, JAR.w, JAR.h], a: 1, label: t - jd < 4.4 ? 1 - clamp01((t - jd - 1.4) / 3) : 0 });
    } else if (t >= 30) {
      out.push({ label: 1, box: [JAR.hands[0], JAR.hands[1], JAR.w, JAR.h] });
    }
    // the people of the town
    if (t >= T.comeSee + 1.2) {
      const tw = townAt(t), f = tw.f, s = Math.max(0.07, depth(f[1]));
      out.push({ n: 'people', box: [f[0] - PEOPLE.feet[0] * s + 30 * s, f[1] - PEOPLE.feet[1] * s + (tw.walking ? bob(t * 2 * Math.PI, s * 0.6) : 0), PEOPLE.w * s, PEOPLE.h * s],
        a: tw.a });
    }
    return out;
  }
  // the people of the town: at the gate after "Come and see", then (after a brief dip) on the last bend behind her
  function townAt(t) {
    if (t < T.waiting + DIP) return { f: TOWN_GATE, p: 0, walking: false,
      a: Math.min(S.still ? 1 : clamp01((t - T.comeSee - 1.2) / 1.5), fadeOut(clamp01((t - T.waiting) / DIP))) };
    const t0 = T.waiting + DIP + 1.5, p = S.still ? 1 : clamp01((t - t0) / TOWN);
    return { f: along(TOWN_NEAR, p), p, walking: p > 0 && p < 1, a: fadeIn(clamp01((t - T.waiting - DIP) / DIP)) };
  }
  function speakMix(t) {
    let m = 0;
    for (const [a, b] of [[T.asked, T.chorus1], [T.named, T.smallest], [T.mountain, T.chorus2], [T.knowToo, T.breakStart]]) {
      if (t >= a - 0.1 && t < b + 0.5) m = Math.max(m, Math.min(clamp01((t - a + 0.1) / 0.5), clamp01((b + 0.5 - t) / 0.5)));
    }
    return S.still ? (m > 0.5 ? 1 : 0) : m;
  }

  /* ---------- jointed figures (engine/rig.py): the same people, places and moments, now moving their heads, arms and feet.
     "?rig=0" shows the earlier still poses (and is what the kit compares with the live site) ---------- */
  const RIGS = ['jesus', 'woman', 'person_a', 'person_b', 'person_c'];
  const useRig = !/[?&]rig=0(&|$)/.test(location.search);
  let rigReady = false;
  const PZ = TPoTScene.pose;
  const pose = (fig, name) => (S.rig(fig).poses || {})[name] || {};
  const cyc = (fig, name, phase) => { const c = (S.rig(fig).cycles || {})[name]; return c ? PZ.cycle(c, S.still ? 0 : phase) : pose(fig, 'stand'); };
  const stride = (fig, name) => ((S.rig(fig).cycles || {})[name] || {}).stride || 60;
  const pathLen = path => path.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
  const add = (p, extra) => { const o = Object.assign({}, p); for (const [k, v] of Object.entries(extra)) o[k] = typeof v === 'number' ? (o[k] || 0) + v : v; return o; };
  const only = (p, parts) => Object.fromEntries(Object.entries(p).filter(([k]) => parts.includes(k)));
  const ARM_R = ['armR_upper', 'armR_fore'];
  // a blink every few seconds, at its own unhurried rhythm for each person (the same moment every time the song plays)
  function blinking(t, seed) {
    if (S.still || !S.started) return false;
    const n = Math.floor((t + seed) / 4.3), r = Math.abs(Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    const at = n * 4.3 - seed + 0.6 + r * 2.6;
    return t >= at && t < at + 0.14;
  }
  const blinkFace = (p, on) => on ? Object.assign({}, p, { _face: Object.assign({}, p._face || {}, { head: 'blink' }) }) : p;
  // the sun is high and to the right: a warm side, a cooler far side, and a soft shadow on the ground
  const SUN = t => { const L = light(t); return { dir: [-0.62, 0.78], warm: `255,212,146,${0.26 + 0.2 * L.warm}`, shade: `34,24,52,${0.44 - 0.14 * L.spring}` }; };
  function jesusPose(t) {
    if (!S.started) return add(pose('jesus', 'rest'), S.still ? {} : { body: 0.5 * Math.sin(t * 1.4), head: 1.2 * Math.sin(t * 0.6) });
    const k = [[0, pose('jesus', 'rest')], [28, pose('jesus', 'listen'), 1.6]];
    for (const [a, b] of [[T.asked, T.chorus1], [T.named, T.smallest], [T.mountain, T.chorus2], [T.knowToo, T.breakStart]]) k.push([a - 0.1, pose('jesus', 'speak'), 0.5], [b + 0.5, pose('jesus', 'listen'), 0.8]);
    k.sort((x, y) => x[0] - y[0]);
    let p = PZ.at(k, t, S.still);
    if (!S.still) {
      const sp = speakMix(t);                                                     // breathing; the hand moves as He speaks
      p = add(p, { body: 0.5 * Math.sin(t * 1.4), head: 1.2 * Math.sin(t * 0.6 + 1), armR_fore: sp * 5 * Math.sin(t * 2.6) });
    }
    return blinkFace(p, blinking(t, 1.7));
  }
  function face(t) {
    if (t >= T.smallest && t < T.mountain) return 'down';                        // the smallest truth
    if (t >= T.turnAway && t < T.roadBack) return 'up';                          // You did not turn away
    if (t >= T.jarStood - 4 && t < T.final) return 'up';
    return null;
  }
  let jarAt = null;                                                              // where her hands left the jar (world)
  function womanFigure(t) {
    if (!S.started || t < T.first + 1) return null;
    const still = S.still, jd = jarTime(), goStart = Math.max(jd + 1.6, T.auto + 1.2);
    // her mantle trails behind as she moves, and settles when she stops; standing, her weight shifts slowly
    const [hx0] = herAt(t - 0.3), [hx1] = herAt(t), trail = still ? 0 : Math.max(-9, Math.min(9, (hx1 - hx0) / 0.3 * 0.14));
    const sway = still ? {} : { veil: 2.5 * Math.sin(t * 1.3) + trail, torso: 0.6 * Math.sin(t * 1.5) + 0.8 * Math.sin(t * 0.47 + 1), _x: 5 * Math.sin(t * 0.47) };
    const withFace = p => { const f = blinking(t, 0.4) ? 'blink' : face(t); return f ? Object.assign({}, p, { _face: Object.assign({}, p._face || {}, { head: f }) }) : p; };
    // the jar leaves her hands at the bottom of her reach and is set on the ground, upright
    const keepJar = p => jarAt && t >= jarAt.t ? Object.assign({}, p, { _detach: { jar: jarAt.from.map((v, i) => lerp(v, jarAt.to[i], still ? 1 : ease(clamp01((t - jarAt.t) / 0.35)))) } }) : p;
    if (t < arriveEnd()) {                                                        // the last bend of the road, with her jar
      let p = (t - (T.first + 1)) / ARRIVE;
      if (still) p = p < 0.5 ? 0 : 1;
      const f = along(ROAD_NEAR, p), s = Math.max(0.3, depth(f[1]));
      return { pose: add(withFace(cyc('woman', 'walk_jar', p * pathLen(ROAD_NEAR) / (stride('woman', 'walk_jar') * s))), sway), x: f[0], y: f[1], s, a: clamp01((t - T.first - 1) / 1.2) };
    }
    if (t < jd + 1.2) {                                                           // at the well; then she bends to set the jar down
      const k = [[arriveEnd(), pose('woman', 'stand_jar'), 0.8], [jd, pose('woman', 'stand_jar')], [jd + 0.1, pose('woman', 'reach'), 1.1]];
      return { pose: add(withFace(PZ.at(k, t, still)), t < jd ? sway : {}), x: STAND[0], y: STAND[1], s: 1, a: 1 };
    }
    if (!jarAt || jarAt.jd !== jd) {                                              // where her hands are at the bottom of the reach
      const m = S.rigMats('woman', pose('woman', 'reach'), STAND[0], STAND[1]), R = S.rig('woman'), J = R.parts.jar;
      const from = S.rigPoint(m, 'jar', J.pivot[0], J.pivot[1]), bottom = S.rigPoint(m, 'jar', J.size[0] / 2, J.size[1]);
      const to = [bottom[0] - R.px * (J.size[0] / 2 - J.pivot[0]), STAND[1] + 6 - R.px * (J.size[1] - J.pivot[1]), 0];
      jarAt = { jd, t: jd + 1.2, from, to };
    }
    if (t < goStart) {
      const k = [[jd + 1.2, pose('woman', 'reach')], [jd + 1.6, pose('woman', 'stand'), 0.9]];
      return { pose: keepJar(withFace(PZ.at(k, t, still))), x: STAND[0], y: STAND[1], s: 1, a: 1 };
    }
    if (t < goStart + GO) {                                                       // she sets off for the town (a few steps)
      let p = (t - goStart) / GO;
      if (still) p = 0.1;
      const f = along(OUT_NEAR, p), s = Math.max(0.08, depth(f[1]));
      const run = Object.assign({}, cyc('woman', 'run', p * pathLen(OUT_NEAR) / (stride('woman', 'run') * s)), { _face: { head: 'up' } });
      return { pose: keepJar(PZ.mix(pose('woman', 'stand'), run, still ? 1 : clamp01((t - goStart) / 0.6))), x: f[0], y: f[1], s, a: fadeOut(clamp01((t - goStart - GO + DIP) / DIP)), flip: true };
    }
    if (t < T.waiting + DIP) {                                                    // at the gate: come and see (one still call)
      const k = [[goStart + GO, pose('woman', 'stand')], [T.comeSee - 0.3, pose('woman', 'call'), 0.7]];
      return { pose: keepJar(PZ.at(k, t, still)), x: GATE[0], y: GATE[1], s: depth(712), flip: true,
        a: Math.min(fadeIn(clamp01((t - goStart - GO) / DIP)), fadeOut(clamp01((t - T.waiting) / DIP))) };
    }
    // she leads the town back to Him (4:30), seen on the last bend of the road
    let p = (t - T.waiting - DIP) / BACK;
    if (still) p = 1;
    const f = along(BACK_NEAR, p), s = Math.max(0.08, depth(f[1]));
    const body = p < 1 ? cyc('woman', 'walk', p * pathLen(BACK_NEAR) / (stride('woman', 'walk') * s)) : pose('woman', 'stand');
    return { pose: keepJar(withFace(p < 1 ? body : add(body, sway))), x: f[0], y: f[1], s, a: fadeIn(clamp01((t - T.waiting - DIP) / DIP)) };
  }
  function townFigures(t) {
    if (!S.started || t < T.comeSee + 1.2) return [];
    const tw = townAt(t), L = pathLen(TOWN_NEAR), p = tw.p, f = tw.f, s = Math.max(0.07, depth(f[1]));
    const ox = f[0] - PEOPLE.feet[0] * s + 30 * s, oy = f[1] - PEOPLE.feet[1] * s;   // the same group, arranged as in the earlier painting
    return ['person_a', 'person_b', 'person_c'].map((n, i) => {
      const sf = S.rig(n).sprite_feet, walking = tw.walking;
      return { n, pose: walking ? cyc(n, 'walk', p * L / (stride(n, 'walk') * s) + i * 0.37) : pose(n, 'rest'), x: ox + sf[0] * s, y: oy + sf[1] * s, s, a: tw.a };
    });
  }
  function drawFigures(ctx, t, label) {
    const sun = SUN(t);
    S.drawRig(ctx, 'jesus', jesusPose(t), JESUS_FEET()[0], JESUS_FEET()[1], { light: sun, shadow: [78, 15, 0.4] });
    const w = womanFigure(t);
    if (w && w.a > 0.002) {
      const sf = S.rig('woman').sprite_feet;                                     // stand where the earlier painting stood
      const m = S.drawRig(ctx, 'woman', w.pose, w.x + (sf[0] - FEET[0]) * w.s * (w.flip ? -1 : 1), w.y + (sf[1] - FEET[1]) * w.s,
        { scale: w.s, alpha: w.a, flip: w.flip, light: sun, shadow: [66 * w.s, 14 * w.s, 0.42] });
      const jd = jarTime(), J = S.rig('woman').parts.jar;
      const show = t < jd ? 1 : t - jd < 4.4 ? 1 - clamp01((t - jd - 1.4) / 3) : 0;
      if (m && label && show > 0 && t >= 30) {
        const [lx, ly] = S.rigPoint(m, 'jar', J.size[0] / 2, J.size[1]);
        ctx.save(); ctx.globalAlpha = show; ctx.font = 'italic 21px Georgia, "Times New Roman", serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(20,16,12,.9)'; ctx.shadowBlur = 8; ctx.fillStyle = '#f6ead0';
        ctx.fillText(label, lx, ly + 8); ctx.restore();
      }
    }
    // one object from today (engine/objects.py): she left both. A phone lies face-down beside her jar.
    if (jarAt && t >= jarAt.t && S.ok('phone')) {
      const R = S.rig('woman'), J = R.parts.jar, bx = jarAt.to[0] + R.px * (J.size[0] / 2 - J.pivot[0]);
      ctx.globalAlpha = S.still ? 1 : clamp01((t - jarAt.t) / 0.8);
      ctx.drawImage(S.img.phone.i, bx - 46, STAND[1] - 1, 30, 10); ctx.globalAlpha = 1;
    }
    for (const p of townFigures(t)) if (p.a > 0.002) S.drawRig(ctx, p.n, p.pose, p.x, p.y, { scale: p.s, alpha: p.a, light: sun, shadow: [50 * p.s, 11 * p.s, 0.38] });
  }
  const JESUS_FEET = () => { const f = S.rig('jesus').sprite_feet || [135, 380]; return [BOX.jesus[0] + f[0], BOX.jesus[1] + f[1]]; };

  /* ---------- light: warmth around Him, the hiding, the spring rising ---------- */
  function light(t) {
    if (!S.started) return { warm: 0.12, dark: 0, spring: 0 };
    let warm = t < T.sat ? 0.05 : 0.28;
    if (t >= T.ifYouKnow && t < T.turnAway + 2) warm = 0.55;
    if (t >= T.hide && t < T.knowToo) warm = 0.12;
    if (t >= jarTime()) warm = Math.max(warm, 0.38);
    const dark = t >= T.hide && t < T.knowToo + 1.5 ? 0.22 * Math.min(clamp01((t - T.hide) / 2), clamp01((T.knowToo + 1.5 - t) / 1.5)) : 0;
    const spring = S.still ? (t >= T.spring ? 1 : 0) : clamp01((t - T.spring) / 5);
    return { warm, dark, spring };
  }
  const waterMix = t => {
    if (!S.started) return 0;
    const a = clamp01((t - (T.v1 - 1.4)) / 1.2), b = 1 - clamp01((t - (T.sat - 1.1)) / 0.9);
    const m = Math.min(a, b);
    return S.still ? (m > 0.5 ? 1 : 0) : m;
  };

  /* ---------- drawing ---------- */
  function drawWorld(ctx, t) {
    const img = S.img, ok = S.ok;
    S.inWorld(ctx, t);
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
    ripples(ctx, t);
    const label = (window.WellScene && WellScene.answer) || '';
    if (rigReady) drawFigures(ctx, t, label);
    else for (const d of cast(t)) {
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
    motes(ctx, t, L);
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
    if (L.dark > 0) { ctx.fillStyle = `rgba(12,10,9,${L.dark})`; ctx.fillRect(0, 0, S.cw, S.ch); }
    if (L.spring > 0) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(246,220,152,${0.35 * L.spring})`; ctx.fillRect(0, 0, S.cw, S.ch); ctx.globalCompositeOperation = 'source-over'; }
  }
  // dust in the warm air around the well (kit v2): it drifts up slowly, brighter as the warmth around Him grows
  function motes(ctx, t, L) {
    if (!S.started || S.still) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i++) {
      const bx = 1030 + (i * 137) % 760, rise = (t * (4 + (i % 3)) + i * 41) % 300, y = 1080 - (i * 89) % 260 - rise;
      const x = bx + 20 * Math.sin(t * 0.21 + i * 1.7);
      const edge = Math.min(1, rise / 60, (300 - rise) / 60), tw = 0.55 + 0.45 * Math.sin(t * 0.9 + i);
      ctx.fillStyle = `rgba(255,238,196,${(0.12 + 0.3 * L.warm) * edge * tw})`;
      ctx.beginPath(); ctx.arc(x, y, 1.6 + (i % 3) * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
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
  function ripples(ctx, t) {
    if (!S.started || S.still) return;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(WATER.x, WATER.y, WATER.rx, WATER.ry, 0, 0, Math.PI * 2); ctx.clip();
    ctx.lineWidth = 2.2;
    for (const c of S.cues) {
      const age = t - c[0];
      if (age < 0 || age > 2.8) continue;
      const p = age / 2.8;
      ctx.strokeStyle = `rgba(255,236,190,${0.55 * (1 - p)})`;
      ctx.beginPath(); ctx.ellipse(WATER.x + 20, WATER.y + 4, 8 + WATER.rx * p, 2 + WATER.ry * p, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  /* looking down the well during the first verse: the other wells, reflected in the water */
  function drawWater(ctx, t) {
    const img = S.img, ok = S.ok, still = S.still, cw = S.cw, ch = S.ch;
    if (!ok('water')) { S.load('water'); return; }
    const N = 1440, R = 300;
    const p = clamp01((t - T.v1) / (T.sat - T.v1));
    const z = Math.max(cw, ch) / N * (still ? 1.25 : 1.15 + 0.2 * p);
    const ox = cw / 2 - 720 * z, oy = ch * S.focusY - 720 * z;
    ctx.setTransform(z, 0, 0, z, ox, oy);
    ctx.drawImage(img.water.i, 0, 0, N, N);
    ctx.save();
    ctx.beginPath(); ctx.arc(720, 720, R, 0, Math.PI * 2); ctx.clip();
    const lines = S.cues.filter(c => c[0] >= T.v1 - 0.1 && c[0] < T.sat - 0.1).map(c => c[0]);
    const fade = 1 - clamp01((t - T.thirsty - 0.6) / 2.2);
    const on = i => lines[i] != null ? clamp01((t - lines[i]) / 0.7) * fade : 0;
    const flick = k => still ? 1 : 0.86 + 0.14 * Math.sin(t * k);
    const lasts = lines[6] != null && t >= lines[6] && t < T.thirsty ? 1.25 : 1;
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };
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
        const q = still ? r / 3 : ((t - lines[1]) * 0.45 + r / 3) % 1;
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
    if (!still) {
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

  S = TPoTScene.create({
    track: 1, title: 'Same Well, Same Thirst', audio: 'well-song', store: 'tpot.well.v2', events: 'well',
    size: [W, H], ground: '#141612', duration: 315.5, lastCue: [300.52, 306.24],
    files: { back: 'back.jpg', water: 'water.jpg', jar: 'jar.webp', jesusRest: 'jesus-rest.webp', jesusSpeak: 'jesus-speak.webp',
      walk: 'woman-walk.webp', stand: 'woman-stand.webp', empty: 'woman-empty.webp', go: 'woman-go.webp', people: 'people.webp',
      phone: 'phone-down.webp' },
    first: ['back', 'jesusRest'],
    // each moment, found by its words in the album's lyric timings (with the time to use if a line can't be found)
    lines: {
      first: ['I came to the well I already knew', 4.83], v1: ['Screen light before the house is awake', 36.86],
      thirsty: ['Then come up thirsty every time', 57.3], sat: ['You sat down tired beside the water', 61.57],
      asked: ['Asked a drink of me', 65.35], laughed: ['I almost laughed', 67.04], bucket: ['You had no bucket', 69.21],
      chorus1: ['Same well', 74.12], v2: ['I knew the chapter, knew the line', 97.22],
      named: ['You named the life I hadn’t mentioned', 119.76], smallest: ['I gave the smallest truth I could', 122.73],
      mountain: ['Then asked which mountain held the Father', 125.63], secrets: ['While You sat where my secrets stood', 128.45],
      chorus2: ['Same well', 133.44, 1], ifYouKnow: ['If You know', 156.29], turnAway: ['You did not turn away', 170.22],
      roadBack: ['And the road back to the well', 181.0], hide: ['With somewhere left to hide', 188.73],
      knowToo: ['You know that too', 196.62], empty: ['Then let me stand here empty', 203.38],
      askingLife: ['And I am asking life of You', 212.39], jarStood: ['The jar stood where I left it', 239.59],
      halfway: ['I was halfway down the road', 242.33], comeSee: ['Come and see', 251.1], waiting: ['He was waiting at the well', 258.59],
      final: ['Same well', 264.62, 2], spring: ['Let the spring You spoke of rise', 280.64],
      jarByWater: ['The jar is by the water', 289.73], people: ['There are people down the road', 296.41]
    },
    times(t, cues) {
      const ask = cues.find(c => c[2] === 'And I am asking life of You');
      t.breakStart = ask ? ask[1] : 222.48;
      t.auto = t.jarStood - 3.5;                 // if no one sets it down, she still leaves it (John 4:28)
      T = t;
    },
    /* Scripture where the song points to it (KJV, quoted exactly from the reading on this page) */
    notes: T => [
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
    ],
    arrival: [0, 0, 1430, 880, 1000, 640],
    // the camera (kit v2): a few calm framings; a change of size is a cross-fade, never a zoom. The widest shows the whole
    // height of the world; the closest (her face at "the smallest truth") still keeps the painting sharp.
    shots: T => [
      [0.2, 2.2, 1560, 800, 1440, 2300],                                         // the world opens: mountain, well, road, town
      [T.first + 0.5, 2, t => lerp(1720, herAt(t)[0], 0.5), 940, 980, 1400],    // she comes down the road (the camera walks with her)
      [T.v1, 0, 1510, 960, 800, 1000],                                           // (a cut while we look down into the water)
      [T.chorus1, 2.4, 1560, 880, 1200, 1800],                                   // Same well
      [T.v2, 2, 1510, 960, 800, 1000],                                           // she knew the chapter
      [T.smallest, 1.8, 1640, 950, 700, 760],                                    // the smallest truth (on her)
      [T.mountain, 2, 900, 660, 1150, 1700],                                     // which mountain held the Father
      [T.secrets, 2, 1510, 960, 800, 1000],
      [T.chorus2, 2.4, 1560, 880, 1200, 1800],
      [T.ifYouKnow, 2, 1500, 950, 720, 860],                                     // why are You still here
      [T.roadBack, 2.2, 1860, 890, 1040, 1500],                                  // the road back to the well
      [T.hide, 2, 1530, 960, 800, 1000],
      [T.knowToo, 2, 1620, 980, 720, 820],                                       // she, the jar, and Him
      [T.jarStood, 3, 1630, 1000, 720, 820],                                     // the jar stood where I left it
      [T.halfway, 2.2, t => lerp(1950, herAt(t)[0], 0.6), t => lerp(880, herAt(t)[1], 0.4), 1000, 1450],   // halfway down the road
      [T.comeSee, 2, 2190, 760, 700, 800],                                       // at the gate: come and see
      [T.waiting, 2.4, 1680, 840, 1440, 2300],                                   // He was waiting at the well
      [T.spring, 2.2, 1490, 920, 900, 1150],                                    // the spring You spoke of rises
      [T.people, 2.4, 1600, 820, 1440, 2300]                                     // there are people down the road
    ],
    moments: T => [[0, 'I came to the well'], [T.sat - 0.6, 'He asks for water'], [T.v2, 'Which mountain'], [T.knowToo, 'Set down the jar'], [T.jarStood - 0.4, 'Come and see']],
    resumeBefore: T => T.jarStood,
    paint(ctx, t) {
      const wm = waterMix(t);
      if (wm < 1) drawWorld(ctx, t);
      if (wm > 0) { ctx.globalAlpha = wm; drawWater(ctx, t); ctx.globalAlpha = 1; }
    },
    preload(t) {
      if (t > T.v1 - 8 && t < T.sat) S.load('water');
      if (S.started) { S.load('walk'); S.load('stand'); S.load('jesusSpeak'); if (t > 150) { S.load('empty'); S.load('jar'); S.load('go'); S.load('people'); S.load('phone'); } }
    },
    // the jar: the one thing the visitor does (never before she has reached the well)
    act: { key: 'jar', min: 30.5, auto: T => T.auto, load: ['empty', 'jar', 'go'] },
    // the keepsake: Jesus at the well, the jar by the water, the town on its way, the spring risen
    card: {
      layers: ['back', 'jesusRest', 'jar', 'people'], view: [1500, 860, 1060], seed: 4101,
      lines: ['“Sir, give me this water,', 'that I thirst not”'], ref: 'J O H N   4 : 1 5', footer: 'The Well · FIND ME',
      paint(g, S) {
        const img = S.img, ok = S.ok;
        if (ok('back')) g.drawImage(img.back.i, 0, 0, W, H);
        g.save(); g.beginPath(); g.ellipse(WATER.x, WATER.y, WATER.rx, WATER.ry, 0, 0, Math.PI * 2); g.clip();
        const sg = g.createRadialGradient(WATER.x, WATER.y, 4, WATER.x, WATER.y, WATER.rx);
        sg.addColorStop(0, 'rgba(255,240,196,.95)'); sg.addColorStop(1, 'rgba(214,166,80,.6)'); g.fillStyle = sg; g.fillRect(WATER.x - WATER.rx, WATER.y - WATER.ry, WATER.rx * 2, WATER.ry * 2); g.restore();
        if (ok('jesusRest')) g.drawImage(img.jesusRest.i, ...BOX.jesus);
        if (ok('jar')) g.drawImage(img.jar.i, JAR.down[0], JAR.down[1], JAR.w, JAR.h);
        if (ok('people')) { const s = depth(915); g.drawImage(img.people.i, 2010 - PEOPLE.feet[0] * s, 915 - PEOPLE.feet[1] * s, PEOPLE.w * s, PEOPLE.h * s); }
        g.globalCompositeOperation = 'lighter';
        column(g, 0.36);
      }
    }
  });
  if (!S) return;
  T = S.T;
  if (useRig) Promise.all(RIGS.map(n => S.loadRig(n))).then(() => { rigReady = RIGS.every(n => S.rig(n)); S.request(); });

  /* the page (well.js) talks to the scene through this, exactly as before the kit */
  window.WellScene = {
    start: S.start, toggle: S.toggle, seek: S.seek, setJarDown: S.act, card: S.card, setFocus: S.setFocus, request: S.request, toScreen: S.toScreen, load: S.load,
    get started() { return S.started; }, get playing() { return S.playing; }, get time() { return S.time; },
    get duration() { return S.duration; },
    get T() { return S.T; }, get moments() { return S.moments; }, get cues() { return S.cues; }, get notes() { return S.notes; },
    get jarDown() { return S.acted; }, get jarDownAt() { return S.actAt; }, get saved() { return S.saved; }, get inReader() { return S.inReader; },
    answer: '', keep: S.keep
  };
})();
