/* Medicine of Immortality · progressive enhancement only.
   Without this file every passage is visible in reading order and the links still work.
   It plays no sound itself: the only music is the album player on /find-me/. */
(() => {
  const root = document.documentElement;
  root.classList.add('js');

  /* 1. The light follows the reading: as each movement comes into view the room changes. */
  const hero = document.querySelector('.hero .art');
  const order = { hidden: 0, recognize: 1, open: 2 };
  if ('IntersectionObserver' in window && hero) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const want = e.target.dataset.scene;
        if (order[want] > order[hero.dataset.state]) hero.dataset.state = want;
      });
    }, { rootMargin: '0px 0px -55% 0px' });
    document.querySelectorAll('[data-scene]').forEach(s => io.observe(s));
  }

  /* 2. What keeps your hand closed? Choosing opens the matching passage and the door. Nothing is stored. */
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
      if (hero) hero.dataset.state = 'open';
      answers.querySelector(`[data-for="${b.dataset.answer}"] h4`).focus();
    });
    all.addEventListener('click', () => {
      answers.classList.add('all');
      if (openArt) openArt.dataset.state = 'open';
      all.hidden = true;
      answers.querySelector('h4').focus();
    });
  }

  /* 3. "Read as text": show every passage at once. */
  document.querySelectorAll('[data-whole]').forEach(a => a.addEventListener('click', () => {
    answers?.classList.add('all');
    if (all) all.hidden = true;
  }));

  /* 4. Opened inside the FIND ME reader: offer the album player, explicitly. */
  let albumPage = null;
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin &&
        window.parent.location.pathname.startsWith('/find-me')) albumPage = window.parent;
  } catch { albumPage = null; }
  const play = document.querySelector('[data-album-play]');
  const link = document.querySelector('[data-album-link]');
  if (albumPage) root.classList.add('in-reader');
  if (albumPage && play) {
    play.hidden = false;
    if (link) link.hidden = true;
    play.addEventListener('click', () => albumPage.postMessage({ type: 'tpot:play-track', track: 5 }, location.origin));
  }
})();
