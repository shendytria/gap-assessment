"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";

type EvidenceItem = {
  evidenceId: number;
  actionPlanId: number;
  evidenceType: "FILE" | "TEXT";
  evidenceText: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  uploadedByName: string;
  uploadedAt: string;
};

type DueChangeItem = {
  dueChangeId: number;
  actionPlanId: number;
  oldDueDate: string;
  newDueDate: string;
  reason: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED";
  requestedByName: string;
  requestedAt: string;
  verifiedByName: string;
  verifiedAt: string | null;
  verificationNotes: string;
};

type ActionPlanItem = {
  actionPlanId: number;
  gapAnalysisId: number;
  gapId: number;
  gapNo: string;
  legalNumber: string;
  regulationTitle: string;
  siteId: number;
  siteCode: string;
  workflowStatus: string;
  executionStatus: "IN_PROGRESS" | "PENDING_VERIFICATION" | "VERIFIED";
  clauseNo: string;
  requirementText: string;
  actualCondition: string;
  clauseStatus: string;
  planText: string;
  picUserId: number;
  picName: string;
  picInitials: string;
  deptCode: string;
  deptCodes: string[];
  deptInControlAll: boolean;
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
  notes: string;
  evidenceCount: number;
  evidences: EvidenceItem[];
  pendingDueChange: DueChangeItem | null;
  dueChanges: DueChangeItem[];
  canUpdate: boolean;
  canRequestDueChange: boolean;
  canVerify: boolean;
};

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];

