/* The Blood Still Speaks · progressive enhancement only.
   Without this file the whole passage, every speaker label and the reading on Abel’s missing words are visible in order.
   It plays no sound itself: the only music is the album player on /find-me/. Nothing is stored or sent. */
(() => {
  const root = document.documentElement;
  root.classList.add('js');

  const art = document.querySelector('[data-art]');
  const group = document.querySelector('[data-speakers]');
  const passage = document.querySelector('[data-passage]');
  const finding = document.querySelector('[data-finding]');
  const abel = document.querySelector('[data-abel]');

  /* Who speaks in Genesis 4? The findings are counted from the marked passage, not typed in. */
  const count = who => passage.querySelectorAll(`.say[data-who="${who}"] .who`).length;
  const times = n => ['never', 'once', 'twice', 'three times', 'four times', 'five times'][n] || `${n} times`;
  const say = {
    god: n => `God speaks ${times(n)}: to Cain before the harm (4:6–7), after it (4:9–12), and when Cain fears for his own life (4:15).`,
    cain: n => `Cain speaks ${times(n)}: to deny (4:9) and to fear for himself (4:13–14). Genesis says he “talked with Abel” (4:8) but gives no words.`,
    eve: n => `Eve speaks ${times(n)}, when Cain is born (4:1).`,
    abel: () => 'Genesis records no spoken words from Abel. The only voice it gives him is his blood, crying to God from the ground (4:10).'
  };
  if (group && passage && finding) {
    group.hidden = false;
    group.addEventListener('click', e => {
      const b = e.target.closest('button[data-who]'); if (!b) return;
      const who = b.dataset.who;
      group.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      passage.dataset.show = who;
      finding.textContent = say[who](count(who));
      const heard = who === 'abel';
      if (heard && abel) {
        abel.classList.add('on');
        if (art) art.dataset.state = 'heard';
        abel.querySelector('h3').focus({ preventScroll: true });
        abel.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    });
  }

  /* "Read as text": show everything, including the Abel reading and the deeper sections. */
  document.querySelectorAll('[data-whole]').forEach(a => a.addEventListener('click', () => {
    abel?.classList.add('on');
    document.querySelectorAll('details.deep').forEach(d => { d.open = true; });
  }));

  /* Opened inside the FIND ME reader: offer the album player explicitly. Same track = same place in it. */
  let albumPage = null;
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin &&
        window.parent.location.pathname.startsWith('/find-me')) albumPage = window.parent;
  } catch { albumPage = null; }
  if (albumPage) {
    root.classList.add('in-reader');
    document.querySelectorAll('[data-album-play]').forEach(b => {
      b.hidden = false;
      b.addEventListener('click', () => albumPage.postMessage({ type: 'tpot:play-track', track: 4 }, location.origin));
    });
    document.querySelectorAll('[data-album-link]').forEach(a => { a.hidden = true; });
  }
})();
