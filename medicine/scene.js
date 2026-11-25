/* Medicine of Immortality: the scene file (Nov 25, 2026), on the shared kit (/assets/tpot-scene.js).
   The art is the approved Medicine v10, painted by our own engine (tpot-encounter-art/engine/medicine.py), unchanged:
   the room at night (its own TPOT_LIGHT setting) and the approved still, plus soft-edged pieces of the still (the door,
   Ignatius's niche, the fish on the wall, the table, the hand). The song brings the light to one place at a time; at
   "You brought the table to me" the whole approved painting is lit. Story map: STORY-MAP-medicine.md (song kit folder).
   On this device only: the answer chosen is never stored or sent. The page keeps only whether the hand was opened
   (and the day), the place in the song and whether it was finished, in localStorage "tpot.medicine.v1". */
(() => {
  'use strict';
  if (!window.TPoTScene) return;
  const { env, clamp01, ease } = TPoTScene;
  const W = 1536, H = 1024;
  const PIECES = { door: [800, 60, 1240, 800], niche: [70, 140, 500, 690], fish: [1130, 150, 1470, 400], table: [150, 650, 1450, 1024], hand: [1030, 790, 1536, 1024] };
  let S = null, T = {};
  /* the jointed hand (engine/medicine_hand.py): open at first, it closes at "my hands have closed", trembles where the song
     trembles, and opens when the visitor holds (or at "The hand I kept shut opens to receive"). "?rig=0" keeps the painted hand. */
  const useRig = !/[?&]rig=0(&|$)/.test(location.search);
  let rigReady = false, off = null;
  const PZ = TPoTScene.pose;
  function handPose(t) {
    const P = n => S.rig('hand').poses[n];
    if (!S.started) return P('open');
    const a = actTime();
    let k = [[0, P('open')], [T.closed, P('closed'), 1.2], [T.trembles, P('tremble'), 0.8], [T.finds2, P('closed'), 1], [T.trembleOpen, P('tremble'), 1.2],
      [T.approach, P('closed'), 1.5], [T.looking + 2, P('tremble'), 1.5]].filter(x => x[0] < a);
    k.push([a, P('open'), 2.5]);
    let p = PZ.at(k, t, S.still);
    const shaking = !S.still && t < a + 2.5 && ((t >= T.trembles && t < T.finds2) || (t >= T.trembleOpen && t < T.approach) || t >= T.looking + 2);
    if (shaking) { p = Object.assign({}, p); ['f1a', 'f2a', 'f3a', 'f4a', 'thumb'].forEach((n, i) => { p[n] = (p[n] || 0) + 1.6 * Math.sin(t * 13 + i * 1.7); }); }
    return p;
  }
  // the hand is painted in the door's light; in the dark it is dimmed like the room around it
  function drawHand(ctx, t, lightness) {
    const c = ctx.canvas;
    if (!off) off = document.createElement('canvas');
    if (off.width !== c.width || off.height !== c.height) { off.width = c.width; off.height = c.height; }
    const g = off.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, off.width, off.height);
    g.setTransform(ctx.getTransform());
    const R = S.rig('hand');
    S.drawRig(g, 'hand', handPose(t), R.place[0], R.place[1]);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(14,10,8,${(1 - lightness).toFixed(3)})`; g.fillRect(0, 0, off.width, off.height);
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(off, 0, 0); ctx.restore();
  }

  /* ---------- light: where it is, as a function of the song (so seeking always shows the right moment) ---------- */
  const actTime = () => S.actAt != null ? S.actAt : T.opensTo;          // the hand opens: by the visitor, or at its own line
  const rise = (t, from, secs) => S.still ? (t >= from ? 1 : 0) : ease(clamp01((t - from) / secs));
  function light(t) {
    if (!S.started) return { room: 0, door: S.saved && S.saved.hand ? 0.35 : 0.12, niche: 0, fish: 0, table: 0, hand: 0 };
    const k = (keys) => env(keys, t, S.still);
    const a = actTime();
    const room = Math.max(k([[T.ninety, 0], [T.looking + 6, 0.18], [T.flesh, 0.3], [T.opensTo, 0.42], [T.found, 0.55], [T.opened + 2, 0.75], [T.brought, 0.75], [T.brought + 4, 1]]),
      0.42 * rise(t, a + 1, 4));
    let door = k([[0, 0.12], [T.night - 0.5, 0.12], [T.night + 1.5, 0.4], [T.locked, 0.35], [T.locked + 3, 0.05], [T.finds1 - 0.5, 0.05], [T.finds1 + 1.5, 0.6],
      [T.opens1, 0.8], [T.opens1 + 3, 0.8], [T.strange1 + 2, 0.1], [T.finds2 - 0.5, 0.1], [T.finds2 + 1.5, 0.7], [T.opens2, 0.95], [T.opens2 + 3, 0.9],
      [T.strange2 + 2, 0.15], [T.hid, 0.12], [T.hid + 3, 0.02], [T.ninety - 1, 0.04], [T.ninety + 2, 0.8], [T.flesh, 0.9], [T.flesh + 3, 1]]);
    if (!S.still && door > 0.03 && door < 0.98) door = Math.min(1, door * (0.94 + 0.06 * Math.sin(t * 1.7)));   // the light breathes
    const niche = k([[T.bishop - 1, 0], [T.bishop + 1.5, 0.85], [T.desire, 0.85], [T.desire + 3, 0], [T.fathers - 0.5, 0], [T.fathers + 1.5, 0.7], [T.trembles, 0.7], [T.trembles + 2.5, 0]]);
    const fish = k([[T.strange1 - 0.5, 0], [T.strange1 + 1.5, 0.85], [T.wont1, 0.6], [T.wont1 + 2, 0], [T.strange2 - 0.5, 0], [T.strange2 + 1.5, 0.85], [T.wont2, 0.6],
      [T.wont2 + 2, 0], [T.strange3 - 0.5, 0], [T.strange3 + 1.5, 1]]);
    const table = Math.max(k([[T.carries1 - 0.5, 0], [T.carries1 + 1.5, 0.45], [T.opens1 + 3, 0.4], [T.strange1 + 2, 0], [T.earth - 0.5, 0], [T.earth + 1.5, 0.35],
      [T.body + 3, 0.35], [T.fathers, 0.05], [T.carries2 - 0.5, 0.05], [T.carries2 + 1.5, 0.55], [T.strange2 + 2, 0.05], [T.hid, 0], [T.mouth - 0.5, 0], [T.mouth + 1.5, 0.3],
      [T.approach + 2, 0.1], [T.looking + 6, 0.35], [T.gave, 0.45], [T.gave + 2, 1]]), 0.7 * rise(t, a + 0.5, 3));
    const hand = Math.max(k([[T.trembleOpen - 0.5, 0], [T.trembleOpen + 2, 0.3], [T.approach + 1, 0.15]]), rise(t, a, 2.5));
    return { room, door, niche, fish, table, hand };
  }

  // dust drifting in the light from the doorway (kit v2); it settles before "You brought the table to me"
  function dust(ctx, t, L) {
    if (!S.started || S.still) return;
    const a = Math.min(1, L.door) * (1 - clamp01((t - T.brought + 2) / 3));
    if (a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 34; i++) {
      const bx = 905 + (i * 151) % 225, rise = (t * (3 + (i % 4)) + i * 53) % 560, y = 740 - rise;
      const x = bx + 14 * Math.sin(t * 0.23 + i * 1.9) + (740 - y) * 0.04 * Math.sin(i);
      const edge = Math.min(1, rise / 80, (560 - rise) / 80), tw = 0.55 + 0.45 * Math.sin(t * 0.8 + i * 2.3);
      ctx.fillStyle = `rgba(255,236,196,${0.42 * a * edge * tw})`;
      ctx.beginPath(); ctx.arc(x, y, 1.3 + (i % 3) * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  S = TPoTScene.create({
    track: 5, title: 'Medicine of Immortality', audio: 'medicine-song', store: 'tpot.medicine.v1', events: 'medicine',
    size: [W, H], ground: '#0f0d0f', duration: 340.6, lastCue: [331.83, 338.76], focus: 0.42,
    files: { dark: 'dark.jpg', lit: 'lit.jpg', door: 'door.webp', niche: 'niche.webp', fish: 'fish.webp', table: 'table.webp', hand: 'hand.webp',
      darkNo: 'dark-nohand.jpg', litNo: 'lit-nohand.jpg', tableNo: 'table-nohand.webp' },
    first: ['dark', 'door'],
    // each moment, found by its words in the album's lyric timings (with the time to use if a line can't be found)
    lines: {
      night: ['The night I made is the night He walked', 15.69], locked: ['I heard the sound and still I locked the door', 23.1],
      bishop: ['The bishop of Antioch wrote it in chains', 46.68], taste: ['I have no taste for the food that decays', 52.23],
      desire: ['I desire the bread of God, the flesh of the Christ', 58.67], seed: ['Of the seed of David, the blood that remains', 64.55],
      closed: ['My mouth has wounded and my hands have closed', 68.33], outside: ['I stood outside the feast I claimed to know', 71.87],
      finds1: ['He finds them in the dark', 77.83], hide1: ['He finds the ones who hide', 81.53], carries1: ['He carries the bread that heals', 84.75],
      opens1: ['He opens from the inside', 88.37], strange1: ['Strange and ancient weight', 94.97], wont1: ['Still I won’t receive', 100.44],
      adam: ['What broke in Adam, I carry in my chest', 116.94], earth: ['Bread from the earth, no longer common bread', 120.4],
      heavenly: ['Earthly and heavenly, more than I can name', 123.78], body: ['The body that suffered is the body I need most', 130.14],
      fathers: ['I can name the fathers, I can speak the line', 134.48], trembles: ['But my hand still trembles when the cup draws near mine', 137.94],
      finds2: ['He finds them in the dark', 147.44, 1], carries2: ['He carries the bread that heals', 154.2, 1], opens2: ['He opens from the inside', 157.82, 1],
      strange2: ['Strange and ancient weight', 164.5, 1], wont2: ['Still I won’t receive', 169.9, 1],
      hid: ['I hid because I knew what I had done', 186.88], mouth: ['The mouth that cut is the mouth that wants the bread', 193.96],
      trembleOpen: ['The hand that closed now trembles open', 201.28], approach: ['I cannot make myself approach the table', 205.47],
      ninety: ['He left the ninety-nine', 209.57], looking: ['He came looking for the one who would not come', 211.43],
      flesh: ['You came in flesh to meet me in my own', 245.71], earned: ['Not for the words I knew or what I’d earned', 253.19],
      inHand: ['The bread is in my hand; I cannot speak', 257.94], opensTo: ['The hand I kept shut opens to receive', 263.66],
      near: ['Still trembling, I let You near', 267.28], found: ['You found me in the dark', 276.45], gave: ['You gave me the bread that heals', 283.38],
      opened: ['You opened from the inside', 287.0], strange3: ['Strange and ancient weight', 293.68, 2], notFind: ['I did not find the table', 296.17],
      brought: ['You brought the table to me', 301.08], breadOfGod: ['The bread of God…', 324.34]
    },
    times(t) { T = t; },
    /* Scripture (KJV) and the early Church (labelled quotations), each word for word from the reading on this page */
    notes: T => [
      [T.locked, 'Genesis 3:10', 'And he said, I heard thy voice in the garden, and I was afraid, because I was naked; and I hid myself.'],
      [T.bishop, 'Ignatius of Antioch, Letter to the Ephesians 20', '…breaking one and the same bread, which is the medicine of immortality…', 'quote'],
      [T.taste, 'Ignatius of Antioch, Letter to the Romans 7', 'I have no delight in corruptible food, nor in the pleasures of this life. I desire the bread of God, the heavenly bread, the bread of life, which is the flesh of Jesus Christ…', 'quote'],
      [T.earth, 'Irenaeus of Lyons, Against Heresies IV.18.5', '…the bread, which is produced from the earth, when it receives the invocation of God, is no longer common bread, but the Eucharist, consisting of two realities, earthly and heavenly…', 'quote'],
      [T.body, 'Ignatius of Antioch, Letter to the Smyrnaeans 7', '…the flesh of our Saviour Jesus Christ, which suffered for our sins…', 'quote'],
      [T.trembles, 'John 6:37', '…and him that cometh to me I will in no wise cast out.'],
      [T.hid, 'Genesis 3:9', 'And the LORD God called unto Adam, and said unto him, Where art thou?'],
      [T.ninety, 'Luke 15:4', 'What man of you, having an hundred sheep, if he lose one of them, doth not leave the ninety and nine in the wilderness, and go after that which is lost, until he find it?'],
      [T.flesh, 'John 6:51', 'I am the living bread which came down from heaven'],
      [T.breadOfGod, 'John 6:35', 'I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.']
    ],
    // the camera: [time, move seconds, x, y, view height, min view width], in the painting's own pixels
    arrival: [0, 0, 800, 560, 1024, 1500],
    // the camera (kit v2): mostly the whole room, so the light can move from place to place; a few closer framings
    // (the door, the niche, the table, the hand) come and go as cross-fades, never as a zoom
    shots: T => [
      [0.2, 2.2, 768, 512, 1024, 1536],             // the room at night
      [T.night - 0.5, 2, 1000, 480, 800, 940],      // the door, and the light behind it
      [T.locked, 2, 768, 540, 1024, 1536],          // still I locked the door
      [T.bishop - 0.5, 2, 340, 520, 780, 800],      // the niche: chain, letter, pen
      [T.desire, 2, 740, 770, 820, 1000],            // the bread of God, the cup
      [T.closed, 1.8, 1130, 830, 760, 900],         // my hands have closed
      [T.outside, 2.2, 768, 512, 1024, 1536],       // outside the feast; the chorus in the whole room
      [T.wont1, 1.8, 1130, 830, 760, 900],          // still I won't receive
      [T.adam, 2.2, 768, 512, 1024, 1536],
      [T.earth, 2, 740, 770, 820, 1000],             // bread from the earth
      [T.fathers, 2, 340, 520, 780, 800],           // I can name the fathers
      [T.trembles, 2, 1080, 810, 780, 920],         // the cup draws near
      [T.finds2, 2.2, 768, 512, 1024, 1536],
      [T.wont2, 1.8, 1130, 830, 760, 900],
      [T.wont2 + 12, 2.4, 768, 512, 1024, 1536],
      [T.mouth, 2, 740, 770, 820, 1000],             // the mouth that wants the bread
      [T.trembleOpen, 1.8, 1130, 830, 760, 900],    // the hand that closed now trembles open
      [T.approach, 2.2, 768, 540, 1024, 1536],      // I cannot make myself approach the table
      [T.ninety, 2, 1000, 480, 800, 940],           // He left the ninety-nine
      [T.looking, 2.4, 880, 640, 1024, 1536],       // the light comes across the floor
      [T.looking + 10, 2.2, 1100, 810, 780, 920],   // the table and the hand (the visitor may open it)
      [T.inHand, 3, 1130, 830, 780, 920],           // the bread is in my hand
      [T.near + 2, 2.4, 768, 512, 1024, 1536],
      [T.gave, 2, 740, 770, 820, 1000],              // You gave me the bread that heals
      [T.notFind, 2.4, 768, 512, 1024, 1536]        // I did not find the table; You brought the table to me
    ],
    moments: T => [[0, 'The locked door'], [T.bishop - 0.5, 'Written in chains'], [T.finds1 - 0.3, 'He finds them in the dark'], [T.ninety - 0.5, 'Open your hand'], [T.notFind - 0.3, 'The table brought to me']],
    resumeBefore: T => T.brought,
    paint(ctx, t) {
      const img = S.img, ok = S.ok, L = light(t);
      const rig = rigReady && ok('darkNo') && ok('litNo') && ok('tableNo');     // the room without its painted hand, and the moving hand
      const dark = rig ? 'darkNo' : 'dark', lit = rig ? 'litNo' : 'lit';
      S.inWorld(ctx, t);
      if (ok(dark)) ctx.drawImage(img[dark].i, 0, 0, W, H);
      if (L.room > 0.002 && ok(lit)) { ctx.globalAlpha = Math.min(1, L.room); ctx.drawImage(img[lit].i, 0, 0, W, H); }
      for (const n of ['door', 'niche', 'fish', 'table', 'hand']) {
        if (L[n] <= 0.002 || L.room >= 0.999 || (rig && n === 'hand')) continue;
        const name = rig && n === 'table' ? 'tableNo' : n;
        if (!ok(name)) continue;
        const b = PIECES[n];
        ctx.globalAlpha = Math.min(1, L[n]);
        ctx.drawImage(img[name].i, b[0], b[1], b[2] - b[0], b[3] - b[1]);
      }
      ctx.globalAlpha = 1;
      dust(ctx, t, L);
      if (rig) {
        drawHand(ctx, t, 0.45 + 0.55 * Math.min(1, Math.max(L.hand, L.room)));
        // "You brought the table to me": the approved painting itself, whole
        const whole = S.started ? (S.still ? (t >= T.brought + 4 ? 1 : 0) : clamp01((t - T.brought) / 4)) : 0;
        if (whole > 0 && ok('lit')) { S.inWorld(ctx, t); ctx.globalAlpha = whole; ctx.drawImage(img.lit.i, 0, 0, W, H); ctx.globalAlpha = 1; }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    preload() { if (S.started) ['lit', 'niche', 'fish', 'table', 'hand'].forEach(S.load); if (rigReady) ['litNo', 'tableNo'].forEach(S.load); },
    // the hand: the one thing the visitor does (from "He came looking" on); the story opens it anyway at its own line
    act: { key: 'hand', min: T => T.looking, auto: T => T.opensTo, load: ['hand', 'table', 'lit'] },
    // the keepsake: the lit room (the door, the table, the bread and the cup) and the line to carry
    card: {
      layers: ['lit'], view: [860, 520, 1180], seed: 5021,
      lines: ['“I am the bread of life:', 'he that cometh to me', 'shall never hunger”'], ref: 'J O H N   6 : 3 5', footer: 'Medicine of Immortality · FIND ME',
      paint(g, S) { if (S.ok('lit')) g.drawImage(S.img.lit.i, 0, 0, W, H); }
    }
  });
  if (!S) return;
  T = S.T;
  if (useRig) Promise.all([S.loadRig('hand'), S.load('darkNo')]).then(() => { rigReady = !!S.rig('hand'); S.request(); });
  window.MedicineScene = S;
})();
