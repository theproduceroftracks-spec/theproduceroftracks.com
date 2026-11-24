(() => {
  const byId = id => document.getElementById(id);
  const stages = ['roof', 'seal', 'truth', 'pray'];
  const stageNames = {roof: 'The Roof', seal: 'the seal', truth: 'Nathan', read: 'the reading'};
  const previousSteps = {seal: 'roof', truth: 'seal', read: 'truth', pray: 'truth'};
  const room = byId('room');
  const back = byId('back');
  const slider = byId('seal-control');
  const panels = [...room.querySelectorAll('[data-panel]')];
  const controls = [...room.querySelectorAll('[data-controls]')];
  const from = new URLSearchParams(location.search).get('from');
  const entrance = from === 'storm' ? { href: '/#storm-prayer', label: 'The Storm' } :
    from === 'well' ? { href: '/well/#rest', label: 'The Well' } :
      { href: '/well/#arrival', label: 'The Well' };
  if (from === 'storm') {
    byId('exit').href = entrance.href;
    byId('exit-label').textContent = 'Back to The Storm';
    byId('other-room').href = '/well/#arrival';
    byId('other-room').firstChild.textContent = 'Return to the water ';
  }
  const isStage = step => stages.includes(step) || step === 'read';
  const stage = () => isStage(location.hash.slice(1)) ? location.hash.slice(1) : 'roof';
  const url = step => step === 'roof' ? location.pathname + location.search : '#' + step;
  let current;
  let drag;
  let ignorePointerClick = false;

  function reveal(value) { document.body.style.setProperty('--reveal', String(value)); }
  function previousStep(step) {
    if (step === 'pray' && history.state?.roofFrom === 'read') return 'read';
    return previousSteps[step];
  }
  function render() {
    const step = stage();
    if (current === step) return;
    const wasOpen = Boolean(current);
    current = step;
    drag = undefined;
    reveal(0);
    const index = stages.indexOf(step);
    const previous = previousStep(step);
    room.dataset.step = document.body.dataset.step = step;
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== step; });
    controls.forEach(group => { group.hidden = group.dataset.controls !== step; });
    byId('position').textContent = step === 'read' ? 'Reading' : 'Scene ' + (index + 1) + ' of ' + stages.length;
    back.href = previous ? url(previous) : entrance.href;
    byId('back-label').textContent = previous ? 'Back to ' + stageNames[previous] : entrance.label;
    if (wasOpen) {
      window.scrollTo(0, 0);
      room.querySelector('[data-panel="' + step + '"] [tabindex="-1"]').focus({preventScroll: true});
    }
  }

  function go(next) {
    if (!isStage(next) || next === current) return;
    history.pushState({roofFrom: current}, '', url(next));
    render();
  }

  back.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || current === 'roof') return;
    event.preventDefault();
    const previous = previousStep(current);
    if (history.state?.roofFrom === previous) history.back();
    else {
      history.replaceState(null, '', url(previous));
      render();
    }
  });
  window.addEventListener('popstate', render);
  window.addEventListener('hashchange', render);
  room.querySelectorAll('[data-go]').forEach(control => control.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    if (current === 'roof' && control.dataset.go === 'seal' && !musicStarted) playExcerpt();
    go(control.dataset.go);
  }));

  room.querySelector('.reading-sources').addEventListener('click', event => {
    const summary = event.target.closest('summary');
    if (!summary) return;
    requestAnimationFrame(() => {
      if (summary.parentElement.open &&
          summary.getBoundingClientRect().top < document.querySelector('.mast').getBoundingClientRect().bottom) {
        summary.scrollIntoView({block: 'start'});
      }
    });
  });

  slider.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    ignorePointerClick = false;
    drag = {id: event.pointerId, start: event.clientX, delta: 0, moved: false};
    slider.setPointerCapture(event.pointerId);
  });
  slider.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    drag.delta = event.clientX - drag.start;
    drag.moved ||= Math.abs(drag.delta) > 9;
    reveal(Math.min(1, Math.max(0, drag.delta / 104)));
  });
  slider.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    ignorePointerClick = drag.moved;
    const opened = drag.delta >= 64;
    drag = undefined;
    reveal(0);
    if (opened) go('truth');
  });
  const cancel = () => { if (drag) { drag = undefined; reveal(0); } };
  slider.addEventListener('pointercancel', cancel);
  slider.addEventListener('lostpointercapture', cancel);
  slider.addEventListener('click', event => {
    const suppress = ignorePointerClick && event.detail > 0;
    ignorePointerClick = false;
    if (!suppress) go('truth');
  });

  const sound = byId('sound');
  const track = byId('track');
  const captions = byId('captions');
  let musicStarted = false;
  const cues = [
    [0.81, 1.98, '“You are the man.”'],
    [2.0, 3.13, 'And the cover was gone'],
    [3.13, 6.27, 'You broke the story I rehearsed'],
    [7.63, 11.76, 'I named the sin. You answered first'],
    [11.76, 16.06, 'No throne to hide behind that day'],
    [16.95, 21.87, 'You heard me still. You let me stay'],
    [21.87, 25.22, 'Tear the roof off the lie I’m living'],
    [27.09, 29.92, 'Let the light hit what I’ve hidden']
  ];
  function lyric() {
    if (track.paused) return;
    const t = track.currentTime;
    const line = cues.find(cue => t >= cue[0] && t < cue[1])?.[2] ?? '♪';
    if (captions.textContent !== line) captions.textContent = line;
  }
  function soundState(on) {
    sound.setAttribute('aria-pressed', String(on));
    sound.setAttribute('aria-label', (on ? 'Pause' : 'Play') + ' The Roof excerpt');
    byId('sound-label').textContent = on ? 'Pause' : 'Listen';
    captions.hidden = !on;
    if (on) lyric();
  }
  async function playExcerpt() {
    if (!track.paused) return;
    try {
      if (track.ended) track.currentTime = 0;
      await track.play();
    } catch (error) {
      if (error.name !== 'NotAllowedError' && track.error) {
        captions.textContent = 'Audio is unavailable. You can still enter the room.';
        captions.hidden = false;
      }
    }
  }
  sound.addEventListener('click', () => {
    if (track.paused) playExcerpt();
    else track.pause();
  });
  track.addEventListener('playing', () => {
    musicStarted = true;
    soundState(true);
  });
  track.addEventListener('pause', () => soundState(false));
  track.addEventListener('ended', () => soundState(false));
  track.addEventListener('timeupdate', lyric);
  window.addEventListener('pagehide', () => track.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) track.pause(); });
  render();
  if (current === 'roof') playExcerpt();
})();
