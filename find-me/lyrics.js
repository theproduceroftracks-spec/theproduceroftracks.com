(() => {
  const audio = document.getElementById('album-audio');
  const scene = document.querySelector('.lyric-scene');
  const status = document.getElementById('scene-status');
  const previous = document.getElementById('scene-before');
  const current = document.getElementById('scene-current');
  const next = document.getElementById('scene-after');
  const lights = ['ash', 'water', 'gold', 'ember'];
  let light = Math.floor(Math.random() * lights.length);
  try {
    const last = lights.indexOf(sessionStorage.getItem('tpot-find-me-light'));
    if (last >= 0) light = (last + 1 + Math.floor(Math.random() * (lights.length - 1))) % lights.length;
  } catch {
    // The design still varies when browser storage is unavailable.
  }

  let track = 1;
  let cues;
  let failed = false;
  let shown = '';

  function setLight() {
    scene.dataset.light = lights[light];
    try { sessionStorage.setItem('tpot-find-me-light', lights[light]); } catch {}
  }

  function render() {
    const lines = cues?.[track];
    const time = audio.currentTime;
    const active = lines?.findIndex(([start, end]) => start <= time && time < end) ?? -1;
    const following = active < 0 ? lines?.findIndex(([start]) => start > time) ?? -1 : active + 1;
    const key = JSON.stringify([track, active, following, !!cues, failed, audio.ended]);
    if (key === shown) return;
    shown = key;

    previous.textContent = active > 0 ? lines[active - 1][2] : '';
    next.textContent = lines?.[following]?.[2] ?? '';
    if (active >= 0) {
      current.textContent = lines[active][2];
    } else if (lines) {
      current.textContent = following === 0 ? 'Waiting for the first line' : following >= 0 ? 'Listening…' : 'End of lyrics';
    } else {
      current.textContent = document.querySelector(`#lyrics-${track} summary`).textContent;
    }
    const state = lines ? 'Lyrics follow playback' : !cues && !failed ? 'Loading lyric timing…' : 'Read the lyrics for this track';
    if (status.textContent !== state) status.textContent = state;
  }

  document.getElementById('scene-light').addEventListener('click', () => {
    light = (light + 1) % lights.length;
    setLight();
  });
  document.getElementById('scene-read').addEventListener('click', () => {
    const words = document.getElementById(`lyrics-${track}`);
    words.open = true;
    words.querySelector('summary').focus({ preventScroll: true });
    words.scrollIntoView({ block: 'start' });
  });

  document.addEventListener('tpot:album-track-change', event => {
    track = event.detail.track;
    shown = '';
    render();
  });
  for (const event of ['timeupdate', 'seeked', 'playing', 'ended']) {
    audio.addEventListener(event, render);
  }

  setLight();
  render();
  scene.hidden = false;
  fetch('/find-me/lyric-cues.json')
    .then(response => {
      if (!response.ok) throw new Error('Lyric timing unavailable');
      return response.json();
    })
    .then(data => {
      cues = data;
      render();
    })
    .catch(() => {
      failed = true;
      render();
    });
})();
