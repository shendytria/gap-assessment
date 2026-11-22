# Gap Assessment Online — Kalbe Consumer Health

Aplikasi **Gap Assessment Online** untuk mengelola evaluasi pemenuhan regulasi baru dan revisi klausul demi klausul, penyusunan tindakan perbaikan (*action plan*), persetujuan elektronik berjenjang (ERES), pemantauan eksekusi, serta pelaporan kepatuhan (*compliance rate*) multi-site Kalbe Consumer Health (**Cikarang / CKR**, **Pulogadung / PLG**, **Pulomas / PLM**).

Mengacu pada:
* **URS Gap Assessment Online (`URS1-26-SFT-QS-002.00`)**
* **WI-QO-QS-1023.04** (*Panduan Penyusunan Gap Analysis Legal & Other Requirements Compliance*)

---

## 🛠️ Tech Stack & Prasyarat

* **Database**: PostgreSQL 14+ (bisa via Docker Compose atau instalasi lokal)
* **Backend**: Go 1.22+ (`net/http`, `pgx/v5`, `bcrypt`)
* **Frontend**: Node.js 18+ / 20+ (Next.js App Router, React 18, TypeScript)

---

## 📂 Struktur Project

```text
├── .env.example                 # Template konfigurasi environment (salin ke .env di root)
├── docker-compose.yml           # Container PostgreSQL 14 (otomatis menjalankan migration.sql)
├── migration/
│   └── migration.sql            # Skema lengkap database (schema gap, enum, tabel, trigger, view, referensi dasar)
├── backend/
│   ├── cmd/server/              # Main entrypoint REST API backend (default port :8080)
│   ├── internal/
│   │   ├── apphandler/          # HTTP handlers & routing REST API
│   │   ├── auth/                # Autentikasi, kebijakan password, sesi idle 30 menit
│   │   ├── config/              # Loader konfigurasi dari ../.env
│   │   ├── httpx/               # JSON response & error helpers
│   │   ├── mailer/              # SMTP mail relay helper
│   │   ├── pdfparser/           # Engine ekstraksi PDF regulasi & pemilah klausul
│   │   └── store/               # Data access layer PostgreSQL (pgx) & auto-bootstrap admin
│   ├── go.mod
│   └── go.sum
└── frontend/
    ├── app/                     # Next.js App Router
    ├── components/              # Komponen UI & template laporan PDF Lampiran 1
    ├── lib/                     # API client & session manager
    ├── public/                  # Logo & aset statis
    └── package.json
```

---

## ⚙️ Konfigurasi Environment (`.env`)

Repository ini menggunakan **satu file `.env` di root project** yang otomatis dibaca oleh Backend (`../.env`) maupun Frontend (`../.env`). File `.env` di-ignore oleh Git agar kredensial tidak ikut ter-push ke GitHub.

Salin template terlebih dahulu di root project:
```bash
cp .env.example .env
```

Lalu sesuaikan nilai `CHANGE_ME` dan variabel berikut di file `.env`:

| Variabel | Contoh / Default | Catatan untuk Lokal & Deployment Server (Tim IT) |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgres://postgres:password123@127.0.0.1:5432/gap_db?sslmode=disable` | Sesuaikan host, user, password (untuk Docker lokal sesuai `docker-compose.yml`: `password123`) |
| `PORT` | `8080` | Port REST API backend |
| `JWT_SECRET_KEY` | `CHANGE_ME_...` | **Wajib diganti** dengan string acak minimal 32 karakter |
| `COOKIE_SECURE` | `false` | Set `true` jika diakses melalui **HTTPS**; `false` jika HTTP intranet |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Isi URL/IP frontend yang diakses browser (pisah koma bila lebih dari satu) |
| `SMTP_HOST` / `SMTP_SENDER` | `CHANGE_ME` | Isi relay SMTP perusahaan untuk pengiriman notifikasi email |
| `BACKEND_URL` | `http://127.0.0.1:8080` | URL internal backend untuk proxy Next.js (`/api/*`) |
| `INITIAL_ADMIN_EMAIL` | `admin@kalbeconsumerhealth.co.id` | Email akun admin awal (auto-seed saat backend start) |
| `INITIAL_ADMIN_PASSWORD` | `Gap12345` | Password awal admin (wajib diganti saat login pertama) |

---

## 🚀 Panduan Instalasi & Menjalankan (Development / Lokal)

### 1. Siapkan Database PostgreSQL

