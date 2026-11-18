// impor.js - cek teks JSON yang ditempel lalu ubah jadi kartu (tahap 3)
// Murni logika (tidak menyentuh layar atau penyimpanan), supaya gampang dites.
//
// Format teks tempel: daftar kartu dalam JSON, diawali [ dan diakhiri ].
//   Pilihan ganda:
//     { "jenis": "pg", "soal": "...", "opsi": ["...", "...", "...", "..."], "benar": 1, "alasan": "..." }
//   Hitungan atau esai (satu paket, satu nilai):
//     { "jenis": "esai", "soal": "...", "bagian": [ { "huruf": "a", "tanya": "...", "jawab": "..." } ] }
// Yang diisi app sendiri (tidak perlu ada di teks): id, makulId, jarak, due, lupa.
//
// Aturan (disepakati dengan Faris, 17 Nov):
//  - Satu kartu salah format -> SEMUA dibatalkan, kesalahan dilaporkan lengkap.
//  - Kartu yang soalnya sama persis dengan kartu di makul itu (atau dengan kartu lain di teks yang sama)
//    -> dilewati dan dilaporkan.
//  - Semua kartu baru mulai muncul di tanggal "mulai".

(function () {
  var JENIS = ["pg", "hitungan", "esai"];

  function adaIsi(v) { return typeof v === "string" && v.trim() !== ""; }

  // untuk membandingkan soal: abaikan beda spasi/baris baru dan huruf besar-kecil
  function rapikan(s) { return s.replace(/\s+/g, " ").trim().toLowerCase(); }

  function tanggalValid(t) {
    if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    var p = t.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return d.getUTCFullYear() === +p[0] && d.getUTCMonth() === +p[1] - 1 && d.getUTCDate() === +p[2];
  }

  // Kalau teks disalin lengkap dengan pagar kode (```json ... ```), buang pagarnya.
  function bukaPagar(teks) {
    var t = teks.trim();
    var m = t.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
    return m ? m[1] : t;
  }

  // Kembalikan daftar kesalahan untuk satu kartu (kosong = aman).
  function cekKartu(k, no) {
    var awal = "Kartu " + no + ": ";
    var salah = [];
    if (k === null || typeof k !== "object" || Array.isArray(k)) {
      return [awal + "harus berupa objek { ... }."];
    }
    if (JENIS.indexOf(k.jenis) < 0) {
      return [awal + '"jenis" harus salah satu dari "pg", "hitungan", atau "esai".'];
    }
    if (!adaIsi(k.soal)) salah.push(awal + '"soal" harus berupa teks dan tidak boleh kosong.');

    if (k.jenis === "pg") {
      if (!Array.isArray(k.opsi) || k.opsi.length !== 4) {
        salah.push(awal + '"opsi" harus berisi tepat 4 pilihan.');
      } else if (!k.opsi.every(adaIsi)) {
        salah.push(awal + "semua opsi harus berupa teks dan tidak boleh kosong.");
      }
      if (!(Number.isInteger(k.benar) && k.benar >= 0 && k.benar <= 3)) {
        salah.push(awal + '"benar" harus angka 0 sampai 3 (0 = opsi A, 1 = B, 2 = C, 3 = D).');
      }
      if (!adaIsi(k.alasan)) salah.push(awal + '"alasan" harus berupa teks dan tidak boleh kosong.');
    } else {
      if (!Array.isArray(k.bagian) || k.bagian.length === 0) {
        salah.push(awal + '"bagian" harus berupa daftar dan minimal berisi satu bagian.');
      } else {
        k.bagian.forEach(function (b, n) {
          var ab = awal + "bagian ke-" + (n + 1) + " ";
          if (b === null || typeof b !== "object" || Array.isArray(b)) {
            salah.push(ab + "harus berupa objek { ... }.");
            return;
          }
          if (!adaIsi(b.huruf)) salah.push(ab + 'tidak punya "huruf".');
          if (!adaIsi(b.tanya)) salah.push(ab + 'tidak punya "tanya".');
          if (!adaIsi(b.jawab)) salah.push(ab + 'tidak punya "jawab".');
        });
      }
    }
    return salah;
  }

  // Nomor urut id berikutnya untuk makul ini: STSI4305-001, STSI4305-002, ...
  function nomorAwal(kartuAda, makulId) {
    var awalan = makulId + "-";
    var maks = 0;
    kartuAda.forEach(function (k) {
      if (k.id.indexOf(awalan) === 0) {
        var n = parseInt(k.id.slice(awalan.length), 10);
        if (n > maks) maks = n;
      }
    });
    return maks + 1;
  }

  function buatKartu(k, id, makulId, mulai) {
    var hasil = { id: id, makulId: makulId, jenis: k.jenis, jarak: 0, due: mulai, lupa: false, soal: k.soal.trim() };
    if (k.jenis === "pg") {
      hasil.opsi = k.opsi.map(function (o) { return o.trim(); });
      hasil.benar = k.benar;
      hasil.alasan = k.alasan.trim();
    } else {
      hasil.bagian = k.bagian.map(function (b) {
        return { huruf: b.huruf.trim(), tanya: b.tanya.trim(), jawab: b.jawab.trim() };
      });
    }
    return hasil;
  }

  // teks       : isi yang ditempel
  // opsi       : { makulId, tanggalUjian, mulai, kartuAda }
  //              kartuAda = semua kartu yang sudah tersimpan (untuk cek soal dobel dan nomor id)
  // hasil      : { ok, kesalahan: [], kartu: [], dilewati: [], jumlah: { pg, hitungan, esai } }
  //              ok = true berarti `kartu` aman dimasukkan ke data
  function proses(teks, opsi) {
    var hasil = { ok: false, kesalahan: [], kartu: [], dilewati: [], jumlah: { pg: 0, hitungan: 0, esai: 0 } };

    if (!opsi || !adaIsi(opsi.makulId)) {
      hasil.kesalahan.push("Pilih makul tujuan dulu.");
      return hasil;
    }
    if (!tanggalValid(opsi.mulai)) {
      hasil.kesalahan.push('Isi "Mulai muncul tanggal" dengan tanggal yang benar.');
      return hasil;
    }
    if (tanggalValid(opsi.tanggalUjian) && opsi.mulai >= opsi.tanggalUjian) {
      hasil.kesalahan.push('"Mulai muncul tanggal" harus sebelum tanggal ujian makul ini, kalau tidak kartunya tidak akan pernah muncul.');
      return hasil;
    }
    if (typeof teks !== "string" || teks.trim() === "") {
      hasil.kesalahan.push("Kotak tempel masih kosong.");
      return hasil;
    }

    var isi;
    try {
      isi = JSON.parse(bukaPagar(teks));
    } catch (e) {
      hasil.kesalahan.push("Teks bukan JSON yang valid (" + e.message + '). Pastikan yang ditempel utuh dari "[" di awal sampai "]" di akhir.');
      return hasil;
    }

    if (isi !== null && typeof isi === "object" && !Array.isArray(isi) && Array.isArray(isi.kartu)) isi = isi.kartu;
    if (!Array.isArray(isi)) {
      hasil.kesalahan.push('Isi harus berupa daftar kartu: diawali "[" dan diakhiri "]".');
      return hasil;
    }
    if (isi.length === 0) {
      hasil.kesalahan.push("Daftar kartu kosong.");
      return hasil;
    }

    // 1) cek format semua kartu dulu
    isi.forEach(function (k, n) {
      cekKartu(k, n + 1).forEach(function (s) { hasil.kesalahan.push(s); });
    });
    if (hasil.kesalahan.length > 0) return hasil; // ada yang salah: batalkan semua

    // 2) buang yang soalnya dobel (dengan kartu lama di makul ini, atau dengan kartu lain di teks ini)
    var kartuAda = opsi.kartuAda || [];
    var sudahAda = {};
    kartuAda.forEach(function (k) {
      if (k.makulId === opsi.makulId) sudahAda[rapikan(k.soal)] = "kartu yang sudah ada di makul ini";
    });

    var nomor = nomorAwal(kartuAda, opsi.makulId);
    isi.forEach(function (k, n) {
      var kunci = rapikan(k.soal);
      if (sudahAda[kunci]) {
        hasil.dilewati.push("Kartu " + (n + 1) + ": dilewati, soalnya sama dengan " + sudahAda[kunci] + ".");
        return;
      }
      sudahAda[kunci] = "kartu " + (n + 1) + " di teks yang sama";
      var id = opsi.makulId + "-" + String(nomor).padStart(3, "0");
      nomor++;
      hasil.kartu.push(buatKartu(k, id, opsi.makulId, opsi.mulai));
      hasil.jumlah[k.jenis]++;
    });

    hasil.ok = true;
    return hasil;
  }

  // ----- Dipakai juga oleh form tambah/edit kartu (supaya aturan cek-nya sama dengan impor) -----

  // Daftar kesalahan isi satu kartu (kosong = aman), tanpa awalan "Kartu N:".
  function cekIsi(k) {
    return cekKartu(k, 1).map(function (s) { return s.replace(/^Kartu 1: /, ""); });
  }

  // Apakah dua soal dianggap sama (abaikan beda spasi/baris/huruf besar-kecil)?
  function samaSoal(a, b) {
    return typeof a === "string" && typeof b === "string" && rapikan(a) === rapikan(b);
  }

  // Salinan isi kartu yang sudah dirapikan (teks di-trim). Hanya field isi, tanpa jadwal.
  function bersihkan(k) {
    var h = { jenis: k.jenis, soal: k.soal.trim() };
    if (k.jenis === "pg") {
      h.opsi = k.opsi.map(function (o) { return o.trim(); });
      h.benar = k.benar;
      h.alasan = k.alasan.trim();
    } else {
      h.bagian = k.bagian.map(function (b) {
        return { huruf: b.huruf.trim(), tanya: b.tanya.trim(), jawab: b.jawab.trim() };
      });
    }
    return h;
  }

  var Impor = { proses: proses, cekIsi: cekIsi, samaSoal: samaSoal, bersihkan: bersihkan };

  // Bisa dipakai di browser (window.Impor) maupun Node (untuk tes)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Impor;
  } else {
    window.Impor = Impor;
  }
})();