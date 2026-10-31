/* ECHT – Service Worker: macht die App offline nutzbar. Es werden nur eigene Dateien gespeichert. */
const CACHE = 'echt-v9';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'css/app.css',
  'js/words.js', 'js/core.js', 'js/i18n.js', 'js/lang-en.js', 'js/ui.js', 'js/store.js', 'js/gate.js',
  'js/circle.js', 'js/seals.js', 'js/verify.js', 'js/settings.js', 'js/app.js',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Netz zuerst, Cache nur als Rückfall. So wird eine einmal ausgelieferte, falsche Datei beim
// nächsten Aufruf mit Verbindung sofort wieder durch die richtige ersetzt (kein „Nachlaufen“ des Caches).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([
        fetch(req, { cache: 'no-cache' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
      ]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
