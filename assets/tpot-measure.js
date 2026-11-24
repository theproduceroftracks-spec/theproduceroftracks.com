/* The Producer of Tracks: first-party site measurement (v1).
   Sends batches to the tpot-listens Worker (/e). Records what is touched, where and when:
   pages, scroll depth, sections seen, clicks and outbound links, every audio/video play, pause, seek and
   progress, album events, opened readings, copy actions, load speed, script errors and blocked-content reports.
   Never records: typed text, copied text, which answer a choice button names (they carry generic data-track labels),
   the length of a copy that includes a visitor's own answer, IP address, cookies, or any visitor ID beyond the
   tab's random session ID (which lasts as long as the tab, possibly more than a day). "Returning" is a single
   yes/no flag. Global Privacy Control or Do Not Track turns the flag off.
   Our own tests: open any page once with ?qa=1 (and ?qa=0 to stop); every later event from that browser is marked QA. */
(function () {
  'use strict';
  var me = document.currentScript;
  var ENDPOINT = (me && me.dataset.endpoint) || 'https://tpot-listens.shadowline-strategic-llc.workers.dev/e';
  if (!window.crypto || !crypto.randomUUID || !window.JSON) return;

  function store(kind) { try { var s = window[kind]; s.setItem('tpot_t', '1'); s.removeItem('tpot_t'); return s; } catch (e) { return null; } }
  var ss = store('sessionStorage'), ls = store('localStorage');
  var params = new URLSearchParams(location.search);
  var optOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';

  // session: one random ID per browser tab, shared by pages opened in that tab
  var session = ss && ss.getItem('tpot_s');
  if (!session) { session = crypto.randomUUID(); if (ss) ss.setItem('tpot_s', session); }
  var view = crypto.randomUUID().slice(0, 8);   // this page load; events are numbered within it
  var seq = 0;

  // campaign: kept for the whole tab session so later pages stay attributed to the post that brought them
  var utm = { src: params.get('utm_source'), med: params.get('utm_medium'), cmp: params.get('utm_campaign'), cnt: params.get('utm_content') };
  if (utm.src || utm.cmp) { if (ss) ss.setItem('tpot_u', JSON.stringify(utm)); }
  else { try { utm = JSON.parse(ss && ss.getItem('tpot_u')) || utm; } catch (e) {} }
  var ref = null;
  try { var r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) ref = r.host; } catch (e) {}
  if (ref) { if (ss) ss.setItem('tpot_r', ref); } else { ref = ss && ss.getItem('tpot_r'); }

  if (params.get('qa') === '1' && ls) ls.setItem('tpot_qa', '1');
  if (params.get('qa') === '0' && ls) ls.removeItem('tpot_qa');
  var qa = ls && ls.getItem('tpot_qa') === '1' ? 1 : 0;

  var returning = null;
  if (!optOut && ls) { returning = ls.getItem('tpot_seen') === '1' ? 1 : 0; ls.setItem('tpot_seen', '1'); }

  var w = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  var page = location.pathname.replace(/index\.html$/, '');
  var queue = [];

  function track(name, target, value, detail) {
    seq += 1;
    queue.push([seq, Math.round(performance.now()), name, target == null ? null : String(target).slice(0, 160),
      typeof value === 'number' && isFinite(value) ? Math.round(value * 100) / 100 : null, detail || null]);
    if (NOW[name] || queue.length >= 20) flush();                   // key moments go out at once
    else if (!timer) timer = setTimeout(flush, 3000);
  }
  // Sent immediately: the visitor may be about to leave (outbound link) or these are the counts that matter most.
  var NOW = { page_view: 1, outbound: 1, nav: 1, album_track_listen: 1, album_track_complete: 1, album_complete: 1,
    album_purchase_click: 1, media_play: 1, media_end: 1, page_hide: 1, page_ping: 1, js_error: 1, csp_violation: 1 };
  var timer = null;
  function flush(leaving) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    var body = JSON.stringify({ v: 1, s: session, pv: view, now: Math.round(performance.now()), wt: Date.now(), p: page, u: utm, ref: ref, q: qa, a: navigator.webdriver ? 1 : 0, r: returning,
      lang: (navigator.language || '').slice(0, 12), vw: w < 600 ? 'phone' : w < 1024 ? 'tablet' : 'wide', ev: queue.splice(0, 60) });
    // keepalive fetch survives the page closing; sendBeacon only if fetch is missing (tested: some embedded
    // browsers accept a beacon on navigation and then drop it).
    // Leaving: send by both routes; the collector stores each event once (same session, page view and number).
    var sent = false;
    try { fetch(ENDPOINT, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'cors' }).catch(function () {}); sent = true; } catch (e) {}
    if ((leaving || !sent) && navigator.sendBeacon) { try { navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' })); } catch (e) {} }
    if (queue.length) flush(leaving);
  }

  window.tpotMeasure = { track: track, flush: flush, session: session, view: view, qa: qa };   // for page code and QA checks

  // ---- page, time and scroll ----
  track('page_view', page, null, { title: document.title.slice(0, 80), hash: location.hash.slice(0, 40) || undefined });
  var visibleMs = 0, shownAt = document.visibilityState === 'visible' ? performance.now() : null, maxScroll = 0, marks = {};
  function onScroll() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var pct = h > 0 ? Math.min(100, Math.round(window.scrollY / h * 100)) : 100;
    if (pct > maxScroll) maxScroll = pct;
    [25, 50, 75, 100].forEach(function (m) { if (pct >= m && !marks[m]) { marks[m] = 1; track('scroll', m + '%', m); } });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  var left = false;
  function leave() {
    if (shownAt != null) { visibleMs += performance.now() - shownAt; shownAt = null; }
    if (!left) { left = true; track('page_hide', page, visibleMs / 1000, { scroll: maxScroll, lcp: lcp || undefined }); }
    flush(true);
  }
  // While the page is on screen, report time so far every 30 s, so time on page survives a lost leave message.
  setInterval(function () {
    if (shownAt == null) return;
    track('page_ping', page, (visibleMs + performance.now() - shownAt) / 1000, { scroll: maxScroll });
  }, 30000);
  var loaded = false;
  window.addEventListener('pagehide', function () { if (!loaded) leave(); });   // a visitor who leaves before the page finishes loading
  // Registered after load, so page code that pauses audio on leaving (Roof, Well, Storm) runs first and its pause is sent.
  window.addEventListener('load', function () {
    loaded = true;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') leave();
      else { shownAt = performance.now(); left = false; }
    });
    window.addEventListener('pagehide', leave);
  });
  window.addEventListener('hashchange', function () { track('nav', location.hash.slice(0, 80) || '#', null, { via: 'hash' }); });

  // ---- sections seen (at least half on screen, first time only) ----
  if ('IntersectionObserver' in window) {
    var seen = {}, count = 0;
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (e) {
        var id = e.target.id;
        if (e.isIntersecting && id && !seen[id] && count < 80) { seen[id] = 1; count += 1; track('section_view', id); io.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    var watch = function () { document.querySelectorAll('section[id], article[id], [data-room][id], [data-measure-section][id]').forEach(function (el) { if (!seen[el.id]) io.observe(el); }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  }

  // ---- clicks: what was touched ----
  function label(el) {
    return (el.dataset.track || el.id || el.getAttribute('aria-label') || (el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 60);
  }
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('a[href], button, summary, [role=button], .track');
    if (!el) return;
    if (el.tagName === 'A') {
      var u; try { u = new URL(el.href, location.href); } catch (e) { return; }
      if (u.host && u.host !== location.host) track('outbound', (u.host + u.pathname).slice(0, 160), null, { label: label(el) });
      else track('nav', (u.pathname + u.hash).slice(0, 160), null, { label: label(el) });
    } else if (el.tagName !== 'SUMMARY') {
      track('click', label(el), null, el.closest('[id]') && el.closest('[id]') !== el ? { in: el.closest('[id]').id.slice(0, 40) } : null);
    }
  }, true);
  document.addEventListener('toggle', function (ev) {
    var d = ev.target;
    if (d.tagName === 'DETAILS' && d.open) { var s = d.querySelector('summary'); track('details_open', d.id || (s ? s.textContent.trim().slice(0, 80) : '')); }
  }, true);
  document.addEventListener('copy', function () {
    var sel = String(window.getSelection ? window.getSelection() : '');
    var anchor = window.getSelection && window.getSelection().anchorNode;
    var host = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
    var where = host && host.closest && host.closest('[id]');
    // An echo of the visitor's own answer ([data-measure-private]) changes length with the answer. If ANY part of
    // the selection touches one, wherever the selection starts or ends, send no length at all.
    var priv = false;
    try {
      var s = window.getSelection(), marks = document.querySelectorAll('[data-measure-private]');
      for (var i = 0; i < s.rangeCount && !priv; i += 1) {
        var r = s.getRangeAt(i);
        for (var j = 0; j < marks.length; j += 1) { if (r.intersectsNode(marks[j])) { priv = true; break; } }
      }
    } catch (e) { priv = true; }                                       // if unsure, withhold the length
    track('copy', where ? where.id : null, priv ? null : sel.length);   // length only, never the text
  });

  // ---- every audio and video element ----
  var media = new WeakMap();
  function mname(m) {
    var src = m.currentSrc || m.src || '';
    if (src.indexOf('blob:') === 0 && m.dataset.measureName) return m.dataset.measureName;
    return m.id || m.dataset.measureName || src.split('/').pop().split('?')[0].slice(0, 80) || 'media';
  }
  function state(m) { var s = media.get(m); if (!s) { s = { last: 0, marks: {}, src: '' }; media.set(m, s); } return s; }
  function mark(m) { var s = state(m), src = m.currentSrc || m.src; if (s.src !== src) { s.src = src; s.marks = {}; } return s; }
  ['play', 'pause', 'seeked', 'ended', 'error', 'timeupdate'].forEach(function (type) {
    document.addEventListener(type, function (ev) {
      var m = ev.target; if (!(m instanceof HTMLMediaElement)) return;
      var s = mark(m), t = m.currentTime, d = m.duration;
      if (type === 'timeupdate') {
        if (!m.seeking) s.last = t;
        var heard = 0;                                                  // audio actually played, so a jump does not count
        for (var i = 0; i < m.played.length; i += 1) heard += m.played.end(i) - m.played.start(i);
        if (isFinite(d) && d > 0) [25, 50, 75, 90].forEach(function (p) {
          if (heard / d * 100 >= p && !s.marks[p]) { s.marks[p] = 1; track('media_progress', mname(m), p, { at: Math.round(t) }); }
        });
        return;
      }
      if (type === 'play') track('media_play', mname(m), t);
      else if (type === 'pause' && !m.ended) track('media_pause', mname(m), t);
      else if (type === 'seeked') { track('media_seek', mname(m), t, { from: Math.round(s.last) }); s.last = t; }
      else if (type === 'ended') track('media_end', mname(m), d);
      else if (type === 'error') track('media_error', mname(m), null, { code: m.error ? m.error.code : null });
    }, true);
  });

  // ---- album player events already emitted by album.js ----
  document.addEventListener('tpot:album-metric', function (ev) {
    var d = ev.detail || {}, extra = {};
    Object.keys(d).forEach(function (k) { if (['name', 'track', 'product', 'album', 'source'].indexOf(k) < 0) extra[k] = d[k]; });
    track(d.name, d.track != null ? d.track : d.product, typeof d.duration_seconds === 'number' ? d.duration_seconds : null,
      Object.keys(extra).length ? extra : null);
  });
  document.addEventListener('tpot:album-track-change', function (ev) { track('album_track_change', ev.detail && ev.detail.track); });

  // ---- speed, errors and blocked content ----
  var lcp = 0;
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { lcp = Math.round(e.startTime); }); })
        .observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  window.addEventListener('load', function () {
    setTimeout(function () {
      var n = performance.getEntriesByType('navigation')[0];
      if (n) track('perf', 'load', Math.round(n.loadEventEnd || n.duration),
        { ttfb: Math.round(n.responseStart), dom: Math.round(n.domContentLoadedEventEnd), kb: Math.round((n.transferSize || 0) / 1024) });
    }, 0);
  });
  var errors = 0;
  window.addEventListener('error', function (e) {
    if (errors++ >= 10) return;
    if (e.target && e.target !== window && e.target.tagName) { track('js_error', 'resource ' + e.target.tagName.toLowerCase(), null, { src: String(e.target.src || e.target.href || '').split('?')[0].slice(-80) }); return; }
    track('js_error', String(e.message || 'error').slice(0, 120), null, { file: String(e.filename || '').split('/').pop().slice(0, 60), line: e.lineno || null });
  }, true);
  window.addEventListener('unhandledrejection', function (e) { if (errors++ < 10) track('js_error', 'promise: ' + String(e.reason && e.reason.message || e.reason).slice(0, 110)); });
  document.addEventListener('securitypolicyviolation', function (e) {
    var b = String(e.blockedURI || ''); try { b = new URL(b).host || b; } catch (x) {}
    track('csp_violation', e.effectiveDirective || e.violatedDirective, null, { blocked: b.slice(0, 80), file: String(e.sourceFile || '').split('/').pop().slice(0, 60) });
  });
})();
