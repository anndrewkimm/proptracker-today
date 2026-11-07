// Cache only this app's shell. ESPN data is never silently served from this cache.
const CACHE = 'proptracker-shell-v1';
const HOME = new URL('./', self.location.href).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(HOME)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin
      || ![new URL(HOME).pathname, new URL('index.html', HOME).pathname].includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(event.request, {signal: controller.signal});
      if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error('Page unavailable');
      await cache.put(HOME, response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match(HOME);
      if (saved) return saved;
      throw error;
    } finally { clearTimeout(timer); }
  })());
});
