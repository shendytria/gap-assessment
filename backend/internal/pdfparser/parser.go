package pdfparser

import (
	"bytes"
	"compress/zlib"
	"encoding/hex"
	"fmt"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
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

	streamRe := regexp.MustCompile(`(?s)stream\s*\r?\n(.*?)\r?\n?endstream`)
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

		streamText := extractStreamText(data)
		if len(streamText) > 0 {
			if fullText.Len() > 0 {
				fullText.WriteString("\n")
			}
			fullText.WriteString(streamText)
		}
	}

	return cleanUTF8Text(strings.TrimSpace(fullText.String()))
}

// extractBTBlocks splits PDF content stream into BT ... ET blocks while ignoring
// literal (...) and hex <...> string operands so words like "KETENTUAN" or "BT" in text
// never prematurely terminate a text object.
func extractBTBlocks(data []byte) [][]byte {
	var blocks [][]byte
	n := len(data)
	inBT := false
	btStart := 0

	isDelim := func(b byte) bool {
		return b == ' ' || b == '\t' || b == '\r' || b == '\n' || b == '/' || b == '<' || b == '(' || b == '[' || b == ']' || b == '>' || b == ')'
	}

	for i := 0; i < n; i++ {
		ch := data[i]
		if ch == '(' {
			// Skip literal string (...)
			depth := 1
			i++
			for i < n && depth > 0 {
				if data[i] == '\\' {
					i++ // skip escaped byte
				} else if data[i] == '(' {
					depth++
				} else if data[i] == ')' {
					depth--
				}
				i++
			}
			i--
			continue
		}
		if ch == '<' && (i+1 >= n || data[i+1] != '<') {
			// Skip hex string <...>
			i++
			for i < n && data[i] != '>' {
				i++
			}
			continue
		}
		if !inBT {
			if ch == 'B' && i+1 < n && data[i+1] == 'T' {
				prevOK := i == 0 || isDelim(data[i-1])
				nextOK := i+2 >= n || isDelim(data[i+2])
				if prevOK && nextOK {
					inBT = true
					btStart = i + 2
					i++
				}
			}
		} else {
			if ch == 'E' && i+1 < n && data[i+1] == 'T' {
				prevOK := i == 0 || isDelim(data[i-1])
				nextOK := i+2 >= n || isDelim(data[i+2])
				if prevOK && nextOK {
					blocks = append(blocks, data[btStart:i])
					inBT = false
					i++
				}
			}
		}
	}
	return blocks
}

var (
	btOpRe = regexp.MustCompile(`(?s)(\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]+>|\[(?:[^\[\]\\]|\\.)*\])\s*(Tj|'|"|TJ)|([-+]?[0-9]*\.?[0-9]+)\s+([-+]?[0-9]*\.?[0-9]+)\s+(Td|TD)|(T\*)|(?:[-+]?[0-9]*\.?[0-9]+\s+){4}([-+]?[0-9]*\.?[0-9]+)\s+([-+]?[0-9]*\.?[0-9]+)\s+(Tm)|/[A-Za-z0-9_+\-\.]+\s+([-+]?[0-9]*\.?[0-9]+)\s+(Tf)`)
)

