package apphandler

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gapapp/internal/auth"
	"gapapp/internal/config"
	"gapapp/internal/httpx"
	"gapapp/internal/pdfparser"
	"gapapp/internal/store"
)

type Handler struct {
	cfg   *config.Config
	db    *store.Store
	auth  *auth.Service
}

func New(cfg *config.Config, db *store.Store, authSvc *auth.Service) *Handler {
	return &Handler{cfg: cfg, db: db, auth: authSvc}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	origin := auth.OriginCheck(h.cfg.AllowedOrigins)
	authed := func(handler http.HandlerFunc) http.Handler {
		return auth.Chain(handler, origin, h.auth.Authenticate, h.auth.RequirePasswordCurrent)
	}

	// Master Data
	mux.Handle("GET /api/sites", authed(h.handleListSites))
	mux.Handle("GET /api/categories", authed(h.handleListCategories))
	mux.Handle("GET /api/roles", authed(h.handleListRoles))
	mux.Handle("GET /api/departments", authed(h.handleListDepartments))
	mux.Handle("POST /api/departments", authed(h.handleSaveDepartment))
	mux.Handle("GET /api/users", authed(h.handleListUsers))
	mux.Handle("POST /api/users", authed(h.handleCreateUser))
	mux.Handle("PUT /api/users/{id}", authed(h.handleUpdateUser))
	mux.Handle("GET /api/delegations", authed(h.handleListDelegations))
	mux.Handle("POST /api/delegations", authed(h.handleCreateDelegation))
	mux.Handle("DELETE /api/delegations/{id}", authed(h.handleRevokeDelegation))

	// Regulations & Clauses (007A-E)
	mux.Handle("GET /api/regulations", authed(h.handleListRegulations))
	mux.Handle("POST /api/regulations", authed(h.handleCreateRegulation))
	mux.Handle("POST /api/regulations/parse-pdf", authed(h.handleParseRegulationPDF))
	mux.Handle("GET /api/regulations/{id}", authed(h.handleGetRegulation))
	mux.Handle("GET /api/regulations/{id}/pdf", authed(h.handleDownloadRegulationPDF))

	// Master List (010A, WI Lampiran 2)
	mux.Handle("GET /api/master-list", authed(h.handleListMasterList))

	// Gap Document & Analysis (008A-C, WI Lampiran 1)
	mux.Handle("GET /api/gap-documents", authed(h.handleListGapDocuments))
	mux.Handle("GET /api/gap-documents/{id}", authed(h.handleGetGapDocument))
	mux.Handle("GET /api/gap-documents/{id}/action-plans", authed(h.handleGetGapActionPlans))
	mux.Handle("PUT /api/gap-documents/{id}/analysis", authed(h.handleSaveGapAnalysis))
	mux.Handle("POST /api/gap-documents/{id}/submit", authed(h.handleSubmitGapDocument))
	mux.Handle("POST /api/gap-documents/{id}/return-pic", authed(h.handleReturnGapToPic))
	mux.Handle("POST /api/gap-documents/{id}/verify", authed(h.handleVerifyGapDocument))

	// Approvals (009A, 009C)
	mux.Handle("GET /api/approvals", authed(h.handleListApprovals))
	mux.Handle("POST /api/approvals/{id}/act", authed(h.handleActOnApproval))

	// Action Plan & Outstanding (009B, WI Lampiran 3)
	mux.Handle("GET /api/action-plans/outstanding", authed(h.handleListOutstandingActionPlans))
	mux.Handle("PUT /api/action-plans/{id}", authed(h.handleUpdateActionPlan))
	mux.Handle("POST /api/action-plans/{id}/verify", authed(h.handleVerifyActionPlan))
	mux.Handle("POST /api/action-plans/{id}/due-change", authed(h.handleRequestDueDateChange))
	mux.Handle("POST /api/due-changes/{id}/verify", authed(h.handleVerifyDueDateChange))
	mux.Handle("GET /api/evidences/{id}/file", authed(h.handleDownloadEvidenceFile))

	// Notifications
	mux.Handle("GET /api/notifications", authed(h.handleListNotifications))
	mux.Handle("POST /api/notifications/{id}/read", authed(h.handleMarkNotificationRead))
	mux.Handle("POST /api/notifications/read-all", authed(h.handleMarkAllNotificationsRead))

	// Dashboard & Audit Trail (004A, 005A)
	mux.Handle("GET /api/dashboard", authed(h.handleGetDashboard))
	mux.Handle("GET /api/audit-trail", authed(h.handleListAuditTrail))
}

