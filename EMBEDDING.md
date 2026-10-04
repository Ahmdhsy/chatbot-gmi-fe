# Menempelkan Smart Interactive Reporting ke situs lain

Jalankan migrasi backend sebelum memakai pendaftaran website baru:

```powershell
cd ../chatbot-gmi/backend
alembic -c app/alembic.ini upgrade head
```

Jika frontend dan backend berjalan di container berbeda, server Next.js perlu
`EMBED_POLICY_API_BASE=http://api:8000/v1`. File Docker Compose di repository
ini sudah mengisinya. Saat berjalan dari terminal lokal, nilai bawaan
`NEXT_PUBLIC_API_BASE` dipakai.

Chat ini murni NLP (tanpa LLM), jadi biayanya nol per pertanyaan dan jawabannya
deterministik — cocok ditempel di portal lain.

Tiga bentuk pemakaian, semuanya memakai **satu halaman** yang sama
(`/embed/reporting`):

| Bentuk | Dipasang dengan |
|---|---|
| Bubble melayang | satu tag `<script>` |
| Halaman penuh | satu tag `<iframe>` |
| Tautan biasa | `<a href>` |

---

## 1. Siapkan service account

Buat satu user khusus di aplikasi ini. **Role dan area user inilah yang menentukan
data yang terlihat di widget** — RBAC yang sudah ada dipakai apa adanya:

- service account nasional → widget menampilkan seluruh Indonesia
- service account `manager` area 2 → widget hanya bisa menjawab soal area 2

Kalau satu situs butuh cakupan berbeda, buat service account terpisah.

## 2. Daftarkan website sebagai superadmin

Login sebagai superadmin, buka **Dashboard → Token Widget**
(`/admin/widget-tokens`). Isi nama website dan **origin persis** seperti
`https://portal.example.co.id` (tanpa path), pilih akun dan tekan
**Buat kode widget**. Salin kode yang muncul ke website tersebut. Untuk website
lain, buat pendaftaran baru. Superadmin dapat mencabut tiap pendaftaran kapan saja.

Kode pemasangan memuat ID publik, bukan kredensial permanen. Widget meminta
sesi 15 menit dari backend dan memperbaruinya otomatis selama dibuka. Endpoint
sesi hanya melayani origin yang didaftarkan. Backend juga memeriksa status
pendaftaran saat setiap request reporting, sehingga pencabutan berlaku langsung.

Karena ID pemasangan terlihat di HTML, origin membatasi pemakaian oleh browser,
tetapi tidak menjadi autentikasi kuat terhadap klien non-browser yang memalsukan
header Origin. Gunakan hanya untuk data yang memang disetujui untuk publik.
Rate limit per IP dan tombol **Cabut akses** tersedia.

Di bawah daftar website masih ada **Token manual sementara**. Hanya superadmin
yang dapat membuatnya lewat `POST /v1/embed/token`, dengan masa berlaku maksimal
120 menit. Token manual perlu diganti saat habis.

## 3. Pasang di halaman

**Bubble melayang**

```html
<script src="https://APP/widget.js"
        data-widget-id="{{ id_dari_dashboard }}"
        data-api-base="https://API/v1"></script>
```

Atribut opsional: `data-title`, `data-position="left"`, `data-open="true"`,
`data-origin`. Kontrol dari JS: `ReportingWidget.open() / .close() / .toggle()`.
Panel bisa digeser lewat bilah judul, diperbesar atau dipulihkan lewat tombol
di kanan atas, dan diubah ukurannya lewat pojok kanan bawah. Tombol Escape
menutup panel. Kontrol JS tambahan: `ReportingWidget.maximize()` dan
`ReportingWidget.restore()`.

**Halaman penuh**

```html
<iframe src="https://APP/embed/reporting#token={{ token_manual }}"
        style="width:100%;height:80vh;border:0"></iframe>
```

**Tautan biasa** (tanpa iframe, jadi tanpa syarat langkah 4)

```html
<a href="https://APP/embed/reporting#token={{ token_manual }}" target="_blank">
  Buka laporan
</a>
```

Token selalu di **fragment** (`#token=`), bukan query string — fragment tidak
dikirim ke server, jadi tidak masuk access log maupun header Referer. Halaman
embed juga langsung menghapusnya dari address bar setelah dibaca.

## 4. Kebijakan iframe

Semua halaman aplikasi ini memasang `X-Frame-Options: DENY`. Untuk kode widget
yang didaftarkan di dashboard, `/embed/reporting?widget=...` memakai kebijakan
`frame-ancestors` sesuai origin pendaftaran aktif dari backend. Tidak perlu
menambah environment variable tiap kali memasang website baru.

Untuk iframe manual tanpa ID pemasangan, origin harus disebut di konfigurasi:

```bash
# .env frontend
EMBED_ALLOWED_ORIGINS=https://portal.example.co.id
```

Lalu restart frontend-nya. Tanpa ini, nilainya `frame-ancestors 'none'` dan
iframe akan ditolak browser — default yang aman, bukan bug.

Cara memastikan sudah benar:

```bash
curl -sI https://APP/embed/reporting | grep -i -e content-security-policy -e x-frame-options
# Content-Security-Policy: frame-ancestors https://portal.example.co.id
# (X-Frame-Options TIDAK boleh muncul di sini)
```

## Yang belum ada

- **Token manual.** Token yang diberikan lewat `data-token` masih harus diganti
  setelah habis. Kode pemasangan dengan `data-widget-id` memperbarui sesi otomatis.
- **Riwayat percakapan.** Hilang saat panel ditutup.
- **Pembatasan laju.** Request `/reporting/ask` dari widget memakai batas per IP
  dan batas report aktif.
