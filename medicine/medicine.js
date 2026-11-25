/* Medicine of Immortality · progressive enhancement only.
   Without this file every passage is visible in reading order and the links still work.
   With it: the painted room comes alive with the whole song (the shared kit, /assets/tpot-scene.js, and scene.js).
   The song plays on this page; inside the FIND ME reader it plays on the album player, so there is only one sound. */
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const scene = window.MedicineScene;

  /* 1. What keeps your hand closed? Choosing opens the matching passage and the door. Nothing is stored. */
  const choices = document.querySelector('[data-choices]');
  const answers = document.querySelector('[data-answers]');
  const all = document.querySelector('[data-show-all]');
  const openArt = document.querySelector('.art-open');
  if (choices && answers) {
    choices.hidden = false;
    all.hidden = false;
    choices.addEventListener('click', e => {
      const b = e.target.closest('[data-answer]'); if (!b) return;
      choices.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      answers.querySelectorAll('.answer').forEach(a => a.classList.toggle('on', a.dataset.for === b.dataset.answer));
      if (openArt) openArt.dataset.state = 'open';
      answers.querySelector(`[data-for="${b.dataset.answer}"] h4`).focus();
    });
    all.addEventListener('click', () => {
      answers.classList.add('all');
      if (openArt) openArt.dataset.state = 'open';
      all.hidden = true;
      answers.querySelector('h4').focus();
    });
  }

  /* 2. "Read as text": show every passage at once. */
  document.querySelectorAll('[data-whole]').forEach(a => a.addEventListener('click', () => {
    answers?.classList.add('all');
    if (all) all.hidden = true;
  }));

  /* 3. Opened inside the FIND ME reader: the album player is the only music. */
  let albumPage = null;
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin &&
        window.parent.location.pathname.startsWith('/find-me')) albumPage = window.parent;
  } catch { albumPage = null; }
  const play = document.querySelector('[data-album-play]');
  const link = document.querySelector('[data-album-link]');
  if (albumPage) root.classList.add('in-reader');
  if (albumPage && play && !scene) {
    play.hidden = false;
    if (link) link.hidden = true;
    play.addEventListener('click', () => albumPage.postMessage({ type: 'tpot:play-track', track: 5 }, location.origin));
  }
  if (!scene) return;

  /* 4. The song, living: the painting follows it; "#song" is the song over the painting, anything else is the page. */
  const begin = document.querySelector('[data-song-begin]');
  const panel = document.getElementById('song');
  const stage = document.querySelector('[data-stage]');
  const phone = () => matchMedia('(max-width: 759px)').matches;
  const inSong = () => location.hash === '#song';
  begin.hidden = false;
  if (play) play.hidden = true;
  if (link) link.hidden = true;

  const ui = TPoTScene.controls(scene, {
    name: 'medicine', audio: 'medicine-song', duration: 340.6, actKey: 'hand', cardName: 'medicine-of-immortality-john-6-35.png', inSong,
    actWindow: T => [T.looking, T.opensTo], onEnd: () => ui.prepareKeepsake()
  });

  /* Home's "Pick up where you left off" card reads this (world.js). Only the place is kept, never an answer. */
  const PLACES = { song: 'In the song', pray: 'At the prayer', keep: 'A line to carry' };
  function remember() {
    try {
      const KEY = 'tpot.world.v1', id = location.hash.slice(1);
      const s = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      const kept = Array.isArray(s.kept) ? s.kept : [];
      let last;
      if (id === 'keep' && scene.saved.done) last = { route: 'storm', pos: 1, at: Date.now(), place: 'Next, after Medicine' };
      else if (PLACES[id]) last = { route: 'medicine', pos: 1, at: Date.now(), href: '/medicine/#' + id, place: PLACES[id] };
      else return;
      localStorage.setItem(KEY, JSON.stringify({ last, kept }));
    } catch {}
  }

  function mode(moveFocus) {
    const on = inSong();
    panel.hidden = !on;
    document.body.classList.toggle('is-song', on);
    scene.setFocus(on && !phone() ? 0.42 : 0.5);
    remember();
    ui.update();
    if (on && moveFocus) panel.querySelector('h2').focus({ preventScroll: true });
    if (on) window.scrollTo(0, 0);
    else if (moveFocus && location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    if (location.hash === '#keep') ui.prepareKeepsake();
  }
  const resumeFrom = () => scene.saved.t > 10 && scene.saved.t < scene.T.brought ? scene.saved.t : 0;
  begin.addEventListener('click', () => {
    if (!scene.started) scene.start(resumeFrom()).catch(() => {});
    else if (!scene.playing) scene.toggle();
    if (!inSong()) history.pushState(null, '', '#song');
    mode(true);
  });
  addEventListener('hashchange', () => mode(true));
  addEventListener('popstate', () => mode(true));

  // draw only while the painting can be seen; make the card when its place comes near
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => es.forEach(e => { stage.dataset.idle = e.isIntersecting ? '' : '1'; if (e.isIntersecting) scene.request(); })).observe(stage);
    const keep = document.getElementById('keep');
    new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); ui.prepareKeepsake(); } }, { rootMargin: '300px 0px' }).observe(keep);
  }
  addEventListener('resize', () => scene.setFocus(inSong() && !phone() ? 0.42 : 0.5));
  mode(false);
})();
