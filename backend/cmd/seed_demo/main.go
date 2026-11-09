package main

import (
	"context"
	"fmt"
	"os"

	"gapapp/internal/auth"
	"gapapp/internal/config"
	"gapapp/internal/store"
)

type DemoUser struct {
	Username string
	FullName string
	Email    string
	Role     string
	Dept     string
	Site     string
	Title    string
	Initials string
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Config error: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	db, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "DB connection error: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	hash, err := auth.HashPassword("KCH12345", cfg.BcryptCost)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Hash error: %v\n", err)
		os.Exit(1)
	}

	users := []DemoUser{
		{
			Username: "admin",
			FullName: "Admin Co Gap Supervisor",
			Email:    "admin.spv@kalbe.co.id",
			Role:     "CO_GAP_SUPERVISOR",
			Dept:     "QS",
			Site:     "CKR",
			Title:    "Quality System Supervisor",
			Initials: "AS",
		},
		{
			Username: "staff_qs",
			FullName: "Budi Santoso (Co Gap Staff)",
			Email:    "budi.qs@kalbe.co.id",
			Role:     "CO_GAP_STAFF",
			Dept:     "QS",
			Site:     "CKR",
			Title:    "Quality System Staff",
			Initials: "BS",
		},
		{
			Username: "pic_pr",
			FullName: "Rian Hidayat (PIC Area Produksi)",
			Email:    "rian.pr@kalbe.co.id",
			Role:     "PIC_AREA",
			Dept:     "PR",
			Site:     "CKR",
			Title:    "Production Officer",
			Initials: "RH",
		},
		{
			Username: "mgr_pr",
			FullName: "Siti Rahma (Manager Area Produksi)",
			Email:    "siti.pr@kalbe.co.id",
			Role:     "MANAGER_AREA",
			Dept:     "PR",
			Site:     "CKR",
			Title:    "Production Manager",
			Initials: "SR",
		},
		{
			Username: "mgr_qs",
			FullName: "Hendra Wijaya (Co Gap Manager)",
			Email:    "hendra.qs@kalbe.co.id",
			Role:     "CO_GAP_MANAGER",
			Dept:     "QS",
			Site:     "CKR",
			Title:    "Quality System Manager",
			Initials: "HW",
		},
		{
			Username: "mgr_qa",
			FullName: "Dewi Lestari (QA Manager)",
			Email:    "dewi.qa@kalbe.co.id",
			Role:     "QA_MANAGER",
			Dept:     "QA",
			Site:     "CKR",
			Title:    "Quality Assurance Manager",
			Initials: "DL",
		},
		{
			Username: "head_qo",
			FullName: "Dr. Bambang Kusumo (QO Head)",
			Email:    "bambang.qo@kalbe.co.id",
			Role:     "QO_HEAD",
			Dept:     "QS",
			Site:     "CKR",
			Title:    "Quality Operation Head",
			Initials: "BK",
		},
	}

	fmt.Println("=== Seeding Demo Users for Testing ===")
	for _, u := range users {
		var id int
		err := db.Pool.QueryRow(ctx, `
			INSERT INTO users (username, full_name, email, job_title, initials, role_id, department_id, site_id,
			                   password_hash, must_change_password)
			SELECT $1, $2, $3, NULLIF($4,''), NULLIF($5,''), r.role_id,
			       (SELECT d.department_id FROM department d JOIN site s ON s.site_id = d.site_id
			         WHERE d.department_code = NULLIF($7,'') AND s.site_code = NULLIF($8,'')),
			       (SELECT site_id FROM site WHERE site_code = NULLIF($8,'')),
			       $6, FALSE
			  FROM role r WHERE r.role_code = $9
			ON CONFLICT (lower(username)) DO UPDATE
			  SET full_name = EXCLUDED.full_name,
			      role_id = EXCLUDED.role_id,
			      department_id = EXCLUDED.department_id,
			      site_id = EXCLUDED.site_id,
			      password_hash = EXCLUDED.password_hash,
			      must_change_password = FALSE
			RETURNING user_id`, u.Username, u.FullName, u.Email, u.Title, u.Initials, hash, u.Dept, u.Site, u.Role).Scan(&id)
		if err != nil {
			fmt.Printf("✗ Error seeding user %s: %v\n", u.Username, err)
		} else {
			fmt.Printf("✓ User %-12s [%-18s] (ID %d) - Password: KCH12345\n", u.Username, u.Role, id)
		}
	}

	fmt.Println("\nSemua user demo berhasil disiapkan!")
	fmt.Println("Password untuk semua user: KCH12345")
}
