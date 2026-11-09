package pdfparser

import (
	"bytes"
	"compress/zlib"
	"encoding/hex"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
)

type ParsedClause struct {
	SortOrder       int    `json:"sortOrder"`
	Chapter         string `json:"chapter"`
	ClauseNo        string `json:"clauseNo"`
	ClauseTitle     string `json:"clauseTitle"`
	RequirementText string `json:"requirementText"`
	IsInfo          bool   `json:"isInfo"`
}

type ParseResult struct {
	LegalNumber    string         `json:"legalNumber"`
	Title          string         `json:"title"`
	PublishedDate  *string        `json:"publishedDate"`
	RegulationType string         `json:"regulationType"`
	RawTextPreview string         `json:"rawTextPreview"`
	Clauses        []ParsedClause `json:"clauses"`
}

// ExtractRawText extracts readable text from unencrypted PDF content streams
func ExtractRawText(pdfBytes []byte) string {
	var fullText strings.Builder

	streamRe := regexp.MustCompile(`(?s)stream\r?\n(.*?)\r?\nendstream`)
	matches := streamRe.FindAllSubmatch(pdfBytes, -1)

	for _, m := range matches {
		raw := m[1]
		var data []byte

		zr, err := zlib.NewReader(bytes.NewReader(raw))
		if err == nil {
			decompressed, errRead := io.ReadAll(zr)
			zr.Close()
			if errRead == nil {
				data = decompressed
			} else {
				data = raw
			}
		} else {
			data = raw
		}

		// Find BT ... ET blocks (ensure BT and ET are standalone PDF operator tokens, not substrings in text like KETENTUAN)
		btEtRe := regexp.MustCompile(`(?s)(?:^|\s)BT\s+(.*?)\s+ET(?:\s|$)`)
		textBlocks := btEtRe.FindAllSubmatch(data, -1)

		for _, tb := range textBlocks {
			content := tb[1]
			lines := parseBTBlock(content)
			if len(lines) > 0 {
				fullText.WriteString(lines + "\n")
			}
		}
	}

	return strings.TrimSpace(fullText.String())
}

func parseBTBlock(block []byte) string {
	var b strings.Builder

	// Matches:
	// 1 & 2: Text operators: (text) Tj, <hex> Tj, [array] TJ, ', "
	// 3 & 4: Td / TD with dy: dx dy Td / TD
	// 5: T* (next line)
	// 6: Tm (text matrix)
	opRe := regexp.MustCompile(`(?s)(\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]+>|\[(?:[^\[\]\\]|\\.)*\])\s*(Tj|'|"|TJ)|(?:[-+]?[0-9]*\.?[0-9]+\s+([-+]?[0-9]*\.?[0-9]+)\s+(Td|TD))|(T\*)|(?:(?:[-+]?[0-9]*\.?[0-9]+\s+){5}[-+]?[0-9]*\.?[0-9]+\s+(Tm))`)
	matches := opRe.FindAllSubmatch(block, -1)

	for _, m := range matches {
		if len(m[2]) > 0 { // Tj, ', ", TJ
			operand := string(m[1])
			op := string(m[2])

			switch op {
			case "Tj", "'", "\"":
				text := decodeStringOperand(operand)
				b.WriteString(text + " ")
				if op == "'" || op == "\"" {
					b.WriteString("\n")
				}
			case "TJ":
				text := decodeArrayOperand(operand)
				b.WriteString(text + " ")
			}
		} else if len(m[4]) > 0 { // Td or TD
			dyStr := string(m[3])
			dy, _ := strconv.ParseFloat(dyStr, 64)
			// In PDF coordinates, moving to a new line has non-zero dy (typically negative)
			if dy != 0 {
				b.WriteString("\n")
			}
		} else if len(m[5]) > 0 { // T*
			b.WriteString("\n")
		} else if len(m[6]) > 0 { // Tm
			b.WriteString("\n")
		}
	}

	return b.String()
}

