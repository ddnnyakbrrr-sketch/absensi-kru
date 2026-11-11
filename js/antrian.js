/*
 * Absensi Kru Mobil Tangki
 * Hak Cipta (c) 2026 Deny Akbar
 * Versi V1
 *
 * Antrian kirim: setiap absen disimpan dulu di HP, lalu dikirim berurutan.
 * Kalau sinyal hilang atau server sibuk, data dicoba kirim lagi otomatis.
 */
(function (w) {
  'use strict';
  var AK = w.AK;
  var pendengar = [];
  var sedangKirim = false;
  var timer = null;

  function umumkan(acara, item, data) {
    pendengar.slice().forEach(function (fn) {
      try { fn(acara, item, data); } catch (e) { /* abaikan */ }
    });
  }

  function jadwal(ms) {
    if (timer) w.clearTimeout(timer);
    timer = w.setTimeout(function () { timer = null; antrian.proses(); }, Math.max(1000, ms));
  }

  var antrian = {
    dengar: function (fn) {
      pendengar.push(fn);
      return function () { pendengar = pendengar.filter(function (x) { return x !== fn; }); };
    },
    semua: function () {
      return AK.db.semua('antrian').then(function (d) {
        return (d || []).sort(function (a, b) { return a.dibuat - b.dibuat; });
      }, function () { return []; });
    },
    milikSesi: function () {
      var s = AK.sesi.ambil();
      return antrian.semua().then(function (d) {
        return d.filter(function (x) { return s && x.idKru === s.profil.id; });
      });
    },
    tambah: function (item) {
      item.status = 'menunggu';
      item.percobaan = 0;
      return AK.db.taruh('antrian', item).then(function () { umumkan('berubah', item); });
    },
    hapus: function (idKirim) {
      return AK.db.hapus('antrian', idKirim).then(function () { umumkan('berubah'); });
    },
    sedangMengirim: function () { return sedangKirim; },
    // Saat sinyal kembali, semua data langsung dicoba kirim tanpa menunggu jeda.
    segera: function () {
      return antrian.semua().then(function (d) {
        return Promise.all(d.filter(function (x) { return x.tungguSampai; }).map(function (x) {
          x.tungguSampai = 0;
          return AK.db.taruh('antrian', x);
        }));
      }).then(function () { return antrian.proses(); });
    },
    proses: function () {
      if (sedangKirim) return Promise.resolve();
      var s = AK.sesi.ambil();
      if (!s) return Promise.resolve();
      sedangKirim = true;
      umumkan('mulai');
      function berikut() {
        return antrian.semua().then(function (d) {
          var sesiKini = AK.sesi.ambil();
          if (!sesiKini) return null;
          var daftar = d.filter(function (x) { return x.status === 'menunggu' && x.idKru === sesiKini.profil.id; });
          if (!daftar.length) return null;
          var it = daftar[0];
          if (it.tungguSampai && it.tungguSampai > Date.now()) {
            jadwal(it.tungguSampai - Date.now());
            return null;
          }
          var data = Object.assign({}, it.data, { token: sesiKini.token, idHp: AK.idHp.ambil() });
          return AK.api.panggil(it.jenis, data, { batas: 120000 }).then(function (hasil) {
            return AK.db.hapus('antrian', it.idKirim).then(function () {
              if (hasil.status) AK.sesi.perbarui({ status: hasil.status });
              umumkan('terkirim', it, hasil);
              return berikut();
            });
          }, function (e) {
            if (e.jaringan || e.kode === 'SIBUK' || e.kode === 'SERVER') {
              it.percobaan = (it.percobaan || 0) + 1;
              it.pesan = e.pesan;
              var jeda = e.kode === 'SIBUK' ? 3000 + Math.random() * 5000
                : Math.min(60000, 5000 * Math.pow(2, Math.min(it.percobaan - 1, 4)));
              it.tungguSampai = Date.now() + jeda;
              return AK.db.taruh('antrian', it).then(function () {
                umumkan('gagalKirim', it, e);
                jadwal(jeda);
                return null;
              });
            }
            if (e.kode === 'SESI') {
              umumkan('sesi', it, e);
              return null;
            }
            it.status = 'ditolak';
            it.pesan = e.pesan;
            return AK.db.taruh('antrian', it).then(function () {
              umumkan('ditolak', it, e);
              return berikut();
            });
          });
        });
      }
      return berikut().catch(function () { jadwal(15000); }).then(function () {
        sedangKirim = false;
        umumkan('selesai');
      });
    },
    // Menambah data lalu menunggu hasil kirim sebentar. Kalau belum terkirim, data tetap aman di HP.
    kirimDanTunggu: function (item, batasMs) {
      return new Promise(function (selesai) {
        var beres = false;
        var diulang = false;
        var lepas = antrian.dengar(function (acara, it, data) {
          if (beres) return;
          var milikIni = it && it.idKirim === item.idKirim;
          if (milikIni && acara === 'terkirim') akhiri({ status: 'terkirim', hasil: data });
          else if (milikIni && acara === 'ditolak') akhiri({ status: 'ditolak', galat: data });
          // Antrian berhenti kalau sinyal putus atau sesi habis: data ini tetap aman di HP.
          else if (acara === 'sesi') akhiri({ status: 'tertunda', galat: data });
          else if (acara === 'gagalKirim' && data && data.jaringan) akhiri({ status: 'tertunda', galat: data });
          else if (acara === 'selesai') {
            AK.db.ambil('antrian', item.idKirim).then(function (x) {
              if (beres || !x || x.status !== 'menunggu') return;
              if (!x.percobaan && !diulang) {
                diulang = true;
                antrian.proses();
              } else {
                akhiri({ status: 'tertunda' });
              }
            }, function () {});
          }
        });
        function akhiri(h) {
          if (beres) return;
          beres = true;
          lepas();
          selesai(h);
        }
        antrian.tambah(item).then(function () { return antrian.segera(); }, function () {
          akhiri({ status: 'gagalSimpan' });
        });
        w.setTimeout(function () { akhiri({ status: 'tertunda' }); }, batasMs || 60000);
      });
    }
  };

  w.addEventListener('online', function () { antrian.segera(); });
  w.setInterval(function () { antrian.proses(); }, 30000);

  AK.antrian = antrian;
})(window);
