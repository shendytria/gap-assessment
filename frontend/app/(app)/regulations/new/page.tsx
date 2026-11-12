"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

type ClauseInput = {
  sortOrder: number;
  chapter: string;
  clauseNo: string;
  clauseTitle: string;
  requirementText: string;
  isInfo: boolean;
};

type ExistingRegulation = {
  id: number;
  categoryId: number;
  legalNumber: string;
  title: string;
  maxRevisionNo: number;
};

export default function NewRegulationPage() {
  const router = useRouter();

  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; code: string; name: string }[]>([]);
  const [existingRegs, setExistingRegs] = useState<ExistingRegulation[]>([]);

  const [selectedSites, setSelectedSites] = useState<number[]>([]);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [regulationType, setRegulationType] = useState<string>("");
  const [docStatus, setDocStatus] = useState<string>("NEW");
  const [previousRegulationId, setPreviousRegulationId] = useState<number | null>(null);
  const [revisionNo, setRevisionNo] = useState<string>("00");
  const [legalNumber, setLegalNumber] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [publishedDate, setPublishedDate] = useState<string>("");

  // PDF Upload state
  const [uploading, setUploading] = useState<boolean>(false);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [pdfFilePath, setPdfFilePath] = useState<string>("");
  const [pdfSha256, setPdfSha256] = useState<string>("");
  const [extractSuccess, setExtractSuccess] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clauses, setClauses] = useState<ClauseInput[]>([
    {
      sortOrder: 1,
      chapter: "",
      clauseNo: "1.1",
      clauseTitle: "",
      requirementText: "",
      isInfo: false,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleMatchInfo, setTitleMatchInfo] = useState<{ currentRev: number; nextRev: number } | null>(null);
  const autoMatchedByTitleRef = useRef(false);

  useEffect(() => {
    Promise.all([
      api<{ id: number; code: string; name: string }[]>("/api/sites"),
      api<{ id: number; code: string; name: string }[]>("/api/categories"),
      api<ExistingRegulation[]>("/api/regulations"),
    ]).then(([sList, cList, rList]) => {
      setSites(sList || []);
      setCategories(cList || []);
      setExistingRegs(rList || []);
      if (sList && sList.length > 0) setSelectedSites([sList[0].id]);
      if (cList && cList.length > 0) setCategoryId(cList[0].id);
    });
  }, []);

  useEffect(() => {
    const norm = title.trim().toLowerCase().replace(/\s+/g, " ");
    if (!norm || existingRegs.length === 0) {
      setTitleMatchInfo(null);
      if (autoMatchedByTitleRef.current) {
        autoMatchedByTitleRef.current = false;
        setDocStatus("NEW");
        setPreviousRegulationId(null);
        setRevisionNo("00");
      }
      return;
    }

    const matches = existingRegs.filter(
      (r) => r.title.trim().toLowerCase().replace(/\s+/g, " ") === norm
    );
    if (matches.length > 0) {
      let best = matches[0];
      let maxRev = matches[0].maxRevisionNo || 0;
      for (const m of matches) {
        const rev = m.maxRevisionNo || 0;
        if (rev >= maxRev) {
          maxRev = rev;
          best = m;
        }
      }
      const nextRev = Math.min(99, maxRev + 1);
      autoMatchedByTitleRef.current = true;
      setTitleMatchInfo({ currentRev: maxRev, nextRev });
      setDocStatus("REVISION");
      setPreviousRegulationId(best.id);
      setRevisionNo(String(nextRev).padStart(2, "0"));
    } else {
      setTitleMatchInfo(null);
      if (autoMatchedByTitleRef.current) {
        autoMatchedByTitleRef.current = false;
        setDocStatus("NEW");
        setPreviousRegulationId(null);
        setRevisionNo("00");
      }
    }
  }, [title, existingRegs]);

  const toggleSite = (id: number) => {
    if (selectedSites.includes(id)) {
      if (selectedSites.length > 1) {
        setSelectedSites(selectedSites.filter((s) => s !== id));
      }
    } else {
      setSelectedSites([...selectedSites, id]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF document files are supported (.pdf).");
      return;
    }

    setUploading(true);
    setError(null);
    setExtractSuccess(null);
    setPdfFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/regulations/parse-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to read PDF file (Status ${res.status})`);
      }

      const data = await res.json();
      setPdfFilePath(data.filePath || "");
      setPdfSha256(data.sha256 || "");

      if (data.isScanned) {
        setError(data.message || "File PDF is a scanned image. Please use the manual input mode.");
        return;
      }

      // Auto-fill detected metadata
      if (data.legalNumber) {
        const revMatch = String(data.legalNumber).match(/^(.+?)\.(\d{2})$/);
        if (revMatch && /^(WI|SOP|IK|FM|PR)[-\/]/i.test(revMatch[1])) {
          setLegalNumber(String(data.legalNumber));
          setRevisionNo(revMatch[2]);
          if (parseInt(revMatch[2], 10) > 0) setDocStatus("REVISION");
        } else {
          setLegalNumber(data.legalNumber);
        }
      }
      if (data.title) setTitle(data.title);
      if (data.publishedDate) setPublishedDate(data.publishedDate);
      if (data.regulationType) setRegulationType(data.regulationType);

      // Auto-fill extracted clauses
      if (data.clauses && data.clauses.length > 0) {
        setClauses(data.clauses);
        setExtractSuccess(
          `Successfully extracted ${data.clauses.length} clauses from file "${file.name}". Please review the metadata and clause details below before saving.`
        );
      } else {
        setExtractSuccess(`File "${file.name}" uploaded successfully.`);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to process PDF file");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const addClause = () => {
    const nextOrder = clauses.length + 1;
    setClauses([
      ...clauses,
      {
        sortOrder: nextOrder,
        chapter: clauses[clauses.length - 1]?.chapter || "",
        clauseNo: `${nextOrder}.1`,
        clauseTitle: "",
        requirementText: "",
        isInfo: false,
      },
    ]);
  };

  const updateClause = (idx: number, field: keyof ClauseInput, val: any) => {
    const updated = [...clauses];
    updated[idx] = { ...updated[idx], [field]: val };
    setClauses(updated);
  };

  const removeClause = (idx: number) => {
    if (clauses.length <= 1) return;
    const filtered = clauses.filter((_, i) => i !== idx);
    setClauses(filtered.map((c, i) => ({ ...c, sortOrder: i + 1 })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedSites.length === 0) {
      setError("Please select at least one target site (CKR, PLG, or PLM).");
      return;
    }
    if (!legalNumber.trim() || !title.trim()) {
      setError("Legal Number and Regulation Title are required.");
      return;
    }
    const emptyClause = clauses.find((c) => !c.clauseNo.trim() || !c.requirementText.trim());
    if (emptyClause) {
      setError("Each clause must have a Clause Number and Requirement Text.");
      return;
    }

    setSaving(true);
    try {
      const parsedRev = Math.max(0, Math.min(99, parseInt(revisionNo || "0", 10) || 0));
      const payload = {
        categoryId,
        regulationType,
        docStatus,
        revisionNo: parsedRev,
        previousRegulationId: docStatus === "REVISION" ? previousRegulationId : null,
        legalNumber: legalNumber.trim(),
        title: title.trim(),
        publishedDate: publishedDate ? new Date(publishedDate) : null,
        pdfFilePath,
        pdfSha256,
        readMode: pdfFilePath && clauses.length > 0 ? "AUTO" : "MANUAL",
        siteIds: selectedSites,
        clauses,
      };

      const res = await api<{ regulationId: number; gapIds: number[]; gapNos: string[] }>(
        "/api/regulations",
        {
          method: "POST",
          body: payload,
        }
      );

      if (res.gapIds && res.gapIds.length > 0) {
        router.push(`/gap-analysis/${res.gapIds[0]}?from=/regulations`);
      } else {
        router.push("/master-list");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create regulation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Register Regulation</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Register new regulations and define clauses by uploading a PDF file or entering them manually.
          </p>
        </div>
        <Link href="/regulations" className="btn btn-ghost">
          Back
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {extractSuccess && <div className="alert alert-info">{extractSuccess}</div>}

      <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
        {/* PDF Upload Section (Opsional) */}
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.35rem" }}>Upload Regulation PDF Document (Opsional)</h2>
          <p className="muted small" style={{ margin: "0 0 1rem" }}>
            Upload the PDF document of the regulation to automatically extract its number and title and categorize its articles or simply complete the form below if you do not have a PDF file.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />

          {pdfFileName && !uploading ? (
            <div className="file-uploaded-card">
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "var(--surface)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>
                    {pdfFileName}
                  </div>
                  {pdfSha256 && (
                    <div className="muted small" style={{ marginTop: "0.15rem", fontFamily: "monospace" }}>
                      SHA-256: {pdfSha256.slice(0, 20)}...
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                style={{ background: "var(--surface)" }}
              >
                Ganti File PDF
              </button>
            </div>
          ) : (
            <div
              className={`dropzone ${isDragOver ? "dragover" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="dropzone-icon"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 12 15 15" />
              </svg>

              {uploading ? (
                <div>
                  <span className="spinner" style={{ display: "inline-block", marginRight: "0.5rem" }} />
                  <strong>Sedang membaca dokumen PDF dan mengekstrak klausul...</strong>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, fontSize: "1rem", color: "var(--text)" }}>
                    Drag and drop the regulation PDF file here, or <span style={{ color: "var(--primary)", textDecoration: "underline" }}>select a file</span>
                  </div>
                  <div className="muted small" style={{ marginTop: "0.35rem" }}>
                    Supports official BPOM, Permenkes, ISO, CPOB PDF formats (Maximum 32 MB)
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 1. Regulation Metadata */}
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>1. Regulation Metadata & Target Site</h2>

          <div className="field" style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Target Sites <span style={{ color: "#c52a2a" }}>*</span> :
            </label>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              {sites.map((s) => {
                const isSel = selectedSites.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`site-chip ${isSel ? "selected" : ""}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleSite(s.id)}
                      style={{
                        width: "18px",
                        height: "18px",
                        margin: "0 0.55rem 0 0",
                        accentColor: "var(--primary)",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: "normal" }}>
                      {s.code} - {s.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))" }}>
            <div className="field">
              <label htmlFor="category">
                Regulation Category <span style={{ color: "#c52a2a" }}>*</span>
              </label>
              <select
                id="category"
                className="filter-select"
                style={{ width: "100%" }}
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="docStatus">
                Document Status <span style={{ color: "#c52a2a" }}>*</span>
              </label>
              <select
                id="docStatus"
                className="filter-select"
                style={{ width: "100%" }}
                value={docStatus}
                onChange={(e) => {
                  const next = e.target.value;
                  setDocStatus(next);
                  if (next === "NEW") {
                    setPreviousRegulationId(null);
                    setRevisionNo("00");
                  } else if (next === "REVISION" && (revisionNo === "00" || !revisionNo)) {
                    setRevisionNo("01");
                  }
                }}
              >
                <option value="NEW">New (New Documents - Rev 00)</option>
                <option value="REVISION">Revision (Revision from previous version)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="publishedDate">
                Published Date (Date Published/Effective) <span style={{ color: "#c52a2a" }}>*</span>
              </label>
              <input
                id="publishedDate"
                type="date"
                value={publishedDate}
                onChange={(e) => setPublishedDate(e.target.value)}
              />
            </div>
          </div>

          {docStatus === "REVISION" && (
            <div className="field" style={{ marginTop: "0.75rem" }}>
              <label htmlFor="prevReg">Previous Regulation (Opsional - pilih regulasi lama yang direvisi)</label>
              <select
                id="prevReg"
                className="filter-select"
                style={{ width: "100%" }}
                value={previousRegulationId ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setPreviousRegulationId(val);
                  if (val) {
                    const prev = existingRegs.find((r) => r.id === val);
                    if (prev) {
                      const nextRev = Math.min(99, (prev.maxRevisionNo || 0) + 1);
                      setRevisionNo(String(nextRev).padStart(2, "0"));
                      if (!legalNumber.trim()) setLegalNumber(prev.legalNumber);
                      if (!title.trim()) setTitle(prev.title);
                    }
                  }
                }}
              >
                <option value="">-- Choose previous regulation (or leave blank if it's a new document in the system) --</option>
                {existingRegs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.legalNumber} — {r.title} (Rev {String(r.maxRevisionNo || 0).padStart(2, "0")})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))", marginTop: "0.25rem" }}>
            <div className="field">
              <label htmlFor="title">
                Regulation Title <span style={{ color: "#c52a2a" }}>*</span>
              </label>
              <input
                id="title"
                type="text"
                placeholder="e.g., Sertifikasi Cara Pembuatan Obat yang Baik dan Cara Distribusi Obat yang Baik"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="legalNumber">
                Legal Number & Revision Number <span style={{ color: "#c52a2a" }}>*</span>
              </label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  id="legalNumber"
                  type="text"
                  placeholder="e.g., PERBPOM NOMOR 16 TAHUN 2026 atau WI-QO-QS-1023"
                  value={legalNumber}
                  onChange={(e) => setLegalNumber(e.target.value)}
                  style={{ flex: 1 }}
                  required
                />
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", flexShrink: 0 }}>
                  <span style={{ fontWeight: 700, color: "var(--muted)" }}>.</span>
                  <input
                    id="revisionNo"
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    aria-label="Revision Number"
                    title="Nomor Revisi (00, 01, 04, ...)"
                    value={revisionNo}
                    onChange={(e) => setRevisionNo(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    onBlur={() => setRevisionNo(String(parseInt(revisionNo || "0", 10) || 0).padStart(2, "0"))}
                    style={{ width: "3.75rem", textAlign: "center", fontWeight: 700 }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Extracted Clauses Table */}
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.25rem" }}>
                2. Clauses Review & Edit ({clauses.length} clauses)
              </h2>
              <p className="muted small" style={{ margin: "0" }}>
                Clauses extracted from the document or entered manually. Clauses marked with <strong>INFO</strong> are excluded from the compliance percentage calculation.
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "45px" }}>No</th>
                  <th style={{ width: "160px" }}>Chapter / Bab</th>
                  <th style={{ width: "120px" }}>Clause No <span style={{ color: "#c52a2a" }}>*</span></th>
                  <th style={{ width: "180px" }}>Clause Title (opsional)</th>
                  <th>Requirement Text <span style={{ color: "#c52a2a" }}>*</span></th>
                  <th style={{ width: "95px", textAlign: "center" }}>Is INFO?</th>
                  <th style={{ width: "80px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {clauses.map((c, idx) => (
                  <tr key={idx}>
                    <td>{c.sortOrder}</td>
                    <td>
                      <input
                        type="text"
                        placeholder="mis. BAB I / Umum"
                        className="filter-input"
                        style={{ width: "100%" }}
                        value={c.chapter}
                        onChange={(e) => updateClause(idx, "chapter", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="mis. Pasal 1 / 4.1"
                        className="filter-input"
                        style={{ width: "100%", fontWeight: 600 }}
                        value={c.clauseNo}
                        onChange={(e) => updateClause(idx, "clauseNo", e.target.value)}
                        required
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="Clause Title"
                        className="filter-input"
                        style={{ width: "100%" }}
                        value={c.clauseTitle}
                        onChange={(e) => updateClause(idx, "clauseTitle", e.target.value)}
                      />
                    </td>
                    <td>
                      <textarea
                        rows={2}
                        placeholder="Requirement Text..."
                        className="filter-input"
                        style={{ width: "100%", height: "auto", resize: "vertical", padding: "0.5rem" }}
                        value={c.requirementText}
                        onChange={(e) => updateClause(idx, "requirementText", e.target.value)}
                        required
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={c.isInfo}
                          onChange={(e) => updateClause(idx, "isInfo", e.target.checked)}
                          style={{ width: "16px", height: "16px" }}
                        />
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: c.isInfo ? "var(--primary)" : "var(--muted)",
                          }}
                        >
                        </span>
                      </label>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => removeClause(idx)}
                        disabled={clauses.length <= 1}
                        style={{
                          minHeight: "30px",
                          padding: "0 0.65rem",
                          fontSize: "0.8rem",
                          color: "var(--muted)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          cursor: clauses.length <= 1 ? "not-allowed" : "pointer",
                        }}
                        title="Delete clause row"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <button type="button" className="btn btn-ghost" onClick={addClause}>
              + Add Clause
            </button>
          </div>
        </div>

        <div style={{ marginTop: "1.75rem", display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
          <Link href="/regulations" className="btn btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
            {saving ? "Registering & Generating Gap..." : "Save Regulation & Generate Gap Analysis"}
          </button>
        </div>
      </form>
    </main>
  );
}
