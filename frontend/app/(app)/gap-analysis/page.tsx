"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import Lampiran1Modal from "@/components/reports/Lampiran1Modal";

type GapDocSummary = {
  gapId: number;
  gapNo: string;
  regulationId: number;
  legalNumber: string;
  regulationTitle: string;
  siteId: number;
  siteCode: string;
  siteName: string;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  workflowStatus: string;
  revisionNo: number;
  effectiveDate: string;
  totalClauses: number;
  totalApplicable: number;
  count100: number;
  count50: number;
  count0: number;
  pct100: number;
  pct50: number;
  pct0: number;
  createdByName: string;
  createdAt: string;
};

export default function GapAnalysisListPage() {
  const { me } = useSession();
  const [items, setItems] = useState<GapDocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteFilter, setSiteFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedDocForPdf, setSelectedDocForPdf] = useState<any | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const canDownload =
    me?.user.role === "CO_GAP_STAFF" || me?.user.role === "CO_GAP_SUPERVISOR";

  const handleOpenPdf = async (gapId: number) => {
    setLoadingPdf(true);
    try {
      const data = await api<any>(`/api/gap-documents/${gapId}`);
      setSelectedDocForPdf(data);
    } catch (err: any) {
      alert("Gagal memuat dokumen: " + (err?.message || "Error"));
    } finally {
      setLoadingPdf(false);
    }
  };

  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; code: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      api<{ id: number; code: string; name: string }[]>("/api/sites"),
      api<{ id: number; code: string; name: string }[]>("/api/categories"),
    ])
      .then(([sList, cList]) => {
        setSites(sList || []);
        setCategories(cList || []);
      })
      .catch(() => {
        setSites([]);
        setCategories([]);
      });
  }, []);

  const loadData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (siteFilter) params.set("siteId", siteFilter);
    if (catFilter) params.set("categoryId", catFilter);
    if (statusFilter) params.set("status", statusFilter);

    api<GapDocSummary[]>(`/api/gap-documents?${params.toString()}`)
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [siteFilter, catFilter, statusFilter]);

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "DRAFT":
        return <span className="badge badge-gray">DRAFT</span>;
      case "SUPERVISOR_VERIFICATION":
        return <span className="badge badge-info">SPV VERIFICATION</span>;
      case "APPROVAL_STAGE1":
        return <span className="badge badge-warn">STAGE 1 APPROVAL</span>;
      case "EXECUTION":
        return <span className="badge badge-warn">ACTION EXECUTION</span>;
      case "APPROVAL_STAGE2":
        return <span className="badge badge-info">STAGE 2 CLOSURE</span>;
      case "CLOSED":
        return <span className="badge badge-ok">CLOSED</span>;
      case "ARCHIVED":
        return <span className="badge badge-gray">ARCHIVED</span>;
      default:
        return <span className="badge badge-gray">{st}</span>;
    }
  };

  return (
    <main className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Gap Analysis & Action Plan</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Dokumen analisis kesenjangan peraturan perundangan.
          </p>
        </div>
        <div>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: "1rem" }}>
        <div className="filter-group">
          <select
            className="filter-select"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
          >
            <option value="">All Sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} ({c.name})
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SUPERVISOR_VERIFICATION">Supervisor Verification</option>
            <option value="APPROVAL_STAGE1">Approval Stage 1</option>
            <option value="EXECUTION">Execution & Evidence</option>
            <option value="APPROVAL_STAGE2">Approval Stage 2</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <div className="muted small">
          Showing <strong>{(items || []).length}</strong> gap documents
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Gap Number</th>
              <th>Legal Number</th>
              <th>Title</th>
              <th>Workflow Status</th>
              <th>Effective Date</th>
              <th>Total Clauses</th>
              <th>100% Comply</th>
              <th>50% Comply</th>
              <th>0% Comply</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: "2rem" }}>
                  <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Loading...
                </td>
              </tr>
            ) : (items || []).length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                  No gap assessment documents found.
                </td>
              </tr>
            ) : (
              (items || []).map((doc) => (
                <tr key={doc.gapId}>
                  <td>
                    <span className="badge badge-info">{doc.siteCode}</span>
                  </td>
                  <td>
                    <Link href={`/gap-analysis/${doc.gapId}`} style={{ fontWeight: 700 }}>
                      {doc.gapNo}
                    </Link>
                  </td>
                  <td style={{ fontWeight: 600 }}>{doc.legalNumber}</td>
                  <td>{doc.regulationTitle}</td>
                  <td>{getStatusBadge(doc.workflowStatus)}</td>
                  <td>{new Date(doc.effectiveDate).toLocaleDateString()}</td>
                  <td>
                    {doc.totalApplicable} / {doc.totalClauses}
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: "var(--ok)" }}>
                      {doc.pct100.toFixed(1)}% ({doc.count100})
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: "#d99b00" }}>
                      {doc.pct50.toFixed(1)}% ({doc.count50})
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: "#c52a2a" }}>
                      {doc.pct0.toFixed(1)}% ({doc.count0})
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                      <Link href={`/gap-analysis/${doc.gapId}`} className="btn btn-ghost" style={{ minHeight: "32px", fontSize: "0.8rem", padding: "0 0.65rem" }}>
                        Open Matrix
                      </Link>
                      {canDownload && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ minHeight: "32px", fontSize: "0.8rem", padding: "0 0.65rem" }}
                          onClick={() => handleOpenPdf(doc.gapId)}
                          disabled={loadingPdf}
                          title="Download PDF Laporan Identifikasi & Evaluasi"
                        >
                          PDF
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Official Gap Analysis Report Modal (WI-QO-QS-1023.04 Lampiran 1) */}
      {selectedDocForPdf && (
        <Lampiran1Modal
          doc={selectedDocForPdf}
          onClose={() => setSelectedDocForPdf(null)}
        />
      )}
    </main>
  );
}