func decodeStringOperand(operand string) string {
	operand = strings.TrimSpace(operand)
	if strings.HasPrefix(operand, "(") && strings.HasSuffix(operand, ")") {
		inner := operand[1 : len(operand)-1]
		return unescapeLiteralString(inner)
	}
	if strings.HasPrefix(operand, "<") && strings.HasSuffix(operand, ">") {
		hexStr := strings.ReplaceAll(operand[1:len(operand)-1], " ", "")
		decoded, err := hex.DecodeString(hexStr)
		if err == nil {
			// check if UTF-16BE (starts with 0xFE 0xFF or every alternate 0x00)
			if len(decoded) >= 2 && decoded[0] == 0xFE && decoded[1] == 0xFF {
				return decodeUTF16BE(decoded[2:])
			}
			if len(decoded)%2 == 0 && isLikelyUTF16(decoded) {
				return decodeUTF16BE(decoded)
			}
			return string(decoded)
		}
	}
	return ""
}

func decodeArrayOperand(operand string) string {
	operand = strings.TrimSpace(operand)
	if !strings.HasPrefix(operand, "[") || !strings.HasSuffix(operand, "]") {
		return ""
	}
	inner := operand[1 : len(operand)-1]

	var b strings.Builder
	itemRe := regexp.MustCompile(`(\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]+>|[-+]?[0-9]*\.?[0-9]+)`)
	items := itemRe.FindAllString(inner, -1)

	for _, it := range items {
		it = strings.TrimSpace(it)
		if strings.HasPrefix(it, "(") || strings.HasPrefix(it, "<") {
			b.WriteString(decodeStringOperand(it))
		} else {
			// Kerning number. Large negative kerning like -100 or less often indicates a space
			val, err := strconv.ParseFloat(it, 64)
			if err == nil && val < -150 {
				b.WriteString(" ")
			}
		}
	}

	return b.String()
}

func isLikelyUTF16(b []byte) bool {
	if len(b) < 2 {
		return false
	}
	nullCount := 0
	for i := 0; i < len(b); i += 2 {
		if b[i] == 0 {
			nullCount++
		}
	}
	return nullCount > len(b)/4
}