func extractStreamText(data []byte) string {
	blocks := extractBTBlocks(data)
	if len(blocks) == 0 {
		return ""
	}

	var b strings.Builder
	hasLastPos := false
	lastY := 0.0
	lastEndX := 0.0
	fontSize := 12.0
	leading := 14.0

	for _, block := range blocks {
		// Each BT resets text matrix & line matrix per PDF spec
		lmX, lmY := 0.0, 0.0
		curX, curY := 0.0, 0.0

		matches := btOpRe.FindAllSubmatch(block, -1)
		for _, m := range matches {
			switch {
			case len(m[2]) > 0: // Tj, ', ", TJ
				op := string(m[2])
				if op == "'" || op == "\"" {
					lmY -= leading
					curX = lmX
					curY = lmY
				}
				var text string
				if op == "TJ" {
					text = decodeArrayOperand(string(m[1]))
				} else {
					text = decodeStringOperand(string(m[1]))
				}
				if text == "" {
					continue
				}

				if hasLastPos {
					if math.Abs(curY-lastY) > 2.5 {
						if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
							b.WriteByte('\n')
						}
					} else if strings.TrimSpace(text) != "" {
						// Same baseline: insert space only if there is a clear horizontal gap and no adjoining space
						curStr := b.String()
						lastChar := byte(0)
						if len(curStr) > 0 {
							lastChar = curStr[len(curStr)-1]
						}
						if lastChar != 0 && lastChar != ' ' && lastChar != '\n' && text[0] != ' ' {
							if curX-lastEndX > fontSize*0.20 {
								b.WriteByte(' ')
							}
						}
					}
				}

				b.WriteString(text)
				trimmed := strings.TrimSpace(text)
				if trimmed != "" || !hasLastPos {
					lastY = curY
					hasLastPos = true
				}
				estWidth := float64(utf8.RuneCountInString(text)) * fontSize * 0.48
				curX += estWidth
				lastEndX = curX

			case len(m[5]) > 0: // dx dy Td / TD
				dx, _ := strconv.ParseFloat(string(m[3]), 64)
				dy, _ := strconv.ParseFloat(string(m[4]), 64)
				lmX += dx
				lmY += dy
				curX = lmX
				curY = lmY
				if string(m[5]) == "TD" && dy != 0 {
					leading = math.Abs(dy)
				}

			case len(m[6]) > 0: // T*
				lmY -= leading
				curX = lmX
				curY = lmY

			case len(m[9]) > 0: // a b c d e f Tm
				e, _ := strconv.ParseFloat(string(m[7]), 64)
				f, _ := strconv.ParseFloat(string(m[8]), 64)
				lmX = e
				lmY = f
				curX = e
				curY = f

			case len(m[11]) > 0: // /Font size Tf
				sz, err := strconv.ParseFloat(string(m[10]), 64)
				if err == nil && sz > 0 {
					fontSize = sz
				}
			}
		}
	}

	return b.String()
}

