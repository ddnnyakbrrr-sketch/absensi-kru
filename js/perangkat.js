/*
 * Absensi Kru Mobil Tangki
 * Hak Cipta (c) 2026 Deny Akbar
 * Versi V2.1
 *
 * Akses perangkat HP: GPS, kamera (tanpa galeri), cap foto, dan kompres foto.
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
    // Posisi terakhir tetap disimpan saat pembacaan dimulai ulang (misalnya aplikasi ditinggal sebentar),
    // dan hanya dipakai kalau umurnya kurang dari 2 menit.
    mulai: function (batasAkurasi, cb) {
      lokasi.berhenti();
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
    jarak: jarakMeter
  };

  // ---------- Cap foto ----------
  // Logo untuk cap foto dimuat sekali dari file aplikasi (ikut tersimpan di HP, jadi tetap ada tanpa sinyal).
  var logoCap = new w.Image();
  logoCap.src = 'assets/logo-patra-logistik.png';
  function logoSiap() { return logoCap.complete && logoCap.naturalWidth > 0; }

  // Huruf ramping seperti kamera lapangan. Di Android memakai Roboto Condensed bawaan HP.
  var HURUF = '"Roboto Condensed", "sans-serif-condensed", "Arial Narrow", Roboto, "Helvetica Neue", Arial, sans-serif';

  function kotakBulat(x, kiri, atas, lebar, tinggi, r) {
    x.beginPath();
    x.moveTo(kiri + r, atas);
    x.arcTo(kiri + lebar, atas, kiri + lebar, atas + tinggi, r);
    x.arcTo(kiri + lebar, atas + tinggi, kiri, atas + tinggi, r);
    x.arcTo(kiri, atas + tinggi, kiri, atas, r);
    x.arcTo(kiri, atas, kiri + lebar, atas, r);
    x.closePath();
  }

  // Potong teks yang terlalu panjang dan beri tanda "..." di akhir.
  function potong(x, teks, lebar) {
    teks = String(teks);
    if (x.measureText(teks).width <= lebar) return teks;
    while (teks.length > 1 && x.measureText(teks + '...').width > lebar) teks = teks.slice(0, -1);
    return teks + '...';
  }

  // Pecah teks panjang menjadi beberapa baris (paling banyak "maks" baris).
  function bungkus(x, teks, lebar, maks) {
    var hasil = [];
    var kini = '';
    String(teks).split(/\s+/).forEach(function (kata) {
      var coba = kini ? kini + ' ' + kata : kata;
      if (!kini || x.measureText(coba).width <= lebar) kini = coba;
      else { hasil.push(kini); kini = kata; }
    });
    if (kini) hasil.push(kini);
    if (hasil.length > maks) {
      hasil = hasil.slice(0, maks);
      hasil[maks - 1] = potong(x, hasil[maks - 1] + ' ...', lebar);
    }
    return hasil.map(function (b) { return potong(x, b, lebar); });
  }

  function bayangan(x, u, nyala) {
    x.shadowColor = nyala ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0)';
    x.shadowBlur = nyala ? Math.round(6 * u) : 0;
    x.shadowOffsetX = 0;
    x.shadowOffsetY = nyala ? Math.max(1, Math.round(2 * u)) : 0;
  }

  // Koordinat gaya kamera lapangan, contoh "2.471375°S, 111.911559°E".
  function koordinatCap(g) {
    return Math.abs(g.lat).toFixed(6) + '°' + (g.lat < 0 ? 'S' : 'N') + ', ' +
      Math.abs(g.lng).toFixed(6) + '°' + (g.lng < 0 ? 'W' : 'E');
  }

  // Nopol dengan spasi, contoh "KH8773TN" menjadi "KH 8773 TN".
  function nopolCap(n) {
    var t = String(n || '').toUpperCase();
    var m = t.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
    return m ? [m[1], m[2], m[3]].filter(Boolean).join(' ') : (t || '-');
  }

  // Cap foto: logo di kiri atas; jam besar, tanggal, hari, alamat, dan data kru di bagian bawah foto;
  // lalu pita putih berisi nama perusahaan dan lokasi kerja di bawah foto.
  // info: { label, jam, tanggal, hari, alamat, baris: [teks...], namaPT, lokasiKerja, warna }
  function cap(c, info) {
    var W = c.width;
    var H = c.height;
    var u = Math.min(W, H) / 960;
    var m = Math.round(26 * u);
    var pita = Math.round(170 * u);
    var out = w.document.createElement('canvas');
    out.width = W;
    out.height = H + pita;
    var x = out.getContext('2d');
    x.drawImage(c, 0, 0);

    // Bagian bawah foto digelapkan sedikit supaya tulisan putih mudah dibaca.
    var gelap = x.createLinearGradient(0, H * 0.4, 0, H);
    gelap.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gelap.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    x.fillStyle = gelap;
    x.fillRect(0, Math.floor(H * 0.4), W, H - Math.floor(H * 0.4));

    // Kotak data kru (paling bawah)
    var fP = Math.round(36 * u);
    var tbP = Math.round(60 * u);
    var padP = Math.round(18 * u);
    x.font = fP + 'px ' + HURUF;
    var lebarIsi = 0;
    info.baris.forEach(function (t) { lebarIsi = Math.max(lebarIsi, x.measureText(t).width); });
    var lebarP = Math.min(W - 2 * m, lebarIsi + 2 * padP);
    var tinggiP = info.baris.length * tbP + padP;
    var atasP = H - m - tinggiP;
    bayangan(x, u, false);
    x.fillStyle = 'rgba(0, 0, 0, 0.38)';
    kotakBulat(x, m, atasP, lebarP, tinggiP, Math.round(10 * u));
    x.fill();
    bayangan(x, u, true);
    x.fillStyle = '#FFFFFF';
    x.textBaseline = 'middle';
    info.baris.forEach(function (t, i) {
      x.fillText(potong(x, t, lebarP - 2 * padP), m + padP, atasP + padP / 2 + tbP * i + tbP / 2);
    });

    // Alamat di atas kotak data kru
    var fA = Math.round(36 * u);
    var tbA = Math.round(46 * u);
    x.font = fA + 'px ' + HURUF;
    var barisAlamat = info.alamat ? bungkus(x, info.alamat, Math.min(W - 2 * m, 700 * u), 4) : [];
    var atasA = atasP - Math.round(16 * u) - barisAlamat.length * tbA;
    barisAlamat.forEach(function (t, i) { x.fillText(t, m, atasA + tbA * i + tbA / 2); });

    // Jam besar, garis tegak, lalu tanggal dan hari
    var fJ = Math.round(120 * u);
    x.font = fJ + 'px ' + HURUF;
    x.textBaseline = 'alphabetic';
    var bawahJ = atasA - Math.round(18 * u);
    var atasJ = bawahJ - Math.round(fJ * 0.72);
    x.fillText(info.jam, m, bawahJ);
    var xGaris = m + x.measureText(info.jam).width + Math.round(20 * u);
    x.fillRect(xGaris, atasJ, Math.max(2, Math.round(5 * u)), bawahJ - atasJ);
    var fT = Math.round(40 * u);
    x.font = fT + 'px ' + HURUF;
    var xTgl = xGaris + Math.round(22 * u);
    var lebarTgl = W - m - xTgl;
    x.fillText(potong(x, info.tanggal, lebarTgl), xTgl, atasJ + Math.round(fT * 0.8));
    x.fillText(potong(x, info.hari, lebarTgl), xTgl, bawahJ);

    // Label jenis foto di atas jam, contoh "ABSEN MASUK"
    var fL = Math.round(26 * u);
    var padL = Math.round(10 * u);
    x.font = 'bold ' + fL + 'px ' + HURUF;
    var tinggiL = fL + Math.round(14 * u);
    var atasL = atasJ - Math.round(20 * u) - tinggiL;
    bayangan(x, u, false);
    x.fillStyle = info.warna || '#006CB8';
    kotakBulat(x, m, atasL, x.measureText(info.label).width + 2 * padL, tinggiL, Math.round(6 * u));
    x.fill();
    x.fillStyle = '#FFFFFF';
    x.textBaseline = 'middle';
    x.fillText(info.label, m + padL, atasL + tinggiL / 2);

    // Logo di kiri atas, di atas latar putih supaya tetap terlihat di foto yang gelap
    if (logoSiap()) {
      var tLogo = Math.round(64 * u);
      var padLogo = Math.round(10 * u);
      var lLogo = tLogo * logoCap.naturalWidth / logoCap.naturalHeight;
      x.fillStyle = 'rgba(255, 255, 255, 0.88)';
      kotakBulat(x, m, m, lLogo + 2 * padLogo, tLogo + 2 * padLogo, Math.round(8 * u));
      x.fill();
      x.drawImage(logoCap, m + padLogo, m + padLogo, lLogo, tLogo);
    }

    // Pita putih di bawah foto
    x.fillStyle = '#FFFFFF';
    x.fillRect(0, H, W, pita);
    var kiriPita = Math.round(40 * u);
    var lebarTeks = W * 0.56 - kiriPita;
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#101828';
    x.font = 'bold ' + Math.round(44 * u) + 'px ' + HURUF;
    x.fillText(potong(x, info.namaPT, lebarTeks), kiriPita, H + Math.round(pita * 0.46));
    x.fillStyle = '#344054';
    x.font = Math.round(34 * u) + 'px ' + HURUF;
    x.fillText(potong(x, info.lokasiKerja, lebarTeks), kiriPita, H + Math.round(pita * 0.8));
    x.strokeStyle = '#D0D5DD';
    x.lineWidth = Math.max(1, Math.round(2 * u));
    x.beginPath();
    x.moveTo(W * 0.6, H + pita);
    x.lineTo(W * 0.66, H);
    x.stroke();
    if (logoSiap()) {
      var lb = Math.min(W * 0.3, (pita * 0.5) * logoCap.naturalWidth / logoCap.naturalHeight);
      var tb = lb * logoCap.naturalHeight / logoCap.naturalWidth;
      x.drawImage(logoCap, W - kiriPita - lb, H + (pita - tb) / 2, lb, tb);
    }
    return out;
  }

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
    // Ambil gambar dari video apa adanya (tidak dibalik), sisi terpanjang maksimal 960 px supaya cepat dikirim.
    jepret: function (video) {
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      var skala = Math.min(1, 960 / Math.max(vw, vh));
      var c = w.document.createElement('canvas');
      c.width = Math.round(vw * skala);
      c.height = Math.round(vh * skala);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      return c;
    },
    // Cap foto (lihat fungsi cap di atas). Mengembalikan kanvas baru yang lebih tinggi karena ada pita di bawah.
    cap: cap,
    koordinatCap: koordinatCap,
    nopolCap: nopolCap,
    // Kompres JPEG sampai di bawah 140 KB.
    kompres: function (c) {
      var target = 140 * 1024;
      var kualitas = [0.8, 0.7, 0.6, 0.5, 0.45];
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

  AK.lokasi = lokasi;
  AK.kamera = kamera;
})(window);
