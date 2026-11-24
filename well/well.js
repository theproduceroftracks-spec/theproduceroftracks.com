(() => {
  const sections = [...document.querySelectorAll('main > section')];
  const valid = new Set(sections.map(section => section.id));
  const arrival = document.getElementById('arrival');
  const backLink = document.querySelector('[data-back]');
  const backLabel = backLink.querySelector('[data-back-label]');
  const previousSteps = {
    scripture: { id: 'arrival', label: 'Back to water' },
    deeper: { id: 'scripture', label: 'Back to John 4' },
    examine: { id: 'scripture', label: 'Back to John 4' },
    prayer: { id: 'examine', label: 'Back to reflection' },
    rest: { id: 'prayer', label: 'Back to prayer' }
  };
  const audioCard = document.querySelector('.audio-card');
  const audio = audioCard.querySelector('audio');
  const sound = audioCard.querySelector('[data-sound]');
  const arrivalSound = document.querySelector('[data-arrival-sound]');
  const soundError = audioCard.querySelector('.sound-error');
  const inviteButton = document.querySelector('[data-invite]');
  const inviteStatus = document.querySelector('[data-invite-status]');
  const inviteLink = document.querySelector('[data-invite-link]');
  const storageKey = 'tpot.well.read-john4';
  let revealTimer;
  let hasReadScripture = false;
  let activeScene;
  let musicStarted = false;
  let resumeAfterRest = false;
  try { hasReadScripture = localStorage.getItem(storageKey) === '1'; } catch {}

  function stopExcerpt() {
    audio.pause();
    audio.currentTime = 0;
  }

  function updateSound() {
    const isPlaying = !audio.paused && !audio.ended;
    sound.textContent = isPlaying ? 'Pause excerpt' : 'Play excerpt';
    arrivalSound.textContent = isPlaying ? 'Pause music' : 'Play music';
  }

  function startExcerpt() {
    if (!audio.paused) return;
    soundError.hidden = true;
    audio.play().catch(error => {
      if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') soundError.hidden = false;
      updateSound();
    });
  }

  function startEntryMusic() {
    if (!musicStarted) startExcerpt();
  }

  function previousStep(id) {
    if (id === 'examine' && history.state?.wellFrom === 'deeper') {
      return { id: 'deeper', label: 'Back to the reading' };
    }
    return previousSteps[id];
  }

  function show(id, moveFocus = true) {
    activeScene = id;
    resumeAfterRest = id === 'rest';
    clearTimeout(revealTimer);
    arrival.classList.remove('is-touched');
    if (id !== 'scripture') stopExcerpt();
    sections.forEach(section => { section.hidden = section.id !== id; });
    const previous = previousStep(id);
    backLink.hidden = !previous;
    if (previous) {
      backLink.href = `#${previous.id}`;
      backLabel.textContent = previous.label;
    }
    window.scrollTo(0, 0);
    if (moveFocus) document.querySelector(`#${id} h1, #${id} h2`).focus({ preventScroll: true });
    if (id === 'scripture' || id === 'deeper') {
      hasReadScripture = true;
      try { localStorage.setItem(storageKey, '1'); } catch {}
    }
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
      if (activeScene === 'arrival' && link.dataset.show === 'scripture') startEntryMusic();
      go(link.dataset.show);
    });
  });

  document.querySelector('[data-water]').addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (arrival.classList.contains('is-touched')) return;
    startEntryMusic();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      go('scripture');
      return;
    }
    const sceneBounds = arrival.getBoundingClientRect();
    const labelBounds = event.currentTarget.querySelector('.water-label').getBoundingClientRect();
    const x = event.detail ? event.clientX : labelBounds.left + labelBounds.width / 2;
    const y = event.detail ? event.clientY : labelBounds.top + labelBounds.height / 2;
    arrival.style.setProperty('--ripple-x', `${x - sceneBounds.left}px`);
    arrival.style.setProperty('--ripple-y', `${y - sceneBounds.top}px`);
    arrival.classList.add('is-touched');
    revealTimer = window.setTimeout(() => go('scripture'), 710);
  });

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

  function toggleExcerpt() {
    if (audio.paused) startExcerpt();
    else audio.pause();
  }
  sound.addEventListener('click', toggleExcerpt);
  arrivalSound.addEventListener('click', toggleExcerpt);
  arrivalSound.hidden = false;
  audio.addEventListener('playing', () => {
    musicStarted = true;
    updateSound();
  });
  ['pause', 'ended'].forEach(event => audio.addEventListener(event, updateSound));
  audio.addEventListener('error', () => { soundError.hidden = false; });
  function restoreLocation() {
    const id = fromLocation();
    if (id !== activeScene) show(id);
  }

  addEventListener('popstate', restoreLocation);
  addEventListener('hashchange', restoreLocation);

  function returnToScripture() {
    history.replaceState(null, '', '#scripture');
    show('scripture');
  }

  // Reopening after explicitly leaving can resume the reading. The water
  // and every other active step stay put when the app is only backgrounded.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
    else if (resumeAfterRest && activeScene === 'rest' && hasReadScripture) {
      returnToScripture();
    }
  });
  addEventListener('pagehide', () => {
    resumeAfterRest = false;
    audio.pause();
  });

  audioCard.hidden = false;
  if (!location.hash && hasReadScripture) returnToScripture();
  else show(fromLocation(), false);
  if (activeScene === 'arrival') startEntryMusic();
})();
