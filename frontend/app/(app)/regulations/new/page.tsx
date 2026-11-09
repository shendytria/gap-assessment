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

export default function NewRegulationPage() {
  const router = useRouter();

  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; code: string; name: string }[]>([]);

  const [selectedSites, setSelectedSites] = useState<number[]>([]);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [regulationType, setRegulationType] = useState<string>("CHAPTER_ARTICLE");
  const [docStatus, setDocStatus] = useState<string>("NEW");
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

  useEffect(() => {
    Promise.all([
      api<{ id: number; code: string; name: string }[]>("/api/sites"),
      api<{ id: number; code: string; name: string }[]>("/api/categories"),
    ]).then(([sList, cList]) => {
      setSites(sList || []);
      setCategories(cList || []);
      if (sList && sList.length > 0) setSelectedSites([sList[0].id]);
      if (cList && cList.length > 0) setCategoryId(cList[0].id);
    });
  }, []);

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
      setError("Hanya file dokumen PDF yang didukung (.pdf).");
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
        throw new Error(errJson.message || `Gagal membaca file PDF (Status ${res.status})`);
      }

      const data = await res.json();
      setPdfFilePath(data.filePath || "");
      setPdfSha256(data.sha256 || "");

      if (data.isScanned) {
        setError(data.message || "File PDF berupa gambar/scan. Silakan gunakan mode input manual.");
        return;
      }

      // Auto-fill detected metadata
      if (data.legalNumber) setLegalNumber(data.legalNumber);
      if (data.title) setTitle(data.title);
      if (data.publishedDate) setPublishedDate(data.publishedDate);
      if (data.regulationType) setRegulationType(data.regulationType);

      // Auto-fill extracted clauses
      if (data.clauses && data.clauses.length > 0) {
        setClauses(data.clauses);
        setExtractSuccess(
          `Berhasil mengekstrak ${data.clauses.length} klausul dari file "${file.name}". Periksa metadata dan rincian klausul di bawah sebelum disimpan.`
        );
      } else {
        setExtractSuccess(`File "${file.name}" berhasil diunggah.`);
      }
    } catch (err: any) {
      setError(err?.message || "Gagal memproses file PDF");
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
      setError("Pilih minimal satu site tujuan (CKR, PLG, atau PLM).");
      return;
    }
    if (!legalNumber.trim() || !title.trim()) {
      setError("Nomor Regulasi (Legal Number) dan Judul Regulasi wajib diisi.");
      return;
    }
    const emptyClause = clauses.find((c) => !c.clauseNo.trim() || !c.requirementText.trim());
    if (emptyClause) {
      setError("Setiap klausul wajib memiliki Nomor Klausul dan Uraian Persyaratan.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        categoryId,
        regulationType,
        docStatus,
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
        router.push(`/gap-analysis/${res.gapIds[0]}`);
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
            Daftarkan regulasi baru dan tentukan klausul melalui upload file PDF atau input manual.
          </p>
        </div>
        <Link href="/regulations" className="btn btn-ghost">
          Cancel
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {extractSuccess && <div className="alert alert-info">{extractSuccess}</div>}

      <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
        {/* PDF Upload Section (Opsional) */}
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.35rem" }}>Upload Regulation PDF Document (Opsional)</h2>
          <p className="muted small" style={{ margin: "0 0 1rem" }}>
            Unggah dokumen PDF regulasi untuk membaca nomor, judul, dan memilah klausul secara otomatis, atau langsung lengkapi formulir di bawah jika tidak memiliki file PDF.
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
                    Tarik & letakkan file PDF regulasi di sini, atau <span style={{ color: "var(--primary)", textDecoration: "underline" }}>pilih file</span>
                  </div>
                  <div className="muted small" style={{ marginTop: "0.35rem" }}>
                    Mendukung format PDF resmi BPOM, Permenkes, ISO, CPOB (Maksimal 32 MB)
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
              Target Sites (Dokumen Gap terbit terpisah otomatis per site yang dipilih):
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
              <label htmlFor="category">Regulation Category</label>
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
              <label htmlFor="regType">Regulation Type</label>
              <select
                id="regType"
                className="filter-select"
                style={{ width: "100%" }}
                value={regulationType}
                onChange={(e) => setRegulationType(e.target.value)}
              >
                <option value="CHAPTER_ARTICLE">Chapter / Article based (Pasal/Bab)</option>
                <option value="NUMBERED_STANDARD">Numbered Standard (ISO, CPOB 1.1, dll)</option>
                <option value="INTERNAL_DOC">Internal Corporate Guideline</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="docStatus">Document Status</label>
              <select
                id="docStatus"
                className="filter-select"
                style={{ width: "100%" }}
                value={docStatus}
                onChange={(e) => setDocStatus(e.target.value)}
              >
                <option value="NEW">New (Dokumen Baru - Rev 00)</option>
                <option value="REVISION">Revision (Revisi dari versi sebelumnya)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="legalNumber">Legal Number (lengkap dg tahun)</label>
              <input
                id="legalNumber"
                type="text"
                placeholder="mis. PerBPOM No. 34 Tahun 2021 atau ISO 9001:2015"
                value={legalNumber}
                onChange={(e) => setLegalNumber(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="title">Regulation Title</label>
              <input
                id="title"
                type="text"
                placeholder="mis. Pedoman Cara Pembuatan Obat yang Baik (CPOB)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="publishedDate">Published Date (Tanggal Terbit/Berlaku)</label>
              <input
                id="publishedDate"
                type="date"
                value={publishedDate}
                onChange={(e) => setPublishedDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 2. Extracted Clauses Table */}
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.25rem" }}>
                2. Clauses Review & Edit ({clauses.length} klausul)
              </h2>
              <p className="muted small" style={{ margin: "0" }}>
                Klausul hasil ekstraksi dokumen atau input manual. Klausul bertanda <strong>INFO</strong> dikecualikan dari perhitungan kepatuhan %.
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "45px" }}>No</th>
                  <th style={{ width: "160px" }}>Chapter / Bab</th>
                  <th style={{ width: "120px" }}>Clause No</th>
                  <th style={{ width: "180px" }}>Clause Title (opsional)</th>
                  <th>Requirement Text (Persyaratan)</th>
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
                        placeholder="Judul klausul"
                        className="filter-input"
                        style={{ width: "100%" }}
                        value={c.clauseTitle}
                        onChange={(e) => updateClause(idx, "clauseTitle", e.target.value)}
                      />
                    </td>
                    <td>
                      <textarea
                        rows={2}
                        placeholder="Teks pernyataan persyaratan..."
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
                          INFO
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
                        title="Hapus baris klausul"
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
