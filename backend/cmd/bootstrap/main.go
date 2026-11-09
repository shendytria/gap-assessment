// Command bootstrap mendaftarkan user dengan password default (URS 001A).
// Pemakaian (user pertama biasanya Co Gap Supervisor, yang kemudian mendaftarkan user lain lewat menu Setting):
//
//	DATABASE_URL=postgres://... go run ./cmd/bootstrap \
//	    -username jdoe -name "John Doe" -email jdoe@example.com \
//	    -role CO_GAP_SUPERVISOR -dept QS -site CKR -title "Supervisor" -initials JD
package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"gapapp/internal/auth"
	"gapapp/internal/config"
	"gapapp/internal/store"
)

func main() {
	var username, name, email, role, dept, site, title, initials string
	flag.StringVar(&username, "username", "", "username (unik)")
	flag.StringVar(&name, "name", "", "nama lengkap")
	flag.StringVar(&email, "email", "", "email")
	flag.StringVar(&role, "role", "CO_GAP_SUPERVISOR", "role_code, mis. CO_GAP_STAFF, CO_GAP_SUPERVISOR, PIC_AREA, ...")
	flag.StringVar(&dept, "dept", "", "kode departemen, mis. QS")
	flag.StringVar(&site, "site", "", "kode site: CKR / PLG / PLM")
	flag.StringVar(&title, "title", "", "jabatan")
	flag.StringVar(&initials, "initials", "", "inisial (untuk PIC)")
	flag.Parse()
	if username == "" || name == "" || email == "" {
		fmt.Fprintln(os.Stderr, "username, name, dan email wajib diisi")
		os.Exit(2)
	}

	cfg, err := config.Load()
	check(err)
	ctx := context.Background()
	db, err := store.New(ctx, cfg.DatabaseURL)
	check(err)
	defer db.Close()

	hash, err := auth.HashPassword(cfg.DefaultPassword, cfg.BcryptCost)
	check(err)

	var id int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO users (username, full_name, email, job_title, initials, role_id, department_id, site_id,
		                   password_hash, must_change_password)
		SELECT $1, $2, $3, NULLIF($4,''), NULLIF($5,''), r.role_id,
		       (SELECT d.department_id FROM department d JOIN site s ON s.site_id = d.site_id
		         WHERE d.department_code = NULLIF($7,'') AND s.site_code = NULLIF($8,'')),
		       (SELECT site_id FROM site WHERE site_code = NULLIF($8,'')),
		       $6, TRUE
		  FROM role r WHERE r.role_code = $9
		RETURNING user_id`, username, name, email, title, initials, hash, dept, site, role).Scan(&id)
	check(err)
	fmt.Printf("user %q dibuat (id %d). Password default dipakai dan wajib diganti saat login pertama.\n", username, id)
}

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