// ------------------------------------------------ Master Data

func (h *Handler) handleListSites(w http.ResponseWriter, r *http.Request) {
	sites, err := h.db.ListSites(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, sites)
}

func (h *Handler) handleListCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.db.ListCategories(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, cats)
}

func (h *Handler) handleListRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := h.db.ListRoles(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, roles)
}

func (h *Handler) handleListDepartments(w http.ResponseWriter, r *http.Request) {
	var siteID *int
	if s := r.URL.Query().Get("siteId"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	depts, err := h.db.ListDepartments(r.Context(), siteID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, depts)
}

func (h *Handler) handleSaveDepartment(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	var dept store.Department
	if err := httpx.Decode(w, r, &dept); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.db.SaveDepartment(r.Context(), u.ID, dept); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleListUsers(w http.ResponseWriter, r *http.Request) {
	var siteID, deptID *int
	if s := r.URL.Query().Get("siteId"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	if d := r.URL.Query().Get("departmentId"); d != "" {
		if id, err := strconv.Atoi(d); err == nil {
			deptID = &id
		}
	}
	search := r.URL.Query().Get("q")
	users, err := h.db.ListUsersSummary(r.Context(), siteID, deptID, search)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, users)
}

func (h *Handler) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	var req store.CreateUserReq
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	hash, err := auth.HashPassword(h.cfg.DefaultPassword, h.cfg.BcryptCost)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	newID, err := h.db.CreateUserAdmin(r.Context(), u.ID, req, hash)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": newID})
}

func (h *Handler) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid user ID"))
		return
	}
	var req store.UpdateUserReq
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	req.ID = id
	if err := h.db.UpdateUserAdmin(r.Context(), u.ID, req); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleListDelegations(w http.ResponseWriter, r *http.Request) {
	var siteID *int
	if s := r.URL.Query().Get("siteId"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	list, err := h.db.ListDelegations(r.Context(), siteID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Handler) handleCreateDelegation(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	var req store.CreateDelegationReq
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := h.db.CreateDelegation(r.Context(), u.ID, req)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) handleRevokeDelegation(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid delegation ID"))
		return
	}
	if err := h.db.RevokeDelegation(r.Context(), u.ID, id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ------------------------------------------------ Regulations

func (h *Handler) handleListRegulations(w http.ResponseWriter, r *http.Request) {
	var catID *int
	if c := r.URL.Query().Get("categoryId"); c != "" {
		if id, err := strconv.Atoi(c); err == nil {
			catID = &id
		}
	}
	search := r.URL.Query().Get("q")
	list, err := h.db.ListRegulations(r.Context(), catID, search)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Handler) handleCreateRegulation(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	var req store.CreateRegulationReq
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if req.ReadMode == "" {
		req.ReadMode = "AUTO"
	}
	res, err := h.db.CreateRegulationWithGapDocs(r.Context(), u.ID, req)
	if err != nil {
		slog.Error("create regulation", "err", err)
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, res)
}

func (h *Handler) handleGetRegulation(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid regulation ID"))
		return
	}
	item, clauses, err := h.db.GetRegulationWithClauses(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"regulation": item,
		"clauses":    clauses,
	})
}

func (h *Handler) handleParseRegulationPDF(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<20)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "File size exceeds 32MB or invalid multipart form"))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "No PDF file provided in form field 'file'"))
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".pdf") {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Only PDF files are supported"))
		return
	}

	pdfBytes, err := io.ReadAll(file)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to read uploaded file"))
		return
	}

	shaBytes := sha256.Sum256(pdfBytes)
	shaHex := hex.EncodeToString(shaBytes[:])

	uploadDir := "uploads/regulations"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		slog.Error("create upload dir", "err", err)
	}
	destPath := filepath.Join(uploadDir, fmt.Sprintf("%s.pdf", shaHex))
	if err := os.WriteFile(destPath, pdfBytes, 0644); err != nil {
		slog.Error("save pdf file", "err", err)
	}

	rawText := pdfparser.ExtractRawText(pdfBytes)
	if strings.TrimSpace(rawText) == "" {
		httpx.JSON(w, http.StatusOK, map[string]any{
			"isScanned": true,
			"filePath":  destPath,
			"sha256":    shaHex,
			"filename":  header.Filename,
			"message":   "File PDF tidak memiliki lapisan teks yang dapat dibaca (kemungkinan scan/gambar atau terproteksi). Silakan isi klausul secara manual.",
			"clauses":   []pdfparser.ParsedClause{},
		})
		return
	}

	parsed := pdfparser.ParseRegulationDocument(rawText)

	httpx.JSON(w, http.StatusOK, map[string]any{
		"isScanned":      false,
		"filePath":       destPath,
		"sha256":         shaHex,
		"filename":       header.Filename,
		"legalNumber":    parsed.LegalNumber,
		"title":          parsed.Title,
		"publishedDate":  parsed.PublishedDate,
		"regulationType": parsed.RegulationType,
		"rawPreview":     parsed.RawTextPreview,
		"clauses":        parsed.Clauses,
	})
}

