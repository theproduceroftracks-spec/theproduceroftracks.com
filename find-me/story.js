/* FIND ME stories: chapter reader, resume, track playback from stories, and The Roof verdict.
   Works alongside album.js without changing it: it drives the same <audio> element and the same
   track buttons, so album playback and the private listen reporting stay exactly as they are.
   Without JavaScript every story link is an ordinary link and the whole Roof chapter reads as text. */
(() => {
  const audio = document.getElementById('album-audio');
  const trackButtons = [...document.querySelectorAll('.track')];
  if (!audio || !trackButtons.length) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  document.addEventListener('tpot:album-track-change', e => { current = e.detail.track - 1; updateMini(); });

  const title = i => trackButtons[i].firstElementChild.textContent;

  // Play a track without leaving the reader's place on the page.
  function playTrack(i) {
    if (i < 0 || i >= trackButtons.length) return;
    const x = scrollX, y = scrollY, focus = document.activeElement;
    trackButtons[i].click();                       // album.js selects, plays and scrolls to the player
    requestAnimationFrame(() => { scrollTo(x, y); focus?.focus?.({ preventScroll: true }); });
  }

  /* ---------- mini controls (inside the chapter reader) ---------- */
  const reader = document.getElementById('chapter-reader');
  const mini = reader?.querySelector('[data-mini]');
  function updateMini() {
    if (!mini) return;
    mini.querySelector('[data-mini-now]').textContent = `${current + 1} of ${trackButtons.length} · ${title(current)}`;
    const playing = !audio.paused && !audio.ended;
    const toggle = mini.querySelector('[data-mini="toggle"]');
    toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    mini.querySelector('[data-mini-icon]').textContent = playing ? '❚❚' : '▶';
  }
  ['play', 'pause', 'ended', 'playing'].forEach(ev => audio.addEventListener(ev, updateMini));
  mini?.addEventListener('click', e => {
    const b = e.target.closest('[data-mini]'); if (!b) return;
    const act = b.dataset.mini;
    if (act === 'toggle') { if (audio.paused) { pauseFrameMedia(); audio.play().catch(() => {}); } else audio.pause(); }
    if (act === 'prev') playTrack(audio.currentTime > 3 ? current : current - 1);
    if (act === 'next') playTrack(current + 1);
  });

  /* ---------- chapter reader: story pages open over the album, so playback continues ---------- */
  const frame = reader?.querySelector('[data-reader-frame]');
  const readerTitle = reader?.querySelector('#reader-title');
  const pageLink = reader?.querySelector('[data-reader-page]');
  const note = reader?.querySelector('[data-reader-note]');
  let opener = null;

  function frameDoc() { try { return frame.contentDocument; } catch { return null; } }
  function pauseFrameMedia() { frameDoc()?.querySelectorAll('audio, video').forEach(m => m.pause()); }

  function openChapter(link) {
    opener = link;
    readerTitle.textContent = link.dataset.chapter;
    pageLink.href = link.getAttribute('href');
    frame.src = link.getAttribute('href');
    note.hidden = true;
    updateMini();
    reader.showModal();
    reader.querySelector('[data-reader-close]').focus();
  }
  function closeChapter() {
    if (!reader.open) return;
    pauseFrameMedia();
    reader.close();
  }
  reader?.addEventListener('close', () => {
    frame.removeAttribute('src');                  // stop the chapter page and free memory
    frame.src = 'about:blank';
    opener?.focus({ preventScroll: false });
  });
  reader?.querySelector('[data-reader-close]').addEventListener('click', closeChapter);

  frame?.addEventListener('load', () => {
    const doc = frameDoc(); if (!doc || !frame.contentWindow) return;
    const path = frame.contentWindow.location.pathname;
    // A link inside a chapter that leads back to the album closes the reader instead of nesting the album.
    if (path.startsWith('/find-me')) {
      const hash = frame.contentWindow.location.hash;
      closeChapter();
      if (hash) location.hash = hash;
      return;
    }
    pageLink.href = frame.contentWindow.location.href;
    // Only one sound at a time: a chapter's own audio pauses the album, and the album pauses the chapter.
    // Inside the reader the album player is the only source of music. A chapter's own sound
    // (its <audio>/<video>, or a YouTube embed, which plays in a separate frame we cannot observe)
    // is held, and the reader points to the standalone chapter page for that playback.
    const win = frame.contentWindow;
    const hold = () => {
      pauseFrameMedia();
      note.textContent = 'In the reader, music comes from the album player. To hear this chapter’s own audio or video, open it as a page.';
      note.hidden = false;
    };
    win.addEventListener('play', e => { if (e.target.matches?.('audio, video')) { e.target.pause(); hold(); } }, true);
    if ([...doc.querySelectorAll('audio, video')].some(m => !m.paused)) hold();
    // Click-to-load video players: stop the click before the chapter's own handler builds the embed.
    win.addEventListener('click', e => {
      const btn = e.target.closest?.('.player[data-yt] .play, [data-yt] button');
      if (!btn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      hold();
    }, true);
    // Any media embed that still appears (another code path, a future chapter) is removed before it can play.
    const isMediaEmbed = el => el.tagName === 'IFRAME' &&
      /(^|\.)(youtube(-nocookie)?\.com|youtu\.be|vimeo\.com|spotify\.com|soundcloud\.com)$/i.test((() => { try { return new URL(el.src, win.location.href).hostname; } catch { return ''; } })());
    const sweep = root => {
      (root.tagName ? [root, ...root.querySelectorAll('iframe')] : [...root.querySelectorAll('iframe')])
        .filter(isMediaEmbed).forEach(f => { f.removeAttribute('src'); f.remove(); hold(); });
    };
    sweep(doc);
    new win.MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) sweep(n); })))
      .observe(doc.documentElement, { childList: true, subtree: true });
    doc.addEventListener('keydown', e => { if (e.key === 'Escape') closeChapter(); });
  });
  audio.addEventListener('play', () => { if (reader?.open) pauseFrameMedia(); });

  if (reader && typeof reader.showModal === 'function') {
    document.querySelectorAll('a.story-open[data-chapter]').forEach(a => {
      a.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;   // let "open in new tab" work
        e.preventDefault();
        openChapter(a);
      });
    });
  }

  // A chapter open in the reader may ask, on the visitor's explicit tap, to play its song in the album player.
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !reader?.open || e.source !== frame?.contentWindow) return;
    const n = Number(e.data?.type === 'tpot:play-track' && e.data.track);
    if (Number.isInteger(n) && n >= 1 && n <= trackButtons.length) playTrack(n - 1);
  });

  /* ---------- play a track from a chapter ---------- */
  document.querySelectorAll('[data-play-track]').forEach(b => {
    b.hidden = false;
    b.addEventListener('click', () => playTrack(Number(b.dataset.playTrack) - 1));
  });

  /* ---------- resume where you left off (this browser only) ---------- */
  const KEY = 'tpot-find-me-resume';
  const resume = document.getElementById('resume-album');
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
  if (resume && saved && Number.isInteger(saved.t) && saved.t >= 0 && saved.t < trackButtons.length &&
      (saved.t > 0 || saved.s > 10)) {
    resume.textContent = `Continue: ${saved.t + 1} · ${title(saved.t)} at ${fmt(saved.s || 0)}`;
    resume.hidden = false;
    resume.addEventListener('click', () => {
      const seek = document.getElementById('album-position');
      const go = () => {
        if (saved.s > 1 && seek && !seek.disabled) {
          seek.value = Math.floor(saved.s);
          seek.dispatchEvent(new Event('change'));   // album.js handles the jump, including hosts without byte ranges
        }
      };
      if (saved.t === current && Number.isFinite(audio.duration)) { go(); audio.play().catch(() => {}); }
      else { audio.addEventListener('loadedmetadata', go, { once: true }); trackButtons[saved.t].click(); }
      resume.hidden = true;
    });
  }
  let lastSave = 0;
  function save(force) {
    const now = Date.now();
    if (!force && now - lastSave < 5000) return;
    lastSave = now;
    try { localStorage.setItem(KEY, JSON.stringify({ t: current, s: Math.floor(audio.currentTime || 0) })); } catch {}
  }
  audio.addEventListener('timeupdate', () => save(false));
  audio.addEventListener('pause', () => save(true));
  audio.addEventListener('seeked', () => save(true));
  audio.addEventListener('ended', () => {
    try { if (current === trackButtons.length - 1) localStorage.removeItem(KEY); } catch {}
  });

  /* ---------- back from another tab ----------
     Some browsers (notably iOS) may pause or suspend audio in a background tab. If the album was playing when
     this tab was hidden and is paused when it comes back, offer one tap to resume at the latest real position.
     Never autoplays. No prompt if it is still playing. A discarded page is reloaded by the browser and the
     existing Continue button (same storage key) covers it. Nothing new is stored or sent. */
  let away = null;                                   // { t, s } at the moment the tab was hidden
  const back = document.createElement('div');
  back.className = 'return-prompt';
  back.hidden = true;
  back.setAttribute('role', 'status');
  back.innerHTML = '<p>Paused while you were away.</p><button type="button" class="button primary"></button>';
  const backBtn = back.querySelector('button');
  const playerBox = document.querySelector('.album-player');
  let backAt = null;
  function hideBack() { back.hidden = true; backAt = null; }
  // Keep a pending prompt reachable: inside the reader while it is open, back on the album player when it closes.
  function placeBack() {
    if (reader?.open) reader.insertBefore(back, note); else if (playerBox) playerBox.appendChild(back);
  }
  if (reader) new MutationObserver(() => { if (!back.hidden) placeBack(); }).observe(reader, { attributes: true, attributeFilter: ['open'] });
  function offerBack() {
    const was = away; away = null;
    if (!was || !audio.paused || audio.ended) return;
    // Latest actual position: the live element's time (it may have moved on in the background, even to the
    // next track), and never earlier than where it was when the tab was hidden.
    const s = current === was.t ? Math.max(audio.currentTime || 0, was.s) : (audio.currentTime || 0);
    backAt = { t: current, s };
    backBtn.textContent = `▶ Resume ${current + 1} · ${title(current)} at ${fmt(s)}`;
    placeBack();
    back.hidden = false;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      away = !audio.paused && !audio.ended ? { t: current, s: audio.currentTime || 0 } : null;
      if (away) save(true);                          // same key as Continue, latest position
    } else offerBack();
  });
  addEventListener('pageshow', e => { if (e.persisted) offerBack(); });
  // Any newer choice by the listener (play, a seek, another track) retires the offer, so it can never rewind them.
  audio.addEventListener('play', hideBack);
  audio.addEventListener('seeked', hideBack);
  document.addEventListener('tpot:album-track-change', hideBack);
  backBtn.addEventListener('click', () => {
    if (!backAt || backAt.t !== current) return hideBack();
    const { t, s } = backAt;
    hideBack();
    const seekBox = document.getElementById('album-position');
    const go = () => {
      if (current !== t || Math.abs((audio.currentTime || 0) - s) < 1) return;   // the listener moved on meanwhile
      if (seekBox && !seekBox.disabled) { seekBox.value = Math.floor(s); seekBox.dispatchEvent(new Event('change')); }
      else { try { audio.currentTime = s; } catch {} }
    };
    if (t === current && audio.readyState > 0 && Number.isFinite(audio.duration)) { go(); audio.play().catch(() => {}); }
    else { audio.addEventListener('loadedmetadata', go, { once: true }); trackButtons[t].click(); }
  });

  /* ---------- The Roof: you are the judge ---------- */
  const verdict = document.getElementById('roof-verdict');
  if (verdict) {
    const choice = verdict.querySelector('.verdict-choice');
    const steps = [...verdict.querySelectorAll('.verdict-step')];
    const mine = verdict.querySelector('.verdict-mine');
    const toNathan = verdict.querySelector('[data-reveal="nathan"]');
    const all = verdict.querySelector('[data-verdict-all]');
    const answers = {
      repay: 'You asked for repayment. David went further.',
      die: 'You chose the harshest sentence. So did David.',
      unsure: 'You held back. David did not.'
    };
    const show = (step, focus) => {
      step.hidden = false;
      step.classList.toggle('arrive', !calm.matches);
      if (focus) step.querySelector('[tabindex="-1"]').focus();
    };
    steps.forEach(s => { s.hidden = true; });
    choice.hidden = false;
    all.hidden = false;
    choice.addEventListener('click', e => {
      const b = e.target.closest('[data-verdict]'); if (!b) return;
      choice.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      mine.textContent = answers[b.dataset.verdict];
      show(steps[0], true);
      toNathan.hidden = false;
    });
    toNathan.addEventListener('click', () => { toNathan.hidden = true; show(steps[1], true); });
    all.addEventListener('click', () => {
      steps.forEach(s => { s.hidden = false; s.classList.remove('arrive'); });
      toNathan.hidden = true;
      all.hidden = true;
      steps[0].querySelector('[tabindex="-1"]').focus();
    });
  }

  updateMini();
})();
