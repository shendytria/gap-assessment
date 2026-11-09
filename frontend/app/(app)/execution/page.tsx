"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import Lampiran3Modal from "@/components/reports/Lampiran3Modal";

type ActionPlanItem = {
  actionPlanId: number;
  gapAnalysisId: number;
  gapId: number;
  gapNo: string;
  legalNumber: string;
  regulationTitle: string;
  siteCode: string;
  clauseNo: string;
  requirementText: string;
  actualCondition: string;
  planText: string;
  picUserId: number;
  picName: string;
  picInitials: string;
  deptCode: string;
  createDate: string;
  dueDate: string;
  progressPct: number;
  progressNotes: string;
  closeDate: string | null;
  leadTimeDays: number | null;
  overdueDays: number;
  monitoringStatus: "Pending" | "On time" | "Overdue";
  verifiedByName: string;
  verifiedAt: string | null;
  fulfillmentNotes: string;
  evidenceCount: number;
};

export default function ExecutionPage() {
  const { me } = useSession();
  const [plans, setPlans] = useState<ActionPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [myOnly, setMyOnly] = useState(false);
  const [siteFilter, setSiteFilter] = useState("");
  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);

  // Update Progress modal
  const [selectedPlan, setSelectedPlan] = useState<ActionPlanItem | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [progressNotes, setProgressNotes] = useState("");
  const [fulfillmentNotes, setFulfillmentNotes] = useState("");
  const [evidenceFileName, setEvidenceFileName] = useState("");
  const [evidenceFilePath, setEvidenceFilePath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const canDownload =
    me?.user.role === "CO_GAP_STAFF" || me?.user.role === "CO_GAP_SUPERVISOR";

  useEffect(() => {
    api<{ id: number; code: string; name: string }[]>("/api/sites")
      .then((s) => setSites(s || []))
      .catch(() => setSites([]));
  }, []);

  const loadPlans = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (myOnly) params.set("myOnly", "true");
    if (siteFilter) params.set("siteId", siteFilter);

    api<ActionPlanItem[]>(`/api/action-plans/outstanding?${params.toString()}`)
      .then((data) => setPlans(data || []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPlans();
  }, [myOnly, siteFilter]);

  const openUpdateModal = (p: ActionPlanItem) => {
    setSelectedPlan(p);
    setProgressPct(p.progressPct);
    setProgressNotes(p.progressNotes || "");
    setFulfillmentNotes(p.fulfillmentNotes || "");
    setEvidenceFileName("");
    setEvidenceFilePath("");
    setError(null);
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setSubmitting(true);
    setError(null);

    try {
      await api(`/api/action-plans/${selectedPlan.actionPlanId}`, {
        method: "PUT",
        body: {
          progressPct: Number(progressPct),
          progressNotes,
          fulfillmentNotes,
          evidenceFileName: evidenceFileName.trim(),
          evidenceFilePath: evidenceFilePath.trim() || evidenceFileName.trim(),
        },
      });
      setSelectedPlan(null);
      loadPlans();
    } catch (err: any) {
      setError(err?.message || "Failed to update action plan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Outstanding & Execution (Bukti Pemenuhan Gap)</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Pelaksanaan tindakan perbaikan dan upload bukti pemenuhan klausul (WI-QO-QS-1023.04 Lampiran 3).
          </p>
        </div>
        <div>
          {canDownload && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowReportModal(true)}
              title="Download PDF Bukti Pemenuhan Gap (WI Lampiran 3)"
            >
              📥 Download PDF (Lampiran 3)
            </button>
          )}
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: "1rem" }}>
        <div className="filter-group">
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", marginRight: "0.5rem" }}>
            <input
              type="checkbox"
              checked={myOnly}
              onChange={(e) => setMyOnly(e.target.checked)}
              style={{ width: "16px", height: "16px" }}
            />
            <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>My Tasks Only</span>
          </label>

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
        </div>
        <div className="muted small">
          Total <strong>{(plans || []).length}</strong> outstanding items
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Gap Number</th>
              <th>Clause</th>
              <th>Legal & Other Requirement</th>
              <th>Gap Description</th>
              <th>Action Plan</th>
              <th>PIC & Dept</th>
              <th>Due Date</th>
              <th>Status / Overdue</th>
              <th>Progress</th>
              <th>Evidence</th>
              <th style={{ textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", padding: "2rem" }}>
                  <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Loading items...
                </td>
              </tr>
            ) : (plans || []).length === 0 ? (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                  No outstanding action plan items found.
                </td>
              </tr>
            ) : (
              (plans || []).map((p) => {
                const statusBadge =
                  p.monitoringStatus === "Overdue"
                    ? "badge-err"
                    : p.monitoringStatus === "On time"
                    ? "badge-ok"
                    : "badge-warn";

                return (
                  <tr key={p.actionPlanId}>
                    <td>
                      <span className="badge badge-info">{p.siteCode}</span>
                    </td>
                    <td>
                      <Link href={`/gap-analysis/${p.gapId}`} style={{ fontWeight: 700 }}>
                        {p.gapNo}
                      </Link>
                    </td>
                    <td>
                      <strong>{p.clauseNo}</strong>
                    </td>
                    <td style={{ maxWidth: "200px" }}>
                      <div style={{ maxHeight: "80px", overflowY: "auto", fontSize: "0.8rem" }}>
                        {p.requirementText}
                      </div>
                    </td>
                    <td style={{ maxWidth: "180px", fontSize: "0.8rem" }}>{p.actualCondition}</td>
                    <td style={{ maxWidth: "200px", fontWeight: 500 }}>{p.planText}</td>
                    <td>
                      <div>
                        <strong>{p.picName}</strong>
                      </div>
                      <span className="badge badge-gray">{p.deptCode}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(p.dueDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${statusBadge}`}>
                        {p.monitoringStatus} {p.overdueDays > 0 ? `(${p.overdueDays}d)` : ""}
                      </span>
                    </td>
                    <td style={{ minWidth: "110px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <div className="progress-bar" style={{ flex: 1, margin: 0 }}>
                          <div
                            className="progress-fill progress-fill-ok"
                            style={{ width: `${p.progressPct}%` }}
                          />
                        </div>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>{p.progressPct}%</span>
                      </div>
                    </td>
                    <td>
                      {p.evidenceCount > 0 ? (
                        <span className="badge badge-ok">{p.evidenceCount} file(s)</span>
                      ) : (
                        <span className="muted small">None</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.65rem" }}
                        onClick={() => openUpdateModal(p)}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Update Progress Modal */}
      {selectedPlan && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Update Action Plan Progress & Evidence</h2>
              <button type="button" className="modal-close" onClick={() => setSelectedPlan(null)}>
                ×
              </button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleUpdateSubmit}>
              <div style={{ padding: "0.75rem", background: "var(--surface-2)", borderRadius: "8px", marginBottom: "1rem" }}>
                <div>
                  <strong>{selectedPlan.gapNo}</strong> — Clause {selectedPlan.clauseNo}
                </div>
                <div className="muted small">{selectedPlan.planText}</div>
                <div className="muted small">Target Due Date: {new Date(selectedPlan.dueDate).toLocaleDateString()}</div>
              </div>

              <div className="field">
                <label htmlFor="progressPct">Progress Percentage: {progressPct}%</label>
                <input
                  id="progressPct"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progressPct}
                  onChange={(e) => setProgressPct(Number(e.target.value))}
                  style={{ width: "100%", padding: 0 }}
                />
              </div>

              <div className="field">
                <label htmlFor="progressNotes">Progress Notes</label>
                <textarea
                  id="progressNotes"
                  rows={2}
                  className="filter-input"
                  style={{ width: "100%", height: "auto" }}
                  placeholder="Deskripsi kemajuan pelaksanaan..."
                  value={progressNotes}
                  onChange={(e) => setProgressNotes(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="evidenceFile">Evidence Document / Reference File Name (Lampiran 3)</label>
                <input
                  id="evidenceFile"
                  type="text"
                  className="filter-input"
                  style={{ width: "100%" }}
                  placeholder="mis. Bukti_Pelatihan_Kualima.pdf atau WI-QO-QS-1018 Rev 02"
                  value={evidenceFileName}
                  onChange={(e) => setEvidenceFileName(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="fulfillmentNotes">Fulfillment Notes (Catatan Pemenuhan)</label>
                <textarea
                  id="fulfillmentNotes"
                  rows={2}
                  className="filter-input"
                  style={{ width: "100%", height: "auto" }}
                  placeholder="Catatan tambahan terkait bukti pemenuhan..."
                  value={fulfillmentNotes}
                  onChange={(e) => setFulfillmentNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedPlan(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Progress"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Execution Report Modal (WI-QO-QS-1023.04 Lampiran 3) */}
      {showReportModal && (
        <Lampiran3Modal
          gapNo="ALL-OUTSTANDING"
          legalNumber="Seluruh Tindakan Perbaikan (Action Plan Outstanding)"
          plans={plans}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </main>
  );
}