func (h *Handler) handleDownloadRegulationPDF(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid regulation ID"))
		return
	}
	item, _, err := h.db.GetRegulationWithClauses(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if item.PdfFilePath == "" {
		httpx.Fail(w, httpx.NewError(http.StatusNotFound, "NOT_FOUND", "PDF file not available for this regulation"))
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", filepath.Base(item.PdfFilePath)))
	http.ServeFile(w, r, item.PdfFilePath)
}

// ------------------------------------------------ Master List

func (h *Handler) handleListMasterList(w http.ResponseWriter, r *http.Request) {
	var siteID, catID, year *int
	if s := r.URL.Query().Get("siteId"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	if c := r.URL.Query().Get("categoryId"); c != "" {
		if id, err := strconv.Atoi(c); err == nil {
			catID = &id
		}
	}
	if y := r.URL.Query().Get("year"); y != "" {
		if val, err := strconv.Atoi(y); err == nil {
			year = &val
		}
	}
	search := r.URL.Query().Get("q")
	items, err := h.db.ListMasterList(r.Context(), siteID, catID, year, search)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

// ------------------------------------------------ Gap Document & Analysis

func (h *Handler) handleListGapDocuments(w http.ResponseWriter, r *http.Request) {
	var siteID, catID *int
	var status *string
	if s := r.URL.Query().Get("siteId"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	if c := r.URL.Query().Get("categoryId"); c != "" {
		if id, err := strconv.Atoi(c); err == nil {
			catID = &id
		}
	}
	if st := r.URL.Query().Get("status"); st != "" {
		status = &st
	}
	u := auth.UserFrom(r.Context())
	docs, err := h.db.ListGapDocuments(r.Context(), u, siteID, catID, status)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, docs)
}

func (h *Handler) handleGetGapDocument(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid gap document ID"))
		return
	}
	doc, err := h.db.GetGapDocumentDetail(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, doc)
}

func (h *Handler) handleGetGapActionPlans(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid gap document ID"))
		return
	}
	plans, err := h.db.ListActionPlansByGapID(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, plans)
}

func (h *Handler) handleSaveGapAnalysis(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	gapID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid gap ID"))
		return
	}
	var req struct {
		Items []store.UpdateGapAnalysisItemReq `json:"items"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.db.SaveGapAnalysisDraft(r.Context(), u, gapID, req.Items); err != nil {
		slog.Error("save gap analysis", "err", err)
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleSubmitGapDocument(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	gapID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid gap ID"))
		return
	}
	nextStatus, err := h.db.SubmitGapDocument(r.Context(), u, gapID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "workflowStatus": nextStatus})
}

func (h *Handler) handleVerifyGapDocument(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	gapID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid gap ID"))
		return
	}
	var req struct {
		ReturnDraft bool                             `json:"returnDraft"`
		SendToPIC   bool                             `json:"sendToPic"`
		ReturnNotes string                           `json:"returnNotes"`
		Clauses     []store.VerifyClauseReq          `json:"clauses"`
		Items       []store.UpdateGapAnalysisItemReq `json:"items"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	nextStatus, err := h.db.VerifyGapSupervisor(r.Context(), u.ID, u.RoleCode, gapID, req.ReturnDraft, req.SendToPIC, req.ReturnNotes, req.Clauses, req.Items)
	if err != nil {
		slog.Error("verify gap supervisor", "err", err)
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "workflowStatus": nextStatus})
}

