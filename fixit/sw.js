/* FixIt Service Worker v2.0 – Production */
const CACHE     = 'fixit-v2';
const IMMUTABLE = 'fixit-static-v2';

const PRECACHE = [
  '/', '/index.html',
  '/css/app.css',
  '/js/db.js', '/js/auth.js', '/js/map.js', '/js/app.js', '/js/router.js', '/js/api.js',
  '/pages/home.html', '/pages/search.html', '/pages/booking.html',
  '/pages/tracking.html', '/pages/profile.html', '/pages/chat.html',
  '/pages/payment.html', '/pages/history.html', '/pages/auth.html',
  '/pages/tech-dash.html', '/pages/admin.html', '/pages/review.html',
  '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, {cache:'reload'}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMMUTABLE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({error:'offline'}),{headers:{'Content-Type':'application/json'}}))
    );
    return;
  }

  // Cache-first for static assets, network fallback
  e.respondWith(
    caches.match(request).then(cached => {
      const net = fetch(request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(request, res.clone()));
        return res;
      }).catch(() => cached || fetch('/index.html'));
      return cached || net;
    })
  );
});

self.addEventListener('push', e => {
  const d = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(d.title || 'FixIt', {
    body: d.body || 'New update', icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png', tag: d.tag || 'fixit', data: d.url || '/'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