**Opsi A — Menggunakan Docker Compose (Paling Cepat):**
Pastikan Docker Desktop sudah aktif, lalu jalankan dari root project:
```bash
docker compose up -d
```
Container `gap_assessment_db` akan aktif di port `5432` dan otomatis menjalankan `migration/migration.sql` saat pertama kali dibuat.

**Opsi B — Menggunakan PostgreSQL Lokal (Tanpa Docker):**
1. Buat database kosong (mis. `gap_db`):
   ```bash
   createdb -U postgres gap_db
   ```
2. Jalankan skrip migrasi skema:
   ```bash
   psql -U postgres -d gap_db -f migration/migration.sql
   ```
3. Pastikan kredensial `DATABASE_URL` di `.env` sudah sesuai dengan PostgreSQL lokal Anda.

---

### 2. Jalankan Backend (Go — Port `8080`)
Buka terminal pertama di folder `backend/`:
```bash
cd backend
go mod download
go run ./cmd/server
```
Saat pertama kali dijalankan, backend otomatis:
- Menjalankan sinkronisasi skema (`EnsureSchema`), dan
- Membuat akun **System Administrator** (`CO_GAP_SUPERVISOR`) sesuai konfigurasi `INITIAL_ADMIN_*` di `.env`.

Verifikasi backend aktif dengan membuka `http://localhost:8080/healthz` (harus mengembalikan `ok`).

---

### 3. Jalankan Frontend (Next.js — Port `3000`)
Buka terminal kedua di folder `frontend/`:
```bash
cd frontend
npm install
npm run dev
```

---

### 4. Login Pertama Kali
Buka browser ke **`http://localhost:3000`**, lalu login menggunakan akun admin awal:
* **Username / Email**: `admin` atau `admin@kalbeconsumerhealth.co.id`
* **Password**: `Gap12345` *(sistem akan langsung meminta ganti password minimal 8 karakter dengan kombinasi huruf kapital dan angka)*

Setelah masuk sebagai Admin (`Co Gap Supervisor`), buka menu **Settings** untuk menambahkan:
1. **Departments** per site (`CKR`, `PLG`, `PLM`), dan
2. **Users** sesuai peran masing-masing (*Co Gap Staff*, *PIC Area*, *Manager Area*, *Co Gap Manager*, *QA Manager*, *QO Head*).

---

## 🏗️ Panduan Build & Deploy Production (Tim IT)

1. **Database:** Buat database PostgreSQL pada server tujuan, lalu jalankan `migration/migration.sql`:
   ```bash
   psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -f migration/migration.sql
   ```
2. **Konfigurasi `.env`:** Salin `.env.example` menjadi `.env` di root project (`cp .env.example .env`) lalu sesuaikan seluruh nilai `CHANGE_ME` (`DATABASE_URL`, `JWT_SECRET_KEY`, `COOKIE_SECURE`, `ALLOWED_ORIGINS`, `BACKEND_URL`, dan SMTP).
3. **Build & Jalankan Backend:**
   ```bash
   cd backend
   go build -o bin/gap-server ./cmd/server
   ./bin/gap-server
   ```
   *(Disarankan dijalankan sebagai service `systemd` / Windows Service / supervisor dengan working directory di folder `backend/` agar path `../.env` dan folder `uploads/` terbaca dengan benar.)*
4. **Build & Jalankan Frontend:**
   ```bash
   cd frontend
   npm ci
   npm run build
   npm run start
   ```
   *(Disarankan dijalankan melalui `pm2` / `systemd` dan di-reverse-proxy melalui Nginx/IIS bila menggunakan HTTPS.)*

---

## 🔧 Troubleshooting Singkat

* **`Cannot connect to the Docker daemon`**: Buka aplikasi **Docker Desktop** terlebih dahulu dan tunggu hingga status *Engine running*, lalu ulangi `docker compose up -d`.
* **`EADDRINUSE: address already in use :::3000`**: Port 3000 sedang dipakai proses lain. Hentikan proses lama (`kill -9 $(lsof -ti :3000)` di macOS/Linux) atau jalankan di port lain (`npx next dev -p 3001`) dan tambahkan origin-nya ke `ALLOWED_ORIGINS` di `.env`.
* **`connection refused` ke port `5432`**: Pastikan service/container PostgreSQL sedang berjalan (`docker compose ps` atau `brew services list`) dan cek `http://localhost:8080/healthz`.
* **Reset Database Lokal (Docker):** Jika ingin mengulang dari database kosong:
  ```bash
  docker compose down -v
  docker compose up -d
  ```
