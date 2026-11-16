/*
 * Absensi Kru Mobil Tangki
 * Hak Cipta (c) 2026 Deny Akbar
 * Versi V2.2
 *
 * Tampilan utama: masuk admin, daftar nama kru dan karyawan, data yang belum terkirim,
 * pemberitahuan, dan pemasangan aplikasi.
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
  function amt(jabatan) { return jabatan === 'AMT 1' || jabatan === 'AMT 2'; }

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
    $('appbar').hidden = id === 'v-login';
    $('appbar-aksi').hidden = id !== 'v-beranda';
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

  function chip(teks, warna) { return h('span', { class: 'chip' + (warna ? ' ' + warna : ''), text: teks }); }

  // ---------- Daftar data yang masih tersimpan di HP ----------
  app.lihatAntrian = function () {
    AK.antrian.milikSesi().then(function (daftar) {
      var lapisan = $('lapisan');
      var kotak = util.kosongkan($('dialog'));
      var tunggu = daftar.filter(function (x) { return x.status === 'menunggu'; });
      var tolak = daftar.filter(function (x) { return x.status === 'ditolak'; });
      kotak.appendChild(h('h2', { text: 'Data di HP' }));
      if (!daftar.length) kotak.appendChild(h('div', { class: 'isi', text: 'Semua data sudah terkirim.' }));
      tunggu.forEach(function (it) {
        kotak.appendChild(h('div', { class: 'item-antrian' }, [
          h('div', { class: 'baris-judul' }, [h('span', { text: it.ringkas.judul }), chip('Menunggu', 'biru')]),
          h('div', { class: 'kecil', text: util.tanggalPendek(it.dibuat) + ', ' + util.jam(it.dibuat) }),
          it.pesan ? h('div', { class: 'kecil', text: it.pesan }) : null
        ]));
      });
      tolak.forEach(function (it) {
        kotak.appendChild(h('div', { class: 'item-antrian' }, [
          h('div', { class: 'baris-judul' }, [h('span', { text: it.ringkas.judul }), chip('Ditolak', 'merah')]),
          h('p', { class: 'teks-merah', text: it.pesan }),
          h('button', { type: 'button', class: 'tombol kedua', text: 'Hapus', onclick: function () {
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
      pita.textContent = 'Versi baru tersedia. Ketuk untuk memperbarui.';
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
      var offline = w.navigator.onLine === false;
      if (tunggu) {
        pita.hidden = false;
        pita.className = offline ? 'pita' : 'pita kirim';
        pita.textContent = offline ? 'Tidak ada sinyal. ' + tunggu + ' data menunggu dikirim.'
          : (AK.antrian.sedangMengirim() ? 'Mengirim ' + tunggu + ' data...' : tunggu + ' data belum terkirim');
      } else if (tolak) {
        pita.hidden = false;
        pita.className = 'pita merah';
        pita.textContent = tolak + ' data ditolak. Ketuk untuk melihat.';
      } else if (offline) {
        pita.hidden = false;
        pita.className = 'pita';
        pita.textContent = 'Tidak ada sinyal';
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

  // ---------- Masuk admin ----------
  function siapkanLogin() {
    var inPin = $('in-pin');
    inPin.addEventListener('input', function () { inPin.value = inPin.value.replace(/\D/g, '').slice(0, 6); });
    $('btn-lihat-pin').addEventListener('click', function () { aturLihatPin(inPin.type === 'password'); });
    $('form-login').addEventListener('submit', function (e) {
      e.preventDefault();
      masuk();
    });
    if (!AK.api.siap()) {
      $('pesan-login').className = 'pesan-galat';
      $('pesan-login').textContent = 'Alamat server belum diisi di config.js.';
      $('pesan-login').hidden = false;
    }
  }

  function aturLihatPin(lihat) {
    var b = $('btn-lihat-pin');
    $('in-pin').type = lihat ? 'text' : 'password';
    util.kosongkan(b).appendChild(util.ikon(lihat ? 'mata-tutup' : 'mata'));
    b.setAttribute('aria-pressed', lihat ? 'true' : 'false');
    b.setAttribute('aria-label', lihat ? 'Sembunyikan PIN' : 'Tampilkan PIN');
  }

  function masuk() {
    var pin = $('in-pin').value.trim();
    var kotak = $('pesan-login');
    var tombol = $('btn-masuk');
    function tampil(pesan) {
      kotak.hidden = false;
      kotak.className = 'pesan-galat';
      kotak.textContent = pesan;
    }
    if (!/^\d{6}$/.test(pin)) return tampil('PIN harus 6 angka.');
    tombol.disabled = true;
    tombol.textContent = 'Memeriksa...';
    kotak.hidden = true;
    AK.idHp.siapkan().then(function (idHp) {
      return AK.api.panggil('login', { pin: pin, idHp: idHp });
    }).then(function (hasil) {
      AK.sesi.taruh({
        token: hasil.token,
        pengaturan: hasil.pengaturan,
        kru: hasil.kru,
        hariIni: hasil.hariIni,
        statusDiterima: AK.waktu.sekarang()
      });
      $('in-pin').value = '';
      aturLihatPin(false);
      kotak.hidden = true;
      sinkronTerakhir = Date.now();
      app.beranda();
      AK.antrian.proses();
    }).catch(function (e) {
      tampil(e.jaringan ? 'Tidak ada sinyal. Coba lagi.' : e.pesan);
    }).then(function () {
      tombol.disabled = false;
      tombol.textContent = 'Masuk';
    });
  }

  app.keluar = function () {
    AK.antrian.milikSesi().then(function (daftar) {
      var tunggu = daftar.filter(function (x) { return x.status === 'menunggu'; }).length;
      var isi = tunggu ? tunggu + ' data belum terkirim dan tetap tersimpan di HP.' : '';
      return app.tanya('Keluar dari akun admin?', isi, 'Keluar', 'Batal');
    }).then(function (ya) {
      if (!ya) return;
      AK.sesi.hapus();
      AK.alur.hentikanLokasi();
      app.tampilkan('v-login');
      app.perbaruiPita();
    });
  };

  // ---------- Status tiap orang (status server + data yang belum terkirim) ----------
  app.statusOrang = function (s, orang, antrian) {
    var hariIni = util.kunci(AK.waktu.sekarang());
    var st = s.hariIni === hariIni && orang.status ? JSON.parse(JSON.stringify(orang.status)) : { keadaan: 'BELUM' };
    (antrian || []).filter(function (x) {
      return x.status === 'menunggu' && x.idKru === orang.id && util.kunci(x.dibuat) === hariIni;
    }).forEach(function (it) {
      if (it.jenis === 'masuk') {
        st.keadaan = 'MASUK';
        st.masuk = it.dibuat;
        st.statusMasuk = it.ringkas.statusMasuk;
        st.menitTelat = it.ringkas.menitTelat;
      } else if (it.jenis === 'pulang') {
        st.keadaan = 'PULANG';
        st.pulang = it.dibuat;
      }
      st.tertunda = true;
    });
    return st;
  };

  // ---------- Daftar nama ----------
  var saring = 'semua';
  var antrianTerakhir = [];

  app.beranda = function () {
    var s = AK.sesi.ambil();
    if (!s) { app.tampilkan('v-login'); return Promise.resolve(); }
    app.tampilkan('v-beranda');
    AK.alur.mulaiLokasi();
    perbaruiInfoLokasi();
    if (s.hariIni !== util.kunci(AK.waktu.sekarang())) app.sinkron(true);
    return AK.antrian.milikSesi().then(function (daftar) {
      antrianTerakhir = daftar;
      gambarDaftar();
      app.perbaruiPita();
    });
  };

  function normal(t) { return String(t || '').toUpperCase().replace(/\s+/g, ' ').trim(); }

  // Biru = belum diterima server, hijau = tercatat, merah = telat.
  function chipStatus(o, st) {
    if (st.keadaan === 'MASUK') {
      var telat = st.statusMasuk === 'Telat';
      return chip((telat ? 'Telat ' : 'Masuk ') + util.jam(st.masuk), st.tertunda ? 'biru' : (telat ? 'merah' : 'hijau'));
    }
    if (st.keadaan === 'PULANG') return chip('Pulang ' + util.jam(st.pulang), st.tertunda ? 'biru' : 'hijau');
    if (st.izin) return chip(st.izin.jenis, 'biru');
    return chip('Belum');
  }

  app.chipStatus = chipStatus;

  function gambarDaftar() {
    var s = AK.sesi.ambil();
    if (!s) return;
    $('tgl-hari').textContent = util.tanggalPendek(AK.waktu.sekarang());
    var semua = (s.kru || []).map(function (o) { return { o: o, st: app.statusOrang(s, o, antrianTerakhir) }; });
    var sudah = semua.filter(function (x) { return x.st.keadaan !== 'BELUM'; }).length;
    $('hitung-hadir').textContent = sudah + '/' + semua.length;
    $('progres-hadir').style.width = (semua.length ? Math.round(sudah / semua.length * 100) : 0) + '%';
    var cari = normal($('cari').value);
    var cariNopol = cari.replace(/[\s-]/g, '');
    var tampil = semua.filter(function (x) {
      if (saring === 'amt' && !amt(x.o.jabatan)) return false;
      if (saring === 'karyawan' && amt(x.o.jabatan)) return false;
      if (!cari) return true;
      return normal(x.o.nama).indexOf(cari) >= 0 || (cariNopol && normal(x.o.nopol).indexOf(cariNopol) >= 0) || normal(x.o.id) === cari;
    }).sort(function (a, b) { return a.o.nama.localeCompare(b.o.nama, 'id'); });
    var ul = util.kosongkan($('daftar-kru'));
    if (!tampil.length) {
      ul.appendChild(h('li', { class: 'kosong', text: cari ? 'Tidak ditemukan' : 'Belum ada nama' }));
      return;
    }
    tampil.forEach(function (x) {
      ul.appendChild(h('li', null, [h('button', { type: 'button', class: 'item-kru', onclick: function () { AK.alur.buka(x.o, x.st); } }, [
        h('span', { class: 'avatar', text: util.inisial(x.o.nama) }),
        h('span', { class: 'item-teks' }, [
          h('span', { class: 'item-nama', text: x.o.nama }),
          h('span', { class: 'item-sub', text: x.o.jabatan + (x.o.nopol ? ' · ' + AK.kamera.nopolCap(x.o.nopol) : '') })
        ]),
        chipStatus(x.o, x.st)
      ])]));
    });
  }

  // Dipanggil setelah absen tersimpan, supaya orang berikutnya langsung bisa mengetik namanya.
  app.kosongkanCari = function () {
    var c = $('cari');
    if (c) c.value = '';
  };

  function perbaruiInfoLokasi() {
    var el = $('info-lokasi');
    if (!el) return;
    var k = AK.alur.keadaanLokasi();
    el.textContent = k.teks;
    el.className = 'gps ' + (k.ok ? 'ok' : (k.galat ? 'galat' : 'tunggu'));
  }

  function siapkanBeranda() {
    $('cari').addEventListener('input', gambarDaftar);
    Array.prototype.forEach.call(d.querySelectorAll('.pilih-saring'), function (b) {
      b.addEventListener('click', function () {
        saring = b.getAttribute('data-saring');
        Array.prototype.forEach.call(d.querySelectorAll('.pilih-saring'), function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        gambarDaftar();
      });
    });
    $('btn-segarkan').addEventListener('click', function () {
      var b = $('btn-segarkan');
      if (b.disabled) return;
      b.disabled = true;
      b.classList.add('berputar');
      app.sinkron(true).then(function (ok) {
        b.disabled = false;
        b.classList.remove('berputar');
        if (ok === false) app.pesan('Tidak ada sinyal', 'Daftar belum diperbarui.');
      });
    });
    $('btn-keluar').addEventListener('click', app.keluar);
    AK.alur.dengarLokasi(perbaruiInfoLokasi);
  }

  // Sinkron jam dan daftar nama dengan server (saat aplikasi dibuka, kembali dilihat, atau diminta).
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
      return true;
    }).catch(function (e) {
      if (e.kode === 'SESI') app.sesiBerakhir(e.pesan);
      return false;
    });
  };

  app.sesiBerakhir = function (pesan) {
    if (!AK.sesi.ambil()) return;
    AK.sesi.hapus();
    AK.alur.hentikanLokasi();
    app.tampilkan('v-login');
    var kotak = $('pesan-login');
    kotak.hidden = false;
    kotak.className = 'pesan-galat';
    kotak.textContent = pesan;
    app.perbaruiPita();
  };

  // ---------- Mulai ----------
  function pasangIkon() {
    Array.prototype.forEach.call(d.querySelectorAll('[data-ikon]'), function (el) {
      if (!el.querySelector('svg')) el.appendChild(util.ikon(el.getAttribute('data-ikon')));
    });
  }

  function mulai() {
    var v = KONFIG.VERSI || '';
    $('kaki').textContent = (KONFIG.HAK_CIPTA || 'Hak Cipta © 2026 Deny Akbar') + ' · ' + v;
    pasangIkon();
    siapkanLogo();
    siapkanLogin();
    siapkanBeranda();
    daftarkanServiceWorker();
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
      if (d.hidden) {
        AK.alur.hentikanLokasi();
        return;
      }
      app.sinkron(false);
      AK.antrian.proses();
      if (tampilanAktif === 'v-beranda') app.beranda();
      else if (tampilanAktif === 'v-alur') AK.alur.mulaiLokasi();
    });
    AK.idHp.siapkan().catch(function () {});
    w.history.replaceState({ v: 'awal' }, '');
    if (AK.sesi.ambil() && AK.sesi.ambil().kru) app.beranda();
    else {
      // Sesi dari versi lama (akun per kru) tidak dipakai lagi.
      if (AK.sesi.ambil()) AK.sesi.hapus();
      app.tampilkan('v-login');
    }
    app.sinkron(true);
    AK.antrian.proses();
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})(window);
