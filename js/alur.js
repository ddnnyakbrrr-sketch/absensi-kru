/*
 * Absensi Kru Mobil Tangki
 * Hak Cipta (c) 2026 Deny Akbar
 * Versi V2.0
 *
 * Absen di HP admin: orang yang dipilih dari daftar selfie dengan kamera depan, lalu dikirim.
 * AMT (supir dan kernet) cukup absen masuk. Karyawan absen masuk dan pulang.
 * Lokasi dibaca terus selama aplikasi terbuka, supaya koordinat dan alamat tercetak di foto.
 */
(function (w) {
  'use strict';
  var AK = w.AK;
  var util = AK.util;
  var h = util.h;
  var d = w.document;
  function $(id) { return d.getElementById(id); }

  function akurasiMaks() { var s = AK.sesi.ambil(); return (s && s.pengaturan && s.pengaturan.akurasiMaks) || 100; }
  function amt(jabatan) { return jabatan === 'Supir' || jabatan === 'Kernet'; }

  // ---------- Lokasi dan alamat ----------
  var posisi = { aktif: false, galat: '', mulai: 0, alamat: null };
  var pendengarLokasi = [];

  function kabari() {
    pendengarLokasi.slice().forEach(function (fn) { try { fn(); } catch (e) { /* abaikan */ } });
  }

  function mulaiLokasi() {
    if (posisi.aktif) return;
    posisi.aktif = true;
    posisi.galat = '';
    posisi.mulai = Date.now();
    AK.lokasi.mulai(akurasiMaks(), function (x) {
      posisi.galat = x.pos ? '' : x.galat;
      var g = AK.lokasi.bagus();
      if (g) ambilAlamat(g);
      kabari();
    });
  }

  function hentikanLokasi() {
    AK.lokasi.berhenti();
    posisi.aktif = false;
  }

  // Alamat untuk cap foto diambil dari server (Google Maps). Tanpa sinyal, foto tetap dicap dengan koordinat.
  function ambilAlamat(g) {
    var a = posisi.alamat;
    if (a && (a.status === 'cari' || AK.lokasi.jarak(a.pos, g) < 150)) return;
    var s = AK.sesi.ambil();
    if (!s || !AK.api.siap()) return;
    var x = { status: 'cari', teks: '', pos: { lat: g.lat, lng: g.lng } };
    posisi.alamat = x;
    AK.api.panggil('alamat', { token: s.token, idHp: AK.idHp.ambil(), gps: { lat: g.lat, lng: g.lng } }, { batas: 12000 })
      .then(function (hasil) {
        x.teks = hasil.alamat || '';
        x.status = x.teks ? 'ada' : 'gagal';
      }, function () { x.status = 'gagal'; })
      .then(function () {
        // Kalau gagal (misalnya tanpa sinyal), dicoba lagi setelah 2 menit.
        if (x.status === 'gagal') w.setTimeout(function () { if (posisi.alamat === x) posisi.alamat = null; }, 120000);
        kabari();
      });
  }

  function alamatUntuk(gps) {
    var a = posisi.alamat;
    if (!gps || !a || a.status !== 'ada') return '';
    return AK.lokasi.jarak(a.pos, gps) <= 300 ? a.teks : '';
  }

  // Keadaan lokasi untuk ditampilkan: { ok, teks }
  function keadaanLokasi() {
    var g = AK.lokasi.bagus();
    if (g) {
      var a = posisi.alamat;
      return {
        ok: true,
        teks: 'Lokasi terbaca (±' + Math.round(g.akurasi) + ' m)' +
          (a && a.status === 'ada' ? ' · ' + a.teks : (a && a.status === 'cari' ? ' · mengambil alamat...' : ''))
      };
    }
    var t = AK.lokasi.terakhir();
    if (posisi.galat && !t) return { ok: false, teks: posisi.galat };
    if (t && t.akurasi > akurasiMaks()) {
      return { ok: false, teks: 'Sinyal GPS lemah (akurasi ' + Math.round(t.akurasi) + ' m). Tunggu sebentar di tempat terbuka.' };
    }
    return {
      ok: false,
      teks: Date.now() - posisi.mulai > 20000
        ? 'Lokasi belum ditemukan. Pastikan GPS menyala, lalu tunggu sebentar di tempat terbuka.'
        : 'Mencari lokasi. Pastikan GPS (lokasi) di HP menyala.'
    };
  }

  // ---------- Isi cap foto ----------
  // AMT1 untuk supir, AMT2 untuk kernet, jabatan lain ditulis apa adanya.
  function infoCap(label, orang, waktu, gps) {
    var s = AK.sesi.ambil();
    var atur = (s && s.pengaturan) || {};
    var tgl = util.tanggal(waktu).split(', ');
    var kode = orang.jabatan === 'Supir' ? 'AMT1' : (orang.jabatan === 'Kernet' ? 'AMT2' : String(orang.jabatan || 'Karyawan').toUpperCase());
    var baris = [kode + ': ' + orang.nama];
    if (orang.nopol) baris.push('NOPOL: ' + AK.kamera.nopolCap(orang.nopol));
    baris.push('Koordinat: ' + (gps ? AK.kamera.koordinatCap(gps) : 'belum terbaca'));
    return {
      label: label,
      jam: util.jam(waktu),
      hari: tgl[0],
      tanggal: tgl[1] || '',
      alamat: alamatUntuk(gps),
      baris: baris,
      namaPT: String(atur.namaPT || 'PT Patra Logistik').toUpperCase(),
      lokasiKerja: String(atur.lokasiKerja || 'FT Pangkalan Bun').toUpperCase(),
      warna: (w.KONFIG && w.KONFIG.WARNA_UTAMA) || '#006CB8'
    };
  }

  // ---------- Kamera layar penuh ----------
  var kameraAktif = null;

  function bukaKameraLayar(opsi) {
    var lapis = $('kamera');
    var video = $('kamera-video');
    var bingkai = $('kamera-bingkai');
    var pesan = $('kamera-pesan');
    var jepret = $('kamera-jepret');
    var batal = $('kamera-batal');
    var senter = $('kamera-senter');
    bingkai.className = 'bingkai';
    util.kosongkan(bingkai).appendChild(h('span', { text: opsi.teksBingkai }));
    pesan.textContent = 'Membuka kamera...';
    jepret.hidden = false;
    jepret.disabled = true;
    senter.hidden = true;
    lapis.hidden = false;
    var nyala = false;
    return new Promise(function (selesai) {
      var beres = false;
      function akhiri(nilai) {
        if (beres) return;
        beres = true;
        AK.kamera.tutup();
        video.srcObject = null;
        lapis.hidden = true;
        kameraAktif = null;
        selesai(nilai);
      }
      kameraAktif = { tutup: function () { akhiri(null); } };
      batal.onclick = function () { akhiri(null); };
      senter.onclick = function () {
        nyala = !nyala;
        AK.kamera.senter(nyala).then(function (ok) { senter.textContent = ok && nyala ? 'Senter mati' : 'Senter'; });
      };
      AK.kamera.buka(video, opsi.arah).then(function () {
        if (beres) { AK.kamera.tutup(); return; }
        pesan.textContent = opsi.pesan || '';
        senter.hidden = !AK.kamera.bisaSenter();
        jepret.disabled = false;
        jepret.onclick = function () {
          // Foto hanya diambil kalau lokasi sudah terbaca, supaya koordinat selalu tercetak.
          var gps = AK.lokasi.bagus();
          if (!gps) {
            pesan.textContent = 'Menunggu lokasi terbaca. Tekan Ambil Foto lagi sebentar lagi.';
            return;
          }
          jepret.disabled = true;
          pesan.textContent = 'Memproses foto...';
          var waktu = AK.waktu.sekarang();
          var kanvas = AK.kamera.cap(AK.kamera.jepret(video), opsi.info(waktu, gps));
          AK.kamera.kompres(kanvas).then(function (foto) {
            akhiri({ dataUrl: foto.dataUrl, ukuran: foto.ukuran, waktu: waktu, gps: gps });
          }, function () {
            pesan.textContent = 'Foto gagal diproses. Coba ambil lagi.';
            jepret.disabled = false;
          });
        };
      }, function (e) {
        akhiri(null);
        AK.app.pesan('Kamera tidak bisa dibuka', e.pesan || String(e));
      });
    });
  }

  // ---------- Layar absen satu orang ----------
  var alur = null;
  var timerKembali = null;

  // Jenis absen yang bisa dilakukan: 'masuk', 'pulang', atau null kalau sudah selesai hari ini.
  function jenisAksi(orang, st) {
    if (st.keadaan === 'BELUM') return 'masuk';
    if (!amt(orang.jabatan) && st.keadaan === 'MASUK') return 'pulang';
    return null;
  }

  function buka(orang, st) {
    if (timerKembali) { w.clearTimeout(timerKembali); timerKembali = null; }
    alur = { orang: orang, st: st, jenis: jenisAksi(orang, st), foto: null, hasil: null };
    AK.app.tampilkan('v-alur');
    mulaiLokasi();
    gambar();
  }

  function kembaliKeDaftar() {
    if (timerKembali) { w.clearTimeout(timerKembali); timerKembali = null; }
    if (kameraAktif) kameraAktif.tutup();
    alur = null;
    AK.app.tutupBar();
    AK.app.beranda();
  }

  function mintaBatal() {
    if (!alur) { AK.app.beranda(); return; }
    if (!alur.foto || alur.hasil) { kembaliKeDaftar(); return; }
    AK.app.tanya('Batalkan absen?', 'Foto ' + alur.orang.nama + ' belum dikirim dan akan dihapus.', 'Ya, batalkan', 'Lanjutkan absen')
      .then(function (ya) { if (ya) kembaliKeDaftar(); });
  }

  function teksJabatan(o) {
    return o.jabatan + (o.nopol ? ' · ' + AK.kamera.nopolCap(o.nopol) : '') + ' · ' + o.id;
  }

  function teksStatus(st) {
    if (st.keadaan === 'MASUK') {
      return 'Sudah absen masuk jam ' + util.jam(st.masuk) +
        (st.statusMasuk === 'Telat' ? ' (telat ' + st.menitTelat + ' menit)' : '') + (st.tertunda ? ', belum terkirim' : '');
    }
    if (st.keadaan === 'PULANG') {
      return 'Sudah absen masuk jam ' + util.jam(st.masuk) + ' dan pulang jam ' + util.jam(st.pulang) +
        (st.tertunda ? ', belum terkirim' : '');
    }
    return st.izin ? 'Tercatat ' + st.izin.jenis + ' hari ini' : 'Belum absen hari ini';
  }

  function gambar() {
    var wadah = util.kosongkan($('isi-alur'));
    var o = alur.orang;
    var st = alur.st;
    wadah.appendChild(h('h1', { text: alur.jenis === 'pulang' ? 'Absen Pulang' : (alur.jenis ? 'Absen Masuk' : 'Absen') }));
    wadah.appendChild(h('div', { class: 'kartu profil' }, [
      h('div', { class: 'nama', text: o.nama }),
      h('div', { class: 'jabatan', text: teksJabatan(o) }),
      h('div', { class: 'status-rinci', text: teksStatus(st) })
    ]));

    if (alur.hasil) { gambarHasil(wadah); return; }
    if (!alur.jenis) {
      wadah.appendChild(h('div', { class: 'kotak-pesan hijau', text: amt(o.jabatan)
        ? 'Supir dan kernet cukup absen masuk sekali sehari. Absen ' + o.nama + ' hari ini sudah tercatat.'
        : 'Absen masuk dan pulang ' + o.nama + ' hari ini sudah tercatat.' }));
      AK.app.isiBar([h('button', { type: 'button', class: 'tombol', text: 'Kembali ke Daftar', onclick: kembaliKeDaftar })]);
      return;
    }
    if (st.izin) {
      wadah.appendChild(h('div', { class: 'kotak-pesan biasa', text: o.nama + ' tercatat ' + st.izin.jenis +
        ' hari ini. Absen tetap bisa dilakukan kalau orangnya hadir.' }));
    }
    wadah.appendChild(h('div', { id: 'alur-lokasi', class: 'kotak-pesan biasa', text: '' }));
    if (alur.foto) {
      wadah.appendChild(h('img', { class: 'foto-hasil', src: alur.foto.dataUrl, alt: 'Hasil selfie ' + o.nama }));
      wadah.appendChild(h('p', { class: 'kecil', text: 'Periksa foto. Wajah harus terlihat jelas. Kalau sudah benar, tekan Kirim.' }));
      AK.app.isiBar([
        h('button', { type: 'button', class: 'tombol kedua', text: 'Ulangi Foto', onclick: ambilFoto }),
        h('button', { type: 'button', id: 'btn-kirim', class: 'tombol', text: alur.jenis === 'pulang' ? 'Kirim Pulang' : 'Kirim Masuk', onclick: kirim })
      ]);
    } else {
      wadah.appendChild(h('p', { text: 'Minta ' + o.nama + ' memegang HP lalu selfie dengan kamera depan. Wajah harus terlihat jelas.' }));
      wadah.appendChild(h('button', { type: 'button', id: 'btn-kamera', class: 'tombol besar', text: 'Buka Kamera Depan', onclick: ambilFoto }));
      AK.app.isiBar([h('button', { type: 'button', class: 'tombol kedua', text: 'Kembali ke Daftar', onclick: mintaBatal })]);
    }
    perbaruiLokasiAlur();
    w.scrollTo(0, 0);
  }

  function gpsKirim() {
    var g = alur && alur.foto && alur.foto.gps;
    if (g && g.akurasi <= akurasiMaks()) return g;
    return AK.lokasi.bagus();
  }

  function perbaruiLokasiAlur() {
    var el = $('alur-lokasi');
    if (!el || !alur) return;
    var k = keadaanLokasi();
    el.className = 'kotak-pesan ' + (k.ok ? 'hijau' : (posisi.galat ? 'merah' : 'biasa'));
    el.textContent = k.teks;
    var bk = $('btn-kamera');
    if (bk) {
      bk.className = 'tombol besar' + (k.ok ? '' : ' nonaktif');
      bk.setAttribute('aria-disabled', k.ok ? 'false' : 'true');
    }
    var kirimSiap = !!gpsKirim();
    var bs = $('btn-kirim');
    if (bs && !bs.disabled) {
      bs.className = 'tombol' + (kirimSiap ? '' : ' nonaktif');
      bs.setAttribute('aria-disabled', kirimSiap ? 'false' : 'true');
    }
  }
  pendengarLokasi.push(perbaruiLokasiAlur);

  function ambilFoto() {
    if (!alur) return;
    var k = keadaanLokasi();
    if (!k.ok) {
      AK.app.pesan('Lokasi belum terbaca', k.teks + '\n\nKoordinat dan alamat harus tercetak di foto, jadi tunggu sampai lokasi terbaca.');
      return;
    }
    var o = alur.orang;
    var label = alur.jenis === 'pulang' ? 'ABSEN PULANG' : 'ABSEN MASUK';
    bukaKameraLayar({ arah: 'user', teksBingkai: 'Wajah ' + o.nama + ' harus terlihat jelas',
      info: function (waktu, gps) { return infoCap(label, o, waktu, gps); } }).then(function (foto) {
      if (!foto || !alur) return;
      alur.foto = foto;
      gambar();
    });
  }

  // Perkiraan telat di HP (dipakai kalau data belum terkirim). Server tetap menghitung ulang.
  function perkiraanTelat(o, waktu) {
    var s = AK.sesi.ambil();
    var atur = (s && s.pengaturan) || {};
    var jamBatas = amt(o.jabatan) ? (atur.jamMasuk || '06:00') : (atur.jamMasukKaryawan || '08:00');
    var batas = String(jamBatas).split(':');
    var menit = Math.max(0, util.menitHari(waktu) - (Number(batas[0]) * 60 + Number(batas[1])));
    return { statusMasuk: menit > 0 ? 'Telat' : 'Tepat waktu', menitTelat: menit };
  }

  function kirim() {
    if (!alur || !alur.foto) return;
    var o = alur.orang;
    var g = gpsKirim();
    if (!g) {
      AK.app.pesan('Lokasi belum terbaca', 'Tunggu sinyal GPS di tempat terbuka, lalu tekan Kirim lagi.');
      return;
    }
    var tombol = $('btn-kirim');
    tombol.disabled = true;
    tombol.textContent = 'Mengirim...';
    Array.prototype.forEach.call($('bar-isi').querySelectorAll('button'), function (b) { b.disabled = true; });
    var jenis = alur.jenis;
    var data = {
      idKirim: util.uuid(),
      idKru: o.id,
      waktu: alur.foto.waktu,
      gps: { lat: g.lat, lng: g.lng, akurasi: g.akurasi },
      foto: { selfie: alur.foto.dataUrl }
    };
    var tl = jenis === 'masuk' ? perkiraanTelat(o, alur.foto.waktu) : {};
    var item = {
      idKirim: data.idKirim,
      jenis: jenis,
      idKru: o.id,
      dibuat: alur.foto.waktu,
      data: data,
      ringkas: {
        judul: (jenis === 'masuk' ? 'Absen masuk' : 'Absen pulang') + ' · ' + o.nama,
        nama: o.nama,
        statusMasuk: tl.statusMasuk,
        menitTelat: tl.menitTelat
      }
    };
    AK.antrian.kirimDanTunggu(item, 45000).then(function (hasil) {
      if (hasil.status === 'ditolak') AK.antrian.hapus(item.idKirim);
      if (!alur || alur.orang.id !== o.id) return;
      alur.hasil = { jenis: jenis, item: item, hasil: hasil };
      gambar();
    });
  }

  function gambarHasil(wadah) {
    var x = alur.hasil;
    var o = alur.orang;
    var judul = (x.jenis === 'masuk' ? 'Absen masuk ' : 'Absen pulang ') + o.nama;
    var otomatis = false;
    if (x.hasil.status === 'terkirim') {
      var sesi = (x.hasil.hasil.ringkasan && x.hasil.hasil.ringkasan.sesi) || {};
      var waktu = x.jenis === 'masuk' ? sesi.masuk : sesi.pulang;
      var rinci = judul + ' tercatat di server jam ' + util.jam(waktu) + ' WIB.';
      if (x.jenis === 'masuk') rinci += sesi.statusMasuk === 'Telat' ? ' Telat ' + sesi.menitTelat + ' menit.' : ' Tepat waktu.';
      if (x.jenis === 'pulang' && sesi.durasiMenit !== null && sesi.durasiMenit !== undefined) {
        rinci += ' Lama kerja ' + util.durasi(sesi.durasiMenit) + '.';
      }
      wadah.appendChild(h('div', { class: 'kotak-pesan hijau', text: rinci }));
      otomatis = true;
    } else if (x.hasil.status === 'tertunda') {
      wadah.appendChild(h('div', { class: 'kotak-pesan biasa', text: judul + ' disimpan di HP. Data dikirim otomatis saat ada sinyal.' }));
      otomatis = true;
    } else if (x.hasil.status === 'ditolak') {
      wadah.appendChild(h('div', { class: 'kotak-pesan merah', text: 'Ditolak server: ' + ((x.hasil.galat && x.hasil.galat.pesan) || 'alasan tidak diketahui.') }));
    } else {
      wadah.appendChild(h('div', { class: 'kotak-pesan merah', text: 'Data tidak bisa disimpan di HP. Ulangi absen.' }));
    }
    if (alur.foto) wadah.appendChild(h('img', { class: 'foto-kecil', src: alur.foto.dataUrl, alt: 'Foto yang dikirim' }));
    AK.app.isiBar([h('button', { type: 'button', class: 'tombol', text: 'Kembali ke Daftar', onclick: kembaliKeDaftar })]);
    if (otomatis) {
      wadah.appendChild(h('p', { class: 'kecil', text: 'Kembali ke daftar nama dalam 4 detik.' }));
      timerKembali = w.setTimeout(function () { timerKembali = null; if (alur && alur.hasil === x) kembaliKeDaftar(); }, 4000);
    }
  }

  AK.alur = {
    buka: buka,
    mulaiLokasi: mulaiLokasi,
    hentikanLokasi: hentikanLokasi,
    keadaanLokasi: keadaanLokasi,
    dengarLokasi: function (fn) { pendengarLokasi.push(fn); },
    minta_batal: mintaBatal,
    kameraTerbuka: function () { return !!kameraAktif; },
    tutupKamera: function () { if (kameraAktif) kameraAktif.tutup(); }
  };
})(window);
