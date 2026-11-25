(() => {
  const sections = [...document.querySelectorAll('main > section')];
  const valid = new Set(sections.map(section => section.id));
  const arrival = document.getElementById('arrival');
  const backLink = document.querySelector('[data-back]');
  const backLabel = backLink.querySelector('[data-back-label]');
  const previousSteps = {
    song: { id: 'arrival', label: 'Back to the water' },
    scripture: { id: 'arrival', label: 'Back to water' },
    deeper: { id: 'scripture', label: 'Back to John 4' },
    examine: { id: 'scripture', label: 'Back to John 4' },
    prayer: { id: 'examine', label: 'Back to reflection' },
    rest: { id: 'prayer', label: 'Back to prayer' }
  };
  const STAGE_SCENES = new Set(['arrival', 'song']);
  const scene = window.WellScene;
  const stage = document.querySelector('[data-stage]');
  const audioCard = document.querySelector('.audio-card');
  const sound = audioCard.querySelector('[data-sound]');
  const soundError = audioCard.querySelector('.sound-error');
  const inviteButton = document.querySelector('[data-invite]');
  const inviteStatus = document.querySelector('[data-invite-status]');
  const inviteLink = document.querySelector('[data-invite-link]');
  const storageKey = 'tpot.well.read-john4';
  let revealTimer;
  let activeScene;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => matchMedia('(max-width: 759px)').matches;

  function previousStep(id) {
    if (id === 'examine' && history.state?.wellFrom === 'deeper') return { id: 'deeper', label: 'Back to the reading' };
    if (id === 'scripture' && history.state?.wellFrom === 'song') return { id: 'song', label: 'Back to the song' };
    if (id === 'prayer' && history.state?.wellFrom === 'song') return { id: 'song', label: 'Back to the song' };
    return previousSteps[id];
  }

  /* Home's "Pick up where you left off" card reads this (world.js). Only the place is kept, never an answer. */
  const PLACES = { song: 'In the song', scripture: 'Reading John 4', deeper: 'Reading with the early Church', examine: 'Sitting with it', prayer: 'At the prayer' };
  function rememberPlace(id) {
    try {
      const KEY = 'tpot.world.v1';
      const s = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      const kept = Array.isArray(s.kept) ? s.kept : [];
      let last = s.last || null;
      if (id === 'rest') last = { route: 'storm', pos: 1, at: Date.now(), place: 'Next, after The Well' };
      else if (PLACES[id]) last = { route: 'well', pos: 1, at: Date.now(), href: '/well/#' + id, place: PLACES[id] };
      else return;
      localStorage.setItem(KEY, JSON.stringify({ last, kept }));
    } catch {}
  }

  function show(id, moveFocus = true) {
    activeScene = id;
    clearTimeout(revealTimer);
    arrival.classList.remove('is-touched');
    sections.forEach(section => { section.hidden = section.id !== id; });
    document.body.dataset.scene = id;
    stage.hidden = !STAGE_SCENES.has(id);
    const previous = previousStep(id);
    backLink.hidden = !previous;
    if (previous) {
      backLink.href = `#${previous.id}`;
      backLabel.textContent = previous.label;
    }
    window.scrollTo(0, 0);
    if (moveFocus) document.querySelector(`#${id} h1, #${id} h2`).focus({ preventScroll: true });
    if (id === 'scripture' || id === 'deeper') {
      try { localStorage.setItem(storageKey, '1'); } catch {}
    }
    placeJar(id);
    if (id === 'rest') prepareKeepsake();
    rememberPlace(id);
    if (scene) {
      scene.setFocus(phone() ? 0.56 : id === 'arrival' ? 0.5 : 0.42);
      scene.request();
    }
    updateSong();
    placeWater();
  }

  function fromLocation() {
    const id = window.location.hash.slice(1);
    return valid.has(id) ? id : 'arrival';
  }

  function go(id) {
    if (activeScene === id) return;
    history.pushState({ wellFrom: activeScene }, '', `#${id}`);
    show(id);
  }

  backLink.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const previous = previousStep(activeScene);
    if (!previous) return;
    if (history.state?.wellFrom === previous.id) {
      history.back();
    } else {
      history.replaceState(null, '', `#${previous.id}`);
      show(previous.id);
    }
  });

  document.querySelectorAll('[data-show]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      go(link.dataset.show);
    });
  });

  /* ---------- the water: touching it begins the song ---------- */
  function beginSong(from) {
    if (!scene) return;
    soundError.hidden = true;
    scene.start(from).catch(error => {
      if (error && error.name !== 'AbortError' && error.name !== 'NotAllowedError') soundError.hidden = false;
      updateSong();
    });
  }
  const water = document.querySelector('[data-water]');
  water.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (arrival.classList.contains('is-touched')) return;
    beginSong(scene && !scene.started ? resumeFrom() : undefined);
    if (reduced()) { go('song'); return; }
    const sceneBounds = arrival.getBoundingClientRect();
    const labelBounds = event.currentTarget.querySelector('.water-label').getBoundingClientRect();
    const x = event.detail ? event.clientX : labelBounds.left + labelBounds.width / 2;
    const y = event.detail ? event.clientY : labelBounds.top + labelBounds.height / 2;
    arrival.style.setProperty('--ripple-x', `${x - sceneBounds.left}px`);
    arrival.style.setProperty('--ripple-y', `${y - sceneBounds.top}px`);
    arrival.classList.add('is-touched');
    revealTimer = window.setTimeout(() => go('song'), 710);
  });
  function resumeFrom() {
    const s = scene && scene.saved;
    return s && s.t > 10 && s.t < 230 && location.hash === '#song' ? s.t : 0;
  }
  // "Touch the water" sits on the painted well, wherever the camera has put it
  function placeWater() {
    if (!scene || activeScene !== 'arrival') return;
    const [x, y] = scene.toScreen(1440, 962);
    const r = arrival.getBoundingClientRect(), s = stage.getBoundingClientRect();
    if (!s.width) return;
    water.style.left = `${x + s.left - r.left}px`;
    water.style.top = `${y + s.top - r.top}px`;
  }
  addEventListener('resize', placeWater);

  sound.addEventListener('click', () => {
    if (!scene) return;
    if (!scene.started) beginSong(0);
    go('song');
  });

  /* ---------- the song's controls, lyrics and Scripture ---------- */
  const toggles = [...document.querySelectorAll('[data-song-toggle]')];
  const track = document.querySelector('[data-song-track]');
  const fill = document.querySelector('[data-song-fill]');
  const timeLabel = document.querySelector('[data-song-time]');
  const lineNow = document.querySelector('[data-line-now]');
  const lineNext = document.querySelector('[data-line-next]');
  const note = document.querySelector('[data-note]');
  const noteRef = document.querySelector('[data-note-ref]');
  const noteText = document.querySelector('[data-note-text]');
  const songEnd = document.querySelector('[data-song-end]');
  const mini = document.querySelector('[data-song-mini]');
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  toggles.forEach(b => b.addEventListener('click', () => { soundError.hidden = true; const r = scene && scene.toggle(); if (r && r.catch) r.catch(() => {}); }));

  function buildMoments() {
    if (!scene) return;
    track.querySelectorAll('.song-moment').forEach(m => m.remove());
    const end = scene.duration || 315.5;
    scene.moments.forEach(([at, label]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'song-moment'; b.dataset.track = 'well-moment';
      b.style.left = `${Math.max(0, Math.min(100, at / end * 100))}%`;
      b.setAttribute('aria-label', `Go to: ${label}`);
      b.dataset.label = label;
      b.addEventListener('click', () => { scene.seek(at); });
      track.appendChild(b);
    });
  }
  document.addEventListener('well:timeline', buildMoments);
  buildMoments();
  track.addEventListener('click', event => {
    if (!scene || event.target.closest('.song-moment')) return;
    const r = track.getBoundingClientRect();
    scene.seek(Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)) * (scene.duration || 315.5));
  });

  let lastLine = '';
  let lastNote = '';
  function updateSong() {
    if (!scene) return;
    const t = scene.time, playing = scene.playing, started = scene.started;
    toggles.forEach(b => {
      b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      b.classList.toggle('is-playing', playing);
    });
    mini.hidden = !(started && t > 0 && t < (scene.duration || 315.5) - 0.5 && !STAGE_SCENES.has(activeScene) && (activeScene !== 'rest' || playing));
    sound.textContent = started && playing ? 'Back to the song' : 'Hear the song';
    if (activeScene !== 'song') return;
    const end = scene.duration || 315.5;
    fill.style.width = `${Math.max(0, Math.min(100, (t < 0 ? (scene.saved.t || 0) : t) / end * 100))}%`;
    timeLabel.textContent = fmt(Math.max(0, t));
    // the line being sung, and the next one, faintly
    const cues = scene.cues;
    let now = '', next = '';
    for (let i = 0; i < cues.length; i++) {
      if (t >= cues[i][0] && t < cues[i][1]) { now = cues[i][2]; next = cues[i + 1] && cues[i + 1][0] - cues[i][1] < 4 ? cues[i + 1][2] : ''; break; }
      if (t < cues[i][0]) { if (cues[i][0] - t < 1.2) next = cues[i][2]; break; }
    }
    if (!started) now = scene.saved.t > 10 ? `Continue from ${fmt(scene.saved.t)}` : '';
    if (now !== lastLine) {
      lastLine = now;
      lineNow.textContent = now;
      lineNow.classList.remove('is-new'); void lineNow.offsetWidth; lineNow.classList.add('is-new');
    }
    lineNext.textContent = next;
    // Scripture where the song points to it
    let n = null;
    const notes = scene.notes;
    for (let i = 0; i < notes.length; i++) {
      const until = Math.min(notes[i][0] + 9, notes[i + 1] ? notes[i + 1][0] - 0.3 : Infinity);
      if (t >= notes[i][0] && t < until) n = notes[i];
    }
    const key = n ? n[1] : '';
    if (key !== lastNote) {
      lastNote = key;
      note.hidden = !n;
      if (n) { noteRef.textContent = `${n[1]} · King James Version`; noteText.textContent = `“${n[2]}”`; }
    }
    // the jar: offered from "You know that too" until she leaves it
    const T = scene.T;
    const offer = started && !scene.jarDown && t >= T.knowToo - 0.5 && t < T.auto;
    if (jarSlot === 'song') {
      ask.hidden = !offer;
      done.hidden = !(scene.jarDown && t >= scene.jarDownAt && t < T.jarStood + 4);
      if (document.body.classList.contains('is-asking') !== offer) {
        document.body.classList.toggle('is-asking', offer);
        setTimeout(() => scene.request(), 520);
      }
    }
    songEnd.hidden = !(started && (t >= T.end - 0.5 || scene.time >= end - 1));
  }
  document.addEventListener('well:frame', updateSong);
  const songAudio = document.getElementById('well-song');
  ['play', 'pause', 'ended', 'timeupdate'].forEach(e => songAudio.addEventListener(e, updateSong));
  songAudio.addEventListener('error', () => { soundError.hidden = false; });
  songAudio.addEventListener('ended', () => { songEnd.hidden = false; });

  /* ---------- the jar: name what you keep coming back to, then hold to set it down ---------- */
  const ask = document.querySelector('[data-jar-ask]');
  const done = document.querySelector('[data-jar-done]');
  const own = document.querySelector('[data-jar-own]');
  const hold = document.querySelector('[data-jar-hold]');
  const holdLabel = document.querySelector('[data-jar-hold-label]');
  const choices = [...document.querySelectorAll('[data-jar-choice]')];
  let jarSlot = 'song';
  function placeJar(id) {
    const slot = document.querySelector(`[data-jar-slot="${id}"]`);
    if (!slot) return;
    jarSlot = id;
    slot.appendChild(ask); slot.appendChild(done);
    document.body.classList.remove('is-asking');
    if (id === 'examine') {
      const set = scene && scene.jarDown;
      ask.hidden = !!set; done.hidden = !set;
    }
  }
  function answer(text) {
    if (scene) { scene.answer = text; scene.request(); }
  }
  choices.forEach(b => b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    choices.forEach(c => c.setAttribute('aria-pressed', String(c === b && on)));
    own.value = '';
    answer(on ? b.dataset.jarChoice : '');
  }));
  own.addEventListener('input', () => {
    choices.forEach(c => c.setAttribute('aria-pressed', 'false'));
    answer(own.value.trim().slice(0, 40));
  });
  own.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); own.blur(); } });
  const HOLD_MS = 1200;
  let holdTimer = null, holdStart = 0, raf = 0;
  function holdProgress() {
    const p = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
    hold.style.setProperty('--p', p.toFixed(3));
    if (p < 1) raf = requestAnimationFrame(holdProgress);
  }
  function beginHold(e) {
    if (holdTimer || (scene && scene.jarDown)) return;
    if (e && e.pointerId != null) { try { hold.setPointerCapture(e.pointerId); } catch {} }
    holdStart = performance.now();
    hold.classList.add('is-holding');
    holdLabel.textContent = 'Keep holding';
    raf = requestAnimationFrame(holdProgress);
    holdTimer = setTimeout(completeHold, HOLD_MS);
  }
  function cancelHold() {
    if (!holdTimer) return;
    clearTimeout(holdTimer); holdTimer = null; cancelAnimationFrame(raf);
    hold.classList.remove('is-holding'); hold.style.setProperty('--p', '0');
    holdLabel.textContent = 'Hold to set it down';
  }
  function completeHold() {
    holdTimer = null; cancelAnimationFrame(raf);
    hold.style.setProperty('--p', '1');
    hold.classList.remove('is-holding');
    if (scene) scene.setJarDown();
    // counted once with the site's own measurement (a long press on a phone may not fire a click); never the answer
    try { window.tpotMeasure && window.tpotMeasure.track('click', 'well-jar-set', null, { in: jarSlot }); } catch {}
    ask.hidden = true;
    done.hidden = false;
    document.body.classList.remove('is-asking');
    holdLabel.textContent = 'Hold to set it down';
    updateReturn();
  }
  hold.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); beginHold(e); } });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => hold.addEventListener(t, () => { if (holdTimer) cancelHold(); }));
  hold.addEventListener('contextmenu', e => e.preventDefault());
  hold.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); beginHold(); } });
  hold.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (holdTimer) cancelHold(); } });
  // assistive technology activates with a plain click (no pointer press): set it down at once
  hold.addEventListener('click', e => { if (e.detail === 0 && !holdTimer && !(scene && scene.jarDown)) completeHold(); });

  /* ---------- coming back: the jar is still where you left it ---------- */
  const returnNote = document.querySelector('[data-return]');
  function updateReturn() {
    const s = scene && scene.saved;
    returnNote.hidden = !(s && s.jar);
  }
  updateReturn();

  /* ---------- the keepsake card ---------- */
  const keepsake = document.querySelector('[data-keepsake]');
  const keepImg = document.querySelector('[data-keepsake-img]');
  const keepBtn = document.querySelector('[data-keepsake-save]');
  const keepStatus = document.querySelector('[data-keepsake-status]');
  let keepFile = null;
  let keepUrl = null;
  async function prepareKeepsake() {
    if (!scene || keepFile) return;
    try {
      const blob = await scene.card();
      if (!blob) return;
      keepFile = new File([blob], 'the-well-john-4-15.png', { type: 'image/png' });
      keepUrl = URL.createObjectURL(blob);
      keepImg.src = keepUrl;
      keepsake.hidden = false;
      scene.keep({ done: true });
    } catch { keepsake.hidden = true; }
  }
  keepBtn.addEventListener('click', async () => {
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

  /* ---------- a way back: the home screen ---------- */
  const home = document.querySelector('[data-homescreen]');
  const installBtn = document.querySelector('[data-install]');
  const iosNote = document.querySelector('[data-install-ios]');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferredInstall = null;
  function renderHome() {
    installBtn.hidden = !deferredInstall;
    iosNote.hidden = !(isIOS && !deferredInstall);
    home.hidden = standalone || (installBtn.hidden && iosNote.hidden);
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; renderHome(); });
  addEventListener('appinstalled', () => { deferredInstall = null; home.hidden = true; });
  installBtn.addEventListener('click', () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.finally(() => { deferredInstall = null; renderHome(); });
  });
  renderHome();

  /* ---------- invitation (unchanged) ---------- */
  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(inviteLink.href);
      inviteStatus.textContent = 'Link copied. Paste it into a message to someone.';
    } catch {
      inviteLink.hidden = false;
      inviteLink.textContent = inviteLink.href;
      inviteStatus.textContent = 'Press and hold the link to copy it.';
    }
  }
  inviteButton.addEventListener('click', async () => {
    const invitation = {
      title: 'Come and See',
      text: 'I thought of you when I read this. Come to the Well with me.',
      url: inviteLink.href
    };
    inviteStatus.textContent = '';
    if (typeof navigator.share !== 'function') {
      await copyInvitation();
      return;
    }
    try {
      await navigator.share(invitation);
    } catch (error) {
      if (error.name !== 'AbortError') await copyInvitation();
    }
  });
  inviteLink.hidden = true;
  inviteButton.hidden = false;

  function restoreLocation() {
    const id = fromLocation();
    if (id !== activeScene) show(id);
  }
  addEventListener('popstate', restoreLocation);
  addEventListener('hashchange', restoreLocation);

  audioCard.hidden = false;
  show(fromLocation(), false);
  requestAnimationFrame(placeWater);
  document.addEventListener('well:frame', () => { if (activeScene === 'arrival') placeWater(); });
})();
