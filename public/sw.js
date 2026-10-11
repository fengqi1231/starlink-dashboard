/* 星链智运 PWA Service Worker：静态资源缓存 + API 网络优先 */
const CACHE = 'starlink-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/echarts.min.js',
  '/js/china.js',
  '/js/icons.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  /* API：网络优先，离线返回明确错误 */
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(
        JSON.stringify({ error: 'OFFLINE', message: '网络不可用' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }
  /* 静态资源：缓存优先，后台更新 */
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok && e.request.method === 'GET' && url.origin === location.origin) {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, cp));
      }
      return r;
    }))
  );
});
