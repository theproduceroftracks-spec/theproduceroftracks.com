/* The Producer of Tracks: v1 app behaviour. No storage, no network calls of its own, no tracking.
   Hash routes: #home #listen #rooms #storm #floor #well (#well-1..#well-5) #about. Without JS, the whole page reads top to bottom. */
(function () {
  'use strict';
  var views = document.querySelectorAll('[data-view]');
  var steps = document.querySelectorAll('[data-stepview]');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var chosen = '';

  /* audio: players live only in #listen. Leaving it unloads the iframe (stops sound for certain) and offers a way back. */
  var audioNote = document.querySelector('.audio-note');
  function stopPlayers() {
    var stopped = false;
    document.querySelectorAll('.player[data-yt]').forEach(function (p) {
      var f = p.querySelector('iframe');
      if (f) { f.remove(); p.insertBefore(makePlayBtn(p), p.firstChild); stopped = true; }
    });
    return stopped;
  }
  function makePlayBtn(p) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'play'; b.textContent = '▶ Play here';
    b.addEventListener('click', function () { loadPlayer(p, b); });
    return b;
  }
  var lastView = null;
  var roomHost = document.querySelector('[data-floor-frame]');
  var stormCrossing = document.querySelector('[data-storm-crossing]');
  var stormReadingBack = document.querySelector('[data-storm-reading-back]');
  var stormDestinations = ['storm-hand', 'storm-witness', 'storm-prayer', 'storm-m1', 'storm-audio'];
  var stormExcerpt = document.querySelector('[data-storm-excerpt]');
  var stormMusicButton = document.querySelector('[data-storm-opening]');
  var stormMusicStarted = false;
  var engagementVisit = window.crypto?.randomUUID?.();
  var recordedEngagement = new Set();
  function recordEngagement(kind, target) {
    var key = kind + ':' + target;
    if (!engagementVisit || recordedEngagement.has(key)) return;
    recordedEngagement.add(key);
    fetch('https://tpot-listens.shadowline-strategic-llc.workers.dev/engagement', {
      method: 'POST', body: engagementVisit + ':' + key, keepalive: true
    }).catch(function () {});
  }

  function showFloorRoom(view) {
    if (view !== 'floor-room') { roomHost.replaceChildren(); return; }
    if (roomHost.firstChild) return;
    var frame = document.createElement('iframe');
    frame.title = 'The Floor Moved interactive 3D room';
    frame.src = '/room/the-floor-moved.html';
    roomHost.appendChild(frame);
    recordEngagement("room", "floor-room");
  }

  function startStormExcerpt() {
    if (!stormExcerpt.paused) return;
    stopPlayers();
    stormExcerpt.play().catch(updateStormMusicControl);
  }

  function updateStormMusicControl() {
    var playing = !stormExcerpt.paused && !stormExcerpt.ended;
    stormMusicButton.textContent = playing ? 'Pause' : 'Listen';
    stormMusicButton.setAttribute('aria-label', (playing ? 'Pause' : 'Play') + ' Bid Me Come excerpt');
  }

  function show(view, step, destination) {
    if (lastView === 'storm' && view !== 'storm') {
      stormExcerpt.pause();
      stormExcerpt.currentTime = 0;
      stormMusicStarted = false;
    }
    if (view === 'storm' && lastView !== 'storm' && location.hash === '#storm') startStormExcerpt();
    if ((lastView === 'listen' || lastView === 'storm') && view !== lastView && stopPlayers() && audioNote) {
      var fromStorm = lastView === 'storm';
      audioNote.querySelector('[data-audio-msg]').textContent = fromStorm ? 'Bid Me Come stopped when you left The Storm.' : 'The music stopped when you left Listen.';
      var back = audioNote.querySelector('[data-audio-back]'); back.setAttribute('href', fromStorm ? '#storm' : '#listen'); back.textContent = fromStorm ? 'Back to The Storm ▶' : 'Back to Listen ▶';
      audioNote.hidden = view === 'listen' || view === 'storm';
    }
    if ((view === 'listen' || view === 'storm') && audioNote) audioNote.hidden = true;
    lastView = view;
    showFloorRoom(view);
    if (!(view === 'well' && String(step) === '4')) stopStill();
    views.forEach(function (v) { v.classList.toggle('on', v.dataset.view === view); });
    document.querySelectorAll('[data-tab]').forEach(function (t) {
      if (t.dataset.tab === view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (view === 'well') {
      var n = String(step || 1);
      steps.forEach(function (s) { s.classList.toggle('on', s.dataset.stepview === n); });
      document.querySelectorAll('.steps [data-step]').forEach(function (a) {
        if (a.dataset.step === n) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
      });
      if (n === '4') reflectEcho();
    }
    var target = destination || (view === 'well' ? document.getElementById('well-' + (step || 1)) : document.getElementById(view));
    var h = target && target.querySelector('h1,h2,h3');
    if (h && !document.body.classList.contains('text')) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
    if (destination && destination.id !== 'storm-hand') {
      requestAnimationFrame(function () {
        if (location.hash === '#' + destination.id) destination.scrollIntoView({block: 'start'});
      });
    } else {
      // Recheck after the browser processes a fragment so it cannot pull the top scene out of view.
      var currentHash = location.hash;
      window.scrollTo(0, 0);
      requestAnimationFrame(function () { if (location.hash === currentHash) window.scrollTo(0, 0); });
    }
  }

  function route() {
    if (document.body.classList.contains('text')) return;
    var hsh = (location.hash || '#home').slice(1);
    var m = hsh.match(/^well-(\d+)$/);
    if (m) {
      var n = +m[1];
      if (n >= 1 && n <= 5) show('well', n);
      else { history.replaceState(null, '', '#well-1'); show('well', 1); }   // invalid step: safe fallback
    }
    else if (hsh === 'storm' || stormDestinations.includes(hsh)) {
      if (hsh === 'storm') {
        delete stormCrossing.dataset.caught;
        delete stormCrossing.dataset.touched;
      } else {
        stormCrossing.dataset.caught = '';
      }
      var cameFromBoat = hsh === 'storm-witness' && history.state?.stormFrom === '#storm';
      stormReadingBack.href = cameFromBoat ? '#storm' : '#storm-hand';
      stormReadingBack.querySelector('[data-storm-reading-back-label]').textContent = cameFromBoat ? 'Back to the boat' : 'Back to the hand';
      show('storm', 1, hsh === 'storm' ? null : document.getElementById(hsh));
    }
    else if (/^floor-m[1-5]$/.test(hsh)) {
      show('floor', 1);
      requestAnimationFrame(function () {
        var scene = document.getElementById(hsh);
        var heading = scene.querySelector('h2,h3') || scene;
        heading.tabIndex = -1;
        heading.focus({preventScroll:true});
        scene.scrollIntoView();
      });
    }
    else if (['home', 'find-me', 'floor-room', 'listen', 'well', 'floor', 'rooms', 'about'].indexOf(hsh) >= 0) show(hsh, 1);
    else show('home');
  }
  window.addEventListener('message', function (event) {
    var frame = roomHost.querySelector('iframe');
    if (event.origin === location.origin && frame && event.source === frame.contentWindow &&
        event.data === 'floor-room:acts') location.hash = 'floor-m4';
  });
  window.addEventListener('hashchange', route);
  stormMusicButton.hidden = false;
  stormMusicButton.addEventListener('click', function () {
    if (stormExcerpt.paused) startStormExcerpt();
    else stormExcerpt.pause();
  });
  stormExcerpt.addEventListener('playing', function () {
    stormMusicStarted = true;
    updateStormMusicControl();
  });
  ['pause', 'ended'].forEach(function (event) {
    stormExcerpt.addEventListener(event, updateStormMusicControl);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stormExcerpt.pause();
  });
  window.addEventListener('pagehide', function () { stormExcerpt.pause(); });
  document.addEventListener('click', function (event) {
    if (document.body.classList.contains('text') || lastView === 'storm' || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest('a[href]');
    if (link && link.origin === location.origin && link.pathname === location.pathname && link.hash === '#storm') {
      // Preserve the tap's media permission on same-page entry through the site.
      startStormExcerpt();
    }
  }, true);
  route();

  document.querySelectorAll('[data-storm-step], [data-storm-back]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (document.body.classList.contains('text') || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      var next = link.hash;
      if (next === location.hash) return;
      if (link.hasAttribute('data-storm-touch')) {
        if (!stormMusicStarted) startStormExcerpt();
        var art = link.getBoundingClientRect();
        var x = event.detail ? event.clientX - art.left : art.width / 2;
        var y = event.detail ? event.clientY - art.top : art.height * .7;
        stormCrossing.style.setProperty('--touch-x', x + 'px');
        stormCrossing.style.setProperty('--touch-y', y + 'px');
        stormCrossing.dataset.touched = '';
      }
      if (link.hasAttribute('data-storm-back')) {
        if (history.state?.stormFrom === next) {
          history.back();
          return;
        }
        history.replaceState(null, '', next);
      } else {
        history.pushState({stormFrom: location.hash}, '', next);
      }
      route();
    });
  });

  document.querySelector('.storm-sources').addEventListener('click', function (event) {
    var summary = event.target.closest('summary');
    if (!summary) return;
    // Closing the previous reading can pull the newly opened one above the sticky header.
    requestAnimationFrame(function () {
      if (!summary.parentElement.open) return;
      var bounds = summary.getBoundingClientRect();
      var headerEdge = document.querySelector('.top').getBoundingClientRect().bottom;
      var tabbar = document.querySelector('.tabbar');
      var lowerEdge = tabbar.offsetHeight ? tabbar.getBoundingClientRect().top : window.innerHeight;
      if (bounds.top < headerEdge || bounds.bottom > lowerEdge) summary.scrollIntoView({block: 'start'});
    });
  });

  /* text version toggle */
  var tm = document.querySelector('[data-textmode]');
  tm.addEventListener('click', function () {
    var on = !document.body.classList.contains('text');
    document.body.classList.toggle('text', on);
    tm.setAttribute('aria-pressed', on ? 'true' : 'false');
    tm.textContent = on ? 'App version' : 'Text version';
    if (!on) route();
  });

  /* click-to-load players (nothing loads or plays before the visitor asks) */
  function loadPlayer(p, btn) {
      stopPlayers();
      stormExcerpt.pause();
      if (lastView === 'storm') stormMusicStarted = true;
      p.classList.add('loading');
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + p.dataset.yt + '?autoplay=1&rel=0&playsinline=1';
      f.title = p.dataset.title;
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.setAttribute('allowfullscreen', '');
      f.addEventListener('load', function () { p.classList.remove('loading'); });
      btn.replaceWith(f);
      setTimeout(function () { p.classList.remove('loading'); }, 8000);   // fallback link stays visible either way
  }
  document.querySelectorAll('.player[data-yt]').forEach(function (p) {
    var btn = p.querySelector('.play');
    btn.addEventListener('click', function () { loadPlayer(p, btn); });
  });
  if (audioNote) audioNote.querySelector('.audio-dismiss').addEventListener('click', function () { audioNote.hidden = true; });

  /* step 1 choices: local only, never saved */
  var echo = document.querySelector('.echo');
  document.querySelectorAll('[data-choice]').forEach(function (b) {
    b.addEventListener('click', function () {
      var was = b.getAttribute('aria-pressed') === 'true';
      document.querySelectorAll('[data-choice]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      if (was) { chosen = ''; echo.textContent = ''; return; }
      b.setAttribute('aria-pressed', 'true');
      chosen = b.dataset.choice;
      echo.textContent = 'You named ' + chosen + '. She came to the well for water too, and someone was already sitting there.';
    });
    b.setAttribute('aria-pressed', 'false');
  });
  function reflectEcho() {
    var r = document.querySelector('.reflect-echo');
    if (r) r.textContent = chosen ? 'You named ' + chosen + '. You can set it down here, even for a minute.' : '';
  }

  /* be still for one minute */
  var pauseBtn = document.querySelector('[data-pause]'), pauseStatus = document.querySelector('.pause-status'), timer = null;
  function stopStill() {   // cancels the minute whenever the visitor leaves step 4 or restarts
    if (timer) { clearInterval(timer); timer = null; }
    document.body.classList.remove('still');
    if (pauseBtn) pauseBtn.textContent = 'Be still for one minute';
    if (pauseStatus) pauseStatus.textContent = '';
  }
  if (pauseBtn) pauseBtn.addEventListener('click', function () {
    if (timer) { clearInterval(timer); timer = null; document.body.classList.remove('still'); pauseBtn.textContent = 'Be still for one minute'; pauseStatus.textContent = ''; return; }
    var left = 60; document.body.classList.add('still'); pauseBtn.textContent = 'End the minute';
    pauseStatus.textContent = 'One minute. Breathe. Nothing to do.';
    timer = setInterval(function () {
      left -= 1;
      if (left % 15 === 0 && left > 0) pauseStatus.textContent = left + ' seconds.';
      if (left <= 0) { clearInterval(timer); timer = null; document.body.classList.remove('still'); pauseBtn.textContent = 'Be still again'; pauseStatus.textContent = 'The minute is over. Stay as long as you like.'; }
    }, 1000);
  });

  /* restart clears the (in-memory) choice */
  document.querySelectorAll('[data-restart]').forEach(function (a) {
    a.addEventListener('click', function () {
      chosen = ''; echo.textContent = ''; stopStill();
      document.querySelectorAll('[data-choice]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    });
  });

  /* share: native sheet if available, else copy the link. Always the canonical public URL, never the serving origin. */
  var CANON = 'https://theproduceroftracks.com/';
  var shareBtn = document.querySelector('[data-share]'), shareStatus = document.querySelector('.share-status');
  if (shareBtn) shareBtn.addEventListener('click', function () {
    var url = CANON + '#well';
    var data = { title: 'The Well | The Producer of Tracks', text: 'What do you keep returning to that never satisfies you?', url: url };
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { shareStatus.textContent = 'Link copied.'; }, function () { shareStatus.textContent = url; });
    else shareStatus.textContent = url;
  });

  document.querySelector('[data-storm-player]').addEventListener('click', function () {
    document.getElementById('storm-audio').scrollIntoView({behavior: reduce ? 'instant' : 'smooth', block: 'start'});
    var b = document.querySelector('#storm-audio button, #storm-audio iframe'); if (b) b.focus({preventScroll:true});
  });
  document.querySelector('[data-storm-stop]').addEventListener('click', function () {
    stopPlayers();
    stormExcerpt.pause();
    stormMusicStarted = true;
  });
  document.querySelector('[data-storm-share]').addEventListener('click', function () {
    var url = CANON + '#storm';
    var status = document.querySelector('[data-storm-share-status]');
    if (navigator.share) { navigator.share({title:'The Storm | The Producer of Tracks', url:url}).catch(function(){}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function(){status.textContent='Link copied.';},function(){status.textContent=url;});
    else status.textContent=url;
  });
  document.querySelector('[data-floor-share]').addEventListener('click', function () {
    var url = CANON + '#floor'; var status = document.querySelector('[data-floor-share-status]');
    if (navigator.share) { navigator.share({title:'The Floor Moved | The Producer of Tracks',url:url}).catch(function(){}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function(){status.textContent='Link copied.';},function(){status.textContent=url;}); else status.textContent=url;
  });
  /* reading panels */
  var opener = null;
  document.querySelectorAll('[data-panel]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = document.getElementById('panel-' + b.dataset.panel); if (!d) return;
      opener = b;
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
      d.querySelector('.close').focus();
      if (['floor-acts', 'john4'].includes(b.dataset.panel)) recordEngagement('scripture', b.dataset.panel);
    });
  });
  document.querySelectorAll('dialog.panel').forEach(function (d) {
    d.querySelector('.close').addEventListener('click', function () { if (d.close) d.close(); else d.removeAttribute('open'); });
    d.addEventListener('close', function () { if (opener) opener.focus(); });
  });
})();

// A scheduled show window is not a verified airplay credit.
(function () {
  var notice = document.querySelector('[data-radio-until]');
  if (!notice) return;
  var end = Date.parse(notice.getAttribute('data-radio-until'));
  var timer;
  function updateNotice() {
    clearTimeout(timer);
    var remaining = end - Date.now();
    notice.hidden = !(remaining > 0);
    if (remaining > 0) timer = setTimeout(updateNotice, Math.min(remaining, 2147483647));
  }
  updateNotice();
  document.addEventListener('visibilitychange', updateNotice);
  window.addEventListener('pageshow', updateNotice);
})();