func decodeUTF16BE(b []byte) string {
	var sb strings.Builder
	for i := 0; i < len(b)-1; i += 2 {
		r := rune(b[i])<<8 | rune(b[i+1])
		if r != 0 {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

func unescapeLiteralString(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) {
			i++
			switch s[i] {
			case 'n':
				b.WriteByte('\n')
			case 'r':
				b.WriteByte('\r')
			case 't':
				b.WriteByte('\t')
			case 'b':
				b.WriteByte('\b')
			case 'f':
				b.WriteByte('\f')
			case '(':
				b.WriteByte('(')
			case ')':
				b.WriteByte(')')
			case '\\':
				b.WriteByte('\\')
			default:
				// check octal \ddd
				if s[i] >= '0' && s[i] <= '7' {
					oct := string(s[i])
					if i+1 < len(s) && s[i+1] >= '0' && s[i+1] <= '7' {
						i++
						oct += string(s[i])
						if i+1 < len(s) && s[i+1] >= '0' && s[i+1] <= '7' {
							i++
							oct += string(s[i])
						}
					}
					val, err := strconv.ParseInt(oct, 8, 32)
					if err == nil {
						b.WriteByte(byte(val))
					}
				} else {
					b.WriteByte(s[i])
				}
			}
		} else {
			b.WriteByte(s[i])
		}
	}
	return b.String()
}

// ParseRegulationDocument parses the raw text and segments it into metadata and clauses
func ParseRegulationDocument(rawText string) *ParseResult {
	res := &ParseResult{
		Clauses: []ParsedClause{},
	}

	lines := strings.Split(rawText, "\n")
	cleanLines := make([]string, 0, len(lines))
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed != "" {
			cleanLines = append(cleanLines, trimmed)
		}
	}

	res.RawTextPreview = strings.Join(cleanLines, "\n")

	// 1. Detect Legal Number
	legalNumRe := regexp.MustCompile(`(?i)(?:PERATURAN|KEPUTUSAN|UNDANG-UNDANG|UU|PERMENKES|BPOM|KEPPRES|INPRES|PP|PERKAP|ISO|WHO|EDQM)\s*(?:MENTERI|KEPALA|PRESIDEN|REPUBLIK INDONESIA|BADAN POM)?\s*(?:NOMOR|NO\.?)\s*([A-Za-z0-9\/\-\.\s]+(?:TAHUN|\d{4})[A-Za-z0-9\/\-\.]*)`)
	for _, line := range cleanLines {
		if m := legalNumRe.FindString(line); m != "" {
			res.LegalNumber = strings.TrimSpace(m)
			break
		}
	}
	if res.LegalNumber == "" {
		// Fallback check: look for "NOMOR ... TAHUN ..."
		numRe := regexp.MustCompile(`(?i)NOMOR\s+([0-9]+[A-Za-z0-9\/\-\.\s]+TAHUN\s+[0-9]{4})`)
		for _, line := range cleanLines {
			if m := numRe.FindString(line); m != "" {
				res.LegalNumber = strings.TrimSpace(m)
				break
			}
		}
	}

	// 2. Detect Title (often starts after "TENTANG" or line 2-4)
	aboutRe := regexp.MustCompile(`(?i)^\s*TENTANG\s*(.*)`)
	for i, line := range cleanLines {
		if m := aboutRe.FindStringSubmatch(line); len(m) > 1 {
			titleText := strings.TrimSpace(m[1])
			// If title extends to next line before BAB/Menimbang
			if i+1 < len(cleanLines) && !strings.HasPrefix(strings.ToUpper(cleanLines[i+1]), "DENGAN RAHMAT") &&
				!strings.HasPrefix(strings.ToUpper(cleanLines[i+1]), "MENIMBANG") &&
				!strings.HasPrefix(strings.ToUpper(cleanLines[i+1]), "BAB") {
				titleText += " " + cleanLines[i+1]
			}
			res.Title = titleText
			break
		}
	}
	if res.Title == "" && len(cleanLines) > 0 {
		for _, l := range cleanLines[:min(5, len(cleanLines))] {
			if len(l) > 10 && !strings.HasPrefix(strings.ToUpper(l), "SALINAN") {
				res.Title = l
				break
			}
		}
	}

	// 3. Detect Published Date
	dateRe := regexp.MustCompile(`(?i)(?:ditetapkan|diundangkan)?\s*(?:di\s+[A-Za-z]+,?\s*)?(?:pada\s+tanggal\s+)?(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})`)
	monthMap := map[string]string{
		"januari": "01", "februari": "02", "maret": "03", "april": "04",
		"mei": "05", "juni": "06", "juli": "07", "agustus": "08",
		"september": "09", "oktober": "10", "november": "11", "desember": "12",
	}
	for i := len(cleanLines) - 1; i >= 0; i-- {
		if m := dateRe.FindStringSubmatch(cleanLines[i]); len(m) == 4 {
			day, _ := strconv.Atoi(m[1])
			mLower := strings.ToLower(m[2])
			month := monthMap[mLower]
			year := m[3]
			if month != "" {
				formatted := fmt.Sprintf("%s-%s-%02d", year, month, day)
				res.PublishedDate = &formatted
				break
			}
		}
	}

	// 4. Detect Regulation Type and Extract Clauses
	hasPasal := false
	for _, l := range cleanLines {
		if regexp.MustCompile(`(?i)^\s*Pasal\s+\d+`).MatchString(l) {
			hasPasal = true
			break
		}
	}

	if hasPasal {
		res.RegulationType = "CHAPTER_ARTICLE"
		res.Clauses = extractPasalClauses(cleanLines)
	} else {
		// Check for numbered standard (e.g. 1.1, 1.2, 4.1)
		res.RegulationType = "NUMBERED_STANDARD"
		res.Clauses = extractNumberedClauses(cleanLines)
	}

	// Default fallback if no clauses parsed
	if len(res.Clauses) == 0 {
		res.Clauses = []ParsedClause{
			{
				SortOrder:       1,
				Chapter:         "General",
				ClauseNo:        "1.1",
				ClauseTitle:     "General Requirement",
				RequirementText: strings.Join(cleanLines[:min(3, len(cleanLines))], "\n"),
				IsInfo:          false,
			},
		}
	}

	return res
}

