# Gap Assessment Online — Kalbe Consumer Health

Aplikasi **Gap Assessment Online** untuk mengelola pemenuhan regulasi baru dan revisi klausul demi klausul, penugasan tindakan perbaikan (*action plan*), persetujuan elektronik berjenjang (ERES 21 CFR Part 11), pemantauan eksekusi, serta pelaporan kepatuhan (*compliance rate*) multi-site Kalbe Consumer Health (**Cikarang**, **Pulogadung**, **Pulomas**).

Dikembangkan mengacu pada:
* **URS Gap Assessment Online** (User Requirement Specification)
* **WI-QO-QS-1023.04** (Panduan Penyusunan Gap Analysis Legal & Other Requirements Compliance)

---

## 🛠️ Tech Stack

* **Backend**: Go 1.22+ (`net/http`, `pgx/v5`, `bcrypt`, PDF parser engine)
* **Frontend**: Next.js 14/16 (App Router, TypeScript, Turbopack)
* **Database**: PostgreSQL 14+ (`gap` schema, triggers, sequences, audit trail)
* **Desain UI**: Palet warna resmi Kalbe Consumer Health (`#006837`, `#6bb745`), layout sidebar vertikal responsif

---

## 📂 Struktur Project

```text
├── db/
│   ├── 01_ddl.sql           # Schema DDL (tabel, enum, sequence, trigger, fungsi gap_no)
│   └── 02_seed.sql          # Seed data (3 sites, 25 departemen, hak akses role per modul)
├── backend/
│   ├── cmd/
│   │   ├── server/          # Main entrypoint REST API backend (:8080)
│   │   ├── bootstrap/       # CLI pendaftaran user pertama
│   │   └── seed_demo/       # Seeder 7 user demo untuk testing lengkap
│   ├── internal/
│   │   ├── apphandler/      # HTTP handlers & routing REST API
│   │   ├── auth/            # ERES, password policy (URS 001A), sesi 30 menit (URS 001B)
│   │   ├── config/          # Environment configuration
│   │   ├── httpx/           # JSON helpers & error handling
│   │   ├── pdfparser/       # Engine ekstraksi PDF regulasi & pemilah klausul (URS 007A/B)
│   │   └── store/           # Data access layer PostgreSQL (pgx)
│   ├── go.mod
│   ├── go.sum
│   └── .env.example
├── frontend/
│   ├── app/                 # Next.js App Router (14 halaman terintegrasi)
│   │   ├── (app)/           # Protected pages (sidebar shell)
│   │   │   ├── home/        # Dashboard & compliance metrics
│   │   │   ├── master-list/ # Master List WI Lampiran 2
│   │   │   ├── regulations/ # Upload & daftar regulasi
│   │   │   ├── gap-analysis/# Matriks klausul WI Lampiran 1
│   │   │   ├── approvals/   # ERES 21 CFR Part 11 electronic signatures
│   │   │   ├── execution/   # Monitoring action plan WI Lampiran 3
│   │   │   ├── audit-trail/ # Log history & rekam jejak
│   │   │   └── settings/    # Users, departemen, delegasi wewenang
│   │   └── login/           # Layar login terpusat
│   ├── components/          # Reusable UI (AppSidebar, PasswordField, Modals, etc.)
│   ├── lib/                 # API client & session manager
│   ├── public/              # Logo Kalbe Consumer Health
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml       # PostgreSQL database container
└── sample_regulation_cpob.pdf # Contoh dokumen regulasi PDF untuk uji coba
```

---

## 🚀 Panduan Menjalankan Aplikasi

### 1. Database (Docker PostgreSQL)
Jalankan container PostgreSQL:
```bash
docker compose up -d
```
Atau jika menggunakan PostgreSQL lokal:
```bash
psql -U postgres -d gap_db -f db/01_ddl.sql
psql -U postgres -d gap_db -f db/02_seed.sql
```