func cleanUTF8Text(s string) string {
	// Normalize common WinAnsi bytes if raw Latin-1 / CP1252 leaked into UTF-8
	s = strings.ReplaceAll(s, "\u00a0", " ")
	s = strings.ReplaceAll(s, "\u2013", "-")
	s = strings.ReplaceAll(s, "\u2014", "-")
	s = strings.ReplaceAll(s, "\ufffd", "-")
	return s
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

	pageNoRe := regexp.MustCompile(`^\s*-\s*\d+\s*-\s*$`)
	multiSpaceRe := regexp.MustCompile(`\s{2,}`)

	lines := strings.Split(rawText, "\n")
	cleanLines := make([]string, 0, len(lines))
	for _, l := range lines {
		trimmed := strings.TrimSpace(multiSpaceRe.ReplaceAllString(l, " "))
		if trimmed != "" && !pageNoRe.MatchString(trimmed) {
			cleanLines = append(cleanLines, trimmed)
		}
	}

	res.RawTextPreview = strings.Join(cleanLines, "\n")

	// Identify header boundary (before Menimbang / Mengingat / BAB / Pasal) so cited laws in Mengingat are ignored
	headerLimit := len(cleanLines)
	for i, l := range cleanLines {
		up := strings.ToUpper(l)
		if strings.HasPrefix(up, "MENIMBANG") || strings.HasPrefix(up, "MENGINGAT") ||
			strings.HasPrefix(up, "BAB ") || strings.HasPrefix(up, "PASAL ") {
			headerLimit = i
			break
		}
	}
	if headerLimit > 20 {
		headerLimit = 20
	}
	headerLines := cleanLines[:headerLimit]

	// 1. Detect Legal Number (prioritize header lines before Mengingat)
	legalNumRe := regexp.MustCompile(`(?i)(?:PERATURAN|KEPUTUSAN|UNDANG-UNDANG|UU|PERMENKES|BPOM|KEPPRES|INPRES|PP|PERKAP|ISO|WHO|EDQM)\s*(?:MENTERI|KEPALA|PRESIDEN|REPUBLIK INDONESIA|BADAN\s+(?:POM|PENGAWAS\s+OBAT\s+DAN\s+MAKANAN))?\s*(?:NOMOR|NO\.?)\s*([A-Za-z0-9\/\-\.\s]+(?:TAHUN|\d{4})[A-Za-z0-9\/\-\.]*)`)
	for _, line := range headerLines {
		if m := legalNumRe.FindString(line); m != "" {
			res.LegalNumber = strings.TrimSpace(m)
			break
		}
	}
	if res.LegalNumber == "" {
		// Handle multi-line header e.g. line i: "PERATURAN ...", line i+1: "NOMOR 16 TAHUN 2026"
		numRe := regexp.MustCompile(`(?i)^NOMOR\s+([A-Za-z0-9\/\-\.\s]+TAHUN\s+\d{4})`)
		for i, line := range headerLines {
			if m := numRe.FindString(line); m != "" {
				if i > 0 && (strings.Contains(strings.ToUpper(headerLines[i-1]), "PERATURAN") ||
					strings.Contains(strings.ToUpper(headerLines[i-1]), "KEPUTUSAN")) {
					res.LegalNumber = strings.TrimSpace(headerLines[i-1] + " " + m)
				} else {
					res.LegalNumber = strings.TrimSpace(m)
				}
				break
			}
		}
	}
	if res.LegalNumber == "" {
		// Check for WI / SOP / ISO document codes in header
		docCodeRe := regexp.MustCompile(`\b(?:WI|SOP|IK|FM|PR|ISO)[A-Z0-9\-\.\/:]{3,}\b`)
		for _, line := range headerLines {
			if m := docCodeRe.FindString(line); m != "" {
				res.LegalNumber = strings.TrimSpace(m)
				break
			}
		}
	}

	// 2. Detect Title (often multi-line after "TENTANG")
	aboutRe := regexp.MustCompile(`(?i)^\s*TENTANG\s*(.*)`)
	for i, line := range cleanLines {
		if m := aboutRe.FindStringSubmatch(line); len(m) > 1 {
			var parts []string
			if first := strings.TrimSpace(m[1]); first != "" {
				parts = append(parts, first)
			}
			for j := i + 1; j < len(cleanLines) && j <= i+6; j++ {
				up := strings.ToUpper(cleanLines[j])
				if strings.HasPrefix(up, "DENGAN RAHMAT") ||
					strings.HasPrefix(up, "MENIMBANG") ||
					strings.HasPrefix(up, "MENGINGAT") ||
					strings.HasPrefix(up, "KEPALA ") ||
					strings.HasPrefix(up, "BAB ") {
					break
				}
				parts = append(parts, cleanLines[j])
			}
			res.Title = strings.TrimSpace(strings.Join(parts, " "))
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

	// 3. Detect Published Date (check single line or combined adjacent lines like "pada tanggal\n3 September 2026")
	dateRe := regexp.MustCompile(`(?i)(?:ditetapkan|diundangkan)?\s*(?:di\s+[A-Za-z]+,?\s*)?(?:pada\s+tanggal\s+)?(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})`)
	monthMap := map[string]string{
		"januari": "01", "februari": "02", "maret": "03", "april": "04",
		"mei": "05", "juni": "06", "juli": "07", "agustus": "08",
		"september": "09", "oktober": "10", "november": "11", "desember": "12",
	}
	for i := len(cleanLines) - 1; i >= 0; i-- {
		cand := cleanLines[i]
		if i > 0 {
			cand = cleanLines[i-1] + " " + cleanLines[i]
		}
		// Prioritize Ditetapkan / Diundangkan section, or standalone date
		if m := dateRe.FindStringSubmatch(cleanLines[i]); len(m) == 4 {
			day, _ := strconv.Atoi(m[1])
			month := monthMap[strings.ToLower(m[2])]
			year := m[3]
			if month != "" {
				formatted := fmt.Sprintf("%s-%s-%02d", year, month, day)
				res.PublishedDate = &formatted
				break
			}
		} else if i > 0 && strings.Contains(strings.ToLower(cand), "tanggal") {
			if m := dateRe.FindStringSubmatch(cand); len(m) == 4 {
				day, _ := strconv.Atoi(m[1])
				month := monthMap[strings.ToLower(m[2])]
				year := m[3]
				if month != "" {
					formatted := fmt.Sprintf("%s-%s-%02d", year, month, day)
					res.PublishedDate = &formatted
					break
				}
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
	inChapterHeader := false
	inSectionHeader := false
	seenPasal := make(map[string]bool)

	pasalRe := regexp.MustCompile(`(?i)^\s*(Pasal\s+\d+[a-zA-Z]?)\s*(.*)`)
	babRe := regexp.MustCompile(`(?i)^\s*(BAB\s+[IVXLCDM0-9]+.*)$`)
	sectionRe := regexp.MustCompile(`(?i)^\s*(Bagian\s+\S+|Paragraf\s+\S+)\s*$`)
	closingRe := regexp.MustCompile(`(?i)^\s*(Ditetapkan\s+di|Diundangkan\s+di|Agar\s+setiap\s+orang)`)
	lampiranRe := regexp.MustCompile(`(?i)^\s*LAMPIRAN(?:\s+[IVXLCDM0-9]+)?\s*$`)
	refRestRe := regexp.MustCompile(`(?i)^([.,;:\)]|ayat\b|huruf\b|angka\b|tidak\b|sebagaimana\b|yang\b|dan\b|atau\b|sampai\b|serta\b|pada\b|dalam\b|di\s+atas\b)`)
	seenClosing := false

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
				strings.Contains(lowerText, "dalam peraturan badan ini yang dimaksud") ||
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

	for _, l := range lines {
		if seenClosing && lampiranRe.MatchString(l) {
			flush()
			break
		}
		if closingRe.MatchString(l) {
			flush()
			seenClosing = true
			inChapterHeader = false
			inSectionHeader = false
			continue
		}
		if m := babRe.FindStringSubmatch(l); len(m) > 1 {
			flush()
			currentChapter = strings.TrimSpace(m[1])
			inChapterHeader = true
			inSectionHeader = false
			continue
		}
		if sectionRe.MatchString(l) {
			flush()
			inChapterHeader = false
			inSectionHeader = true
			continue
		}
		if m := pasalRe.FindStringSubmatch(l); len(m) > 1 {
			candPasal := strings.TrimSpace(m[1])
			rest := strings.TrimSpace(m[2])
			canonKey := strings.ToLower(candPasal)

			isDuplicate := seenPasal[canonKey]
			isWrappedRef := rest != "" && (refRestRe.MatchString(rest) || (rest[0] >= 'a' && rest[0] <= 'z'))

			if !isDuplicate && !isWrappedRef {
				flush()
				seenPasal[canonKey] = true
				currentPasal = candPasal
				inChapterHeader = false
				inSectionHeader = false
				if rest != "" {
					currentText.WriteString(rest + "\n")
				}
				continue
			}
		}

		if inChapterHeader {
			// Append chapter subtitle (e.g. "KETENTUAN UMUM") without eating Pasal body
			if currentChapter != "" {
				currentChapter += " - " + l
			} else {
				currentChapter = l
			}
			continue
		}
		if inSectionHeader {
			// Skip section subheading line right after Bagian/Paragraf (before next Pasal)
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
