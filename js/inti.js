/*
 * Absensi Kru Mobil Tangki
 * Hak Cipta (c) 2026 Deny Akbar
 * Versi V1
 *
 * Fungsi inti: format tanggal WIB, jam server, penyimpanan di HP, ID HP, dan pemanggilan server.
 */
(function (w) {
  'use strict';
  var AK = w.AK = w.AK || {};
  var KONFIG = w.KONFIG || {};

  // ---------- Format tanggal dan angka (selalu WIB) ----------
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September',
    'Oktober', 'November', 'Desember'];
  var BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var WIB = 7 * 3600000;

  function bagian(ms) {
    var d = new Date(ms + WIB);
    return { th: d.getUTCFullYear(), bl: d.getUTCMonth(), tg: d.getUTCDate(), hr: d.getUTCDay(),
      j: d.getUTCHours(), m: d.getUTCMinutes(), d: d.getUTCSeconds() };
  }
  function dua(n) { return (n < 10 ? '0' : '') + n; }

  var util = {
    jam: function (ms, detik) {
      var b = bagian(ms);
      return dua(b.j) + ':' + dua(b.m) + (detik ? ':' + dua(b.d) : '');
    },
    tanggal: function (ms) {
      var b = bagian(ms);
      return HARI[b.hr] + ', ' + b.tg + ' ' + BULAN[b.bl] + ' ' + b.th;
    },
    tanggalPendek: function (ms) {
      var b = bagian(ms);
      return HARI[b.hr].slice(0, 3) + ', ' + b.tg + ' ' + BULAN_PENDEK[b.bl] + ' ' + b.th;
    },
    kunci: function (ms) {
      var b = bagian(ms);
      return b.th + '-' + dua(b.bl + 1) + '-' + dua(b.tg);
    },
    dariKunci: function (k) { return new Date(k + 'T00:00:00+07:00').getTime(); },
    kunciKeTeks: function (k) { return util.tanggal(util.dariKunci(k)); },
    menitHari: function (ms) { var b = bagian(ms); return b.j * 60 + b.m; },
    angka: function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); },
    meter: function (m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'; },
    durasi: function (menit) {
      var j = Math.floor(menit / 60);
      var m = menit % 60;
      return (j ? j + ' jam ' : '') + m + ' menit';
    },
    acakHex: function (nByte) {
      var b = new Uint8Array(nByte);
      w.crypto.getRandomValues(b);
      return Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    },
    uuid: function () {
      var h = util.acakHex(16);
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    },
    // Membuat elemen HTML tanpa memasukkan teks sebagai HTML (aman dari data aneh).
    h: function (tag, attr, anak) {
      var el = document.createElement(tag);
      if (attr) {
        Object.keys(attr).forEach(function (k) {
          var v = attr[k];
          if (v === null || v === undefined || v === false) return;
          if (k === 'class') el.className = v;
          else if (k === 'text') el.textContent = v;
          else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
          else el.setAttribute(k, v === true ? '' : v);
        });
      }
      var daftar = Array.isArray(anak) ? anak : (anak === undefined ? [] : [anak]);
      daftar.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
      return el;
    },
    kosongkan: function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  };

  // ---------- Penyimpanan kecil (localStorage) ----------
  var simpan = {
    ambil: function (k, bawaan) {
      try {
        var v = w.localStorage.getItem('ak_' + k);
        return v === null ? bawaan : JSON.parse(v);
      } catch (e) { return bawaan; }
    },
    taruh: function (k, v) {
      try { w.localStorage.setItem('ak_' + k, JSON.stringify(v)); } catch (e) { /* penyimpanan penuh */ }
    },
    hapus: function (k) {
      try { w.localStorage.removeItem('ak_' + k); } catch (e) { /* abaikan */ }
    }
  };

  // ---------- Penyimpanan besar (IndexedDB) untuk data yang belum terkirim ----------
  var db = (function () {
    var janji = null;
    function buka() {
      if (janji) return janji;
      janji = new Promise(function (ok, gagal) {
        if (!w.indexedDB) { gagal(new Error('Penyimpanan HP tidak tersedia')); return; }
        var r = w.indexedDB.open('absensi-kru', 1);
        r.onupgradeneeded = function () {
          var d = r.result;
          if (!d.objectStoreNames.contains('antrian')) d.createObjectStore('antrian', { keyPath: 'idKirim' });
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
        };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { janji = null; gagal(r.error); };
      });
      return janji;
    }
    function tx(store, mode, kerja) {
      return buka().then(function (d) {
        return new Promise(function (ok, gagal) {
          var t = d.transaction(store, mode);
          var hasil;
          var req = kerja(t.objectStore(store));
          if (req) req.onsuccess = function () { hasil = req.result; };
          t.oncomplete = function () { ok(hasil); };
          t.onerror = function () { gagal(t.error); };
          t.onabort = function () { gagal(t.error || new Error('Penyimpanan HP penuh')); };
        });
      });
    }
    return {
      semua: function (store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); },
      ambil: function (store, k) { return tx(store, 'readonly', function (s) { return s.get(k); }); },
      taruh: function (store, obj) { return tx(store, 'readwrite', function (s) { return s.put(obj); }); },
      hapus: function (store, k) { return tx(store, 'readwrite', function (s) { return s.delete(k); }); }
    };
  })();

  // ---------- ID HP ----------
  // Angka acak yang dibuat sekali di HP ini. Dipakai server untuk mengunci akun ke satu HP.
  var idHp = (function () {
    var nilai = simpan.ambil('idHp', null);
    return {
      siapkan: function () {
        if (nilai) {
          db.taruh('meta', { k: 'idHp', v: nilai }).catch(function () {});
          return Promise.resolve(nilai);
        }
        return db.ambil('meta', 'idHp').then(function (x) { return x && x.v; }, function () { return null; })
          .then(function (lama) {
            nilai = lama || util.acakHex(16);
            simpan.taruh('idHp', nilai);
            db.taruh('meta', { k: 'idHp', v: nilai }).catch(function () {});
            if (w.navigator.storage && w.navigator.storage.persist) w.navigator.storage.persist().catch(function () {});
            return nilai;
          });
      },
      ambil: function () { return nilai; }
    };
  })();

  // ---------- Jam server ----------
  // Jam yang dipakai di aplikasi adalah jam server. Selisihnya dicatat setiap ada balasan server,
  // jadi mengubah jam HP tidak mengubah jam absen.
  var waktu = (function () {
    var selisih = simpan.ambil('selisihJam', null);
    var terakhir = simpan.ambil('jamTerakhir', 0);
    var dasar = null;
    function perbaruiTerakhir(t) {
      if (t > terakhir) {
        terakhir = t;
        simpan.taruh('jamTerakhir', t);
      }
    }
    w.setInterval(function () {
      if (dasar) perbaruiTerakhir(dasar.server + (w.performance.now() - dasar.perf));
    }, 30000);
    return {
      catat: function (msServer, perfMulai, perfSelesai) {
        var rtt = perfSelesai - perfMulai;
        if (!(msServer > 0) || rtt > 4000) return;
        var perkiraan = msServer + rtt / 2;
        dasar = { server: perkiraan, perf: perfSelesai };
        selisih = perkiraan - Date.now();
        terakhir = perkiraan;
        simpan.taruh('selisihJam', selisih);
        simpan.taruh('jamTerakhir', perkiraan);
      },
      sekarang: function () {
        var t = Date.now() + (selisih || 0);
        if (dasar) t = Math.max(t, dasar.server + (w.performance.now() - dasar.perf));
        return Math.max(t, terakhir);
      },
      sudahSinkron: function () { return selisih !== null; }
    };
  })();

  // ---------- Sesi login ----------
  var sesi = {
    ambil: function () { return simpan.ambil('sesi', null); },
    taruh: function (s) { simpan.taruh('sesi', s); },
    perbarui: function (data) {
      var s = sesi.ambil();
      if (!s) return null;
      ['profil', 'pengaturan', 'lokasi', 'unit', 'p2h', 'status'].forEach(function (k) {
        if (data[k] !== undefined) s[k] = data[k];
      });
      if (data.tokenBaru) s.token = data.tokenBaru;
      if (data.status) s.statusDiterima = waktu.sekarang();
      sesi.taruh(s);
      return s;
    },
    hapus: function () { simpan.hapus('sesi'); }
  };

  // ---------- Server ----------
  function galat(pesan, sifat) {
    var e = new Error(pesan);
    e.pesan = pesan;
    Object.keys(sifat || {}).forEach(function (k) { e[k] = sifat[k]; });
    return e;
  }

  var api = {
    siap: function () {
      return /^https?:\/\/\S+$/.test(KONFIG.URL_API || '') && KONFIG.URL_API.indexOf('ISI_') < 0;
    },
    panggil: function (aksi, data, opsi) {
      opsi = opsi || {};
      if (!api.siap()) {
        return Promise.reject(galat('Alamat server belum diisi di config.js. Hubungi admin.', { kode: 'KONFIG' }));
      }
      var isi = JSON.stringify(Object.assign({ aksi: aksi, versi: KONFIG.VERSI }, data || {}));
      var kendali = w.AbortController ? new w.AbortController() : null;
      var batas = w.setTimeout(function () { if (kendali) kendali.abort(); }, opsi.batas || 45000);
      var mulai = w.performance.now();
      return w.fetch(KONFIG.URL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: isi,
        redirect: 'follow',
        cache: 'no-store',
        signal: kendali ? kendali.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw galat('Server tidak merespons (kode ' + res.status + '). Coba lagi nanti.', { jaringan: true });
        return res.text();
      }, function () {
        throw galat('Tidak ada sinyal atau koneksi terputus.', { jaringan: true });
      }).then(function (teks) {
        w.clearTimeout(batas);
        var json;
        try { json = JSON.parse(teks); } catch (e) {
          throw galat('Balasan server tidak terbaca. Kalau terus terjadi, hubungi admin.', { jaringan: true });
        }
        if (json.waktuServer) waktu.catat(json.waktuServer, mulai, w.performance.now());
        if (json.tokenBaru) sesi.perbarui({ tokenBaru: json.tokenBaru });
        if (!json.ok) throw galat(json.pesan || 'Permintaan ditolak server.', { kode: json.kode || 'TOLAK', data: json.data });
        return json;
      }, function (e) {
        w.clearTimeout(batas);
        if (!e || !e.pesan) throw galat('Koneksi terputus saat menerima balasan server.', { jaringan: true });
        throw e;
      });
    }
  };

  AK.util = util;
  AK.simpan = simpan;
  AK.db = db;
  AK.idHp = idHp;
  AK.waktu = waktu;
  AK.sesi = sesi;
  AK.api = api;
  AK.galat = galat;
})(window);
