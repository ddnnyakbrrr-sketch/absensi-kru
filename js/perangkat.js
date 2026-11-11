/*
 * Absensi Kru Mobil Tangki
 * Hak Cipta (c) 2026 Deny Akbar
 * Versi V1
 *
 * Akses perangkat HP: GPS, kamera (tanpa galeri), cap foto, kompres foto, dan scan QR.
 */
(function (w) {
  'use strict';
  var AK = w.AK;
  var util = AK.util;

  // ---------- GPS ----------
  function pesanGalatLokasi(e) {
    if (e && e.code === 1) {
      return 'Izin lokasi ditolak. Buka pengaturan browser, izinkan lokasi untuk aplikasi ini, lalu coba lagi.';
    }
    if (e && e.code === 2) return 'Lokasi belum aktif. Nyalakan lokasi (GPS) di HP lalu coba lagi.';
    return 'Lokasi belum ditemukan. Pindah ke tempat terbuka, tunggu sebentar, lalu coba lagi.';
  }

  function jarakMeter(a, b) {
    var R = 6371000;
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var s = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  var lokasi = {
    _id: null,
    _terakhir: null,
    _bagus: null,
    mulai: function (batasAkurasi, cb) {
      lokasi.berhenti();
      lokasi._terakhir = null;
      lokasi._bagus = null;
      if (!w.navigator.geolocation) {
        cb({ galat: 'HP ini tidak bisa membaca lokasi. Pakai HP lain atau hubungi admin.' });
        return;
      }
      lokasi._id = w.navigator.geolocation.watchPosition(function (p) {
        var pos = { lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy, waktu: Date.now() };
        lokasi._terakhir = pos;
        if (pos.akurasi <= batasAkurasi) lokasi._bagus = pos;
        cb({ pos: pos });
      }, function (e) {
        cb({ galat: pesanGalatLokasi(e), kode: e.code });
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    },
    berhenti: function () {
      if (lokasi._id !== null) w.navigator.geolocation.clearWatch(lokasi._id);
      lokasi._id = null;
    },
    // Posisi terbaru yang akurasinya memenuhi batas (paling lama 2 menit yang lalu).
    bagus: function () {
      var b = lokasi._bagus;
      return b && Date.now() - b.waktu < 120000 ? b : null;
    },
    terakhir: function () { return lokasi._terakhir; },
    jarak: jarakMeter,
    terdekat: function (pos, daftar) {
      var dalam = null;
      var dekat = null;
      (daftar || []).forEach(function (l) {
        var d = jarakMeter(pos, l);
        var x = { nama: l.nama, jarak: d, radius: l.radius, didalam: d <= l.radius };
        if (x.didalam && (!dalam || d < dalam.jarak)) dalam = x;
        if (!dekat || d < dekat.jarak) dekat = x;
      });
      return dalam || dekat;
    }
  };

  // ---------- Kamera ----------
  function galatKamera(e) {
    var n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') {
      return AK.galat('Izin kamera ditolak. Buka pengaturan browser, izinkan kamera untuk aplikasi ini, lalu coba lagi.');
    }
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') {
      return AK.galat('Kamera tidak ditemukan di HP ini.');
    }
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') {
      return AK.galat('Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain yang memakai kamera, lalu coba lagi.');
    }
    return AK.galat((e && e.pesan) || 'Kamera tidak bisa dibuka. Tutup aplikasi, buka lagi, lalu coba lagi.');
  }

  function tungguVideo(video) {
    return new Promise(function (ok, gagal) {
      var mulai = Date.now();
      (function cek() {
        if (video.videoWidth > 0 && video.readyState >= 2) return ok();
        if (Date.now() - mulai > 10000) return gagal(AK.galat('Kamera tidak menampilkan gambar. Tutup aplikasi, buka lagi, lalu coba lagi.'));
        w.setTimeout(cek, 100);
      })();
    });
  }

  function blobKeDataUrl(blob) {
    return new Promise(function (ok, gagal) {
      var r = new w.FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { gagal(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function kanvasKeBlob(c, kualitas) {
    return new Promise(function (ok) {
      if (c.toBlob) {
        c.toBlob(function (b) { ok(b); }, 'image/jpeg', kualitas);
        return;
      }
      var url = c.toDataURL('image/jpeg', kualitas);
      var biner = w.atob(url.split(',')[1]);
      var arr = new Uint8Array(biner.length);
      for (var i = 0; i < biner.length; i++) arr[i] = biner.charCodeAt(i);
      ok(new w.Blob([arr], { type: 'image/jpeg' }));
    });
  }

  var kamera = {
    stream: null,
    buka: function (video, arah) {
      kamera.tutup();
      if (!w.navigator.mediaDevices || !w.navigator.mediaDevices.getUserMedia) {
        return Promise.reject(AK.galat('Kamera tidak tersedia. Buka aplikasi lewat Chrome (Android) atau Safari (iPhone) dengan alamat https.'));
      }
      var md = w.navigator.mediaDevices;
      return md.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: arah }, width: { ideal: 1280 }, height: { ideal: 960 } }
      }).catch(function (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
        return md.getUserMedia({ audio: false, video: true });
      }).then(function (s) {
        kamera.stream = s;
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.muted = true;
        video.srcObject = s;
        var main = video.play();
        return (main && main.catch ? main.catch(function () {}) : Promise.resolve()).then(function () {
          return tungguVideo(video);
        });
      }).catch(function (e) {
        kamera.tutup();
        throw e && e.pesan ? e : galatKamera(e);
      });
    },
    tutup: function () {
      if (kamera.stream) kamera.stream.getTracks().forEach(function (t) { t.stop(); });
      kamera.stream = null;
    },
    bisaSenter: function () {
      var t = kamera.stream && kamera.stream.getVideoTracks()[0];
      try {
        var cap = t && t.getCapabilities && t.getCapabilities();
        return !!(cap && cap.torch);
      } catch (e) { return false; }
    },
    senter: function (nyala) {
      var t = kamera.stream && kamera.stream.getVideoTracks()[0];
      if (!t || !t.applyConstraints) return Promise.resolve(false);
      return t.applyConstraints({ advanced: [{ torch: !!nyala }] }).then(function () { return true; }, function () { return false; });
    },
    // Ambil gambar dari video apa adanya (tidak dibalik), sisi terpanjang maksimal 1280 px.
    jepret: function (video) {
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      var skala = Math.min(1, 1280 / Math.max(vw, vh));
      var c = w.document.createElement('canvas');
      c.width = Math.round(vw * skala);
      c.height = Math.round(vh * skala);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      return c;
    },
    // Cap teks di bagian bawah foto.
    cap: function (c, baris) {
      var ctx = c.getContext('2d');
      var ukuran = Math.max(14, Math.round(Math.min(c.width, c.height) * 0.036));
      var pad = Math.round(ukuran * 0.6);
      ctx.font = 'bold ' + ukuran + 'px Arial, Helvetica, sans-serif';
      var lebarMaks = 0;
      baris.forEach(function (t) { lebarMaks = Math.max(lebarMaks, ctx.measureText(t).width); });
      if (lebarMaks > c.width - pad * 2) ukuran = Math.max(10, Math.floor(ukuran * (c.width - pad * 2) / lebarMaks));
      var jarak = Math.round(ukuran * 1.3);
      var tinggi = pad * 2 + jarak * baris.length;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
      ctx.fillRect(0, c.height - tinggi, c.width, tinggi);
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'top';
      baris.forEach(function (t, i) {
        ctx.font = (i === 0 ? 'bold ' : '') + ukuran + 'px Arial, Helvetica, sans-serif';
        ctx.fillText(t, pad, c.height - tinggi + pad + i * jarak + Math.round((jarak - ukuran) / 2));
      });
      return c;
    },
    // Kompres JPEG sampai di bawah 200 KB.
    kompres: function (c) {
      var target = 195 * 1024;
      var kualitas = [0.82, 0.72, 0.62, 0.52, 0.45];
      function coba(cv, i) {
        return kanvasKeBlob(cv, kualitas[i]).then(function (b) {
          if (b && b.size <= target) return b;
          if (i + 1 < kualitas.length) return coba(cv, i + 1);
          if (Math.max(cv.width, cv.height) <= 640) return b;
          var kecil = w.document.createElement('canvas');
          kecil.width = Math.round(cv.width * 0.8);
          kecil.height = Math.round(cv.height * 0.8);
          kecil.getContext('2d').drawImage(cv, 0, 0, kecil.width, kecil.height);
          return coba(kecil, 2);
        });
      }
      return coba(c, 0).then(function (b) {
        return blobKeDataUrl(b).then(function (url) { return { dataUrl: url, ukuran: b.size }; });
      });
    }
  };

  // ---------- Scan QR ----------
  // Memakai pembaca QR bawaan browser kalau ada. Kalau tidak ada (misalnya iPhone), library jsQR
  // baru dimuat saat scan pertama, supaya aplikasi tetap cepat dibuka di HP murah.
  var janjiJsqr = null;
  function muatJsqr() {
    if (w.jsQR) return Promise.resolve();
    if (janjiJsqr) return janjiJsqr;
    janjiJsqr = new Promise(function (ok, gagal) {
      var s = w.document.createElement('script');
      s.src = 'lib/jsQR.js';
      s.onload = function () { ok(); };
      s.onerror = function () {
        janjiJsqr = null;
        gagal(new Error('Pembaca QR tidak bisa dimuat'));
      };
      w.document.head.appendChild(s);
    });
    return janjiJsqr;
  }

  var qr = {
    _jalan: false,
    mulai: function (video, cb) {
      qr._jalan = true;
      var detektor = null;
      var siap = Promise.resolve();
      if (typeof w.BarcodeDetector === 'function' && typeof w.BarcodeDetector.getSupportedFormats === 'function') {
        try {
          siap = w.BarcodeDetector.getSupportedFormats().then(function (f) {
            if (f && f.indexOf('qr_code') >= 0) detektor = new w.BarcodeDetector({ formats: ['qr_code'] });
          }).catch(function () { detektor = null; });
        } catch (e) {
          detektor = null;
        }
      }
      siap = siap.then(function () {
        if (!detektor) return muatJsqr().catch(function () {});
      });
      var kanvas = w.document.createElement('canvas');
      var ctx = kanvas.getContext('2d', { willReadFrequently: true });
      function bacaJsqr() {
        if (!w.jsQR) {
          muatJsqr().catch(function () {});
          return null;
        }
        var vw = video.videoWidth;
        var vh = video.videoHeight;
        var s = Math.min(1, 720 / Math.max(vw, vh));
        kanvas.width = Math.round(vw * s);
        kanvas.height = Math.round(vh * s);
        ctx.drawImage(video, 0, 0, kanvas.width, kanvas.height);
        var data = ctx.getImageData(0, 0, kanvas.width, kanvas.height);
        var hasil = w.jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' });
        return hasil ? hasil.data : null;
      }
      function langkah() {
        if (!qr._jalan) return;
        if (video.readyState < 2 || !video.videoWidth) {
          w.setTimeout(langkah, 200);
          return;
        }
        var p = detektor
          ? detektor.detect(video).then(function (h) { return h && h.length ? h[0].rawValue : null; })
            .catch(function () { detektor = null; return null; })
          : Promise.resolve().then(bacaJsqr);
        p.then(function (teks) {
          if (!qr._jalan) return;
          if (teks) {
            qr._jalan = false;
            cb(teks);
          } else {
            w.setTimeout(langkah, 150);
          }
        });
      }
      siap.then(langkah);
    },
    berhenti: function () { qr._jalan = false; }
  };

  AK.lokasi = lokasi;
  AK.kamera = kamera;
  AK.qr = qr;
})(window);