func extractPasalClauses(lines []string) []ParsedClause {
	var clauses []ParsedClause
	currentChapter := ""
	currentPasal := ""
	var currentText strings.Builder
	order := 1

	pasalRe := regexp.MustCompile(`(?i)^\s*(Pasal\s+\d+[a-zA-Z]?)\s*(.*)`)
	babRe := regexp.MustCompile(`(?i)^\s*(BAB\s+[IVXLCDM0-9]+.*)`)

	flush := func() {
		if currentPasal != "" {
			reqText := strings.TrimSpace(currentText.String())
			if reqText == "" {
				reqText = currentPasal
			}

			// check if info clause (definitions or preamble)
			isInfo := false
			lowerText := strings.ToLower(reqText)
			lowerBab := strings.ToLower(currentChapter)
			if strings.Contains(lowerBab, "ketentuan umum") ||
				strings.Contains(lowerText, "dalam peraturan ini yang dimaksud") ||
				strings.Contains(lowerText, "cukup jelas") {
				isInfo = true
			}

			clauses = append(clauses, ParsedClause{
				SortOrder:       order,
				Chapter:         currentChapter,
				ClauseNo:        currentPasal,
				ClauseTitle:     "",
				RequirementText: reqText,
				IsInfo:          isInfo,
			})
			order++
			currentText.Reset()
			currentPasal = ""
		}
	}

	closingRe := regexp.MustCompile(`(?i)^\s*(Ditetapkan\s+di|Diundangkan\s+di|Agar\s+setiap\s+orang)`)

	for _, l := range lines {
		if closingRe.MatchString(l) {
			flush()
			currentPasal = ""
			continue
		}
		if m := babRe.FindStringSubmatch(l); len(m) > 1 {
			flush()
			currentChapter = strings.TrimSpace(m[1])
			continue
		}
		if m := pasalRe.FindStringSubmatch(l); len(m) > 1 {
			flush()
			currentPasal = strings.TrimSpace(m[1])
			rest := strings.TrimSpace(m[2])
			if rest != "" {
				currentText.WriteString(rest + "\n")
			}
			continue
		}
		if currentPasal != "" {
			currentText.WriteString(l + "\n")
		}
	}
	flush()

	return clauses
}

func extractNumberedClauses(lines []string) []ParsedClause {
	var clauses []ParsedClause
	currentChapter := ""
	currentNo := ""
	currentTitle := ""
	var currentText strings.Builder
	order := 1

	// Matches 1.1, 1.1.1, 4.2.3, etc. or 1. Title
	numRe := regexp.MustCompile(`^(\d+(?:\.\d+)+|\d+\.)\s*(.*)`)

	flush := func() {
		if currentNo != "" {
			reqText := strings.TrimSpace(currentText.String())
			if reqText == "" {
				reqText = currentTitle
			}
			isInfo := strings.Contains(strings.ToLower(currentTitle), "scope") ||
				strings.Contains(strings.ToLower(currentTitle), "ruang lingkup") ||
				strings.Contains(strings.ToLower(currentTitle), "definisi")

			clauses = append(clauses, ParsedClause{
				SortOrder:       order,
				Chapter:         currentChapter,
				ClauseNo:        currentNo,
				ClauseTitle:     currentTitle,
				RequirementText: reqText,
				IsInfo:          isInfo,
			})
			order++
			currentText.Reset()
		}
	}

	for _, l := range lines {
		if m := numRe.FindStringSubmatch(l); len(m) > 1 {
			flush()
			currentNo = strings.TrimSuffix(strings.TrimSpace(m[1]), ".")
			rest := strings.TrimSpace(m[2])
			// If rest is short, treat as title
			if len(rest) < 60 && !strings.Contains(rest, ".") {
				currentTitle = rest
			} else {
				currentTitle = ""
				currentText.WriteString(rest + "\n")
			}
			continue
		}
		if currentNo != "" {
			currentText.WriteString(l + "\n")
		}
	}
	flush()

	return clauses
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
