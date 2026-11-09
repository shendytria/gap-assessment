"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import Lampiran1Modal from "@/components/reports/Lampiran1Modal";
import Lampiran3Modal from "@/components/reports/Lampiran3Modal";

type GapAnalysisRow = {
  gapAnalysisId: number;
  gapId: number;
  clauseId: number;
  sortOrder: number;
  chapter: string;
  clauseNo: string;
  clauseTitle: string;
  requirementText: string;
  isInfo: boolean;
  isApplicable: boolean;
  deptInControlId: number | null;
  deptInControlCode: string;
  deptInControlName: string;
  coDeptIds: number[];
  coDeptCodes: string[];
  inProcedure: boolean | null;
  inPractice: boolean | null;
  actualCondition: string;
  relatedDocument: string;
  proposedStatus: string | null;
  status: string | null;
  actionPlanId: number | null;
  actionPlanText: string;
  picUserId: number | null;
  picInitials: string;
  dueDate: string | null;
  verifiedByName: string;
  verifiedAt: string | null;
  verificationNotes: string;
};

type GapDocDetail = {
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
  verifiedByName?: string;
  verifiedAt?: string | null;
  changeNotes?: any[];
  approvals?: any[];
  clauses: GapAnalysisRow[];
};

export default function GapAnalysisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { me } = useSession();
  const gapId = params?.id;

  const [doc, setDoc] = useState<GapDocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [departments, setDepartments] = useState<{ id: number; code: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: number; fullName: string; initials: string }[]>([]);

  // Verification modal state (for Co Gap Supervisor)
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [returnDraft, setReturnDraft] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");

  // Report Modals (Lampiran 1 & 3 per WI-QO-QS-1023.04 & URS 010A/B)
  const [showLampiran1, setShowLampiran1] = useState(false);
  const [showLampiran3, setShowLampiran3] = useState(false);
  const [lampiran3Plans, setLampiran3Plans] = useState<any[]>([]);
  const [loadingL3, setLoadingL3] = useState(false);

  const canDownload =
    me?.user.role === "CO_GAP_STAFF" || me?.user.role === "CO_GAP_SUPERVISOR";

  const handleOpenLampiran3 = async () => {
    if (!doc) return;
    setLoadingL3(true);
    try {
      const data = await api<any[]>(`/api/gap-documents/${doc.gapId}/action-plans`);
      setLampiran3Plans(data || []);
      setShowLampiran3(true);
    } catch {
      setLampiran3Plans([]);
      setShowLampiran3(true);
    } finally {
      setLoadingL3(false);
    }
  };

  const loadDoc = () => {
    if (!gapId) return;
    setLoading(true);
    api<GapDocDetail>(`/api/gap-documents/${gapId}`)
      .then((data) => {
        setDoc(data);
        // Load departments for this site
        if (data.siteId) {
          api<{ id: number; code: string; name: string }[]>(`/api/departments?siteId=${data.siteId}`)
            .then((d) => setDepartments(d))
            .catch(() => {});
          api<{ id: number; fullName: string; initials: string }[]>(`/api/users?siteId=${data.siteId}`)
            .then((u) => setUsers(u))
            .catch(() => {});
        }
      })
      .catch((err) => setMsg({ type: "err", text: err.message || "Failed to load gap document" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDoc();
  }, [gapId]);

  if (loading) {
    return (
      <main className="page splash">
        <span className="spinner" /> Loading gap matrix...
      </main>
    );
  }

  if (!doc) {
    return (
      <main className="page">
        <div className="alert alert-error">Gap Document not found.</div>
        <Link href="/gap-analysis" className="btn btn-ghost">
          Back to List
        </Link>
      </main>
    );
  }

  const isSupervisor = me?.user.role === "CO_GAP_SUPERVISOR";
  const canEdit =
    (doc.workflowStatus === "DRAFT" || doc.workflowStatus === "ACTION_PLAN") || isSupervisor;

  const updateClauseRow = (idx: number, field: keyof GapAnalysisRow, val: any) => {
    if (!doc) return;
    const updated = [...doc.clauses];
    const item = { ...updated[idx], [field]: val };

    // Auto calculate proposed status per URS 008A:
    // in_procedure & in_practice = 100; neither = 0; one = 50.
    if (item.inProcedure !== null && item.inPractice !== null) {
      if (item.inProcedure && item.inPractice) {
        item.proposedStatus = "100";
      } else if (!item.inProcedure && !item.inPractice) {
        item.proposedStatus = "0";
      } else {
        item.proposedStatus = "50";
      }
    }

    updated[idx] = item;

    // Recalculate stats
    let totalApp = 0,
      c100 = 0,
      c50 = 0,
      c0 = 0;
    for (const c of updated) {
      if (c.isApplicable && !c.isInfo) {
        totalApp++;
        const st = c.status || c.proposedStatus;
        if (st === "100") c100++;
        else if (st === "50") c50++;
        else if (st === "0") c0++;
      }
    }

    setDoc({
      ...doc,
      clauses: updated,
      totalApplicable: totalApp,
      count100: c100,
      count50: c50,
      count0: c0,
      pct100: totalApp > 0 ? (c100 / totalApp) * 100 : 0,
      pct50: totalApp > 0 ? (c50 / totalApp) * 100 : 0,
      pct0: totalApp > 0 ? (c0 / totalApp) * 100 : 0,
    });
  };

  const handleSaveDraft = async () => {
    if (!doc) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        items: doc.clauses.map((c) => ({
          gapAnalysisId: c.gapAnalysisId,
          isApplicable: c.isApplicable,
          deptInControlId: c.deptInControlId,
          coDeptIds: c.coDeptIds || [],
          inProcedure: c.inProcedure,
          inPractice: c.inPractice,
          actualCondition: c.actualCondition,
          relatedDocument: c.relatedDocument,
          actionPlanText: c.actionPlanText,
          picUserId: c.picUserId,
          picInitials: c.picInitials,
          dueDate: c.dueDate ? new Date(c.dueDate) : null,
        })),
      };

      await api(`/api/gap-documents/${doc.gapId}/analysis`, {
        method: "PUT",
        body: payload,
      });

      setMsg({ type: "ok", text: "Draft gap analysis saved successfully." });
    } catch (err: any) {
      setMsg({ type: "err", text: err.message || "Failed to save draft." });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitToSupervisor = async () => {
    if (!doc) return;
    if (!confirm("Submit this draft gap analysis to Co Gap Supervisor for verification?")) return;
    setSaving(true);
    try {
      await handleSaveDraft();
      await api(`/api/gap-documents/${doc.gapId}/submit`, { method: "POST" });
      setMsg({ type: "ok", text: "Assessment submitted to Co Gap Supervisor." });
      loadDoc();
    } catch (err: any) {
      setMsg({ type: "err", text: err.message || "Failed to submit." });
    } finally {
      setSaving(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc) return;
    setSaving(true);
    try {
      const payload = {
        returnDraft,
        returnNotes,
        clauses: doc.clauses.map((c) => ({
          gapAnalysisId: c.gapAnalysisId,
          status: c.status || c.proposedStatus || (c.isApplicable ? "50" : "NA"),
          notes: c.verificationNotes || "",
        })),
      };
      await api(`/api/gap-documents/${doc.gapId}/verify`, {
        method: "POST",
        body: payload,
      });
      setShowVerifyModal(false);
      setMsg({ type: "ok", text: returnDraft ? "Returned to draft." : "Assessment verified and moved to Stage 1 Approval." });
      loadDoc();
    } catch (err: any) {
      setMsg({ type: "err", text: err.message || "Failed to complete verification." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page" style={{ maxWidth: "98vw" }}>
      {/* Header Info */}
      <div className="toolbar" style={{ alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.25rem" }}>
            <Link href="/gap-analysis" className="muted" style={{ textDecoration: "none" }}>
              ← Gap Analysis
            </Link>
            <span className="badge badge-info">{doc.siteCode} - {doc.siteName}</span>
            <span className="badge badge-gray">{doc.categoryCode}</span>
            <span className="badge badge-warn">{doc.workflowStatus}</span>
          </div>
          <h1 className="page-title" style={{ fontSize: "1.4rem" }}>
            {doc.regulationTitle} (<code>{doc.gapNo}</code>)
          </h1>
          <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
            Legal Number: <strong>{doc.legalNumber}</strong> | Effective Date: {new Date(doc.effectiveDate).toLocaleDateString()} | Created by: {doc.createdByName}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          {canDownload && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowLampiran1(true)}
                title="Download PDF Laporan Identifikasi & Evaluasi (WI Lampiran 1)"
              >
                📄 PDF Lampiran 1
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleOpenLampiran3}
                disabled={loadingL3}
                title="Download PDF Bukti Pemenuhan Gap (WI Lampiran 3)"
              >
                {loadingL3 ? "Loading..." : "📋 PDF Lampiran 3"}
              </button>
            </>
          )}
          {canEdit && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleSaveDraft}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
          )}
          {doc.workflowStatus === "DRAFT" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmitToSupervisor}
              disabled={saving}
            >
              Submit to Supervisor
            </button>
          )}
          {isSupervisor && doc.workflowStatus === "SUPERVISOR_VERIFICATION" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowVerifyModal(true)}
            >
              Verify Assessment
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.type === "ok" ? "alert-info" : "alert-error"}`}>
          {msg.text}
        </div>
      )}

      {/* Compliance Level Banner (WI Formula) */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", margin: "1rem 0" }}>
        <div className="stat-card" style={{ padding: "0.85rem" }}>
          <div className="stat-label">Total Sub-Clauses</div>
          <div className="stat-value">{doc.totalApplicable} <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>app</span></div>
        </div>
        <div className="stat-card" style={{ padding: "0.85rem" }}>
          <div className="stat-label">Comply (100%)</div>
          <div className="stat-value" style={{ color: "var(--ok)" }}>
            {doc.pct100.toFixed(1)}%
          </div>
          <div className="stat-sub">{doc.count100} clauses</div>
        </div>
        <div className="stat-card" style={{ padding: "0.85rem" }}>
          <div className="stat-label">Partially Comply (50%)</div>
          <div className="stat-value" style={{ color: "#d99b00" }}>
            {doc.pct50.toFixed(1)}%
          </div>
          <div className="stat-sub">{doc.count50} clauses</div>
        </div>
        <div className="stat-card" style={{ padding: "0.85rem" }}>
          <div className="stat-label">Not Comply (0%)</div>
          <div className="stat-value" style={{ color: "#c52a2a" }}>
            {doc.pct0.toFixed(1)}%
          </div>
          <div className="stat-sub">{doc.count0} clauses</div>
        </div>
      </div>

      {/* WI Lampiran 1 Spreadsheet Matrix */}
      <div className="table-wrap" style={{ maxHeight: "70vh", overflow: "auto" }}>
        <table className="table" style={{ fontSize: "0.825rem" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr>
              <th style={{ minWidth: "90px" }}>Clausul</th>
              <th style={{ minWidth: "240px" }}>Reference (Klausul)</th>
              <th style={{ minWidth: "90px" }}>Applicability</th>
              <th style={{ minWidth: "120px" }}>Dept In Control</th>
              <th style={{ minWidth: "100px" }}>In Procedure?</th>
              <th style={{ minWidth: "100px" }}>In Practice?</th>
              <th style={{ minWidth: "90px" }}>Proposed</th>
              <th style={{ minWidth: "90px" }}>Final Status</th>
              <th style={{ minWidth: "180px" }}>Related Document</th>
              <th style={{ minWidth: "200px" }}>Actual Condition / Gap</th>
              <th style={{ minWidth: "220px" }}>Action Plan</th>
              <th style={{ minWidth: "100px" }}>PIC</th>
              <th style={{ minWidth: "130px" }}>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {doc.clauses.map((c, idx) => {
              const isBelow100 = (c.status || c.proposedStatus) === "50" || (c.status || c.proposedStatus) === "0";
              return (
                <tr key={c.gapAnalysisId} style={{ background: c.isInfo ? "var(--surface-2)" : undefined }}>
                  <td>
                    <strong>{c.clauseNo}</strong>
                    {c.chapter && <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{c.chapter}</div>}
                    {c.isInfo && <span className="badge badge-gray" style={{ marginTop: "0.2rem" }}>INFO</span>}
                  </td>
                  <td>
                    <div style={{ maxHeight: "100px", overflowY: "auto", whiteSpace: "pre-wrap" }}>
                      {c.requirementText}
                    </div>
                  </td>
                  <td>
                    <select
                      className="filter-select"
                      style={{ padding: "0.2rem 0.4rem", height: "30px", fontSize: "0.8rem" }}
                      value={c.isApplicable ? "YA" : "TIDAK"}
                      disabled={!canEdit || c.isInfo}
                      onChange={(e) => updateClauseRow(idx, "isApplicable", e.target.value === "YA")}
                    >
                      <option value="YA">YA</option>
                      <option value="TIDAK">TIDAK (NA)</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className="filter-select"
                      style={{ padding: "0.2rem 0.4rem", height: "30px", fontSize: "0.8rem", width: "100%" }}
                      value={c.deptInControlId || ""}
                      disabled={!canEdit || !c.isApplicable}
                      onChange={(e) => updateClauseRow(idx, "deptInControlId", e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">— Select —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} - {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="filter-select"
                      style={{ padding: "0.2rem 0.4rem", height: "30px", fontSize: "0.8rem" }}
                      value={c.inProcedure === null ? "" : c.inProcedure ? "YA" : "TIDAK"}
                      disabled={!canEdit || !c.isApplicable}
                      onChange={(e) =>
                        updateClauseRow(idx, "inProcedure", e.target.value === "" ? null : e.target.value === "YA")
                      }
                    >
                      <option value="">—</option>
                      <option value="YA">YA</option>
                      <option value="TIDAK">TIDAK</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className="filter-select"
                      style={{ padding: "0.2rem 0.4rem", height: "30px", fontSize: "0.8rem" }}
                      value={c.inPractice === null ? "" : c.inPractice ? "YA" : "TIDAK"}
                      disabled={!canEdit || !c.isApplicable}
                      onChange={(e) =>
                        updateClauseRow(idx, "inPractice", e.target.value === "" ? null : e.target.value === "YA")
                      }
                    >
                      <option value="">—</option>
                      <option value="YA">YA</option>
                      <option value="TIDAK">TIDAK</option>
                    </select>
                  </td>
                  <td>
                    {c.proposedStatus ? (
                      <span
                        className={`badge ${
                          c.proposedStatus === "100"
                            ? "badge-ok"
                            : c.proposedStatus === "50"
                            ? "badge-warn"
                            : "badge-err"
                        }`}
                      >
                        {c.proposedStatus}%
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {c.status ? (
                      <span
                        className={`badge ${
                          c.status === "100"
                            ? "badge-ok"
                            : c.status === "50"
                            ? "badge-warn"
                            : c.status === "0"
                            ? "badge-err"
                            : "badge-gray"
                        }`}
                      >
                        {c.status === "NA" ? "NA" : `${c.status}%`}
                      </span>
                    ) : (
                      <span className="muted">Pending</span>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      className="filter-input"
                      placeholder="mis. SOP-QA-01"
                      style={{ width: "100%", padding: "0.25rem 0.5rem", height: "30px", fontSize: "0.8rem" }}
                      value={c.relatedDocument}
                      disabled={!canEdit || !c.isApplicable}
                      onChange={(e) => updateClauseRow(idx, "relatedDocument", e.target.value)}
                    />
                  </td>
                  <td>
                    <textarea
                      rows={2}
                      className="filter-input"
                      placeholder="Kondisi aktual & gap..."
                      style={{ width: "100%", height: "auto", padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                      value={c.actualCondition}
                      disabled={!canEdit || !c.isApplicable}
                      onChange={(e) => updateClauseRow(idx, "actualCondition", e.target.value)}
                    />
                  </td>
                  <td>
                    <textarea
                      rows={2}
                      className="filter-input"
                      placeholder={isBelow100 ? "Action plan (wajib jika < 100%)..." : "—"}
                      style={{
                        width: "100%",
                        height: "auto",
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.8rem",
                        borderColor: isBelow100 && !c.actionPlanText ? "var(--err-text)" : undefined,
                      }}
                      value={c.actionPlanText}
                      disabled={!canEdit || !c.isApplicable}
                      onChange={(e) => updateClauseRow(idx, "actionPlanText", e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="filter-select"
                      style={{ padding: "0.2rem 0.4rem", height: "30px", fontSize: "0.8rem", width: "100%" }}
                      value={c.picUserId || ""}
                      disabled={!canEdit || !c.isApplicable || !isBelow100}
                      onChange={(e) => {
                        const uid = e.target.value ? Number(e.target.value) : null;
                        const userObj = users.find((u) => u.id === uid);
                        updateClauseRow(idx, "picUserId", uid);
                        if (userObj) updateClauseRow(idx, "picInitials", userObj.initials);
                      }}
                    >
                      <option value="">—</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.initials ? `[${u.initials}] ` : ""}{u.fullName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      className="filter-input"
                      style={{ padding: "0.2rem 0.4rem", height: "30px", fontSize: "0.8rem" }}
                      value={c.dueDate ? c.dueDate.split("T")[0] : ""}
                      disabled={!canEdit || !c.isApplicable || !isBelow100}
                      onChange={(e) => updateClauseRow(idx, "dueDate", e.target.value || null)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Supervisor Verification Modal */}
      {showVerifyModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Verify Gap Assessment (Co Gap Supervisor)</h2>
              <button type="button" className="modal-close" onClick={() => setShowVerifyModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleVerifySubmit}>
              <div className="field">
                <label>Verification Decision</label>
                <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.5rem" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="decision"
                      checked={!returnDraft}
                      onChange={() => setReturnDraft(false)}
                    />
                    <span>
                      <strong>Approve Verification</strong> (Advance to Stage 1 Approval)
                    </span>
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="decision"
                      checked={returnDraft}
                      onChange={() => setReturnDraft(true)}
                    />
                    <span>
                      <strong>Return to Draft</strong> (Requires revision)
                    </span>
                  </label>
                </div>
              </div>

              {returnDraft && (
                <div className="field">
                  <label htmlFor="returnNotes">Return / Revision Notes (Mandatory)</label>
                  <textarea
                    id="returnNotes"
                    rows={3}
                    className="filter-input"
                    style={{ width: "100%", height: "auto" }}
                    placeholder="Describe discrepancies or missing clauses to be fixed..."
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    required
                  />
                </div>
              )}

              {!returnDraft && (
                <div style={{ margin: "1rem 0" }}>
                  <p className="muted small">
                    Approving will finalize clause fulfillment statuses ({doc.pct100.toFixed(1)}% Comply) and route Stage 1 approval tasks to the respective Manager Areas, Co Gap Manager, QA Manager, and QO Head.
                  </p>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowVerifyModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Processing..." : returnDraft ? "Return to Draft" : "Confirm & Send to Stage 1"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Report Modals (WI-QO-QS-1023.04 Lampiran 1 & 3) */}
      {showLampiran1 && doc && (
        <Lampiran1Modal doc={doc} onClose={() => setShowLampiran1(false)} />
      )}

      {showLampiran3 && doc && (
        <Lampiran3Modal
          gapNo={doc.gapNo}
          legalNumber={doc.legalNumber}
          regulationTitle={doc.regulationTitle}
          plans={lampiran3Plans}
          onClose={() => setShowLampiran3(false)}
        />
      )}
    </main>
  );
}
