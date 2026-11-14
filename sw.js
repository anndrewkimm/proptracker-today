// Cache only this app's shell. ESPN data is never silently served from this cache.
const CACHE = 'proptracker-shell-v4';
const HOME = new URL('./', self.location.href).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([HOME, new URL('insights.js',HOME).href])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const previous = (await caches.keys()).filter(k => k.startsWith('proptracker-shell-') && k !== CACHE);
    await self.clients.claim();
    // Existing tabs must receive the new HTML/CSS, not just refreshed ESPN data.
    if (previous.length) {
      await Promise.all(previous.map(k => caches.delete(k)));
      const windows = await self.clients.matchAll({type:'window'});
      await Promise.allSettled(windows.filter(c => c.url.startsWith(HOME)).map(c => c.navigate(c.url)));
    }
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === new URL('insights.js',HOME).pathname) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      try {
        const response = await fetch(event.request);
        if (!response.ok) throw Error('Script unavailable');
        await cache.put(event.request,response.clone()); return response;
      } catch(error) {const saved=await cache.match(event.request); if(saved) return saved; throw error;}
    }));
    return;
  }
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin
      || ![new URL(HOME).pathname, new URL('index.html', HOME).pathname].includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE).catch(() => null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(event.request, {signal: controller.signal});
      if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error('Page unavailable');
      if (cache) await cache.put(HOME, response.clone()).catch(() => {});
      return response;
    } catch (error) {
      const saved = cache && await cache.match(HOME);
      if (saved) return saved;
      throw error;
    } finally { clearTimeout(timer); }
  })());
});
