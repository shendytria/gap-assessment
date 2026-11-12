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
  returnNotes?: string;
  needsPicActionPlan?: boolean;
};

export default function GapAnalysisListPage() {
  const { me } = useSession();
  const [items, setItems] = useState<GapDocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteFilter, setSiteFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [picActionTab, setPicActionTab] = useState(false);
  const [staffTaskTab, setStaffTaskTab] = useState(false);
  const [selectedDocForPdf, setSelectedDocForPdf] = useState<any | null>(null);
  const [loadingPdfId, setLoadingPdfId] = useState<number | null>(null);

  const canDownloadPdf =
    me?.user.role === "CO_GAP_STAFF" || me?.user.role === "CO_GAP_SUPERVISOR";

  const isStage1Completed = (status: string) =>
    status === "EXECUTION" || status === "APPROVAL_STAGE2" || status === "CLOSED";

  const handleOpenPdf = async (gapId: number) => {
    setLoadingPdfId(gapId);
    try {
      const data = await api<any>(`/api/gap-documents/${gapId}`);
      setSelectedDocForPdf(data);
    } catch (err: any) {
      setToast("Gagal memuat dokumen Lampiran 1: " + (err?.message || "Error"));
    } finally {
      setLoadingPdfId(null);
    }
  };

  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; code: string; name: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("toast");
    if (t === "draft_saved") {
      setToast("Draft gap analysis successfully saved.");
    } else if (t === "verified") {
      setToast("Assessment successfully verified and sent to Stage 1 Approval.");
    } else if (t === "sent_pic") {
      setToast("Assessment checked and sent to PIC Area to fill Action Plan.");
    } else if (t === "returned") {
      setToast("Assessment returned to Staff (Draft) with revision notes.");
    }
    if (t) {
      window.history.replaceState({}, "", "/gap-analysis");
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

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

    api<GapDocSummary[]>(`/api/gap-documents?${params.toString()}`)
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [siteFilter, catFilter]);

  const isSupervisor = me?.user.role === "CO_GAP_SUPERVISOR";
  const isStaff = me?.user.role === "CO_GAP_STAFF";
  const isPic = me?.user.role === "PIC_AREA";
  const isStaffTask = (d: GapDocSummary) =>
    d.workflowStatus === "DRAFT" || d.workflowStatus === "STAFF_REVIEW";
  const pendingVerifyCount = (items || []).filter(
    (d) => d.workflowStatus === "SUPERVISOR_VERIFICATION"
  ).length;
  const pendingStaffCount = (items || []).filter(isStaffTask).length;
  const pendingPicActionCount = (items || []).filter(
    (d) => !!d.needsPicActionPlan
  ).length;
  const visibleItems = picActionTab
    ? (items || []).filter((d) => !!d.needsPicActionPlan)
    : staffTaskTab
    ? (items || []).filter(isStaffTask)
    : statusFilter
    ? (items || []).filter((d) => d.workflowStatus === statusFilter)
    : items || [];

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "DRAFT":
        return <span className="badge badge-gray">DRAFT</span>;
      case "ACTION_PLAN":
        return <span className="badge badge-err">ACTION PLAN</span>;
      case "STAFF_REVIEW":
        return <span className="badge badge-info">STAFF REVIEW</span>;
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
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: "1.25rem",
            right: "1.25rem",
            zIndex: 10000,
            maxWidth: "380px",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.65rem",
            padding: "0.8rem 1rem",
            borderRadius: "10px",
            background: "#ecfdf5",
            border: "1px solid #86efac",
            color: "#14532d",
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            fontSize: "0.85rem",
            lineHeight: 1.4,
          }}
        >
          <span style={{ fontWeight: 700, flexShrink: 0 }}>✓</span>
          <span style={{ flex: 1 }}>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: "1rem",
              lineHeight: 1,
              padding: 0,
              opacity: 0.7,
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="toolbar">
        <div>
          <h1 className="page-title">Gap Analysis & Action Plan</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Analysis document regarding the splitting of legislative regulations.
          </p>
        </div>
      </div>

      {isSupervisor && (
        <div className="tabs" style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>
          <button
            type="button"
            className={`tab ${statusFilter === "" ? "active" : ""}`}
            onClick={() => setStatusFilter("")}
          >
            All Documents ({(items || []).length})
          </button>
          <button
            type="button"
            className={`tab ${statusFilter === "SUPERVISOR_VERIFICATION" ? "active" : ""}`}
            onClick={() => setStatusFilter("SUPERVISOR_VERIFICATION")}
          >
            Need Verification ({pendingVerifyCount})
          </button>
        </div>
      )}

      {isStaff && (
        <div className="tabs" style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>
          <button
            type="button"
            className={`tab ${!staffTaskTab ? "active" : ""}`}
            onClick={() => {
              setStaffTaskTab(false);
              setStatusFilter("");
            }}
          >
            All Documents ({(items || []).length})
          </button>
          <button
            type="button"
            className={`tab ${staffTaskTab ? "active" : ""}`}
            onClick={() => {
              setStaffTaskTab(true);
              setStatusFilter("");
            }}
          >
            Need to be Worked On ({pendingStaffCount})
          </button>
        </div>
      )}

      {isPic && (
        <div className="tabs" style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>
          <button
            type="button"
            className={`tab ${!picActionTab ? "active" : ""}`}
            onClick={() => {
              setPicActionTab(false);
              setStatusFilter("");
            }}
          >
            All Documents ({(items || []).length})
          </button>
          <button
            type="button"
            className={`tab ${picActionTab ? "active" : ""}`}
            onClick={() => {
              setPicActionTab(true);
              setStatusFilter("");
            }}
          >
            Fill Action Plan ({pendingPicActionCount})
          </button>
        </div>
      )}

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
            onChange={(e) => {
              setPicActionTab(false);
              setStaffTaskTab(false);
              setStatusFilter(e.target.value);
            }}
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTION_PLAN">Action Plan (PIC Fill)</option>
            <option value="STAFF_REVIEW">Staff Review (Action Plan Check)</option>
            <option value="SUPERVISOR_VERIFICATION">Supervisor Verification</option>
            <option value="APPROVAL_STAGE1">Approval Stage 1</option>
            <option value="EXECUTION">Execution & Evidence</option>
            <option value="APPROVAL_STAGE2">Approval Stage 2</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <div className="muted small">
          Showing <strong>{visibleItems.length}</strong> gap documents
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
              {canDownloadPdf && <th style={{ textAlign: "right" }}>Lampiran 1</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canDownloadPdf ? 11 : 10} style={{ textAlign: "center", padding: "2rem" }}>
                  <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Loading...
                </td>
              </tr>
            ) : visibleItems.length === 0 ? (
              <tr>
                <td colSpan={canDownloadPdf ? 11 : 10} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                  No gap assessment documents found.
                </td>
              </tr>
            ) : (
              visibleItems.map((doc) => (
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
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                      {getStatusBadge(doc.workflowStatus)}
                      {doc.workflowStatus === "DRAFT" && doc.returnNotes && (
                        <span className="badge badge-err" title={doc.returnNotes}>
                          Returned
                        </span>
                      )}
                    </div>
                  </td>
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
                  {canDownloadPdf && (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {isStage1Completed(doc.workflowStatus) ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ minHeight: "28px", padding: "0 0.55rem", fontSize: "0.78rem" }}
                          disabled={loadingPdfId === doc.gapId}
                          onClick={() => handleOpenPdf(doc.gapId)}
                        >
                          {loadingPdfId === doc.gapId ? "Loading..." : "Download PDF"}
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: "0.78rem" }}>—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedDocForPdf && (
        <Lampiran1Modal
          doc={selectedDocForPdf}
          onClose={() => setSelectedDocForPdf(null)}
        />
      )}
    </main>
  );
}
