// Keeps the app's own files on the phone so it opens instantly (and offline).
// Bump VERSION whenever you change any file so phones pick up the update.
const VERSION = 'v1';
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/db.js', './js/config.js',
  './js/lib/dom.js', './js/lib/scale.js', './js/lib/importer.js',
  './js/views/setup.js', './js/views/login.js', './js/views/list.js',
  './js/views/detail.js', './js/views/form.js', './js/views/shop.js',
  './icons/icon-192.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isOwnFile = url.origin === location.origin;
  const isLibrary = url.hostname === 'cdn.jsdelivr.net';
  if (!isOwnFile && !isLibrary) return; // database calls always go straight to the network

  // Network first (so updates arrive), falling back to the saved copy when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
