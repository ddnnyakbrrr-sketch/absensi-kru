/*
 * Absensi Kru Mobil Tangki
 * Hak Cipta (c) 2026 Deny Akbar
 * Versi V1
 *
 * Tampilan utama: login, beranda, daftar data yang belum terkirim, pemberitahuan, dan pemasangan aplikasi.
 */
(function (w) {
  'use strict';
  var AK = w.AK;
  var util = AK.util;
  var h = util.h;
  var KONFIG = w.KONFIG || {};
  var d = w.document;

  var app = AK.app = {};
  var tampilanAktif = null;
  var promptPasang = null;
  var workerBaru = null;

  function $(id) { return d.getElementById(id); }

  // ---------- Warna utama dari config.js ----------
  (function terapkanWarna() {
    var hex = KONFIG.WARNA_UTAMA;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return;
    var n = parseInt(hex.slice(1), 16);
    var rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    function jadi(f) {
      return '#' + rgb.map(function (x) { var v = Math.round(f(x)); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
    }
    var gaya = d.documentElement.style;
    gaya.setProperty('--biru', hex);
    gaya.setProperty('--biru-tekan', jadi(function (x) { return x * 0.75; }));
    gaya.setProperty('--biru-muda', jadi(function (x) { return x + (255 - x) * 0.88; }));
    var meta = d.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', hex);
  })();

  // ---------- Tampilan ----------
  app.tampilkan = function (id, tanpaHistori) {
    ['v-login', 'v-beranda', 'v-alur'].forEach(function (v) { $(v).hidden = v !== id; });
    d.body.classList.toggle('halaman-masuk', id === 'v-login');
    if (id !== 'v-alur') app.tutupBar();
    if (id !== 'v-login' && id !== 'v-beranda' && !tanpaHistori) w.history.pushState({ v: id }, '');
    tampilanAktif = id;
    w.scrollTo(0, 0);
  };

  w.addEventListener('popstate', function () {
    if (AK.alur && AK.alur.kameraTerbuka()) { AK.alur.tutupKamera(); w.history.pushState({ v: tampilanAktif }, ''); return; }
    if (tampilanAktif === 'v-alur') {
      w.history.pushState({ v: 'v-alur' }, '');
      AK.alur.minta_batal();
      return;
    }
    if (tampilanAktif !== 'v-login' && tampilanAktif !== 'v-beranda') app.beranda();
  });

  // ---------- Tombol yang tetap di bawah layar (dipakai saat absen) ----------
  app.isiBar = function (tombol) {
    var isi = util.kosongkan($('bar-isi'));
    tombol.forEach(function (t) { isi.appendChild(t); });
    $('bar-aksi').hidden = false;
    d.body.classList.add('ada-bar');
  };
  app.tutupBar = function () {
    $('bar-aksi').hidden = true;
    d.body.classList.remove('ada-bar');
  };

  // ---------- Dialog pesan ----------
  app.pesan = function (judul, isi, tombol) {
    return new Promise(function (selesai) {
      var lapisan = $('lapisan');
      var kotak = util.kosongkan($('dialog'));
      kotak.appendChild(h('h2', { text: judul }));
      kotak.appendChild(h('div', { class: 'isi', text: isi }));
      var baris = h('div', { class: 'baris-tombol' });
      (tombol || [{ teks: 'Tutup', nilai: true }]).forEach(function (t) {
        baris.appendChild(h('button', {
          type: 'button', class: 'tombol' + (t.kedua ? ' kedua' : ''), text: t.teks,
          onclick: function () { lapisan.hidden = true; selesai(t.nilai); }
        }));
      });
      kotak.appendChild(baris);
      lapisan.hidden = false;
    });
  };
  app.tanya = function (judul, isi, ya, tidak) {
    return app.pesan(judul, isi, [{ teks: tidak || 'Tidak', nilai: false, kedua: true }, { teks: ya || 'Ya', nilai: true }]);
  };

  // ---------- Daftar data yang masih tersimpan di HP ----------
  app.lihatAntrian = function () {
    AK.antrian.milikSesi().then(function (daftar) {
      var lapisan = $('lapisan');
      var kotak = util.kosongkan($('dialog'));
      var tunggu = daftar.filter(function (x) { return x.status === 'menunggu'; });
      var tolak = daftar.filter(function (x) { return x.status === 'ditolak'; });
      kotak.appendChild(h('h2', { text: 'Data di HP' }));
      if (!daftar.length) kotak.appendChild(h('div', { class: 'isi', text: 'Semua data sudah terkirim.' }));
      if (tunggu.length) {
        kotak.appendChild(h('div', { class: 'isi', text: 'Data ini tersimpan di HP dan dikirim otomatis saat ada sinyal.' }));
      }
      tunggu.forEach(function (it) {
        kotak.appendChild(h('div', { class: 'kartu' }, [
          h('div', { class: 'baris-judul' }, [h('strong', { text: it.ringkas.judul }), chip('Belum terkirim', 'biru')]),
          h('div', { class: 'kecil', text: util.tanggalPendek(it.dibuat) + ' jam ' + util.jam(it.dibuat) }),
          it.pesan ? h('div', { class: 'kecil', text: 'Percobaan terakhir: ' + it.pesan }) : null
        ]));
      });
      tolak.forEach(function (it) {
        kotak.appendChild(h('div', { class: 'kartu' }, [
          h('div', { class: 'baris-judul' }, [h('strong', { text: it.ringkas.judul }), chip('Ditolak', 'merah')]),
          h('p', { class: 'teks-merah', text: it.pesan }),
          h('button', { type: 'button', class: 'tombol kedua', text: 'Hapus dari HP', onclick: function () {
            AK.antrian.hapus(it.idKirim).then(function () { app.perbaruiPita(); app.lihatAntrian(); });
          } })
        ]));
      });
      var baris = h('div', { class: 'baris-tombol' });
      if (tunggu.length) {
        baris.appendChild(h('button', { type: 'button', class: 'tombol kedua', text: 'Kirim sekarang', onclick: function () {
          lapisan.hidden = true;
          AK.antrian.segera();
        } }));
      }
      baris.appendChild(h('button', { type: 'button', class: 'tombol', text: 'Tutup', onclick: function () { lapisan.hidden = true; } }));
      kotak.appendChild(baris);
      lapisan.hidden = false;
    });
  };

  // ---------- Logo (kotak "Logo" kalau file belum ada) ----------
  function siapkanLogo() {
    Array.prototype.forEach.call(d.querySelectorAll('img.logo'), function (img) {
      var ganti = function () {
        if (!img.parentNode) return;
        img.parentNode.replaceChild(h('div', { class: 'logo-kosong', text: 'Logo' }), img);
      };
      if (img.complete && !img.naturalWidth) ganti();
      else img.addEventListener('error', ganti);
    });
  }

  // ---------- Pita pemberitahuan ----------
  var adaVersiBaru = false;
  app.perbaruiPita = function () {
    var pita = $('pita');
    if (adaVersiBaru) {
      pita.hidden = false;
      pita.className = 'pita versi';
      pita.textContent = 'Versi baru tersedia, ketuk untuk muat ulang';
      pita.onclick = pakaiVersiBaru;
      return Promise.resolve();
    }
    if (!AK.sesi.ambil()) {
      pita.hidden = true;
      return Promise.resolve();
    }
    return AK.antrian.milikSesi().then(function (daftar) {
      var tunggu = daftar.filter(function (x) { return x.status === 'menunggu'; }).length;
      var tolak = daftar.filter(function (x) { return x.status === 'ditolak'; }).length;
      pita.onclick = function () { app.lihatAntrian(); };
      if (tunggu) {
        pita.hidden = false;
        pita.className = 'pita';
        pita.textContent = (AK.antrian.sedangMengirim() && w.navigator.onLine !== false ? 'Sedang mengirim, ' : 'Menunggu sinyal, ') +
          tunggu + ' data belum terkirim';
      } else if (tolak) {
        pita.hidden = false;
        pita.className = 'pita merah';
        pita.textContent = tolak + ' data ditolak server. Ketuk untuk melihat.';
      } else if (w.navigator.onLine === false) {
        pita.hidden = false;
        pita.className = 'pita';
        pita.textContent = 'Tidak ada sinyal. Absen tetap bisa dilakukan dan dikirim nanti.';
      } else {
        pita.hidden = true;
      }
    });
  };

  function pakaiVersiBaru() {
    if (!workerBaru) { w.location.reload(); return; }
    app.memuatUlang = true;
    workerBaru.postMessage({ tipe: 'PAKAI_VERSI_BARU' });
    w.setTimeout(function () { w.location.reload(); }, 3000);
  }

  function daftarkanServiceWorker() {
    if (!('serviceWorker' in w.navigator)) return;
    w.navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (app.memuatUlang) w.location.reload();
    });
    w.navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      function tandai(sw) {
        workerBaru = sw;
        adaVersiBaru = true;
        app.perbaruiPita();
      }
      if (reg.waiting && w.navigator.serviceWorker.controller) tandai(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var baru = reg.installing;
        if (!baru) return;
        baru.addEventListener('statechange', function () {
          if (baru.state === 'installed' && w.navigator.serviceWorker.controller) tandai(baru);
        });
      });
      d.addEventListener('visibilitychange', function () { if (!d.hidden) reg.update().catch(function () {}); });
      w.setInterval(function () { reg.update().catch(function () {}); }, 30 * 60000);
    }).catch(function () { /* service worker tidak didukung */ });
  }

  // ---------- Login ----------
  function siapkanLogin() {
    var form = $('form-login');
    var inId = $('in-id');
    var inPin = $('in-pin');
    inId.addEventListener('input', function () {
      var pos = inId.selectionStart;
      inId.value = inId.value.toUpperCase().replace(/\s+/g, '');
      try { inId.setSelectionRange(pos, pos); } catch (e) { /* abaikan */ }
    });
    inPin.addEventListener('input', function () { inPin.value = inPin.value.replace(/\D/g, '').slice(0, 6); });
    $('btn-lihat-pin').addEventListener('click', function () { aturLihatPin(inPin.type === 'password'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      masuk();
    });
    var ios = /iphone|ipad|ipod/i.test(w.navigator.userAgent) ||
      (w.navigator.platform === 'MacIntel' && w.navigator.maxTouchPoints > 1);
    var mandiri = w.navigator.standalone === true || (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches);
    $('info-ios').hidden = !(ios && !mandiri);
    if (!AK.api.siap()) {
      $('pesan-login').className = 'kotak-pesan merah';
      $('pesan-login').textContent = 'Alamat server belum diisi di config.js. Hubungi admin.';
      $('pesan-login').hidden = false;
    }
  }

  function aturLihatPin(lihat) {
    var b = $('btn-lihat-pin');
    $('in-pin').type = lihat ? 'text' : 'password';
    b.textContent = lihat ? 'Sembunyikan' : 'Lihat';
    b.setAttribute('aria-pressed', lihat ? 'true' : 'false');
  }

  function masuk() {
    var id = $('in-id').value.trim().toUpperCase();
    var pin = $('in-pin').value.trim();
    var kotak = $('pesan-login');
    var tombol = $('btn-masuk');
    function tampil(pesan, jenis) {
      kotak.hidden = false;
      kotak.className = 'kotak-pesan ' + (jenis || 'merah');
      kotak.textContent = pesan;
    }
    if (!id) return tampil('Ketik ID Kru Anda. Contoh: S001 atau K001.');
    if (!/^\d{6}$/.test(pin)) return tampil('PIN harus 6 angka.');
    tombol.disabled = true;
    tombol.textContent = 'Memeriksa...';
    tampil('Menghubungi server...', 'biasa');
    AK.idHp.siapkan().then(function (idHp) {
      return AK.api.panggil('login', { id: id, pin: pin, idHp: idHp });
    }).then(function (hasil) {
      AK.sesi.taruh({
        token: hasil.token,
        profil: hasil.profil,
        pengaturan: hasil.pengaturan,
        lokasi: hasil.lokasi,
        unit: hasil.unit,
        p2h: hasil.p2h,
        status: hasil.status,
        statusDiterima: AK.waktu.sekarang()
      });
      $('in-pin').value = '';
      aturLihatPin(false);
      kotak.hidden = true;
      app.beranda();
      AK.antrian.proses();
    }).catch(function (e) {
      tampil(e.jaringan ? 'Tidak ada sinyal. Login butuh internet. Cari sinyal lalu coba lagi.' : e.pesan);
    }).then(function () {
      tombol.disabled = false;
      tombol.textContent = 'Masuk';
    });
  }

  app.keluar = function () {
    AK.antrian.milikSesi().then(function (daftar) {
      var tunggu = daftar.filter(function (x) { return x.status === 'menunggu'; }).length;
      var isi = tunggu
        ? 'Masih ada ' + tunggu + ' data yang belum terkirim. Data tetap tersimpan di HP dan akan dikirim setelah Anda masuk lagi.\n\nTetap keluar?'
        : 'Keluar dari akun ini? Untuk masuk lagi Anda perlu ID Kru dan PIN.';
      return app.tanya('Keluar', isi, 'Keluar', 'Batal');
    }).then(function (ya) {
      if (!ya) return;
      AK.sesi.hapus();
      app.tampilkan('v-login');
      app.perbaruiPita();
    });
  };

  // ---------- Status efektif (status server + data yang belum terkirim) ----------
  app.statusEfektif = function (s, daftar) {
    var st = JSON.parse(JSON.stringify((s && s.status) || { keadaan: 'BELUM' }));
    var hariIni = util.kunci(AK.waktu.sekarang());
    if (st.hariIni && st.hariIni !== hariIni) {
      if (st.keadaan === 'MASUK') st.keadaan = 'JALAN';
      else if (st.keadaan === 'PULANG') { st.keadaan = 'BELUM'; delete st.sesi; }
      st.hariIni = hariIni;
    }
    (daftar || []).filter(function (x) { return x.status === 'menunggu'; }).forEach(function (it) {
      if (it.jenis === 'masuk') {
        st.keadaan = util.kunci(it.dibuat) === hariIni ? 'MASUK' : 'JALAN';
        st.sesi = {
          masuk: it.dibuat, nopol: it.ringkas.nopol, kmBerangkat: it.data.km === undefined ? null : it.data.km,
          statusMasuk: it.ringkas.statusMasuk, menitTelat: it.ringkas.menitTelat, tertunda: true
        };
      } else if (it.jenis === 'pulang') {
        var masukHariIni = st.sesi && st.sesi.masuk && util.kunci(st.sesi.masuk) === hariIni;
        st.keadaan = util.kunci(it.dibuat) === hariIni || masukHariIni ? 'PULANG' : 'BELUM';
        st.sesi = Object.assign({}, st.sesi || {}, { pulang: it.dibuat, tertunda: true });
      }
    });
    return st;
  };

  // ---------- Beranda ----------
  app.beranda = function () {
    var s = AK.sesi.ambil();
    if (!s) { app.tampilkan('v-login'); return Promise.resolve(); }
    app.tampilkan('v-beranda');
    return AK.antrian.milikSesi().then(function (daftar) {
      gambarBeranda(s, app.statusEfektif(s, daftar));
      app.perbaruiPita();
    });
  };

  function chip(teks, warna) { return h('span', { class: 'chip' + (warna ? ' ' + warna : ''), text: teks }); }

  function infoKru(label, nilai, penuh) {
    return h('div', { class: penuh ? 'penuh' : null }, [
      h('span', { class: 'label', text: label }),
      h('span', { class: 'nilai', text: nilai })
    ]);
  }

  function gambarBeranda(s, st) {
    var p = s.profil;
    var kru = util.kosongkan($('kartu-kru'));
    kru.appendChild(h('div', { class: 'nama', text: p.nama }));
    kru.appendChild(h('div', { class: 'jabatan', text: p.jabatan + ' · ' + p.id }));
    var info = h('div', { class: 'info-grid' }, [
      infoKru('Nopol', p.nopol || '-'),
      infoKru('Kapasitas tangki', p.kapasitas ? p.kapasitas + ' KL' : '-')
    ]);
    if (p.jabatan === 'Kernet') info.appendChild(infoKru('Supir', p.supir || '-', true));
    kru.appendChild(info);

    var kartu = $('kartu-status');
    var isi = util.kosongkan(kartu);
    var sekarang = AK.waktu.sekarang();
    var atur = s.pengaturan || {};
    var jamMasuk = atur.jamMasuk || '06:00';
    isi.appendChild(h('div', { class: 'status-kepala' }, [
      h('span', { text: 'Status hari ini' }),
      h('span', { text: util.tanggalPendek(sekarang) })
    ]));
    var utama = '';
    var chips = [];
    var rinci = [];
    var warna = '';
    var sesi = st.sesi || {};
    if (st.keadaan === 'MASUK') {
      utama = 'Masuk jam ' + util.jam(sesi.masuk);
      if (sesi.statusMasuk === 'Telat') {
        chips.push(chip('Telat ' + sesi.menitTelat + ' menit', 'merah'));
        warna = 'merah';
      } else if (sesi.statusMasuk) {
        chips.push(chip(sesi.statusMasuk, 'hijau'));
        warna = 'hijau';
      }
      if (sesi.nopol) rinci.push('Unit ' + sesi.nopol);
    } else if (st.keadaan === 'JALAN') {
      utama = 'Masih di jalan';
      warna = 'biru';
      rinci.push('Sejak ' + util.tanggal(sesi.masuk) + ' jam ' + util.jam(sesi.masuk));
      if (sesi.nopol) rinci.push('Unit ' + sesi.nopol);
      rinci.push('Lakukan absen pulang setelah kembali.');
    } else if (st.keadaan === 'PULANG') {
      utama = 'Sudah pulang jam ' + util.jam(sesi.pulang);
      var luar = sesi.statusPulang === 'Di luar pool';
      if (sesi.statusPulang) chips.push(chip(sesi.statusPulang, luar ? 'merah' : 'hijau'));
      warna = luar ? 'merah' : 'hijau';
      if (sesi.masuk) rinci.push('Masuk jam ' + util.jam(sesi.masuk) + (sesi.nopol ? ' · Unit ' + sesi.nopol : ''));
      if (sesi.kmHarian !== null && sesi.kmHarian !== undefined) rinci.push('KM hari ini ' + util.angka(sesi.kmHarian) + ' km');
    } else {
      utama = 'Belum absen';
      rinci.push('Jam masuk paling lambat ' + jamMasuk + ' WIB');
    }
    if (sesi.tertunda && st.keadaan !== 'BELUM') chips.push(chip('Belum terkirim', 'biru'));
    kartu.className = 'kartu status ' + warna;
    isi.appendChild(h('div', { class: 'status-utama', text: utama }));
    if (chips.length) isi.appendChild(h('div', { class: 'deret-chip' }, chips));
    rinci.forEach(function (r) { isi.appendChild(h('div', { class: 'status-rinci', text: r })); });

    var bolehMasuk = st.keadaan === 'BELUM' || st.keadaan === 'PULANG';
    var bolehPulang = st.keadaan === 'MASUK' || st.keadaan === 'JALAN';
    var bm = $('btn-absen-masuk');
    var bp = $('btn-absen-pulang');
    bm.setAttribute('aria-disabled', bolehMasuk ? 'false' : 'true');
    bp.setAttribute('aria-disabled', bolehPulang ? 'false' : 'true');
    $('sub-masuk').textContent = bolehMasuk ? 'Paling lambat ' + jamMasuk : 'Sudah absen masuk';
    $('sub-pulang').textContent = bolehPulang
      ? (st.keadaan === 'JALAN' ? 'Setelah kembali ke pool' : 'Setelah selesai tugas')
      : (st.keadaan === 'PULANG' ? 'Sudah absen pulang' : 'Belum absen masuk');
    bm.onclick = function () {
      if (bolehMasuk) AK.alur.mulai('masuk', st);
      else app.pesan('Absen masuk', 'Anda masih tercatat masuk' + (sesi.masuk ? ' sejak ' + util.tanggal(sesi.masuk) + ' jam ' + util.jam(sesi.masuk) : '') + '. Lakukan absen pulang dulu.');
    };
    bp.onclick = function () {
      if (bolehPulang) AK.alur.mulai('pulang', st);
      else app.pesan('Absen pulang', 'Anda belum absen masuk. Absen pulang hanya bisa setelah absen masuk.');
    };
  }

  // Sinkron jam dan status dengan server (setiap aplikasi dibuka atau kembali dilihat).
  var sinkronTerakhir = 0;
  app.sinkron = function (paksa) {
    var s = AK.sesi.ambil();
    var sekarang = Date.now();
    if (!paksa && sekarang - sinkronTerakhir < 60000) return Promise.resolve();
    sinkronTerakhir = sekarang;
    if (!AK.api.siap()) return Promise.resolve();
    if (!s) return AK.api.panggil('waktu', {}, { batas: 15000 }).catch(function () {});
    return AK.idHp.siapkan().then(function (idHp) {
      return AK.api.panggil('status', { token: s.token, idHp: idHp }, { batas: 20000 });
    }).then(function (hasil) {
      AK.sesi.perbarui(hasil);
      if (tampilanAktif === 'v-beranda') app.beranda();
      AK.antrian.proses();
    }).catch(function (e) {
      if (e.kode === 'SESI') app.sesiBerakhir(e.pesan);
    });
  };

  app.sesiBerakhir = function (pesan) {
    if (!AK.sesi.ambil()) return;
    AK.sesi.hapus();
    app.tampilkan('v-login');
    var kotak = $('pesan-login');
    kotak.hidden = false;
    kotak.className = 'kotak-pesan merah';
    kotak.textContent = pesan + ' Data yang belum terkirim tetap tersimpan dan dikirim setelah Anda masuk lagi.';
    app.perbaruiPita();
  };

  // ---------- Mulai ----------
  function mulai() {
    var v = KONFIG.VERSI || '';
    $('kaki').textContent = (KONFIG.HAK_CIPTA || 'Hak Cipta © 2026 Deny Akbar') + ' · ' + v;
    siapkanLogo();
    siapkanLogin();
    daftarkanServiceWorker();
    $('btn-keluar').addEventListener('click', app.keluar);
    w.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      promptPasang = e;
      $('btn-pasang').hidden = false;
    });
    $('btn-pasang').addEventListener('click', function () {
      if (!promptPasang) return;
      promptPasang.prompt();
      promptPasang = null;
      $('btn-pasang').hidden = true;
    });
    w.addEventListener('online', app.perbaruiPita);
    w.addEventListener('offline', app.perbaruiPita);
    AK.antrian.dengar(function (acara, it, data) {
      app.perbaruiPita();
      if (acara === 'sesi' && data) app.sesiBerakhir(data.pesan);
      if ((acara === 'terkirim' || acara === 'ditolak') && tampilanAktif === 'v-beranda') app.beranda();
    });
    d.addEventListener('visibilitychange', function () {
      if (!d.hidden) {
        app.sinkron(false);
        AK.antrian.proses();
        if (tampilanAktif === 'v-beranda') app.beranda();
      }
    });
    AK.idHp.siapkan().catch(function () {});
    w.history.replaceState({ v: 'awal' }, '');
    if (AK.sesi.ambil()) app.beranda();
    else app.tampilkan('v-login');
    app.sinkron(true);
    AK.antrian.proses();
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})(window);
