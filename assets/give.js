/* Support the music: while offline, the support link is paused (no dead tap); restored when back online. Sends nothing. */
(function () {
  var links = document.querySelectorAll('[data-give-link]');
  function sync() {
    links.forEach(function (a) {
      if (!a.dataset.href && a.getAttribute('href')) a.dataset.href = a.getAttribute('href');
      if (!a.dataset.href) return;
      if (navigator.onLine === false) { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); a.title = 'Giving needs a connection'; }
      else { a.setAttribute('href', a.dataset.href); a.removeAttribute('aria-disabled'); a.removeAttribute('title'); }
    });
  }
  sync(); window.addEventListener('online', sync); window.addEventListener('offline', sync);
})();
