# Menempelkan Smart Interactive Reporting ke situs lain

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

## 2. Cetak token di BACKEND situs tuan rumah

Kredensial service account **tidak boleh** sampai ke browser. Yang dikirim ke
halaman hanya token pendek hasil cetakan:

```bash
# sekali, simpan token login-nya di server situs tuan rumah
curl -X POST https://APP/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"widget-bot@contoh.co.id","password":"..."}'

# tiap kali merender halaman untuk pengunjung
curl -X POST https://APP/v1/embed/token \
  -H "Authorization: Bearer <token login service account>" \
  -H 'Content-Type: application/json' \
  -d '{"ttlMinutes":30}'
# -> {"token":"eyJ...","expiresInSeconds":1800,"scope":"NATIONWIDE"}
```

Token itu berumur pendek (maks 120 menit) dan **hanya** membuka
`POST /v1/reporting/ask` dan `GET /v1/reporting/ask/examples`. Dipakai ke endpoint
lain — chat LLM, `/reporting/run`, bahkan untuk mencetak token lagi — hasilnya 401.

## 3. Pasang di halaman

**Bubble melayang**

```html
<script src="https://APP/widget.js" data-token="{{ embed_token }}"></script>
```

Atribut opsional: `data-title`, `data-position="left"`, `data-open="true"`,
`data-origin`. Kontrol dari JS: `ReportingWidget.open() / .close() / .toggle()`.

**Halaman penuh**

```html
<iframe src="https://APP/embed/reporting#token={{ embed_token }}"
        style="width:100%;height:80vh;border:0"></iframe>
```

**Tautan biasa** (tanpa iframe, jadi tanpa syarat langkah 4)

```html
<a href="https://APP/embed/reporting#token={{ embed_token }}" target="_blank">
  Buka laporan
</a>
```

Token selalu di **fragment** (`#token=`), bukan query string — fragment tidak
dikirim ke server, jadi tidak masuk access log maupun header Referer. Halaman
embed juga langsung menghapusnya dari address bar setelah dibaca.

## 4. Izinkan origin situs tuan rumah (khusus iframe)

Semua halaman aplikasi ini memasang `X-Frame-Options: DENY`. Hanya `/embed/*`
yang dikecualikan, dan itupun hanya untuk origin yang disebut eksplisit:

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

- **Perpanjangan token otomatis.** Setelah TTL habis, widget menampilkan pesan
  kedaluwarsa dan pengunjung memuat ulang halaman induk. Kalau dirasa mengganggu,
  yang perlu ditambah adalah endpoint refresh, bukan TTL yang dipanjangkan.
- **Riwayat percakapan.** Hilang saat panel ditutup.
- **Pembatasan laju per token.** Rate limit yang ada berlaku global untuk
  `/v1/chat`, belum untuk `/reporting/ask`.
