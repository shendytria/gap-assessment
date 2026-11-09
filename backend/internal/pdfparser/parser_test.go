package pdfparser

import (
	"os"
	"regexp"
	"testing"
)

func TestParseRegulationDocument_Pasal(t *testing.T) {
	sampleText := `SALINAN
PERATURAN BADAN PENGAWAS OBAT DAN MAKANAN
NOMOR 34 TAHUN 2021
TENTANG
STANDAR CARA PEMBUATAN OBAT YANG BAIK

BAB I
KETENTUAN UMUM
Pasal 1
Dalam Peraturan ini yang dimaksud dengan CPOB adalah cara pembuatan obat...

BAB II
PERSYARATAN TEKNIS
Pasal 2
(1) Industri Farmasi wajib menerapkan CPOB dalam seluruh aspek pembuatan obat.
(2) Penerapan CPOB sebagaimana dimaksud pada ayat 1 dibuktikan dengan sertifikat CPOB.

Pasal 3
Setiap fasilitas produksi harus memenuhi standar kebersihan udara dan pemantauan suhu.

Ditetapkan di Jakarta
pada tanggal 15 Desember 2021
`

	res := ParseRegulationDocument(sampleText)
	if res.LegalNumber != "NOMOR 34 TAHUN 2021" && res.LegalNumber != "PERATURAN BADAN PENGAWAS OBAT DAN MAKANAN NOMOR 34 TAHUN 2021" {
		t.Logf("Detected LegalNumber: %s", res.LegalNumber)
	}
	if res.Title != "STANDAR CARA PEMBUATAN OBAT YANG BAIK" {
		t.Logf("Detected Title: %s", res.Title)
	}
	if res.PublishedDate == nil || *res.PublishedDate != "2021-12-15" {
		t.Errorf("Expected PublishedDate 2021-12-15, got %v", res.PublishedDate)
	}
	if res.RegulationType != "CHAPTER_ARTICLE" {
		t.Errorf("Expected CHAPTER_ARTICLE, got %s", res.RegulationType)
	}
	if len(res.Clauses) != 3 {
		t.Fatalf("Expected 3 clauses, got %d", len(res.Clauses))
	}
	if res.Clauses[0].ClauseNo != "Pasal 1" || !res.Clauses[0].IsInfo {
		t.Errorf("Clause 1 should be Pasal 1 with IsInfo=true, got %+v", res.Clauses[0])
	}
	if res.Clauses[1].ClauseNo != "Pasal 2" || res.Clauses[1].IsInfo {
		t.Errorf("Clause 2 should be Pasal 2 with IsInfo=false, got %+v", res.Clauses[1])
	}
}

func TestParseRegulationDocument_Numbered(t *testing.T) {
	sampleText := `ISO 9001:2015 QUALITY MANAGEMENT SYSTEMS
1.1 Scope
This document specifies requirements for a quality management system.
1.2 Normative references
There are no normative references.
4.1 Understanding the organization
The organization shall determine external and internal issues.
4.2 Understanding the needs and expectations
The organization shall determine interested parties.
`
	res := ParseRegulationDocument(sampleText)
	if res.RegulationType != "NUMBERED_STANDARD" {
		t.Errorf("Expected NUMBERED_STANDARD, got %s", res.RegulationType)
	}
	if len(res.Clauses) < 3 {
		t.Fatalf("Expected at least 3 clauses, got %d", len(res.Clauses))
	}
}

func TestSampleFile(t *testing.T) {
	bytes, err := os.ReadFile("../../../sample_regulation_cpob.pdf")
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	raw := ExtractRawText(bytes)
	res := ParseRegulationDocument(raw)
	if len(res.Clauses) != 4 {
		t.Fatalf("Expected 4 clauses, got %d", len(res.Clauses))
	}
	if res.Clauses[0].ClauseNo != "Pasal 1" || !res.Clauses[0].IsInfo {
		t.Errorf("Expected Pasal 1 with IsInfo=true, got %+v", res.Clauses[0])
	}
	if res.Clauses[1].ClauseNo != "Pasal 2" || res.Clauses[1].IsInfo {
		t.Errorf("Expected Pasal 2 with IsInfo=false, got %+v", res.Clauses[1])
	}
}
