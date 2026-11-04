// Service worker de la aplicación (RNF-12): permite instalarla en el celular y que abra rápido.
// Guarda solo los archivos de la propia aplicación. Los datos de la API no se guardan nunca:
// el stock tiene que estar siempre actualizado.
const CACHE = 'suma-voluntades-v1';
const BASE = ['/', '/index.html', '/manifest.webmanifest', '/logo.png', '/icono-192.png', '/icono-512.png'];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(cache => cache.addAll(BASE)));
  self.skipWaiting();
});

// Al activarse una versión nueva, se borran las copias de las anteriores
self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(c => c !== CACHE).map(c => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  // La API está en otro servidor y no se toca; tampoco los envíos de formularios
  if (pedido.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pantallas: primero la red, para tener siempre la última versión; sin conexión, la copia guardada
  if (pedido.mode === 'navigate') {
    evento.respondWith(
      fetch(pedido)
        .then(respuesta => {
          const copia = respuesta.clone();
          caches.open(CACHE).then(cache => cache.put('/index.html', copia));
          return respuesta;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Archivos de la aplicación (JS, CSS, imágenes): la copia guardada si existe. Los de /assets
  // cambian de nombre en cada versión, así que nunca quedan desactualizados.
  evento.respondWith(
    caches.match(pedido).then(guardado => guardado || fetch(pedido).then(respuesta => {
      if (respuesta.ok) {
        const copia = respuesta.clone();
        caches.open(CACHE).then(cache => cache.put(pedido, copia));
      }
      return respuesta;
    }))
  );
});
