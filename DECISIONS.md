# Keputusan & Validasi (ringkasan untuk pengembangan)

## Keputusan pemilik toko
- Toko multi-brand: grup **Apple / Android / ACC / VAS**.
- AirPods: pencapaian masuk **ACC**, tetap tampil di **LOB Apple**.
- VAS: Qoala (brand KOALA), Telkomsel, XL, Indosat — klasifikasi by brand walau di raw tertulis ACCESSORIES.
- Tidak ada di raw = belum ada penjualan (0).
- Gap = Actual − Target. Estimasi closing = MTD ÷ hari berjalan × hari dalam bulan.
- Week = Minggu–Sabtu.
- Point = rumus sheet `MIN(MTD ÷ (Target ÷ hari dalam bulan), cap)`; cap Apple/Android/ACC 30, VAS 10.
- Sumber sales: tab **Control MR &SP** (hasil menu Import Raw). Target: tab **Target Store**. Mading diabaikan.
- Satu file Google Sheet per bulan; link didaftarkan di aplikasi tiap bulan. Satu aplikasi untuk semua bulan.
- Input aplikasi ditulis balik ke Google Sheet (master sheet aplikasi).
- Hanya pemilik (admin) yang bisa mengubah apa pun; akun lain read-only.
- Mapemall = channel online (masuk total toko, bukan staf).
- Traffic, master staf, historis (import raw bulan/tahun lalu), SOH: diinput/diimport lewat aplikasi.
- Modul mengikuti referensi M238 (tanpa identitasnya), disesuaikan multi-brand.
- Platform: Next.js baru di Vercel.

## Aturan turunan (dari analisa data Sept 2026)
- Samsung WATCH & Xiaomi WATCH → ACC (sesuai total Data - Akeno). Huawei/Motorola WATCH tetap Android.
- MOTORIZED (mis. blender) → nilai masuk ACC, tidak dihitung di Qty.
- Qty = DEVICES + ACCESSORIES (VAS ikut karena tipe ACCESSORIES); SUPPORTING/MERCHANDISE/MOTORIZED tidak.
- Qty SP diinferensi: amount ÷ harga satuan (dari MR); amount 0 = 1 unit gratis/bundling.
- Supplier ACC: Dino = MICROPACK, A.ELEMENTS, ZAAG · iBack = IBACKS · IGA = RAPTIC · Medpoin · Mutual = MUTURAL · Kaizen (belum ada).

## Validasi engine terhadap data asli September 2026 (dijalankan di browser, data tidak disalin ke repo)
| Cek | Engine | Sheet |
|---|---|---|
| Total sales | 4.648.133.871 | 4.648.133.871 (Data - Akeno) |
| Apple / Android / ACC / VAS | 3.675.690.000 / 751.172.030 / 151.204.341 / 70.067.500 | sama persis |
| Invoice unik | 357 | 357 |
| Qty / UPT | 667 / 1,87 | 667 / 1,87 (Daily Sales) |
| Target total & per grup | 4,85 M; 3.066.165.028 / 1.587.895.135 / 167.412.822 / 28.527.015 | sama |
| Point | 30 + 14 + 27 + 10 = 81 | 81 |
| Qty per artikel (inferensi vs MR) | 0 selisih dari semua artikel | — |
| Error rekonsiliasi | 0 | — |

Catatan: 9 invoice dibagi ke beberapa staf (mis. 1 invoice iPhone dibagi ke 7 staf) — dihitung 1× di toko, per staf sesuai baris masing-masing. Tidak ada unit ganda: setiap unit di Sales Person cocok dengan qty Merchandise Report per artikel.

## Keputusan implementasi fase 1 (default — bisa diubah)
- **Tanggal "s/d" (as-of)**: tanggal terakhir yang ada datanya di raw (file diimport s/d kemarin); bisa diganti lewat pemilih tanggal. Estimasi closing & point estimasi memakai hari berjalan = tanggal as-of.
- **CVR** hanya dihitung pada hari yang traffic-nya sudah diinput (hari tanpa input tidak menurunkan CVR).
- **AR Qoala** = qty Qoala ÷ qty tipe DEVICES (semua brand).
- **Target minggu** = target harian × jumlah hari minggu itu (minggu terpotong di awal/akhir bulan ikut terpotong).
- **Product Focus**: kolom target dari tab Target Store dicocokkan dengan LOB (Apple), brand (Android), supplier atau brand (ACC), provider (VAS). Penjualan tanpa kolom target tetap tampil sebagai "tanpa target". Supplier di `supplierOrder` selalu tampil walau 0.
- **Admin** hanya dari env (`ADMIN_NIK` + hash). Baris di `APP_Users` tidak bisa memberi hak admin.
- Master sheet: tabel kecil ditulis ulang utuh (clear + write); `APP_Audit` append-only.
- Cache per instance server (TTL 5 menit default); tombol Refresh admin membaca ulang segera.