export default function ExecutionPage() {
  const { me } = useSession();
  const [plans, setPlans] = useState<ActionPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [myOnly, setMyOnly] = useState(false);
  const [siteFilter, setSiteFilter] = useState("");
  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Update Progress modal (PIC Area)
  const [selectedPlan, setSelectedPlan] = useState<ActionPlanItem | null>(null);
  const [progressStatus, setProgressStatus] = useState<"IN_PROGRESS" | "COMPLETED">("IN_PROGRESS");
  const [notes, setNotes] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Due Date Change Request inside modal (PIC Area)
  const [showDueReqForm, setShowDueReqForm] = useState(false);
  const [newDueDate, setNewDueDate] = useState("");
  const [dueChangeReason, setDueChangeReason] = useState("");
  const [submittingDueReq, setSubmittingDueReq] = useState(false);

  // Verify Action Plan modal (Co Gap Supervisor)
  const [verifyPlan, setVerifyPlan] = useState<ActionPlanItem | null>(null);
  const [verifyDecision, setVerifyDecision] = useState<"APPROVE" | "RETURN">("APPROVE");
  const [verifyClauseStatus, setVerifyClauseStatus] = useState<"100" | "50" | "0" | "NA">("100");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);

  // Verify Due Date Change modal (Co Gap Supervisor)
  const [dueVerifyPlan, setDueVerifyPlan] = useState<ActionPlanItem | null>(null);
  const [dueDecision, setDueDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [dueVerifyNotes, setDueVerifyNotes] = useState("");
  const [verifyingDue, setVerifyingDue] = useState(false);
  const [dueVerifyErr, setDueVerifyErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ id: number; code: string; name: string }[]>("/api/sites")
      .then((s) => setSites(s || []))
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

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
    setProgressStatus(p.executionStatus === "PENDING_VERIFICATION" ? "COMPLETED" : "IN_PROGRESS");
    setNotes(p.notes || p.fulfillmentNotes || p.progressNotes || "");
    setEvidenceText("");
    setEvidenceFile(null);
    setError(null);
    setShowDueReqForm(false);
    setNewDueDate(p.dueDate ? p.dueDate.split("T")[0] : "");
    setDueChangeReason("");
  };

  const handleFileChange = (file: File | null) => {
    setError(null);
    if (!file) {
      setEvidenceFile(null);
      return;
    }
    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTS.some((ext) => lowerName.endsWith(ext))) {
      setError("File format not supported. Please upload a PDF or image file (PNG, JPG, JPEG, WEBP).");
      setEvidenceFile(null);
      return;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      setError("File size exceeds the maximum limit of 5 MB.");
      setEvidenceFile(null);
      return;
    }
    setEvidenceFile(file);
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setError(null);

    const hasExistingEvidence = (selectedPlan.evidences?.length || 0) > 0 || selectedPlan.evidenceCount > 0;
    const hasNewEvidence = evidenceText.trim().length > 0 || evidenceFile !== null;
    if (progressStatus === "COMPLETED" && !hasExistingEvidence && !hasNewEvidence) {
      setError("Evidence (text or PDF/image upload) is required when selecting Completed – Submit for Verification.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("progressStatus", progressStatus);
      formData.append("notes", notes.trim());
      if (evidenceText.trim()) {
        formData.append("evidenceText", evidenceText.trim());
      }
      if (evidenceFile) {
        formData.append("evidenceFile", evidenceFile);
      }

      await api(`/api/action-plans/${selectedPlan.actionPlanId}`, {
        method: "PUT",
        body: formData,
      });

      setSelectedPlan(null);
      setToast({
        type: "ok",
        text:
          progressStatus === "COMPLETED"
            ? "Action Plan submitted as Completed & notification sent to Co Gap Supervisor for verification."
            : "Action Plan status (In Progress) saved successfully.",
      });
      loadPlans();
    } catch (err: any) {
      setError(err?.message || "Failed to update action plan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestDueDateChange = async () => {
    if (!selectedPlan) return;
    setError(null);
    if (!newDueDate) {
      setError("New due date is required.");
      return;
    }
    if (!dueChangeReason.trim()) {
      setError("Reason for due date change is required.");
      return;
    }
    setSubmittingDueReq(true);
    try {
      await api(`/api/action-plans/${selectedPlan.actionPlanId}/due-change`, {
        method: "POST",
        body: {
          newDueDate,
          reason: dueChangeReason.trim(),
        },
      });
      setSelectedPlan(null);
      setToast({
        type: "ok",
        text: "Due date change request submitted to Co Gap Supervisor for verification.",
      });
      loadPlans();
    } catch (err: any) {
      setError(err?.message || "Failed to submit due date change request.");
    } finally {
      setSubmittingDueReq(false);
    }
  };

  const openVerifyModal = (p: ActionPlanItem) => {
    setVerifyPlan(p);
    setVerifyDecision("APPROVE");
    const initStatus =
      p.clauseStatus === "100" || p.clauseStatus === "50" || p.clauseStatus === "0" || p.clauseStatus === "NA"
        ? "100"
        : "100";
    setVerifyClauseStatus(initStatus);
    setVerifyNotes("");
    setVerifyErr(null);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPlan) return;
    setVerifyErr(null);

    if (verifyDecision === "RETURN" && !verifyNotes.trim()) {
      setVerifyErr("Notes for return is required if returning Action Plan to PIC Area.");
      return;
    }

    setVerifying(true);
    try {
      const res = await api<{ enteredStage2: boolean; gapNo: string }>(
        `/api/action-plans/${verifyPlan.actionPlanId}/verify`,
        {
          method: "POST",
          body: {
            approve: verifyDecision === "APPROVE",
            clauseStatus: verifyDecision === "APPROVE" ? verifyClauseStatus : verifyPlan.clauseStatus,
            notes: verifyNotes.trim(),
          },
        }
      );
      setVerifyPlan(null);
      setToast({
        type: "ok",
        text:
          verifyDecision === "RETURN"
            ? "Action Plan returned to PIC Area for revision."
            : res?.enteredStage2
            ? `Action Plan verified and document ${res.gapNo} entered Approval Stage 2.`
            : "Action Plan verified successfully.",
      });
      loadPlans();
    } catch (err: any) {
      setVerifyErr(err?.message || "Failed to verify action plan.");
    } finally {
      setVerifying(false);
    }
  };

  const openDueVerifyModal = (p: ActionPlanItem) => {
    setDueVerifyPlan(p);
    setDueDecision("APPROVE");
    setDueVerifyNotes("");
    setDueVerifyErr(null);
  };

  const handleVerifyDueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueVerifyPlan?.pendingDueChange) return;
    setDueVerifyErr(null);
    if (dueDecision === "REJECT" && !dueVerifyNotes.trim()) {
      setDueVerifyErr("Reason for rejection is required if rejecting due date change request.");
      return;
    }
    setVerifyingDue(true);
    try {
      await api(`/api/due-changes/${dueVerifyPlan.pendingDueChange.dueChangeId}/verify`, {
        method: "POST",
        body: {
          approve: dueDecision === "APPROVE",
          notes: dueVerifyNotes.trim(),
        },
      });
      setDueVerifyPlan(null);
      setToast({
        type: "ok",
        text:
          dueDecision === "APPROVE"
            ? "Due date change approved and updated."
            : "Due date change request rejected.",
      });
      loadPlans();
    } catch (err: any) {
      setDueVerifyErr(err?.message || "Failed to verify due date change.");
    } finally {
      setVerifyingDue(false);
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const renderExecutionBadge = (p: ActionPlanItem) => {
    if (p.executionStatus === "VERIFIED") {
      return <span className="badge badge-ok">Verified (Stage 2)</span>;
    }
    if (p.executionStatus === "PENDING_VERIFICATION") {
      return <span className="badge badge-warn">Completed – Submit for Verification</span>;
    }
    return <span className="badge badge-info">In Progress</span>;
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
            maxWidth: "400px",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.65rem",
            padding: "0.8rem 1rem",
            borderRadius: "10px",
            background: toast.type === "ok" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${toast.type === "ok" ? "#86efac" : "#fca5a5"}`,
            color: toast.type === "ok" ? "#14532d" : "#7f1d1d",
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            fontSize: "0.85rem",
            lineHeight: 1.4,
          }}
        >
          <span style={{ fontWeight: 700, flexShrink: 0 }}>{toast.type === "ok" ? "✓" : "!"}</span>
          <span style={{ flex: 1 }}>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1rem", padding: 0 }}
          >
            ×
          </button>
        </div>
      )}

      <div className="toolbar">
        <div>
          <h1 className="page-title">Outstanding & Execution</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Implementation of the action plan (specifically for the 'Approved Stage 1' document), uploading of evidence of compliance, and verification by the Supervisor for progression to Stage 2.
          </p>
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
          Total <strong>{(plans || []).length}</strong> items
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
              <th>Timeline / Lead Time</th>
              <th>Execution Status</th>
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
                  Tidak ada action plan yang berstatus Approved Stage 1 / Execution.
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
                      <Link href={`/gap-analysis/${p.gapId}?from=/execution`} style={{ fontWeight: 700 }}>
                        {p.gapNo}
                      </Link>
                      <div className="muted" style={{ fontSize: "0.72rem" }}>{p.workflowStatus}</div>
                    </td>
                    <td>
                      <strong>{p.clauseNo}</strong>
                      <div className="muted" style={{ fontSize: "0.72rem" }}>
                        Status: {p.clauseStatus ? `${p.clauseStatus}${p.clauseStatus === "NA" ? "" : "%"}` : "-"}
                      </div>
                    </td>
                    <td style={{ maxWidth: "200px" }}>
                      <div style={{ maxHeight: "80px", overflowY: "auto", fontSize: "0.8rem" }}>
                        {p.requirementText}
                      </div>
                    </td>
                    <td style={{ maxWidth: "170px", fontSize: "0.8rem" }}>{p.actualCondition || "—"}</td>
                    <td style={{ maxWidth: "200px", fontWeight: 500 }}>
                      <div>{p.planText}</div>
                      {p.notes && (
                        <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>
                          Catatan: {p.notes}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>
                        <strong>{p.picName}</strong>
                      </div>
                      <span className="badge badge-gray">{p.deptCode || "—"}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div>{new Date(p.dueDate).toLocaleDateString()}</div>
                      {p.pendingDueChange && (
                        <span className="badge badge-warn" style={{ marginTop: "0.2rem", fontSize: "0.7rem" }}>
                          Req: {new Date(p.pendingDueChange.newDueDate).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={`badge ${statusBadge}`}>
                        {p.monitoringStatus} {p.overdueDays > 0 ? `(${p.overdueDays}d)` : ""}
                      </span>
                      {p.closeDate && (
                        <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                          Close: {new Date(p.closeDate).toLocaleDateString()}
                          {p.leadTimeDays !== null && (
                            <div>Lead time: <strong>{p.leadTimeDays} hari</strong></div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{renderExecutionBadge(p)}</td>
                    <td style={{ minWidth: "140px" }}>
                      {p.evidences && p.evidences.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          {p.evidences.map((ev) =>
                            ev.evidenceType === "FILE" ? (
                              <a
                                key={ev.evidenceId}
                                href={`/api/evidences/${ev.evidenceId}/file`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: "0.76rem", fontWeight: 600 }}
                              >
                                📎 {ev.fileName}
                              </a>
                            ) : (
                              <span
                                key={ev.evidenceId}
                                className="badge badge-ok"
                                title={ev.evidenceText}
                                style={{ whiteSpace: "normal", textAlign: "left", fontWeight: 500 }}
                              >
                                📝 {ev.evidenceText.length > 35 ? `${ev.evidenceText.slice(0, 35)}…` : ev.evidenceText}
                              </span>
                            )
                          )}
                        </div>
                      ) : (
                        <span className="muted small">None</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: "0.35rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {p.canUpdate && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.65rem" }}
                            onClick={() => openUpdateModal(p)}
                          >
                            Update
                          </button>
                        )}
                        {!p.canUpdate && me?.user.role === "PIC_AREA" && p.executionStatus === "IN_PROGRESS" && (
                          <span className="muted small" title="PIC only can update clauses of their own department">
                            Dept lain
                          </span>
                        )}
                        {p.canVerify && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.65rem" }}
                            onClick={() => openVerifyModal(p)}
                          >
                            Verify
                          </button>
                        )}
                        {me?.user.role === "CO_GAP_SUPERVISOR" && p.pendingDueChange && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.65rem" }}
                            onClick={() => openDueVerifyModal(p)}
                          >
                            Verify Due Date
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal 1: Update Action Plan for PIC Area */}
      {selectedPlan && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <h2 className="modal-title">Update Action Plan & Evidence</h2>
              <button type="button" className="modal-close" onClick={() => setSelectedPlan(null)}>
                ×
              </button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ padding: "0.75rem", background: "var(--surface-2)", borderRadius: "8px", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                <strong>
                  {selectedPlan.gapNo} — Clause {selectedPlan.clauseNo}
                </strong>
                <span className="badge badge-gray" title="Status clause only determined by Co Gap Supervisor">
                  Status Clause: {selectedPlan.clauseStatus}%
                </span>
              </div>
              <div className="muted small" style={{ marginTop: "0.25rem" }}>{selectedPlan.planText}</div>
              <div style={{ marginTop: "0.45rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                <span className="small">
                  <strong>Target Due Date (Read-Only):</strong> {new Date(selectedPlan.dueDate).toLocaleDateString()}
                </span>
                {selectedPlan.canRequestDueChange && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: "26px", fontSize: "0.76rem", padding: "0 0.55rem" }}
                    onClick={() => setShowDueReqForm((v) => !v)}
                  >
                    {showDueReqForm ? "Close Due Date Request" : "Submit Due Date Change"}
                  </button>
                )}
              </div>
              {selectedPlan.pendingDueChange && (
                <div className="small" style={{ marginTop: "0.45rem", padding: "0.45rem 0.6rem", background: "#fff8e1", borderRadius: "6px", color: "#6b4f00" }}>
                  Waiting for Supervisor verification: change due date to{" "}
                  <strong>{new Date(selectedPlan.pendingDueChange.newDueDate).toLocaleDateString()}</strong>{" "}
                  (Reason: {selectedPlan.pendingDueChange.reason})
                </div>
              )}
            </div>

            {showDueReqForm && (
              <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "0.75rem", marginBottom: "1rem", background: "#fafafa" }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  Due Date Change Request (Requires Supervisor Verification)
                </div>
                <div className="field" style={{ marginBottom: "0.6rem" }}>
                  <label htmlFor="newDueDate">
                    Due Date Baru <span style={{ color: "#c52a2a" }}>*</span>
                  </label>
                  <input
                    id="newDueDate"
                    type="date"
                    className="filter-input"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                  />
                </div>
                <div className="field" style={{ marginBottom: "0.65rem" }}>
                  <label htmlFor="dueChangeReason">
                    Alasan Perubahan <span style={{ color: "#c52a2a" }}>*</span>
                  </label>
                  <textarea
                    id="dueChangeReason"
                    rows={2}
                    className="filter-input"
                    style={{ width: "100%", height: "auto" }}
                    placeholder="Explain the reason for the due date extension / change..."
                    value={dueChangeReason}
                    onChange={(e) => setDueChangeReason(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ minHeight: "32px", fontSize: "0.8rem" }}
                  disabled={submittingDueReq}
                  onClick={handleRequestDueDateChange}
                >
                  {submittingDueReq ? "Submitting..." : "Submit Due Date Change Request"}
                </button>
              </div>
            )}

            <form onSubmit={handleUpdateSubmit}>
              <div className="field">
                <label htmlFor="progressStatus">
                  Progress Status <span style={{ color: "#c52a2a" }}>*</span>
                </label>
                <select
                  id="progressStatus"
                  className="filter-select"
                  style={{ width: "100%" }}
                  value={progressStatus}
                  onChange={(e) => setProgressStatus(e.target.value as "IN_PROGRESS" | "COMPLETED")}
                >
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed – Submit for Verification</option>
                </select>
                {progressStatus === "COMPLETED" && (
                  <div className="muted small" style={{ marginTop: "0.25rem" }}>
                    Close date will be recorded automatically today for lead time calculation, and a notification will be sent to the Co Gap Supervisor for verification at Stage 2.
                  </div>
                )}
              </div>

              <div className="field">
                <label htmlFor="unifiedNotes">Progress / Fulfillment Notes</label>
                <textarea
                  id="unifiedNotes"
                  rows={3}
                  className="filter-input"
                  style={{ width: "100%", height: "auto" }}
                  placeholder="Notes on progress and fulfillment of the clause..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {selectedPlan.evidences && selectedPlan.evidences.length > 0 && (
                <div className="field">
                  <label>Evidence Tersimpan Saat Ini</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", padding: "0.5rem", background: "var(--surface-2)", borderRadius: "6px" }}>
                    {selectedPlan.evidences.map((ev) => (
                      <div key={ev.evidenceId} style={{ fontSize: "0.8rem" }}>
                        {ev.evidenceType === "FILE" ? (
                          <a href={`/api/evidences/${ev.evidenceId}/file`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                            📎 {ev.fileName} {ev.fileSize ? `(${formatBytes(ev.fileSize)})` : ""}
                          </a>
                        ) : (
                          <span>📝 {ev.evidenceText}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="field">
                <label htmlFor="evidenceText">
                  Evidence Text / Document Reference{" "}
                  {progressStatus === "COMPLETED" && (
                    <span style={{ color: "#c52a2a" }} title="Text or file upload is required when marking as Completed">
                      *
                    </span>
                  )}
                </label>
                <textarea
                  id="evidenceText"
                  rows={2}
                  className="filter-input"
                  style={{ width: "100%", height: "auto" }}
                  placeholder="Description of the proof of implementation, the SOP/WI document number, or evidence records..."
                  value={evidenceText}
                  onChange={(e) => setEvidenceText(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="evidenceFileInput">
                  Upload File Evidence (PDF / Image: PNG, JPG, JPEG, WEBP — Max. 5 MB){" "}
                  {progressStatus === "COMPLETED" && <span style={{ color: "#c52a2a" }}>*</span>}
                </label>
                <input
                  id="evidenceFileInput"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                  className="filter-input"
                  style={{ width: "100%", padding: "0.35rem" }}
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                />
                {evidenceFile && (
                  <div className="small" style={{ color: "var(--ok)", marginTop: "0.25rem" }}>
                    File selected: <strong>{evidenceFile.name}</strong> ({formatBytes(evidenceFile.size)})
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedPlan(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? "Saving..."
                    : progressStatus === "COMPLETED"
                    ? "Completed – Submit for Verification"
                    : "Save Progress"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Verify Action Plan & Set Clause Status (Co Gap Supervisor) */}
      {verifyPlan && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <h2 className="modal-title">Verifikasi Action Plan & Evidence (Supervisor)</h2>
              <button type="button" className="modal-close" onClick={() => setVerifyPlan(null)}>
                ×
              </button>
            </div>

            {verifyErr && <div className="alert alert-error">{verifyErr}</div>}

            <div style={{ padding: "0.75rem", background: "var(--surface-2)", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.84rem" }}>
              <div>
                <strong>{verifyPlan.gapNo}</strong> — Clause {verifyPlan.clauseNo} ({verifyPlan.deptCode})
              </div>
              <div style={{ marginTop: "0.2rem" }}>{verifyPlan.planText}</div>
              <div className="muted small" style={{ marginTop: "0.25rem" }}>
                PIC: <strong>{verifyPlan.picName}</strong> | Due Date: {new Date(verifyPlan.dueDate).toLocaleDateString()}
                {verifyPlan.closeDate && (
                  <>
                    {" "}
                    | Close Date: <strong>{new Date(verifyPlan.closeDate).toLocaleDateString()}</strong>{" "}
                    {verifyPlan.leadTimeDays !== null && `(Lead Time: ${verifyPlan.leadTimeDays} hari)`}
                  </>
                )}
              </div>
              {verifyPlan.notes && (
                <div style={{ marginTop: "0.4rem" }}>
                  <strong>Progress / Fulfillment Notes:</strong> {verifyPlan.notes}
                </div>
              )}
              <div style={{ marginTop: "0.45rem" }}>
                <strong>Evidence:</strong>
                {verifyPlan.evidences && verifyPlan.evidences.length > 0 ? (
                  <ul style={{ margin: "0.25rem 0 0 1.1rem", padding: 0 }}>
                    {verifyPlan.evidences.map((ev) => (
                      <li key={ev.evidenceId} style={{ marginBottom: "0.2rem" }}>
                        {ev.evidenceType === "FILE" ? (
                          <a href={`/api/evidences/${ev.evidenceId}/file`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                            📎 {ev.fileName} ({formatBytes(ev.fileSize)})
                          </a>
                        ) : (
                          <span>📝 {ev.evidenceText}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted"> No evidence available.</span>
                )}
              </div>
            </div>

            <form onSubmit={handleVerifySubmit}>
              <div className="field">
                <label htmlFor="verifyDecision">
                  Verification Decision <span style={{ color: "#c52a2a" }}>*</span>
                </label>
                <select
                  id="verifyDecision"
                  className="filter-select"
                  style={{ width: "100%" }}
                  value={verifyDecision}
                  onChange={(e) => setVerifyDecision(e.target.value as "APPROVE" | "RETURN")}
                >
                  <option value="APPROVE">Verify (Sesuai) — Lanjut Stage 2</option>
                  <option value="RETURN">Return to PIC Area for Correction</option>
                </select>
              </div>

              {verifyDecision === "APPROVE" && (
                <div className="field">
                  <label htmlFor="verifyClauseStatus">
                    Status Clause Final (Determined by Supervisor) <span style={{ color: "#c52a2a" }}>*</span>
                  </label>
                  <select
                    id="verifyClauseStatus"
                    className="filter-select"
                    style={{ width: "100%" }}
                    value={verifyClauseStatus}
                    onChange={(e) => setVerifyClauseStatus(e.target.value as "100" | "50" | "0" | "NA")}
                  >
                    <option value="100">100% — Comply</option>
                    <option value="50">50% — Partially Comply</option>
                    <option value="0">0% — Not Comply</option>
                    <option value="NA">N/A — Not Applicable</option>
                  </select>
                </div>
              )}

              <div className="field">
                <label htmlFor="verifyNotes">
                  Catatan Verifikasi {verifyDecision === "RETURN" && <span style={{ color: "#c52a2a" }}>*</span>}
                </label>
                <textarea
                  id="verifyNotes"
                  rows={3}
                  className="filter-input"
                  style={{ width: "100%", height: "auto" }}
                  placeholder={
                    verifyDecision === "RETURN"
                      ? "Must explain the issues that need to be corrected by the PIC Area..."
                      : "Verification notes from Supervisor (optional)..."
                  }
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setVerifyPlan(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={verifying}>
                  {verifying
                    ? "Processing..."
                    : verifyDecision === "APPROVE"
                    ? "Verify & Continue to Stage 2"
                    : "Return to PIC Area"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Verify Due Date Change (Co Gap Supervisor) */}
      {dueVerifyPlan && dueVerifyPlan.pendingDueChange && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Verification of Due Date Change</h2>
              <button type="button" className="modal-close" onClick={() => setDueVerifyPlan(null)}>
                ×
              </button>
            </div>

            {dueVerifyErr && <div className="alert alert-error">{dueVerifyErr}</div>}

            <div style={{ padding: "0.75rem", background: "var(--surface-2)", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.84rem" }}>
              <div>
                <strong>{dueVerifyPlan.gapNo}</strong> — Clause {dueVerifyPlan.clauseNo}
              </div>
              <div style={{ marginTop: "0.25rem" }}>
                Submitted by: <strong>{dueVerifyPlan.pendingDueChange.requestedByName}</strong>
              </div>
              <div style={{ marginTop: "0.25rem" }}>
                Previous Due Date: {new Date(dueVerifyPlan.pendingDueChange.oldDueDate).toLocaleDateString()} →{" "}
                <strong>New: {new Date(dueVerifyPlan.pendingDueChange.newDueDate).toLocaleDateString()}</strong>
              </div>
              <div style={{ marginTop: "0.25rem" }}>
                <strong>Reason:</strong> {dueVerifyPlan.pendingDueChange.reason}
              </div>
            </div>

            <form onSubmit={handleVerifyDueSubmit}>
              <div className="field">
                <label htmlFor="dueDecision">
                  Decision <span style={{ color: "#c52a2a" }}>*</span>
                </label>
                <select
                  id="dueDecision"
                  className="filter-select"
                  style={{ width: "100%" }}
                  value={dueDecision}
                  onChange={(e) => setDueDecision(e.target.value as "APPROVE" | "REJECT")}
                >
                  <option value="APPROVE">Approve Due Date Change</option>
                  <option value="REJECT">Reject Due Date Change</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="dueVerifyNotes">
                  Notes {dueDecision === "REJECT" && <span style={{ color: "#c52a2a" }}>*</span>}
                </label>
                <textarea
                  id="dueVerifyNotes"
                  rows={2}
                  className="filter-input"
                  style={{ width: "100%", height: "auto" }}
                  placeholder={dueDecision === "REJECT" ? "Reason for rejection must be provided..." : "Notes (optional)..."}
                  value={dueVerifyNotes}
                  onChange={(e) => setDueVerifyNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setDueVerifyPlan(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={verifyingDue}>
                  {verifyingDue ? "Processing..." : dueDecision === "APPROVE" ? "Approve Due Date" : "Reject"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
