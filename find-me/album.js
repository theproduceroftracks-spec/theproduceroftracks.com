(() => {
  const media = navigator.mediaSession;
  const audio = document.getElementById('album-audio');
  const seek = document.getElementById('album-position');
  const seekTime = document.getElementById('album-position-time');
  let localAudio;
  let seekRequest;

  const playAlbum = document.getElementById('play-album');
  const nowPlaying = document.getElementById('now-playing');
  const error = document.getElementById('player-error');
  const copy = document.getElementById('copy-album');
  const shareStatus = document.getElementById('share-status');
  const tracks = [...document.querySelectorAll('.track')];
  const campaign = new URLSearchParams(window.location.search).get('utm_source');
  const knownSources = ['instagram', 'youtube', 'email', 'tpot_site', 'editorial'];
  const source = knownSources.includes(campaign) ? campaign : campaign ? 'other' : 'direct';
  let selected = 0;
  let intent = 'player';
  let uninterruptedOrder = true;
  let albumStarted = false;
  let albumFinished = false;
  let sequenceNext = 0;
  let sequenceSeconds = 0;
  const startedTracks = new Set();
  const qualifiedTracks = new Set();

  const listenEndpoint = audio.dataset.listenEndpoint;
  const visitId = listenEndpoint && crypto.randomUUID?.();

  document.addEventListener('tpot:album-metric', event => {
    if (!visitId) return;
    const { name, track } = event.detail;
    const complete = name === 'album_track_complete';
    if (!complete && name !== 'album_track_listen') return;
    fetch(complete ? new URL('/engagement', listenEndpoint) : listenEndpoint, {
      method: 'POST',
      body: `${visitId}:${complete ? "complete:" : ""}${track}`,
      keepalive: true
    }).catch(() => {});
  });

  function playedSeconds() {
    const ranges = audio.played;
    let heard = 0;
    for (let range = 0; range < ranges.length; range += 1) {
      heard += ranges.end(range) - ranges.start(range);
    }
    return heard;
  }

  const completedTracks = new Set();
  function checkListen() {
    if (audio.seeking ||
        audio.currentSrc !== (localAudio || new URL(tracks[selected].dataset.src, location.origin).href)) return;
    const seconds = playedSeconds();
    if (seconds >= 30 && !qualifiedTracks.has(selected)) {
      qualifiedTracks.add(selected);
      emit('album_track_listen', { track: selected + 1 });
    }
    if (Number.isFinite(audio.duration) && audio.duration > 0 &&
        seconds >= audio.duration * 0.9 && !completedTracks.has(selected)) {
      completedTracks.add(selected);
      emit('album_track_complete', { track: selected + 1 });
    }
  }

  audio.addEventListener('timeupdate', checkListen);
  audio.addEventListener('pause', checkListen);

  function emit(name, fields = {}) {
    // The review build sends nothing over the network. An approved collector can
    // subscribe to this event on the album page.
    document.dispatchEvent(new CustomEvent('tpot:album-metric', {
      detail: { name, album: 'find_me', source, ...fields }
    }));
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function select(index, reason) {
    const previous = selected;
    selected = index;
    intent = reason;
    error.hidden = true;
    nowPlaying.textContent = `${index + 1} of ${tracks.length} · ${tracks[index].firstElementChild.textContent}`;
    tracks[previous].removeAttribute('aria-current');
    tracks[index].setAttribute('aria-current', 'true');
    if (index !== previous) {
      seekRequest?.abort();
      seekRequest = undefined;
      if (localAudio) URL.revokeObjectURL(localAudio);
      localAudio = undefined;
      audio.src = tracks[index].dataset.src;
      seek.disabled = true;
      seek.value = 0;
      showSeekTime(0);
    }
    if (media) media.setPositionState?.();
    updateMediaMetadata();
    document.dispatchEvent(new CustomEvent('tpot:album-track-change', { detail: { track: index + 1 } }));
  }

  function showSeekTime(seconds) {
    const time = Math.floor(seconds);
    const label = `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
    seekTime.value = label;
    seek.setAttribute('aria-valuetext', label);
  }

  async function seekTo(seconds) {
    if (!Number.isFinite(audio.duration)) return;
    const target = Math.max(0, Math.min(seconds, audio.duration));
    for (let index = 0; index < audio.seekable.length; index += 1) {
      if (target >= audio.seekable.start(index) && target <= audio.seekable.end(index)) {
        audio.currentTime = target;
        return;
      }
    }

    seekRequest?.abort();
    const request = new AbortController();
    seekRequest = request;
    error.hidden = true;
    seekTime.value = 'Loading…';
    try {
      const response = await fetch(tracks[selected].dataset.src, { signal: request.signal });
      if (!response.ok || response.status === 206) throw new Error('Full track unavailable');
      const blob = await response.blob();
      if (request.signal.aborted) return;
      const resume = !audio.paused;
      checkListen();
      if (localAudio) URL.revokeObjectURL(localAudio);
      localAudio = URL.createObjectURL(blob);
      audio.src = localAudio;
      audio.currentTime = target;
      if (resume) await play();
    } catch {
      if (!request.signal.aborted) showError('Could not jump to that point. Try again.');
    } finally {
      if (seekRequest === request) {
        seekRequest = undefined;
        showSeekTime(audio.currentTime);
      }
    }
  }

  seek.parentElement.hidden = false;
  seek.addEventListener('input', () => showSeekTime(Number(seek.value)));
  seek.addEventListener('change', () => seekTo(Number(seek.value)));
  audio.addEventListener('loadedmetadata', () => {
    seek.disabled = !Number.isFinite(audio.duration);
    if (!seek.disabled) seek.max = Math.floor(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    if (seekRequest || document.activeElement === seek) return;
    seek.value = Math.floor(audio.currentTime);
    showSeekTime(audio.currentTime);
  });

  async function play() {
    const expected = selected;
    try {
      await audio.play();
    } catch (failure) {
      if (expected !== selected || failure.name === 'AbortError') return;
      const message = failure.name === 'NotAllowedError'
        ? 'Press play in the album player to continue.'
        : 'This track could not play. Check your connection, then select the track again.';
      showError(message);
    }
  }

  function jump(index, entry) {
    if (index < 0 || index >= tracks.length) return;
    if (index !== selected) {
      uninterruptedOrder = index === 0;
      if (uninterruptedOrder) {
        sequenceNext = 0;
        sequenceSeconds = 0;
      }
      select(index, entry);
    }
    if (audio.error) audio.load();
    play();
  }

  function updateMediaMetadata() {
    if (!media || typeof MediaMetadata !== 'function') return;
    media.metadata = new MediaMetadata({
      title: tracks[selected].firstElementChild.textContent,
      artist: 'The Producer of Tracks',
      album: 'FIND ME',
      artwork: [{ src: '/assets/find-me-cover.jpg', sizes: '1000x1000', type: 'image/jpeg' }]
    });
  }

  function updateMediaPosition() {
    if (!media || !Number.isFinite(audio.duration) || !audio.duration || !audio.playbackRate) return;
    media.setPositionState?.({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: Math.max(0, Math.min(audio.currentTime, audio.duration))
    });
  }

  if (media) {
    const actions = {
      play,
      pause: () => audio.pause(),
      previoustrack: () => {
        if (audio.currentTime > 3 || selected === 0) audio.currentTime = 0;
        else jump(selected - 1, 'media_control');
      },
      nexttrack: () => jump(selected + 1, 'media_control'),
      seekto: ({ seekTime }) => {
        if (Number.isFinite(seekTime) && Number.isFinite(audio.duration)) {
          seekTo(seekTime);
        }
      }
    };
    Object.entries(actions).forEach(([action, handler]) => {
      try { media.setActionHandler(action, handler); } catch { /* Available actions vary by device. */ }
    });
    for (const event of ['loadedmetadata', 'play', 'pause', 'seeked', 'ratechange']) {
      audio.addEventListener(event, updateMediaPosition);
    }
    audio.addEventListener('playing', () => { media.playbackState = 'playing'; });
    audio.addEventListener('pause', () => { media.playbackState = 'paused'; });
  }

  function showListeningView() {
    document.getElementById('listening-start').scrollIntoView({ block: 'start' });
    nowPlaying.focus({ preventScroll: true });
  }

  function qualifiedFinish() {
    // Use played media ranges to exclude a seek to the end.
    return Number.isFinite(audio.duration) && playedSeconds() >= audio.duration * 0.9;
  }

  audio.addEventListener('playing', () => {
    error.hidden = true;
    if (selected === 0 && !albumStarted) {
      albumStarted = true;
      emit('album_start', { entry: intent });
    }
    if (!startedTracks.has(selected)) {
      startedTracks.add(selected);
      emit('album_track_start', { track: selected + 1, entry: intent });
    }
  });

  audio.addEventListener('ended', () => {
    checkListen();
    const next = selected + 1;
    const qualified = qualifiedFinish();
    if (uninterruptedOrder && selected === sequenceNext && qualified) {
      sequenceNext = next;
      sequenceSeconds += audio.duration;
    } else {
      uninterruptedOrder = false;
    }

    if (next === tracks.length) {
      if (media) media.playbackState = 'paused';
      if (uninterruptedOrder && !albumFinished) {
        albumFinished = true;
        emit('album_complete', { tracks: sequenceNext, duration_seconds: Math.round(sequenceSeconds) });
      }
      return;
    }
    select(next, 'advance');
    play();
  });

  audio.addEventListener('error', () => showError('This track could not load. Check your connection, then select the track again.'));

  playAlbum.addEventListener('click', () => {
    sequenceNext = 0;
    sequenceSeconds = 0;
    uninterruptedOrder = true;
    select(0, 'full_album');
    audio.load();
    play();
    showListeningView();
  });

  tracks.forEach((track, index) => {
    track.hidden = false;
    track.addEventListener('click', () => {
      jump(index, 'tracklist');
      showListeningView();
    });
  });

  document.querySelectorAll('[data-purchase]').forEach(link => {
    link.addEventListener('click', () => emit('album_purchase_click', { product: link.dataset.purchase }));
  });

  if (navigator.clipboard?.writeText) {
    copy.hidden = false;
    copy.addEventListener('click', async () => {
      const url = document.querySelector('link[rel=canonical]').href;
      try {
        await navigator.clipboard.writeText(url);
        shareStatus.textContent = 'Album link copied.';
        emit('album_share_copy');
      } catch {
        shareStatus.textContent = 'Copy the album address below.';
      }
      shareStatus.hidden = false;
    });
  }

  tracks[0].setAttribute('aria-current', 'true');
  updateMediaMetadata();
  playAlbum.hidden = false;
  emit('album_page_view');
})();