func (h *Handler) handleReturnGapToPic(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	gapID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid gap ID"))
		return
	}
	var req struct {
		ReturnNotes string `json:"returnNotes"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.db.ReturnGapToPicByStaff(r.Context(), u, gapID, req.ReturnNotes); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "workflowStatus": "ACTION_PLAN"})
}

// ------------------------------------------------ Approvals

func (h *Handler) handleListApprovals(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	onlyPending := r.URL.Query().Get("pending") == "true"
	list, err := h.db.ListApprovals(r.Context(), u.ID, onlyPending)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Handler) handleActOnApproval(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	approvalID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid approval ID"))
		return
	}
	var req struct {
		Approve  bool   `json:"approve"`
		Notes    string `json:"notes"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	// ERES Signature verification (password confirmation)
	if !auth.CheckPassword(u.PasswordHash, req.Password) {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "INVALID_PASSWORD", "Invalid password for electronic signature"))
		return
	}

	sum := sha256.Sum256([]byte(u.Username + ":" + strconv.FormatInt(approvalID, 10)))
	sigHash := hex.EncodeToString(sum[:])
	if err := h.db.ActOnApproval(r.Context(), u.ID, approvalID, req.Approve, req.Notes, sigHash); err != nil {
		slog.Error("act on approval", "err", err)
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ------------------------------------------------ Action Plans & Outstanding

func (h *Handler) handleListOutstandingActionPlans(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	var picUID *int
	if r.URL.Query().Get("myOnly") == "true" {
		picUID = &u.ID
	}
	var deptID, siteID *int
	if d := r.URL.Query().Get("departmentId"); d != "" {
		if id, err := strconv.Atoi(d); err == nil {
			deptID = &id
		}
	}
	if s := r.URL.Query().Get("siteId"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	list, err := h.db.ListOutstandingActionPlans(r.Context(), u, picUID, deptID, siteID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

const maxEvidenceFileBytes = 5 << 20 // 5 MB max

func parseEvidenceUpload(w http.ResponseWriter, r *http.Request, planID int64) (store.UpdateActionPlanReq, string, error) {
	var req store.UpdateActionPlanReq
	ct := strings.ToLower(r.Header.Get("Content-Type"))

	if strings.HasPrefix(ct, "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxEvidenceFileBytes+(2<<20))
		if err := r.ParseMultipartForm(maxEvidenceFileBytes); err != nil {
			return req, "", httpx.NewError(http.StatusBadRequest, "FILE_TOO_LARGE", "Ukuran total unggahan melebihi batas maksimal 5 MB.")
		}
		req.ProgressStatus = r.FormValue("progressStatus")
		req.Notes = r.FormValue("notes")
		req.EvidenceText = r.FormValue("evidenceText")

		file, header, err := r.FormFile("evidenceFile")
		if err != nil && err != http.ErrMissingFile {
			return req, "", httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Gagal membaca file evidence.")
		}
		if err == nil {
			defer file.Close()
			if header.Size > maxEvidenceFileBytes {
				return req, "", httpx.NewError(http.StatusBadRequest, "FILE_TOO_LARGE", "Ukuran file evidence maksimal adalah 5 MB.")
			}
			limited := io.LimitReader(file, maxEvidenceFileBytes+1)
			fileBytes, readErr := io.ReadAll(limited)
			if readErr != nil {
				return req, "", httpx.NewError(http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal membaca isi file evidence.")
			}
			if int64(len(fileBytes)) > maxEvidenceFileBytes {
				return req, "", httpx.NewError(http.StatusBadRequest, "FILE_TOO_LARGE", "Ukuran file evidence maksimal adalah 5 MB.")
			}

			ext := strings.ToLower(filepath.Ext(header.Filename))
			detected := http.DetectContentType(fileBytes)
			allowedExt := map[string]bool{".pdf": true, ".png": true, ".jpg": true, ".jpeg": true, ".webp": true}
			allowedMime := map[string]bool{
				"application/pdf": true,
				"image/png":       true,
				"image/jpeg":      true,
				"image/webp":      true,
			}
			if !allowedExt[ext] || !allowedMime[detected] {
				return req, "", httpx.NewError(http.StatusBadRequest, "INVALID_FILE_TYPE", "File evidence harus berupa PDF atau gambar (PNG, JPG, JPEG, WEBP).")
			}

			sha := sha256.Sum256(fileBytes)
			shaHex := hex.EncodeToString(sha[:])
			uploadDir := filepath.Join("uploads", "evidences", strconv.FormatInt(planID, 10))
			if err := os.MkdirAll(uploadDir, 0755); err != nil {
				return req, "", httpx.NewError(http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyiapkan direktori penyimpanan evidence.")
			}
			safeName := filepath.Base(header.Filename)
			destPath := filepath.Join(uploadDir, fmt.Sprintf("%s_%s", shaHex[:12], safeName))
			if err := os.WriteFile(destPath, fileBytes, 0644); err != nil {
				return req, "", httpx.NewError(http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan file evidence.")
			}

			req.UploadedFile = &store.UploadedEvidenceFile{
				FileName:   safeName,
				FilePath:   destPath,
				MimeType:   detected,
				FileSize:   int64(len(fileBytes)),
				FileSha256: shaHex,
			}
			return req, destPath, nil
		}
		return req, "", nil
	}

	if err := httpx.Decode(w, r, &req); err != nil {
		return req, "", err
	}
	return req, "", nil
}

func (h *Handler) handleUpdateActionPlan(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	planID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid action plan ID"))
		return
	}
	req, savedPath, err := parseEvidenceUpload(w, r, planID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.db.UpdateActionPlan(r.Context(), u, planID, req); err != nil {
		if savedPath != "" {
			_ = os.Remove(savedPath)
		}
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleVerifyActionPlan(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	planID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid action plan ID"))
		return
	}
	var req struct {
		Approve      bool   `json:"approve"`
		ClauseStatus string `json:"clauseStatus"`
		Notes        string `json:"notes"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	res, err := h.db.VerifyActionPlanSupervisor(r.Context(), u, planID, req.Approve, req.ClauseStatus, req.Notes)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Handler) handleRequestDueDateChange(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	planID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid action plan ID"))
		return
	}
	var req struct {
		NewDueDate string `json:"newDueDate"`
		Reason     string `json:"reason"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	parsedDate, err := time.Parse("2006-01-02", strings.TrimSpace(req.NewDueDate))
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "INVALID_DATE", "Format due date baru harus YYYY-MM-DD."))
		return
	}
	if err := h.db.RequestDueDateChange(r.Context(), u, planID, parsedDate, req.Reason); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleVerifyDueDateChange(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	dueChangeID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid due change ID"))
		return
	}
	var req struct {
		Approve bool   `json:"approve"`
		Notes   string `json:"notes"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.db.VerifyDueDateChange(r.Context(), u, dueChangeID, req.Approve, req.Notes); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleDownloadEvidenceFile(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid evidence ID"))
		return
	}
	ev, err := h.db.GetEvidenceFile(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if ev.EvidenceType != "FILE" || ev.FilePath == "" {
		httpx.Fail(w, httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Evidence bukan berupa file."))
		return
	}
	if ev.MimeType != "" {
		w.Header().Set("Content-Type", ev.MimeType)
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", filepath.Base(ev.FileName)))
	http.ServeFile(w, r, ev.FilePath)
}

func (h *Handler) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	items, unread, err := h.db.ListNotifications(r.Context(), u.ID, 30)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"items":       items,
		"unreadCount": unread,
	})
}

func (h *Handler) handleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "BAD_REQUEST", "Invalid notification ID"))
		return
	}
	if err := h.db.MarkNotificationRead(r.Context(), u.ID, id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleMarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	if err := h.db.MarkAllNotificationsRead(r.Context(), u.ID); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ------------------------------------------------ Dashboard & Audit Trail

func (h *Handler) handleGetDashboard(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	var siteID, catID *int
	if s := r.URL.Query().Get("siteId"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	if c := r.URL.Query().Get("categoryId"); c != "" {
		if id, err := strconv.Atoi(c); err == nil {
			catID = &id
		}
	}
	data, err := h.db.GetDashboardData(r.Context(), u.ID, siteID, catID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, data)
}

func (h *Handler) handleListAuditTrail(w http.ResponseWriter, r *http.Request) {
	var siteID, month, year *int
	var activity, action *string
	if s := r.URL.Query().Get("siteId"); s != "" {
		if id, err := strconv.Atoi(s); err == nil {
			siteID = &id
		}
	}
	if a := r.URL.Query().Get("activity"); a != "" {
		activity = &a
	}
	if ac := r.URL.Query().Get("action"); ac != "" {
		action = &ac
	}
	if m := r.URL.Query().Get("month"); m != "" {
		if val, err := strconv.Atoi(m); err == nil {
			month = &val
		}
	}
	if y := r.URL.Query().Get("year"); y != "" {
		if val, err := strconv.Atoi(y); err == nil {
			year = &val
		}
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	list, total, err := h.db.ListAuditTrail(r.Context(), siteID, activity, action, month, year, limit, offset)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"items": list,
		"total": total,
	})
}
