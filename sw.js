// Service worker minimal: permet l'installation sur le téléphone.
// Les pages et l'API passent toujours par le réseau (pas de données périmées).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => new Response('Pas de connexion. Réessaie dans un instant.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
