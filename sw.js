/* The Producer of Tracks: service worker.
   - Same-origin only. Never touches YouTube, Spotify, Apple, payment links, mail or any other cross-origin request.
   - Precaches a small shell (pages, code, encounter art, icons) so the encounters and readings open offline.
   - Network-first for the shell (fresh code when online, cached copy when not), cache-first for images.
   - Versioned cache; on activate it deletes only older caches that start with this app's own prefix.
   - A new version waits until the visitor taps "Refresh" (no surprise reloads while someone is listening).
   Rollback: deploy the previous files with a NEW CACHE_VERSION, or ship a kill-switch sw.js (see README). */
var PREFIX = 'tpot-world-';
var CACHE_VERSION = PREFIX + 'v41-well-search';
var SHELL = [
  './', './index.html', './bid-me-come/', './find-me/', './find-me/album.css', './find-me/album.js', './find-me/lyrics.js', './find-me/lyric-cues.json', './find-me/story.js', './find-me/press.js', './find-me/story.css', './styles.css', './app.js', './world.js', './manifest.webmanifest', './assets/tpot-measure.js',
  './assets/bid-me-come.jpg', './assets/the-floor-moved.jpg', './assets/find-me.jpg', './assets/find-me-cover.jpg', './assets/doorway.jpg',
  './well/', './well/well.css', './well/well.js', './well/scene.js', './well/assets/the-well.jpg', './well/assets/icon-192.png',
  './well/scene/back.jpg', './well/scene/water.jpg', './well/scene/jar.webp', './well/scene/jesus-rest.webp', './well/scene/jesus-speak.webp',
  './well/scene/woman-walk.webp', './well/scene/woman-stand.webp', './well/scene/woman-empty.webp', './well/scene/woman-go.webp', './well/scene/people.webp',
  './roof/', './roof/roof.css', './roof/roof.js', './roof/roof.jpg',
  './medicine/', './medicine/medicine.css', './medicine/medicine.js',
  './blood/', './blood/blood.css', './blood/blood.js',
  './store/', './assets/give.js', './assets/tpot-2026.css', './assets/tpot-encounter.css', './find-me/player.js', './find-me/player.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];
var SHELL_URLS = SHELL.map(function (p) { return new URL(p, self.registration.scope).href; });

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(SHELL); }));
  // no skipWaiting here: the page asks first
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE_VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // cross-origin: browser default, never cached

  var isNav = req.mode === 'navigate';
  var isImage = req.destination === 'image';
  var known = SHELL_URLS.indexOf(url.origin + url.pathname) >= 0;

  if (isImage) {                                                   // stable artwork: cache-first
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req);
    }));
    return;
  }
  if (isNav || known) {                                            // shell: network-first, bounded wait, cached fallback
    e.respondWith(Promise.race([fetch(req), timeout(5000)]).then(function (res) {
      if (res && res.ok && known) { var copy = res.clone(); caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (isNav ? caches.match('./index.html') : Response.error());
      });
    }));
  }
  // anything else same-origin (sitemap, robots, unknown files): browser default, not cached
});
