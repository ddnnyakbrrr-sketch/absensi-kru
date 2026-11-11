/*
 * Absensi Kru Mobil Tangki
 * Hak Cipta (c) 2026 Deny Akbar
 * Versi V1
 *
 * Service worker: menyimpan file aplikasi di HP supaya tetap bisa dibuka tanpa sinyal.
 * Nama cache mengikuti VERSI di config.js. Saat VERSI dinaikkan, HP mengunduh versi baru
 * lalu aplikasi menampilkan "Versi baru tersedia, ketuk untuk muat ulang".
 */
importScripts('config.js');

var CACHE = 'absensi-kru-' + self.KONFIG.VERSI;
var FILE_WAJIB = [
  './',
  'index.html',
  'panduan-kru.html',
  'config.js',
  'manifest.webmanifest',
  'css/app.css',
  'js/inti.js',
  'js/perangkat.js',
  'js/antrian.js',
  'js/alur.js',
  'js/app.js',
  'lib/jsQR.js',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png'
];
// File gambar ini ikut disimpan kalau ada.
var FILE_PILIHAN = ['assets/logo-patra-logistik.png', 'assets/logo-pertamina.png', 'assets/wallpaper.webp'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(FILE_WAJIB.map(function (u) { return new Request(u, { cache: 'reload' }); }))
      .then(function () {
        return Promise.all(FILE_PILIHAN.map(function (u) {
          return fetch(new Request(u, { cache: 'reload' })).then(function (res) {
            if (res.ok) return cache.put(u, res);
          }).catch(function () { /* logo belum ada */ });
        }));
      });
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (daftar) {
    return Promise.all(daftar.filter(function (k) {
      return k.indexOf('absensi-kru-') === 0 && k !== CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.tipe === 'PAKAI_VERSI_BARU') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (ada) {
        if (ada) return ada;
        return fetch(req).then(function (res) {
          if (res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(function () {
          if (req.mode === 'navigate') return cache.match('index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      });
    })
  );
});
