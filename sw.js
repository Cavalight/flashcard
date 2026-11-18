// sw.js - service worker: simpan file app di HP supaya bisa dibuka offline.
// Strategi: online -> ambil versi terbaru dari situs (maks 3 detik), lalu simpan ke cache.
//           offline / sinyal jelek -> pakai salinan di cache.
// PENTING: tiap kali ngubah file app (index.html, *.js), naikkan angka VERSI di bawah
//          supaya HP membuang cache lama.

var VERSI = "v1";
var NAMA_CACHE = "flashcard-uas-" + VERSI;
var FILE_APP = [
  "./",
  "index.html",
  "jadwal.js",
  "impor.js",
  "backup.js",
  "manifest.json",
  "ikon-192.png",
  "ikon-512.png",
  "ikon-maskable-512.png",
  "apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(NAMA_CACHE)
      .then(function (c) { return c.addAll(FILE_APP); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (nama) {
        return Promise.all(nama.filter(function (n) {
          return n.indexOf("flashcard-uas-") === 0 && n !== NAMA_CACHE;
        }).map(function (n) { return caches.delete(n); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function dariJaringan(req) {
  return new Promise(function (ok, gagal) {
    var selesai = false;
    var timer = setTimeout(function () { if (!selesai) { selesai = true; gagal(new Error("timeout")); } }, 3000);
    fetch(req).then(function (res) {
      if (selesai) return;
      selesai = true; clearTimeout(timer);
      ok(res);
    }, function (err) {
      if (selesai) return;
      selesai = true; clearTimeout(timer);
      gagal(err);
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    dariJaringan(req).then(function (res) {
      if (res && res.ok) {
        var salinan = res.clone();
        // ?hari=... (mode uji) dianggap halaman yang sama dengan index
        var kunci = req.mode === "navigate" ? new Request(url.pathname) : req;
        caches.open(NAMA_CACHE).then(function (c) { c.put(kunci, salinan); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match("index.html");
      });
    })
  );
});