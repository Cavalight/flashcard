// backup.js - bikin dan periksa file backup (tahap 4)
// Murni logika (tidak menyentuh layar atau penyimpanan), supaya gampang dites.
//
// Bentuk file backup (JSON):
//   { "aplikasi": "flashcard-uas", "versi": 1, "tanggal": "2026-11-23", "dibuat": "<waktu ISO>",
//     "data": { "pengaturan": {...}, "makul": [...], "kartu": [...] } }
//
// Aturan (disepakati dengan Faris, 17 Nov):
//  - Restore menimpa SEMUA data (makul, kartu beserta jadwal, pengaturan).
//  - File diperiksa dulu. Kalau rusak/bukan file backup app ini -> ditolak, data sekarang tidak disentuh.
//  - Pengingat: ada kartu, tapi belum pernah backup atau backup terakhir lebih dari 3 hari lalu.

(function () {
  var impor = (typeof module !== "undefined" && module.exports) ? require("./impor.js") : window.Impor;
  var jadwal = (typeof module !== "undefined" && module.exports) ? require("./jadwal.js") : window.Jadwal;

  var NAMA_APLIKASI = "flashcard-uas";
  var VERSI = 1;
  var BATAS_HARI_PENGINGAT = 3;
  var MAKS_PESAN = 10;
  var JENIS = ["pg", "hitungan", "esai"];
  var TEMA = ["terang", "gelap"];
  var HURUF = ["kecil", "normal", "besar"];

  function adaIsi(v) { return typeof v === "string" && v.trim() !== ""; }
  function adalahObjek(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

  function tanggalValid(t) {
    if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    var p = t.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return d.getUTCFullYear() === +p[0] && d.getUTCMonth() === +p[1] - 1 && d.getUTCDate() === +p[2];
  }

  // data = { pengaturan, makul, kartu } milik app. Hasilnya objek siap di-JSON-kan.
  function buatBackup(data, tanggal, dibuat) {
    var salinan = JSON.parse(JSON.stringify(data));
    return {
      aplikasi: NAMA_APLIKASI,
      versi: VERSI,
      tanggal: tanggal,
      dibuat: dibuat,
      data: { pengaturan: salinan.pengaturan, makul: salinan.makul, kartu: salinan.kartu }
    };
  }

  // teks = isi file yang dipilih.
  // hasil = { ok, kesalahan: [], data: {pengaturan, makul, kartu} (sudah bersih), ringkas: { makul, kartu, tanggal } }
  function periksaBackup(teks) {
    var hasil = { ok: false, kesalahan: [], data: null, ringkas: null };
    var salah = hasil.kesalahan;

    if (typeof teks !== "string" || teks.trim() === "") {
      salah.push("File kosong.");
      return hasil;
    }
    var obj;
    try {
      obj = JSON.parse(teks);
    } catch (e) {
      salah.push("Isi file bukan JSON yang valid, jadi ini bukan file backup yang utuh.");
      return hasil;
    }
    if (!adalahObjek(obj) || obj.aplikasi !== NAMA_APLIKASI) {
      salah.push("Ini bukan file backup app Flashcard UAS.");
      return hasil;
    }
    if (typeof obj.versi === "number" && obj.versi > VERSI) {
      salah.push("File ini dibuat oleh versi app yang lebih baru, jadi belum bisa dibuka di versi ini.");
      return hasil;
    }
    if (obj.versi !== VERSI) {
      salah.push("Versi file backup tidak dikenal.");
      return hasil;
    }
    var d = obj.data;
    if (!adalahObjek(d) || !Array.isArray(d.makul) || !Array.isArray(d.kartu)) {
      salah.push('Isi backup tidak lengkap: bagian "makul" atau "kartu" tidak ditemukan.');
      return hasil;
    }

    function tambah(pesan) { salah.push(pesan); }

    // ----- makul -----
    var idMakul = {};
    var makulBersih = [];
    d.makul.forEach(function (m, n) {
      var awal = "Makul ke-" + (n + 1) + ": ";
      if (!adalahObjek(m)) { tambah(awal + "harus berupa objek."); return; }
      if (!adaIsi(m.id)) { tambah(awal + 'tidak punya "id".'); return; }
      if (!adaIsi(m.nama)) { tambah(awal + 'tidak punya "nama".'); return; }
      if (!tanggalValid(m.ujian)) { tambah(awal + 'tanggal "ujian" tidak valid.'); return; }
      if (idMakul[m.id]) { tambah(awal + "kode " + m.id + " dobel."); return; }
      idMakul[m.id] = true;
      makulBersih.push({ id: m.id, nama: m.nama.trim(), ujian: m.ujian });
    });

    // ----- kartu -----
    var idKartu = {};
    var kartuBersih = [];
    d.kartu.forEach(function (k, n) {
      var label = "Kartu ke-" + (n + 1) + (adalahObjek(k) && adaIsi(k.id) ? " (" + k.id + ")" : "") + ": ";
      if (!adalahObjek(k)) { tambah(label + "harus berupa objek."); return; }
      var masalah = [];
      if (!adaIsi(k.id)) masalah.push('tidak punya "id"');
      else if (idKartu[k.id]) masalah.push("id dobel");
      if (!idMakul[k.makulId]) masalah.push("makul-nya tidak ada di daftar makul");
      if (JENIS.indexOf(k.jenis) < 0) masalah.push('"jenis" tidak dikenal');
      if (!(Number.isInteger(k.jarak) && k.jarak >= 0)) masalah.push('"jarak" harus bilangan bulat 0 atau lebih');
      if (typeof k.lupa !== "boolean") masalah.push('"lupa" harus true atau false');
      if (!tanggalValid(k.due)) masalah.push('tanggal "due" tidak valid');
      if (JENIS.indexOf(k.jenis) >= 0) {
        impor.cekIsi(k).forEach(function (s) { masalah.push(s); });
      }
      if (masalah.length > 0) {
        masalah.forEach(function (s) { tambah(label + s + (/[.)]$/.test(s) ? "" : ".")); });
        return;
      }
      idKartu[k.id] = true;
      // urutan field sama dengan kartu buatan app: jadwal dulu, baru isi
      var isi = impor.bersihkan(k);
      var bersih = { id: k.id, makulId: k.makulId, jenis: isi.jenis, jarak: k.jarak, due: k.due, lupa: k.lupa, soal: isi.soal };
      if (isi.jenis === "pg") {
        bersih.opsi = isi.opsi;
        bersih.benar = isi.benar;
        bersih.alasan = isi.alasan;
      } else {
        bersih.bagian = isi.bagian;
      }
      kartuBersih.push(bersih);
    });

    if (salah.length > 0) {
      if (salah.length > MAKS_PESAN) {
        var lebih = salah.length - MAKS_PESAN;
        hasil.kesalahan = salah.slice(0, MAKS_PESAN);
        hasil.kesalahan.push("...dan " + lebih + " kesalahan lain.");
      }
      return hasil;
    }

    // ----- pengaturan (yang aneh diganti nilai bawaan, bukan alasan menolak file) -----
    var p = adalahObjek(d.pengaturan) ? d.pengaturan : {};
    var pengaturan = {
      tema: TEMA.indexOf(p.tema) >= 0 ? p.tema : null,
      huruf: HURUF.indexOf(p.huruf) >= 0 ? p.huruf : "normal",
      backupTerakhir: tanggalValid(p.backupTerakhir) ? p.backupTerakhir : null
    };

    hasil.ok = true;
    hasil.data = { pengaturan: pengaturan, makul: makulBersih, kartu: kartuBersih };
    hasil.ringkas = {
      makul: makulBersih.length,
      kartu: kartuBersih.length,
      tanggal: tanggalValid(obj.tanggal) ? obj.tanggal : null
    };
    return hasil;
  }

  // Teks pengingat backup, atau null kalau tidak perlu.
  //   data = { pengaturan, kartu }; hari = tanggal hari ini (YYYY-MM-DD)
  function pengingat(data, hari) {
    if (!data.kartu || data.kartu.length === 0) return null;
    var terakhir = data.pengaturan && data.pengaturan.backupTerakhir;
    if (!tanggalValid(terakhir)) return "Belum pernah backup.";
    var selisih = jadwal.sisaHari(hari, terakhir); // berapa hari sejak backup terakhir
    if (selisih > BATAS_HARI_PENGINGAT) return "Backup terakhir " + selisih + " hari lalu.";
    return null;
  }

  var Backup = { buatBackup: buatBackup, periksaBackup: periksaBackup, pengingat: pengingat };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Backup;
  } else {
    window.Backup = Backup;
  }
})();