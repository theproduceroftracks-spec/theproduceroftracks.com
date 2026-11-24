/* FIND ME player face (Nov 24, 2026 preview).
   Presentation only. album.js still owns the <audio>, track order, seeking, lock-screen controls and the
   listen counter; story.js still owns the chapter reader and Continue. This file draws one transport
   (play/pause, previous, next, position) and a small now-playing dock, and drives the SAME audio element
   and the SAME track buttons, exactly as a visitor's tap on them would. It stores nothing and sends nothing.
   Without JavaScript the browser's own audio controls stay, as before. */
(() => {
  const audio = document.getElementById('album-audio');
  const tracks = [...document.querySelectorAll('.track')];
  const player = document.querySelector('.album-player');
  const transport = document.querySelector('[data-np-transport]');
  const seek = document.getElementById('album-position');
  if (!audio || !tracks.length || !player || !transport) return;

  const root = document.documentElement;
  const titleOut = player.querySelector('[data-np-title]');
  const subOut = player.querySelector('[data-np-sub]');
  const durOut = player.querySelector('[data-np-dur]');
  const reader = document.getElementById('chapter-reader');
  let current = Math.max(0, tracks.findIndex(t => t.getAttribute('aria-current') === 'true'));

  const title = i => tracks[i].firstElementChild.textContent;
  const listed = i => tracks[i].querySelector('.track-length')?.textContent || '';
  const fmt = s => {
    if (!Number.isFinite(s) || s < 0) return '';
    const t = Math.floor(s);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  const playing = () => !audio.paused && !audio.ended;

  /* the custom transport replaces the native bar (kept for no-JS visitors) */
  audio.removeAttribute('controls');
  transport.hidden = false;
  root.classList.add('np-ready');

  /* Play a track the way a tap on its row does, without moving the reader's place on the page. */
  function playTrack(i, keepPlace) {
    if (i < 0 || i >= tracks.length) return;
    const x = scrollX, y = scrollY, focus = document.activeElement;
    tracks[i].click();
    if (keepPlace) requestAnimationFrame(() => { scrollTo(x, y); focus?.focus?.({ preventScroll: true }); });
  }
  function toggle() {
    if (playing()) { audio.pause(); return; }
    if (audio.error) audio.load();
    audio.play().catch(() => {});      // same as pressing play on the browser's own bar
  }
  function prev(keepPlace) {
    if (audio.currentTime > 3 || current === 0) { audio.currentTime = 0; return; }
    playTrack(current - 1, keepPlace);
  }
  function next(keepPlace) { if (current < tracks.length - 1) playTrack(current + 1, keepPlace); }

  transport.addEventListener('click', e => {
    const b = e.target.closest('[data-np]'); if (!b) return;
    if (b.dataset.np === 'toggle') toggle();
    if (b.dataset.np === 'prev') prev(true);
    if (b.dataset.np === 'next') next(true);
  });

  /* ---------- now-playing dock: appears once the album has started and the player is off screen ---------- */
  const dock = document.createElement('div');
  dock.className = 'np-dock';
  dock.hidden = true;
  dock.setAttribute('role', 'region');
  dock.setAttribute('aria-label', 'Now playing');
  dock.innerHTML = `
    <div class="np-dock-bar" aria-hidden="true"><span data-dock-fill></span></div>
    <button type="button" class="np-dock-open" data-track="dock-open" aria-label="Back to the album player">
      <img src="/assets/find-me-cover.jpg" width="1000" height="1000" alt="">
      <span class="np-dock-text"><strong data-dock-title></strong><span data-dock-sub></span></span>
    </button>
    <div class="np-dock-controls">
      <button type="button" class="np-btn" data-dock="prev" data-track="dock-prev" aria-label="Previous track">${icon('prev')}</button>
      <button type="button" class="np-btn np-play" data-dock="toggle" data-track="dock-toggle" aria-label="Play">${icon('play')}${icon('pause')}</button>
      <button type="button" class="np-btn" data-dock="next" data-track="dock-next" aria-label="Next track">${icon('next')}</button>
    </div>`;
  document.body.appendChild(dock);
  const dockFill = dock.querySelector('[data-dock-fill]');
  dock.addEventListener('click', e => {
    const b = e.target.closest('[data-dock]');
    if (b) {
      if (b.dataset.dock === 'toggle') toggle();
      if (b.dataset.dock === 'prev') prev(true);
      if (b.dataset.dock === 'next') next(true);
      return;
    }
    if (e.target.closest('.np-dock-open')) {
      document.getElementById('listening-start').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      document.getElementById('now-playing')?.focus({ preventScroll: true });
    }
  });

  let playerVisible = true;
  let started = false;
  function placeDock() {
    const show = started && !playerVisible && !reader?.open;
    if (dock.hidden === !show) return;
    dock.hidden = !show;
    root.classList.toggle('np-docked', show);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      playerVisible = entries.some(e => e.isIntersecting);
      placeDock();
    }, { rootMargin: '-64px 0px 0px 0px' }).observe(player);
  }
  if (reader) new MutationObserver(placeDock).observe(reader, { attributes: true, attributeFilter: ['open'] });

  /* ---------- render ---------- */
  function renderTrack() {
    const n = `Track ${current + 1} of ${tracks.length}`;
    if (titleOut) titleOut.textContent = title(current);
    if (subOut) subOut.textContent = `${n} · FIND ME`;
    dock.querySelector('[data-dock-title]').textContent = title(current);
    dock.querySelector('[data-dock-sub]').textContent = n;
    renderTime();
  }
  function renderTime() {
    const d = audio.duration;
    if (durOut) durOut.textContent = fmt(Math.round(d)) || listed(current);   // rounded, like the tracklist
    const p = Number.isFinite(d) && d > 0 ? Math.min(1, audio.currentTime / d) : 0;
    dockFill.style.transform = `scaleX(${p})`;
    if (seek && document.activeElement !== seek) seek.style.setProperty('--p', p);
  }
  function renderState() {
    const on = playing();
    root.classList.toggle('np-playing', on);
    [transport.querySelector('[data-np="toggle"]'), dock.querySelector('[data-dock="toggle"]')].forEach(b => {
      b.setAttribute('aria-label', on ? 'Pause' : 'Play');
      b.classList.toggle('is-playing', on);
    });
    if (on && !started) { started = true; placeDock(); }
  }
  seek?.addEventListener('input', () => {
    const max = Number(seek.max) || 0;
    seek.style.setProperty('--p', max ? Number(seek.value) / max : 0);
  });

  document.addEventListener('tpot:album-track-change', e => { current = e.detail.track - 1; renderTrack(); });
  ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked', 'emptied'].forEach(ev => audio.addEventListener(ev, renderTime));
  ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(ev => audio.addEventListener(ev, renderState));

  renderTrack();
  renderState();

  function icon(name) {
    const paths = {
      play: '<path d="M8 5.2v13.6L19 12z" fill="currentColor"/>',
      pause: '<path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor"/>',
      prev: '<path d="M6 5h2.2v14H6zM19 5.2v13.6L9.4 12z" fill="currentColor"/>',
      next: '<path d="M15.8 5H18v14h-2.2zM5 5.2v13.6L14.6 12z" fill="currentColor"/>'
    };
    return `<svg class="i-${name}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  }
})();
