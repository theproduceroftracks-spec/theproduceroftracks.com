/* The Producer of Tracks: world layer (v1, 2026-11-07).
   Adds, on top of app.js: the Encounters room, continue-where-you-left-off, Keep (bookmarks), next encounter,
   listen-together guide, install help, offline/update status. Progressive: if storage, service workers or
   install prompts aren't available, the site works exactly as before.
   Stored on this device only (localStorage "tpot.world.v1"): last place {route, pos, at}, kept routes, dismissals.
   Nothing is sent anywhere. No journals, answers, choices or profile data are stored. */
(function () {
  'use strict';
  var KEY = 'tpot.world.v1';
  var ROOMS = {
    storm: { title: 'The Storm', song: 'Bid Me Come', ref: 'Matthew 14', next: 'floor', line: 'I have seen enough to trust You. Why am I still afraid?' },
    floor: { title: 'The Floor Moved', song: 'The Floor Moved', ref: 'Acts 16', next: 'well', line: 'At midnight they sang.' },
    well:  { title: 'The Well', song: '', ref: 'John 4', next: 'storm', line: 'What do you keep returning to that never satisfies you?' },
    medicine: { title: 'Medicine of Immortality', song: '', ref: 'John 6', next: 'storm', line: 'What keeps your hand closed?' }
  };
  var ENCOUNTER_VIEWS = ['rooms', 'storm', 'floor', 'well'];

  /* ---------- storage (fails soft) ---------- */
  var storageOK = true, state = { last: null, kept: [] };
  try {
    var raw = window.localStorage.getItem(KEY);
    if (raw) { var p = JSON.parse(raw); if (p && typeof p === 'object') state = { last: p.last || null, kept: Array.isArray(p.kept) ? p.kept.filter(function (r) { return ROOMS[r]; }) : [] }; }
    window.localStorage.setItem(KEY + '.probe', '1'); window.localStorage.removeItem(KEY + '.probe');
  } catch (e) { storageOK = false; }
  document.documentElement.classList.toggle('no-store', !storageOK);
  function save() { if (!storageOK) return; try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOK = false; document.documentElement.classList.add('no-store'); } }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function currentView() {
    var h = (location.hash || '#home').slice(1);
    if (/^well-\d+$/.test(h)) return 'well';
    if (/^storm-(hand|witness|prayer|m1|audio)$/.test(h)) return 'storm';
    return h || 'home';
  }

  /* ---------- return-journey fix (2026-11-08): deterministic restore after a reload ----------
     Only for a reload/back-forward page load, only on The Storm or The Floor Moved, only from the place already stored.
     A fresh navigation or deep link still opens at the top. An update Refresh restores its exact scroll position. */
  var navType = 'navigate';
  try { var ne = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]; if (ne && ne.type) navType = ne.type; else if (performance.navigation && performance.navigation.type === 1) navType = 'reload'; } catch (e) {}
  var restoreY = null, restoreEl = null;
  try { var ry = sessionStorage.getItem('tpot.resume.y'); if (ry !== null) { sessionStorage.removeItem('tpot.resume.y'); restoreY = +ry; } } catch (e) {}
  (function () {
    var h = (location.hash || '').slice(1);
    if (restoreY !== null || !(navType === 'reload' || navType === 'back_forward')) return;
    if ((h === 'storm' || h === 'floor') && state.last && state.last.route === h && state.last.pos > 1) restoreEl = h + '-m' + state.last.pos;
  })();
  var restoring = restoreY !== null || !!restoreEl;
  if (restoring && 'scrollRestoration' in history) { try { history.scrollRestoration = 'manual'; } catch (e) {} }   // no race with the browser's own restore
  /* scroll a movement into view just below whichever sticky dock is showing (the Floor dock is taller and grows with text size) */
  function scrollToMove(t) {
    if (!t) return;
    t.scrollIntoView({ block: 'start' });
    var view = t.closest('.view'), dock = view && view.querySelector('.storm-dock, .floor-dock');
    var edge = dock && dock.offsetParent ? dock.getBoundingClientRect().bottom : (document.querySelector('.top') || { getBoundingClientRect: function () { return { bottom: 0 }; } }).getBoundingClientRect().bottom;
    var gap = t.getBoundingClientRect().top - (edge + 8);
    if (Math.abs(gap) > 1) window.scrollBy(0, gap);
  }
  function doRestore() {
    if (!restoring) return;
    if (restoreY !== null) window.scrollTo(0, restoreY);
    else scrollToMove(document.getElementById(restoreEl));
  }
  function endRestore() { restoring = false; }

  /* ---------- where you are (route + movement/step) ---------- */
  function placeLabel(route, pos) {
    if (!ROOMS[route]) return '';
    var el = route === 'well' ? document.getElementById('s' + pos + '-h') : document.getElementById(route + '-' + pos + '-h');
    var t = el ? el.textContent.replace(/[.\s]+$/, '').trim() : '';
    return t ? t.charAt(0) + t.slice(1).toLowerCase() : '';
  }
  function remember(route, pos) {
    if (!ROOMS[route] || restoring) return;   // don't let the momentary top-of-page overwrite the place being restored
    pos = Math.max(1, Math.min(5, pos || 1));
    if (state.last && state.last.route === route && state.last.pos === pos) return;
    state.last = { route: route, pos: pos, at: Date.now() };
    save(); renderContinue(); renderRooms();
  }

  // continuous-scroll encounters: the movement most in view is "where you are"
  var observing = null;
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || en.intersectionRatio < 0.45) return;
        var m = en.target, route = m.getAttribute('data-room'), pos = +m.getAttribute('data-move');
        if (route === currentView()) remember(route, pos);
      });
    }, { threshold: [0.45, 0.7] });
    $$('[data-room][data-move]').forEach(function (m) { io.observe(m); });
    observing = io;
  }

  function onRoute() {
    var v = currentView();
    var h = (location.hash || '').slice(1), m = h.match(/^well-(\d)$/);
    if (v === 'well') remember('well', m ? +m[1] : 1);
    else if (v === 'storm' || v === 'floor') { if (!state.last || state.last.route !== v) remember(v, 1); }
    // tab bar: "Encounters" stays lit inside any encounter
    var tabRooms = $('[data-tab="rooms"]');
    if (tabRooms) { if (ENCOUNTER_VIEWS.indexOf(v) >= 0) tabRooms.setAttribute('aria-current', 'page'); else if (v !== 'rooms') tabRooms.removeAttribute('aria-current'); }
    renderKeep();
    if (pendingScroll) { var ps = pendingScroll; pendingScroll = null; setTimeout(function () { scrollToMove(document.getElementById(ps)); }, 60); }
  }
  var pendingScroll = null;
  window.addEventListener('hashchange', function () { endRestore(); onRoute(); });

  /* ---------- continue card (Home) ---------- */
  function hrefFor(route, pos) { return route === 'well' ? '#well-' + pos : '#' + route; }
  /* Encounters with their own page (The Well at /well/) record their place themselves: an href on this site and a short label. */
  function pageHref(h) { return typeof h === 'string' && /^\/[a-z-]+\/(#[a-z-]+)?$/.test(h) ? h : null; }
  function pagePlace(p) { return typeof p === 'string' && p.length <= 60 && /^[A-Za-z ,’'.-]+$/.test(p) ? p : null; }
  function renderContinue() {
    var box = $('[data-continue]'); if (!box) return;
    var L = state.last;
    if (!storageOK || !L || !ROOMS[L.route]) { box.hidden = true; return; }
    var own = pagePlace(L.place);
    var label = own || placeLabel(L.route, L.pos);
    box.hidden = false;
    var a = $('a', box);
    a.setAttribute('href', pageHref(L.href) || hrefFor(L.route, L.pos));
    a.dataset.route = L.route; a.dataset.pos = L.pos;
    $('[data-continue-title]', box).textContent = ROOMS[L.route].title;
    $('[data-continue-place]', box).textContent = label ? (own || L.pos > 1 ? label : 'Begin again: ' + label) : '';
    box.dataset.room = L.route;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-continue] a');
    if (!a) return;
    var route = a.dataset.route, pos = +a.dataset.pos;
    if (route === 'storm' || route === 'floor') pendingScroll = route + '-m' + pos;
  });

  /* ---------- Keep (bookmarks) ---------- */
  function isKept(r) { return state.kept.indexOf(r) >= 0; }
  function toggleKeep(r) {
    if (!ROOMS[r]) return;
    if (isKept(r)) state.kept = state.kept.filter(function (x) { return x !== r; }); else state.kept.push(r);
    save(); renderKeep(); renderRooms();
    announce(isKept(r) ? ROOMS[r].title + ' kept on this phone.' : ROOMS[r].title + ' removed from Kept.');
  }
  function renderKeep() {
    $$('[data-keep]').forEach(function (b) {
      var r = b.getAttribute('data-keep'); var on = isKept(r);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      $('.keep-label', b).textContent = on ? 'Kept' : 'Keep';
    });
  }
  $$('[data-keep]').forEach(function (b) { b.addEventListener('click', function () { toggleKeep(b.getAttribute('data-keep')); }); });

  /* ---------- Encounters room ---------- */
  function renderRooms() {
    $$('[data-room-card]').forEach(function (c) {
      var r = c.getAttribute('data-room-card');
      var mark = $('[data-room-state]', c); if (!mark) return;
      var bits = [];
      if (isKept(r)) bits.push('Kept');
      if (state.last && state.last.route === r) { var l = placeLabel(r, state.last.pos); if (l) bits.push('You were at: ' + l); }
      mark.textContent = bits.join(' · ');
      mark.hidden = !bits.length;
    });
  }

  /* ---------- polite announcements ---------- */
  var live = $('[data-world-live]');
  function announce(t) { if (live) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); } }

  /* ---------- reset ---------- */
  var resetBtn = $('[data-world-reset]');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    state = { last: null, kept: [] };
    if (storageOK) { try { window.localStorage.removeItem(KEY); } catch (e) {} }
    renderContinue(); renderRooms(); renderKeep();
    announce('This phone has forgotten your place and your Kept rooms.');
    var s = $('[data-world-reset-status]'); if (s) s.textContent = 'Done. Your place and Kept encounters are forgotten on this device.';
  });

  /* ---------- share an encounter (one handler for all) ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-share-room]'); if (!b) return;
    var r = b.getAttribute('data-share-room'); if (!ROOMS[r]) return;
    var url = 'https://theproduceroftracks.com/#' + r;   // canonical public URL, never the serving origin
    var status = b.parentNode.querySelector('[data-share-room-status]');
    var data = { title: ROOMS[r].title + ' | The Producer of Tracks', text: ROOMS[r].line, url: url };
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(function () { if (status) status.textContent = 'Link copied. Send it to someone you would listen with.'; }, function () { if (status) status.textContent = 'Copying didn’t work here. The link is: ' + url; });
    else if (status) status.textContent = 'The link is: ' + url;
  });

  /* ---------- install ---------- */
  var deferred = null;
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function renderInstall() {
    $$('[data-install-wrap]').forEach(function (w) {
      var btn = $('[data-install]', w), note = $('[data-install-note]', w);
      if (standalone) { btn.hidden = true; note.textContent = 'You’re using TPoT from your home screen.'; return; }
      btn.hidden = false; note.textContent = '';
    });
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; renderInstall(); });
  window.addEventListener('appinstalled', function () { deferred = null; standalone = true; renderInstall(); announce('TPoT is on your home screen.'); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-install]'); if (!b) return;
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (c) { if (c && c.outcome === 'accepted') announce('Adding TPoT to your home screen.'); deferred = null; }).catch(function () { deferred = null; });
      return;
    }
    openDialog('panel-install', b);
    var ios = $('[data-install-ios]'), other = $('[data-install-other]');
    if (ios && other) { ios.hidden = !isIOS; other.hidden = isIOS; }
  });

  /* ---------- simple dialog helper for world panels ---------- */
  var opener = null;
  function openDialog(id, from) {
    var d = document.getElementById(id); if (!d) return;
    opener = from || null;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    var c = $('.close', d); if (c) c.focus();
  }
  $$('dialog.world-panel').forEach(function (d) {
    var c = $('.close', d);
    if (c) c.addEventListener('click', function () { if (d.close) d.close(); else d.removeAttribute('open'); });
    d.addEventListener('close', function () { if (opener) opener.focus(); });
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-world-panel]'); if (!b) return;
    openDialog('panel-' + b.getAttribute('data-world-panel'), b);
  });

  /* ---------- connection + update status strip ---------- */
  var strip = $('[data-status-strip]');
  function setStrip(kind, html) {
    if (!strip) return;
    if (!kind) { strip.hidden = true; strip.dataset.kind = ''; return; }
    strip.hidden = false; strip.dataset.kind = kind; $('[data-status-text]', strip).innerHTML = html;
  }
  function onlineState() {
    if (navigator.onLine === false) setStrip('offline', 'You’re offline. The encounters and readings still open; the music needs a connection.');
    else if (strip && strip.dataset.kind === 'offline') setStrip(null);
  }
  window.addEventListener('online', onlineState); window.addEventListener('offline', onlineState);
  onlineState();
  var stripClose = strip && $('[data-status-close]', strip);
  if (stripClose) stripClose.addEventListener('click', function () { setStrip(null); });

  /* update offer text tracks whether a player is actually loaded right now (loaded ≠ audible; we can only see the iframe) */
  var waitingWorker = null, asked = false;
  function renderOffer() {
    if (!waitingWorker || !strip || (strip.dataset.kind && strip.dataset.kind !== 'update' && !strip.hidden)) return;
    var playing = !!document.querySelector('.player iframe');
    setStrip('update', 'A new version of TPoT is ready.' + (playing ? ' Refreshing will stop the music.' : '') +
      ' <button type="button" data-apply-update>Refresh</button>');
    var b = $('[data-apply-update]'); if (b) b.addEventListener('click', function () { asked = true; waitingWorker.postMessage('SKIP_WAITING'); });
    stackNotes();
  }
  /* the "music stopped" note and the status strip share the bottom edge: lift the strip above the note when both show */
  var audioNote = $('.audio-note');
  function stackNotes() {
    if (!strip) return;
    strip.style.marginBottom = '0px';
    if (strip.hidden || !audioNote || audioNote.hidden) return;
    var s = strip.getBoundingClientRect(), n = audioNote.getBoundingClientRect();
    var lift = Math.ceil(s.bottom - n.top + 8);
    if (lift > 0) strip.style.marginBottom = lift + 'px';
  }
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(function () { renderOfferIfShown(); stackNotes(); });
    $$('.player[data-yt]').forEach(function (p) { mo.observe(p, { childList: true }); });
    if (audioNote) mo.observe(audioNote, { attributes: true, attributeFilter: ['hidden'] });
    if (strip) mo.observe(strip, { attributes: true, attributeFilter: ['hidden'] });
  }
  function renderOfferIfShown() { if (strip && !strip.hidden && strip.dataset.kind === 'update') renderOffer(); }
  if ('ResizeObserver' in window) { var ro = new ResizeObserver(stackNotes); if (audioNote) ro.observe(audioNote); if (strip) ro.observe(strip); }
  window.addEventListener('resize', stackNotes);

  if ('serviceWorker' in navigator && window.isSecureContext) {
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!asked || refreshing) return; refreshing = true;
      try { sessionStorage.setItem('tpot.resume.y', String(window.scrollY)); } catch (e) {}
      location.reload();
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (reg) {
        function offer(w) { waitingWorker = w; renderOffer(); }
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw); });
        });
      }).catch(function () { /* the site keeps working as a normal website */ });
    });
  }

  /* ---------- music: honest offline behaviour for in-page players ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.player[data-yt] .play'); if (!b) return;
    if (navigator.onLine === false) {
      e.stopImmediatePropagation(); e.preventDefault();
      var p = b.closest('.player'); var n = p.querySelector('.offline-note');
      if (!n) { n = document.createElement('p'); n.className = 'offline-note'; n.setAttribute('role', 'status'); p.appendChild(n); }
      n.textContent = 'You’re offline. The song will play here once you’re connected.';
    }
  }, true);

  /* ---------- sticky docks sit exactly below the header, whatever its height (wrapping, text size) ---------- */
  var topBar = $('.top');
  function setTopH() { if (topBar) document.documentElement.style.setProperty('--top-h', Math.ceil(topBar.getBoundingClientRect().height) + 'px'); }
  setTopH();
  if (topBar && 'ResizeObserver' in window) new ResizeObserver(setTopH).observe(topBar); else window.addEventListener('resize', setTopH);

  /* ---------- restore after app.js's first-load scroll to top (deterministic order) ---------- */
  if (restoring) {
    requestAnimationFrame(function () { requestAnimationFrame(doRestore); });
    var finish = function () { doRestore(); setTimeout(function () { doRestore(); endRestore(); }, 60); };
    if (document.readyState === 'complete') setTimeout(finish, 0); else window.addEventListener('load', finish);
  }

  /* ---------- first paint ---------- */
  renderContinue(); renderRooms(); renderKeep(); renderInstall(); onRoute();
  if (!storageOK) { var ns = $('[data-no-store-note]'); if (ns) ns.hidden = false; }
})();
