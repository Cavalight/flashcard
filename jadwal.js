// jadwal.js - logika jadwal kartu spaced-repetition (tahap 1)
// Aturan lengkap: doc project "flashcard-aturan-jadwal-final".
// Murni logika: tidak menyentuh layar atau penyimpanan, supaya gampang dites.
//
// Bentuk data satu kartu:
//   {
//     id: "etika-001",
//     makulId: "STSI4305",
//     jarak: 0,         // jarak terakhir (hari). 0 = kartu baru, belum pernah dinilai
//     due: "2026-11-23",// tanggal jatuh tempo (YYYY-MM-DD)
//     lupa: false       // true = penilaian terakhir Lupa/Ragu
//   }
// Tanggal selalu string "YYYY-MM-DD" supaya tidak kena masalah zona waktu.

(function () {
  var HARI_MS = 24 * 60 * 60 * 1000;

  // "2026-11-28" -> angka hari (dihitung di UTC, jadi aman dari zona waktu)
  function keHari(tanggal) {
    var p = tanggal.split("-");
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / HARI_MS);
  }

  // angka hari -> "YYYY-MM-DD"
  function dariHari(hari) {
    return new Date(hari * HARI_MS).toISOString().slice(0, 10);
  }

  function tambahHari(tanggal, n) {
    return dariHari(keHari(tanggal) + n);
  }

  // Aturan 1: sisa hari = tanggal ujian - hari ini
  function sisaHari(tanggalUjian, hariIni) {
    return keHari(tanggalUjian) - keHari(hariIni);
  }

  // Aturan 5: plafon = floor(sisa / 3) + 1 (minimal 1)
  function plafon(sisa) {
    return Math.max(1, Math.floor(sisa / 3) + 1);
  }

  // Aturan 3, 4, 6: hitung kartu baru setelah dinilai.
  // nilai: "lupa" atau "ingat"
  function nilaiKartu(kartu, nilai, hariIni, tanggalUjian) {
    var hasil = {};
    for (var k in kartu) hasil[k] = kartu[k];

    if (nilai === "lupa") {
      // Aturan 3: muncul lagi besok, jarak terakhir disimpan (tidak direset)
      hasil.lupa = true;
      hasil.due = tambahHari(hariIni, 1);
      return hasil;
    }

    if (nilai !== "ingat") {
      throw new Error('nilai harus "lupa" atau "ingat"');
    }

    var jarakBaru;
    if (kartu.jarak === 0) {
      // Aturan 4 dan 6: kartu baru (termasuk yang langsung Lupa lalu Ingat) -> 1 hari
      jarakBaru = 1;
    } else if (kartu.lupa) {
      // Aturan 6: habis Lupa lalu Ingat -> setengah jarak terakhir, bulat ke atas, min 1
      jarakBaru = Math.max(1, Math.ceil(kartu.jarak / 2));
    } else {
      // Aturan 4: (jarak lama x 1,5 bulat ke atas) + 1
      jarakBaru = Math.ceil(kartu.jarak * 1.5) + 1;
    }

    // Aturan 5 dan 6: plafon selalu menang
    jarakBaru = Math.min(jarakBaru, plafon(sisaHari(tanggalUjian, hariIni)));

    hasil.jarak = jarakBaru;
    hasil.lupa = false;
    hasil.due = tambahHari(hariIni, jarakBaru);
    return hasil;
  }

  // Aturan 8: kartu hanya muncul kalau sudah jatuh tempo DAN hari ini belum hari H ujian.
  // (review terakhir = hari sebelum ujian)
  function munculHariIni(kartu, hariIni, tanggalUjian) {
    return hariIni < tanggalUjian && kartu.due <= hariIni;
  }

  // Aturan 7: urutan kartu yang muncul hari ini.
  //  1) Lupa/Ragu duluan, baru yang lain
  //  2) di status sama: makul dengan ujian paling dekat duluan
  //  3) di situ juga sama: yang jatuh temponya paling lama duluan, lalu urut id
  // ujianPerMakul = { "STSI4305": "2026-11-28", ... }
  function kartuHariIni(daftarKartu, hariIni, ujianPerMakul) {
    return daftarKartu
      .filter(function (k) {
        return munculHariIni(k, hariIni, ujianPerMakul[k.makulId]);
      })
      .sort(function (a, b) {
        if (a.lupa !== b.lupa) return a.lupa ? -1 : 1;
        var ua = ujianPerMakul[a.makulId];
        var ub = ujianPerMakul[b.makulId];
        if (ua !== ub) return ua < ub ? -1 : 1;
        if (a.due !== b.due) return a.due < b.due ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }

  var Jadwal = {
    sisaHari: sisaHari,
    plafon: plafon,
    nilaiKartu: nilaiKartu,
    munculHariIni: munculHariIni,
    kartuHariIni: kartuHariIni,
    tambahHari: tambahHari
  };

  // Bisa dipakai di browser (window.Jadwal) maupun Node (untuk tes)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Jadwal;
  } else {
    window.Jadwal = Jadwal;
  }
})();