### 2. Backend (Go)
```bash
cd backend
cp .env.example .env     # Sesuaikan DATABASE_URL bila diperlukan
go run ./cmd/seed_demo   # Menyiapkan 7 akun demo untuk semua role
go run ./cmd/server      # Berjalan di port 8080
```

### 3. Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev              # Berjalan di http://localhost:3000
```

Buka browser di **`http://localhost:3000`**.

---

## 👥 Akun Demo Pengujian (Testing Accounts)

Password default untuk semua akun: **`KCH12345`**

| Role | Username | Deskripsi Peran |
| :--- | :--- | :--- |
| **Co Gap Supervisor** | `admin` | Verifikasi dokumen, Master Data, & Delegasi |
| **Co Gap Staff** | `staff_qs` | Upload regulasi PDF & kelola draft gap analysis |
| **PIC Area** | `pic_pr` | Pengisian kondisi klausul, action plan, & due date |
| **Manager Area** | `mgr_pr` | Persetujuan elektronik Stage 1 tingkat departemen |
| **Co Gap Manager** | `mgr_qs` | Persetujuan elektronik Stage 1 tingkat Quality System |
| **QA Manager** | `mgr_qa` | Persetujuan elektronik Stage 1 kategori Quality |
| **QO Head** | `head_qo` | Persetujuan final Stage 1 (*Final Approval*) |

---

## 📋 Fitur Utama Sesuai URS & WI

1. **Autentikasi & Keamanan (URS 001A & 001B)**:
   * Password default `KCH12345` wajib diganti saat login pertama.
   * Kebijakan password minimal 8 karakter, huruf kapital, dan angka.
   * Sesi otomatis berakhir setelah 30 menit tidak aktif (*idle timeout*).
2. **Upload Regulasi & Auto-Extract PDF (URS 007A-E)**:
   * Mendukung upload file PDF regulasi (BPOM, ISO, Permenkes, CPOB).
   * Engine parser otomatis mendeteksi Nomor Regulasi, Judul, Tanggal, dan memilah baris klausul bernomor.
   * Penandaan otomatis klausul definisi/pembuka sebagai `INFO`.
   * Otomatis membuat dokumen Gap Analysis terpisah per site (`CKR`, `PLG`, `PLM`) dengan format penomoran standar Kalbe `GAP-AA-BBBB-CCC.DD`.
3. **Matriks Gap Analysis (WI Lampiran 1)**:
   * Penilaian pemenuhan klausul (*Sesuai*, *Sesuai Sebagian*, *Tidak Sesuai*).
   * Rencana tindakan perbaikan (*Action Plan*), PIC, dan target jatuh tempo (*Due Date*).
4. **Persetujuan Elektronik / ERES (URS 009A & 009C)**:
   * Kepatuhan 21 CFR Part 11 dengan re-otentikasi password dan pencatatan alasan (*meaning of signature*).
   * Alur persetujuan Stage 1 sekuensial: PIC $\rightarrow$ SPV $\rightarrow$ Manager Area $\rightarrow$ Co Gap Manager $\rightarrow$ QA Manager $\rightarrow$ QO Head.
5. **Pemantauan Eksekusi Tindakan (WI Lampiran 3)**:
   * Monitoring klausul berstatus *Open*, *On Progress*, *Closed*.
   * Perhitungan otomatis *Lead Time* dan peringatan *Overdue*.
6. **Laporan & Dashboard Kepatuhan**:
   * **Master List (WI Lampiran 2)**: Rekapitulasi pemenuhan seluruh regulasi per site.
   * **Dashboard**: Persentase kepatuhan (*Compliance Rate %*) dengan formula resmi WI:
     $$\% \text{Compliance} = \frac{(N_{\text{sesuai}} \times 100) + (N_{\text{sebagian}} \times 50) + (N_{\text{tidak sesuai}} \times 0)}{N_{\text{total}}}$$
7. **Audit Trail Lengkap (URS 004A)**:
   * Rekam jejak digital permanen dari setiap aktivitas login, perubahan klausul, hingga pembubuhan e-signature.
