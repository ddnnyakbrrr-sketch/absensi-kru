/*
 * Absensi Kru Mobil Tangki
 * Hak Cipta (c) 2026 Deny Akbar
 * Versi V1
 *
 * Langkah absen masuk dan pulang (lokasi, scan QR, selfie, odometer, P2H, ringkasan)
 * dan kamera layar penuh.
 */
(function (w) {
  'use strict';
  var AK = w.AK;
  var util = AK.util;
  var h = util.h;
  var d = w.document;
  function $(id) { return d.getElementById(id); }

  var JUDUL = { lokasi: 'Cek lokasi', qr: 'Scan QR truk', selfie: 'Foto selfie', odometer: 'Foto odometer',
    p2h: 'Checklist P2H', ringkasan: 'Ringkasan', hasil: 'Selesai' };
  var POLA_QR = /^PTL\|([A-Z0-9]+)\|([A-Z0-9]+)$/;
  var alur = null;

  function akurasiMaks() { var s = AK.sesi.ambil(); return (s && s.pengaturan && s.pengaturan.akurasiMaks) || 100; }

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
    bingkai.className = 'bingkai' + (opsi.kotak ? ' kotak' : '');
    util.kosongkan(bingkai).appendChild(h('span', { text: opsi.teksBingkai }));
    pesan.textContent = 'Membuka kamera...';
    jepret.hidden = !!opsi.qr;
    jepret.disabled = true;
    senter.hidden = true;
    lapis.hidden = false;
    var nyala = false;
    return new Promise(function (selesai) {
      var beres = false;
      function akhiri(nilai) {
        if (beres) return;
        beres = true;
        AK.qr.berhenti();
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
        if (opsi.qr) {
          AK.qr.mulai(video, function (teks) { akhiri(teks); });
          return;
        }
        jepret.disabled = false;
        jepret.onclick = function () {
          jepret.disabled = true;
          pesan.textContent = 'Memproses foto...';
          var waktu = AK.waktu.sekarang();
          var gps = AK.lokasi.bagus() || AK.lokasi.terakhir();
          var kanvas = AK.kamera.jepret(video);
          AK.kamera.cap(kanvas, opsi.baris(waktu, gps));
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

  function barisCap(jenisFoto, nopol, waktu, gps) {
    var s = AK.sesi.ambil();
    var p = s.profil;
    var b = [jenisFoto + ' · ' + (nopol || p.nopol || '-'), util.tanggal(waktu) + ' · ' + util.jam(waktu, true) + ' WIB'];
    if (gps) {
      b.push(gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6) + ' (±' + Math.round(gps.akurasi) + ' m)');
      var t = AK.lokasi.terdekat(gps, s.lokasi);
      b.push(t ? t.nama + ' · ' + util.meter(t.jarak) : 'Lokasi kerja belum diatur');
    } else {
      b.push('Lokasi belum terbaca');
    }
    b.push(p.nama + ' · ' + p.jabatan);
    return b;
  }

  // ---------- Alur absen ----------
  function mulai(jenis, st) {
    var s = AK.sesi.ambil();
    if (!s) return;
    var supir = s.profil.jabatan === 'Supir';
    var langkah = jenis === 'masuk'
      ? (supir ? ['lokasi', 'qr', 'selfie', 'odometer', 'p2h', 'ringkasan'] : ['lokasi', 'qr', 'selfie', 'ringkasan'])
      : (supir ? ['lokasi', 'selfie', 'odometer', 'ringkasan'] : ['lokasi', 'selfie', 'ringkasan']);
    alur = {
      jenis: jenis,
      supir: supir,
      langkah: langkah,
      idx: 0,
      st: st,
      gps: null,
      galatGps: '',
      mulaiGps: Date.now(),
      data: {
        nopol: jenis === 'pulang' ? ((st.sesi && st.sesi.nopol) || s.profil.nopol) : '',
        kmBerangkat: jenis === 'pulang' && st.sesi ? st.sesi.kmBerangkat : null,
        km: '',
        p2h: (s.p2h || []).map(function (item) { return { item: item, hasil: '', catatan: '', foto: null }; })
      }
    };
    AK.app.tampilkan('v-alur');
    mulaiGps();
    gambar();
  }

  function mulaiGps() {
    alur.mulaiGps = Date.now();
    alur.galatGps = '';
    AK.lokasi.mulai(akurasiMaks(), function (x) {
      if (!alur) return;
      if (x.pos) { alur.gps = x.pos; alur.galatGps = ''; } else { alur.galatGps = x.galat; }
      if (langkahKini() === 'lokasi') perbaruiLokasi();
    });
    w.setTimeout(function () { if (alur && langkahKini() === 'lokasi') perbaruiLokasi(); }, 20000);
  }

  function selesaiAlur() {
    AK.lokasi.berhenti();
    if (kameraAktif) kameraAktif.tutup();
    AK.app.tutupBar();
    alur = null;
  }

  function langkahKini() { return alur ? alur.langkah[alur.idx] : null; }

  function mintaBatal() {
    if (!alur) { AK.app.beranda(); return; }
    if (langkahKini() === 'hasil') { selesaiAlur(); AK.app.beranda(); return; }
    AK.app.tanya('Batalkan absen?', 'Foto dan data yang sudah diisi akan dihapus.', 'Ya, batalkan', 'Lanjutkan absen')
      .then(function (ya) {
        if (!ya) return;
        selesaiAlur();
        AK.app.beranda();
      });
  }

  function gambar() {
    var wadah = util.kosongkan($('isi-alur'));
    var k = langkahKini();
    var judulAlur = alur.jenis === 'masuk' ? 'Absen Masuk' : 'Absen Pulang';
    wadah.appendChild(h('h1', { text: judulAlur }));
    if (k !== 'hasil') {
      wadah.appendChild(h('div', { class: 'langkah-info', text: 'Langkah ' + (alur.idx + 1) + ' dari ' + alur.langkah.length + ' · ' + JUDUL[k] }));
      var batang = h('div', { class: 'batang-langkah' });
      alur.langkah.forEach(function (x, i) { batang.appendChild(h('span', { class: i <= alur.idx ? 'selesai' : '' })); });
      wadah.appendChild(batang);
    }
    var isi = h('div', { id: 'isi-langkah' });
    wadah.appendChild(isi);
    ({ lokasi: gambarLokasi, qr: gambarQr, selfie: gambarSelfie, odometer: gambarOdometer, p2h: gambarP2h,
      ringkasan: gambarRingkasan, hasil: function () {} })[k](isi);
    if (k === 'hasil') {
      AK.app.tutupBar();
      return;
    }
    // Tombol Kembali dan Lanjut/Kirim selalu terlihat di bagian bawah layar.
    var tombol = [h('button', { type: 'button', class: 'tombol kedua', text: alur.idx === 0 ? 'Batal' : 'Kembali', onclick: function () {
      if (alur.idx === 0) mintaBatal();
      else { alur.idx--; gambar(); }
    } })];
    if (k === 'ringkasan') {
      tombol.push(h('button', { type: 'button', id: 'btn-kirim', class: 'tombol',
        text: alur.jenis === 'masuk' ? 'Kirim Absen Masuk' : 'Kirim Absen Pulang', onclick: kirim }));
    } else {
      tombol.push(h('button', { type: 'button', id: 'btn-lanjut', class: 'tombol', text: 'Lanjut', onclick: lanjut }));
    }
    AK.app.isiBar(tombol);
    perbaruiLanjut();
    w.scrollTo(0, 0);
  }

  function perbaruiLanjut() {
    var b = $('btn-lanjut');
    if (!b) return;
    var siap = cekLangkah(true) === true;
    b.className = 'tombol' + (siap ? '' : ' nonaktif');
    b.setAttribute('aria-disabled', siap ? 'false' : 'true');
  }

  function lanjut() {
    var pesan = cekLangkah(false);
    if (pesan !== true) {
      if (pesan) AK.app.pesan(JUDUL[langkahKini()], pesan);
      return;
    }
    konfirmasiLangkah().then(function (ok) {
      if (!ok) return;
      alur.idx++;
      gambar();
    });
  }

  // Mengembalikan true kalau langkah sudah lengkap, atau pesan yang menjelaskan apa yang kurang.
  function cekLangkah(diam) {
    var k = langkahKini();
    var dt = alur.data;
    if (k === 'lokasi') {
      var c = cekLokasi();
      return c.ok ? true : (diam ? false : c.pesan);
    }
    if (k === 'qr') return dt.qr ? true : (diam ? false : 'Scan dulu stiker QR yang ditempel di truk.');
    if (k === 'selfie') return dt.selfie ? true : (diam ? false : 'Ambil dulu foto selfie di depan truk.');
    if (k === 'odometer') {
      if (!dt.odometer) return diam ? false : 'Ambil dulu foto odometer.';
      if (!/^\d{1,7}$/.test(String(dt.km))) return diam ? false : 'Ketik angka KM sesuai odometer, tanpa titik atau koma.';
      if (alur.jenis === 'pulang' && dt.kmBerangkat !== null && dt.kmBerangkat !== undefined && Number(dt.km) < dt.kmBerangkat) {
        return diam ? false : 'KM pulang (' + util.angka(dt.km) + ') lebih kecil dari KM berangkat (' + util.angka(dt.kmBerangkat) + '). Periksa lagi angka di odometer.';
      }
      return true;
    }
    if (k === 'p2h') {
      var belum = dt.p2h.filter(function (x) { return !x.hasil; }).length;
      if (belum) return diam ? false : 'Masih ada ' + belum + ' item P2H yang belum dipilih Baik atau Tidak.';
      var kurang = dt.p2h.filter(function (x) { return x.hasil === 'Tidak' && (x.catatan.trim().length < 3 || !x.foto); });
      if (kurang.length) return diam ? false : 'Item "' + kurang[0].item + '" bertanda Tidak. Tulis catatan temuan dan ambil fotonya.';
      return true;
    }
    return true;
  }

  function konfirmasiLangkah() {
    var k = langkahKini();
    var dt = alur.data;
    var s = AK.sesi.ambil();
    if (k === 'odometer' && alur.jenis === 'masuk') {
      var unit = (s.unit || []).filter(function (u) { return u.nopol === dt.nopol; })[0];
      if (unit && unit.km !== null && unit.km !== undefined && Number(dt.km) < unit.km) {
        return AK.app.tanya('Periksa angka KM', 'KM yang Anda ketik (' + util.angka(dt.km) + ') lebih kecil dari KM pulang terakhir unit ini (' +
          util.angka(unit.km) + '). Pastikan angkanya benar. Kalau tetap dilanjutkan, absen akan ditandai "KM tidak nyambung".',
          'Angka sudah benar', 'Perbaiki');
      }
    }
    if (k === 'odometer' && alur.jenis === 'pulang' && dt.kmBerangkat !== null && dt.kmBerangkat !== undefined) {
      var batas = (s.pengaturan && s.pengaturan.batasKm) || 1000;
      var harian = Number(dt.km) - dt.kmBerangkat;
      if (harian > batas) {
        return AK.app.tanya('Periksa angka KM', 'KM hari ini ' + util.angka(harian) + ' km, lebih dari batas ' + util.angka(batas) +
          ' km. Pastikan angkanya benar. Kalau tetap dilanjutkan, absen akan ditandai "KM tidak wajar".', 'Angka sudah benar', 'Perbaiki');
      }
    }
    return Promise.resolve(true);
  }

  // ---------- Langkah: lokasi ----------
  function cekLokasi() {
    var s = AK.sesi.ambil();
    var g = alur.gps;
    var maks = akurasiMaks();
    if (alur.galatGps && !g) return { ok: false, pesan: alur.galatGps };
    if (!g) {
      return { ok: false, pesan: Date.now() - alur.mulaiGps > 20000
        ? 'Lokasi belum ditemukan. Pindah ke tempat terbuka, pastikan GPS menyala, lalu tunggu sebentar.'
        : 'Sedang mencari lokasi. Pastikan GPS (lokasi) di HP menyala.' };
    }
    if (g.akurasi > maks) {
      return { ok: false, pesan: 'Sinyal GPS lemah (akurasi ' + Math.round(g.akurasi) + ' m). Tunggu sebentar di tempat terbuka, lalu coba lagi.' };
    }
    var t = AK.lokasi.terdekat(g, s.lokasi);
    if (alur.jenis === 'masuk') {
      if (!t) return { ok: false, pesan: 'Lokasi kerja belum diatur di sistem. Hubungi admin.' };
      if (!t.didalam) {
        return { ok: false, pesan: 'Anda berada ' + util.meter(t.jarak) + ' dari ' + t.nama + '. Absen masuk hanya bisa dalam radius ' +
          t.radius + ' m. Silakan mendekat ke lokasi lalu coba lagi.' };
      }
      return { ok: true, pesan: 'Lokasi sesuai: ' + t.nama + ' (' + util.meter(t.jarak) + ').', t: t };
    }
    if (t && !t.didalam) {
      return { ok: true, luar: true, pesan: 'Anda di luar pool (' + util.meter(t.jarak) + ' dari ' + t.nama + '). Absen pulang tetap bisa dan akan ditandai "Di luar pool".' };
    }
    return { ok: true, pesan: t ? 'Lokasi: ' + t.nama + ' (' + util.meter(t.jarak) + ').' : 'Lokasi terbaca.' };
  }

  function gambarLokasi(isi) {
    isi.appendChild(h('p', { text: 'Aplikasi memeriksa lokasi Anda. Pastikan GPS (lokasi) di HP menyala.' }));
    isi.appendChild(h('div', { class: 'kartu' }, [
      h('div', { class: 'data-baris' }, [h('span', { text: 'Akurasi GPS' }), h('span', { id: 'lok-akurasi', text: '-' })]),
      h('div', { class: 'data-baris' }, [h('span', { text: 'Lokasi terdekat' }), h('span', { id: 'lok-dekat', text: '-' })])
    ]));
    isi.appendChild(h('div', { id: 'lok-pesan', class: 'kotak-pesan biasa', text: 'Sedang mencari lokasi...' }));
    isi.appendChild(h('button', { type: 'button', class: 'tombol kedua', text: 'Cari ulang lokasi', onclick: function () {
      alur.gps = null;
      mulaiGps();
      perbaruiLokasi();
    } }));
    perbaruiLokasi();
  }

  function perbaruiLokasi() {
    var el = $('lok-pesan');
    if (!el || !alur) return;
    var s = AK.sesi.ambil();
    var g = alur.gps;
    $('lok-akurasi').textContent = g ? Math.round(g.akurasi) + ' m' : '-';
    var t = g ? AK.lokasi.terdekat(g, s.lokasi) : null;
    $('lok-dekat').textContent = t ? t.nama + ', ' + util.meter(t.jarak) : '-';
    var c = cekLokasi();
    el.className = 'kotak-pesan ' + (c.ok ? (c.luar ? 'biasa' : 'hijau') : (g || alur.galatGps ? 'merah' : 'biasa'));
    el.textContent = c.pesan;
    perbaruiLanjut();
  }

  // ---------- Langkah: QR ----------
  function gambarQr(isi) {
    var s = AK.sesi.ambil();
    var dt = alur.data;
    isi.appendChild(h('p', { text: 'Scan stiker QR yang ditempel di truk dengan kamera belakang.' }));
    if (dt.qr) {
      var unit = (s.unit || []).filter(function (u) { return u.nopol === dt.nopol; })[0];
      isi.appendChild(h('div', { class: 'kartu' }, [
        h('div', { class: 'kecil', text: 'Unit terbaca' }),
        h('div', { class: 'angka-besar', text: dt.nopol }),
        h('div', { class: 'kecil', text: unit && unit.kapasitas ? 'Kapasitas ' + unit.kapasitas + ' KL' : '' })
      ]));
      if (s.profil.nopol && dt.nopol !== s.profil.nopol) {
        isi.appendChild(h('div', { class: 'kotak-pesan biasa', text: 'Unit ini berbeda dengan unit tetap Anda (' + s.profil.nopol +
          '). Absen tetap bisa dilanjutkan dan akan dicatat "Ganti unit".' }));
      }
      if (!unit) {
        isi.appendChild(h('div', { class: 'kotak-pesan biasa', text: 'Unit ' + dt.nopol + ' tidak ada di daftar unit yang tersimpan di HP. Server akan memeriksa saat data dikirim.' }));
      }
    }
    isi.appendChild(h('button', { type: 'button', class: 'tombol' + (dt.qr ? ' kedua' : ' besar'), text: dt.qr ? 'Scan Ulang' : 'Scan QR', onclick: scanQr }));
  }

  function scanQr() {
    bukaKameraLayar({ arah: 'environment', qr: true, kotak: true, teksBingkai: 'Arahkan ke stiker QR di truk',
      pesan: 'Dekatkan kamera ke stiker QR sampai terbaca.' }).then(function (teks) {
      if (teks === null || !alur) return;
      var m = String(teks).trim().match(POLA_QR);
      if (!m) {
        AK.app.pesan('QR tidak dikenal', 'Pastikan yang di-scan adalah stiker QR absensi yang ditempel di truk, lalu scan ulang.');
        return;
      }
      alur.data.qr = String(teks).trim();
      alur.data.nopol = m[1];
      gambar();
    });
  }

  // ---------- Langkah: selfie ----------
  function gambarFoto(isi, foto, judulTombol, ambil) {
    if (foto) {
      isi.appendChild(h('img', { class: 'foto-hasil', src: foto.dataUrl, alt: 'Hasil foto' }));
      isi.appendChild(h('p', { class: 'kecil', text: 'Ukuran foto ' + Math.round(foto.ukuran / 1024) + ' KB.' }));
      isi.appendChild(h('button', { type: 'button', class: 'tombol kedua', text: 'Ulangi Foto', onclick: ambil }));
    } else {
      isi.appendChild(h('button', { type: 'button', class: 'tombol besar', text: judulTombol, onclick: ambil }));
    }
  }

  function gambarSelfie(isi) {
    isi.appendChild(h('p', { text: 'Berdiri di depan truk. Wajah dan depan truk (plat nomor) harus kelihatan di foto.' }));
    gambarFoto(isi, alur.data.selfie, 'Buka Kamera Depan', function () {
      var jenis = alur.jenis === 'masuk' ? 'MASUK' : 'PULANG';
      bukaKameraLayar({ arah: 'user', teksBingkai: 'Wajah dan depan truk harus kelihatan',
        baris: function (waktu, gps) { return barisCap(jenis, alur.data.nopol, waktu, gps); } }).then(function (foto) {
        if (!foto || !alur) return;
        alur.data.selfie = foto;
        gambar();
      });
    });
  }

  // ---------- Langkah: odometer ----------
  function gambarOdometer(isi) {
    var s = AK.sesi.ambil();
    var dt = alur.data;
    isi.appendChild(h('p', { text: 'Foto angka odometer (KM) di dashboard truk dengan jelas, lalu ketik angkanya.' }));
    gambarFoto(isi, dt.odometer, 'Buka Kamera Belakang', function () {
      var jenis = alur.jenis === 'masuk' ? 'ODOMETER MASUK' : 'ODOMETER PULANG';
      bukaKameraLayar({ arah: 'environment', teksBingkai: 'Angka odometer harus terbaca jelas',
        baris: function (waktu, gps) { return barisCap(jenis, dt.nopol, waktu, gps); } }).then(function (foto) {
        if (!foto || !alur) return;
        dt.odometer = foto;
        gambar();
      });
    });
    if (!dt.odometer) return;
    isi.appendChild(h('label', { for: 'in-km', text: alur.jenis === 'masuk' ? 'Angka KM berangkat' : 'Angka KM pulang' }));
    var input = h('input', { id: 'in-km', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', class: 'input-km',
      autocomplete: 'off', placeholder: 'Contoh: 125430', maxlength: '7', enterkeyhint: 'next' });
    input.value = dt.km;
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '').slice(0, 7);
      dt.km = input.value;
      perbaruiLanjut();
    });
    // Tombol Enter/Lanjut di keyboard HP langsung ke langkah berikutnya.
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      input.blur();
      lanjut();
    });
    isi.appendChild(input);
    if (alur.jenis === 'pulang' && dt.kmBerangkat !== null && dt.kmBerangkat !== undefined) {
      isi.appendChild(h('p', { class: 'kecil', text: 'KM berangkat: ' + util.angka(dt.kmBerangkat) }));
    } else {
      var unit = (s.unit || []).filter(function (u) { return u.nopol === dt.nopol; })[0];
      if (unit && unit.km !== null && unit.km !== undefined) {
        isi.appendChild(h('p', { class: 'kecil', text: 'KM pulang terakhir unit ini: ' + util.angka(unit.km) }));
      }
    }
    isi.appendChild(h('p', { class: 'kecil', text: 'Tulis angka saja, tanpa titik atau koma.' }));
  }

  // ---------- Langkah: P2H ----------
  function gambarP2h(isi) {
    var dt = alur.data;
    var terisi = dt.p2h.filter(function (x) { return x.hasil; }).length;
    isi.appendChild(h('p', { text: 'Periksa kendaraan. Pilih Baik atau Tidak untuk setiap item. Kalau Tidak, tulis catatan dan foto temuannya.' }));
    isi.appendChild(h('p', { class: 'kecil', id: 'p2h-hitung', text: terisi + ' dari ' + dt.p2h.length + ' item sudah diisi.' }));
    dt.p2h.forEach(function (x, i) {
      var kotak = h('div', { class: 'p2h-item' + (x.hasil === 'Tidak' ? ' tidak' : '') });
      kotak.appendChild(h('div', { class: 'judul', text: (i + 1) + '. ' + x.item }));
      var pilih = h('div', { class: 'pilih-dua' });
      ['Baik', 'Tidak'].forEach(function (nilai) {
        pilih.appendChild(h('button', {
          type: 'button',
          class: 'pilih ' + nilai.toLowerCase() + (x.hasil === nilai ? ' aktif' : ''),
          text: nilai,
          'aria-pressed': x.hasil === nilai ? 'true' : 'false',
          onclick: function () {
            x.hasil = nilai;
            var y = w.scrollY;
            gambar();
            w.scrollTo(0, y);
          }
        }));
      });
      kotak.appendChild(pilih);
      if (x.hasil === 'Tidak') {
        kotak.appendChild(h('label', { text: 'Catatan temuan (wajib)' }));
        var ta = h('textarea', { maxlength: '300', placeholder: 'Contoh: lampu sein kiri mati' });
        ta.value = x.catatan;
        ta.addEventListener('input', function () { x.catatan = ta.value; perbaruiLanjut(); });
        kotak.appendChild(ta);
        if (x.foto) {
          kotak.appendChild(h('img', { class: 'foto-hasil', src: x.foto.dataUrl, alt: 'Foto temuan' }));
        }
        kotak.appendChild(h('button', { type: 'button', class: 'tombol kedua', text: x.foto ? 'Ulangi Foto Temuan' : 'Foto Temuan (wajib)',
          onclick: function () {
            bukaKameraLayar({ arah: 'environment', teksBingkai: 'Temuan harus terlihat jelas',
              baris: function (waktu, gps) { return barisCap('TEMUAN P2H', dt.nopol, waktu, gps); } }).then(function (foto) {
              if (!foto || !alur) return;
              x.foto = foto;
              var y = w.scrollY;
              gambar();
              w.scrollTo(0, y);
            });
          } }));
      }
      isi.appendChild(kotak);
    });
  }

  // ---------- Langkah: ringkasan dan kirim ----------
  function perkiraanTelat() {
    var s = AK.sesi.ambil();
    var waktu = alur.data.selfie.waktu;
    var sudahHariIni = alur.st.keadaan === 'PULANG';
    var batas = String((s.pengaturan && s.pengaturan.jamMasuk) || '06:00').split(':');
    var menit = sudahHariIni ? 0 : Math.max(0, util.menitHari(waktu) - (Number(batas[0]) * 60 + Number(batas[1])));
    return { statusMasuk: menit > 0 ? 'Telat' : 'Tepat waktu', menitTelat: menit };
  }

  function gpsKirim() {
    var maks = akurasiMaks();
    var g = alur.data.selfie && alur.data.selfie.gps;
    if (g && g.akurasi <= maks) return g;
    return AK.lokasi.bagus();
  }

  function gambarRingkasan(isi) {
    var s = AK.sesi.ambil();
    var dt = alur.data;
    var g = gpsKirim();
    var t = g ? AK.lokasi.terdekat(g, s.lokasi) : null;
    var daftar = h('div', { class: 'kartu daftar-ringkas' });
    daftar.appendChild(baris('Nama', s.profil.nama));
    daftar.appendChild(baris('Jabatan', s.profil.jabatan));
    daftar.appendChild(baris('Unit', dt.nopol || '-'));
    daftar.appendChild(baris('Jam foto', util.jam(dt.selfie.waktu, true) + ' WIB'));
    daftar.appendChild(baris('Tanggal', util.tanggal(dt.selfie.waktu)));
    daftar.appendChild(baris('Lokasi', t ? t.nama + ', ' + util.meter(t.jarak) : (g ? 'Terbaca' : 'Belum terbaca')));
    if (alur.jenis === 'masuk') {
      var tl = perkiraanTelat();
      daftar.appendChild(baris('Status', tl.statusMasuk === 'Telat' ? 'Telat ' + tl.menitTelat + ' menit' : 'Tepat waktu'));
    }
    if (alur.supir) {
      daftar.appendChild(baris(alur.jenis === 'masuk' ? 'KM berangkat' : 'KM pulang', util.angka(dt.km)));
      if (alur.jenis === 'pulang' && dt.kmBerangkat !== null && dt.kmBerangkat !== undefined) {
        daftar.appendChild(baris('KM hari ini', util.angka(Number(dt.km) - dt.kmBerangkat) + ' km'));
      }
    }
    if (alur.jenis === 'masuk' && alur.supir) {
      var temuan = dt.p2h.filter(function (x) { return x.hasil === 'Tidak'; }).length;
      daftar.appendChild(baris('P2H', temuan ? temuan + ' temuan' : 'Baik semua'));
    }
    isi.appendChild(daftar);
    var foto = h('div', { class: 'deret-foto' });
    [dt.selfie, dt.odometer].filter(Boolean).forEach(function (f) {
      foto.appendChild(h('img', { class: 'foto-kecil', src: f.dataUrl, alt: 'Foto yang akan dikirim' }));
    });
    isi.appendChild(foto);
    isi.appendChild(h('p', { class: 'kecil', text: 'Periksa data di atas, lalu tekan tombol Kirim di bawah.' }));
  }

  function baris(label, nilai) {
    return h('div', { class: 'data-baris' }, [h('span', { text: label }), h('span', { text: nilai })]);
  }

  function kirim() {
    var s = AK.sesi.ambil();
    var dt = alur.data;
    var g = gpsKirim();
    if (!g) {
      AK.app.pesan('Lokasi belum terbaca', 'Tunggu sinyal GPS di tempat terbuka, lalu tekan Kirim lagi.');
      return;
    }
    var tombol = $('btn-kirim');
    tombol.disabled = true;
    tombol.textContent = 'Mengirim...';
    Array.prototype.forEach.call($('bar-isi').querySelectorAll('button'), function (b) { b.disabled = true; });
    var data = {
      idKirim: util.uuid(),
      waktu: dt.selfie.waktu,
      gps: { lat: g.lat, lng: g.lng, akurasi: g.akurasi },
      foto: { selfie: dt.selfie.dataUrl }
    };
    if (alur.jenis === 'masuk') data.qr = dt.qr;
    if (alur.supir) {
      data.foto.odometer = dt.odometer.dataUrl;
      data.km = Number(dt.km);
    }
    if (alur.jenis === 'masuk' && alur.supir) {
      data.p2h = dt.p2h.map(function (x) {
        return { item: x.item, hasil: x.hasil, catatan: x.catatan.trim(), foto: x.foto ? x.foto.dataUrl : null };
      });
    }
    var tl = alur.jenis === 'masuk' ? perkiraanTelat() : {};
    var item = {
      idKirim: data.idKirim,
      jenis: alur.jenis,
      idKru: s.profil.id,
      dibuat: dt.selfie.waktu,
      data: data,
      ringkas: {
        judul: (alur.jenis === 'masuk' ? 'Absen masuk' : 'Absen pulang') + ' · ' + (dt.nopol || s.profil.nopol),
        nopol: dt.nopol || s.profil.nopol,
        statusMasuk: tl.statusMasuk,
        menitTelat: tl.menitTelat
      }
    };
    var jenis = alur.jenis;
    AK.lokasi.berhenti();
    AK.antrian.kirimDanTunggu(item, 60000).then(function (hasil) {
      if (hasil.status === 'ditolak') AK.antrian.hapus(item.idKirim);
      tampilkanHasil(jenis, hasil);
    });
  }

  function tampilkanHasil(jenis, hasil) {
    if (!alur) return;
    alur.idx = alur.langkah.length;
    alur.langkah.push('hasil');
    gambar();
    var isi = $('isi-langkah');
    var judul = jenis === 'masuk' ? 'Absen masuk' : 'Absen pulang';
    if (hasil.status === 'terkirim') {
      var sesi = hasil.hasil.ringkasan && hasil.hasil.ringkasan.sesi;
      var waktu = jenis === 'masuk' ? sesi.masuk : sesi.pulang;
      var rinci = ['Jam ' + util.jam(waktu) + ' WIB, ' + util.tanggal(waktu)];
      if (jenis === 'masuk') rinci.push(sesi.statusMasuk === 'Telat' ? 'Status: Telat ' + sesi.menitTelat + ' menit' : 'Status: Tepat waktu');
      if (sesi.nopol) rinci.push('Unit ' + sesi.nopol);
      if (jenis === 'pulang' && sesi.kmHarian !== null && sesi.kmHarian !== undefined) rinci.push('KM hari ini ' + util.angka(sesi.kmHarian) + ' km');
      if (jenis === 'pulang' && sesi.statusPulang) rinci.push('Status pulang: ' + sesi.statusPulang);
      var catatan = (sesi.catatan || '').split('; ').filter(function (c) { return c && c !== 'Telat'; });
      isi.appendChild(h('div', { class: 'kotak-pesan hijau', text: judul + ' tercatat di server.' }));
      isi.appendChild(h('div', { class: 'kartu' }, rinci.map(function (r) { return h('div', { text: r }); })));
      if (catatan.length) isi.appendChild(h('div', { class: 'kotak-pesan biasa', text: 'Catatan sistem: ' + catatan.join('; ') }));
    } else if (hasil.status === 'ditolak') {
      isi.appendChild(h('div', { class: 'kotak-pesan merah', text: judul + ' ditolak server.' }));
      isi.appendChild(h('p', { text: hasil.galat.pesan }));
    } else if (hasil.status === 'gagalSimpan') {
      isi.appendChild(h('div', { class: 'kotak-pesan merah', text: 'Data tidak bisa disimpan di HP.' }));
      isi.appendChild(h('p', { text: 'Memori HP mungkin penuh. Hapus foto atau aplikasi yang tidak dipakai, lalu ulangi absen.' }));
    } else {
      isi.appendChild(h('div', { class: 'kotak-pesan biasa', text: 'Data disimpan di HP.' }));
      isi.appendChild(h('p', { text: 'Belum ada sinyal atau server belum menjawab. Data akan dikirim otomatis saat ada sinyal. ' +
        'Jangan hapus data aplikasi atau browser sebelum data terkirim.' }));
    }
    isi.appendChild(h('button', { type: 'button', class: 'tombol besar', style: 'margin-top:16px', text: 'Kembali ke Beranda',
      onclick: function () { selesaiAlur(); AK.app.beranda(); } }));
  }

  AK.alur = {
    mulai: mulai,
    minta_batal: mintaBatal,
    kameraTerbuka: function () { return !!kameraAktif; },
    tutupKamera: function () { if (kameraAktif) kameraAktif.tutup(); }
  };
})(window);
