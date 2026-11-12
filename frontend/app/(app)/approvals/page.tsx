"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import ApprovedStamp from "@/components/reports/ApprovedStamp";

type ApprovalTask = {
  approvalId: number;
  gapId: number;
  gapNo: string;
  regulationTitle: string;
  legalNumber: string;
  siteCode: string;
  categoryCode: string;
  stage: string;
  cycleNo: number;
  stepSeq: number;
  roleCode: string;
  roleName: string;
  departmentCode: string;
  assignedUserId: number;
  assignedUserName: string;
  result: "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
  notes: string;
  actedByName: string;
  actedAt: string | null;
  createdAt: string;
  canAct: boolean;
};

export default function ApprovalsPage() {
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending");

  // Electronic Signature / Action modal
  const [selectedTask, setSelectedTask] = useState<ApprovalTask | null>(null);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const loadApprovals = () => {
    setLoading(true);
    const url = activeTab === "pending" ? "/api/approvals?pending=true" : "/api/approvals";
    api<ApprovalTask[]>(url)
      .then((data) => setTasks(data || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadApprovals();
  }, [activeTab]);

  const openSignModal = (task: ApprovalTask, act: "APPROVE" | "REJECT") => {
    setSelectedTask(task);
    setDecision(act);
    setNotes("");
    setPassword("");
    setActionErr(null);
  };

  const handleSignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    setActionErr(null);

    if (decision === "REJECT" && !notes.trim()) {
      setActionErr("Rejection reason is mandatory (URS 009A).");
      return;
    }
    if (!password) {
      setActionErr("Password is required for Electronic Signature (ERES compliance).");
      return;
    }

    setSubmitting(true);
    try {
      await api(`/api/approvals/${selectedTask.approvalId}/act`, {
        method: "POST",
        body: {
          approve: decision === "APPROVE",
          notes: notes.trim(),
          password,
        },
      });
      setSelectedTask(null);
      loadApprovals();
    } catch (err: any) {
      setActionErr(err?.message || "Failed to process approval");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Approval & Monitoring</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Approval & Monitoring for Stage 1 (Gap Assessment) & Stage 2 (Gap Closure).
          </p>
        </div>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          Pending My Action ({(tasks || []).filter((t) => t.canAct && t.result === "PENDING").length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All Approval History & Monitoring
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Gap Number</th>
              <th>Legal Number & Title</th>
              <th>Site</th>
              {activeTab === "all" && <th>Round</th>}
              <th>Role / Dept</th>
              <th>Assigned To</th>
              <th>Result</th>
              {activeTab === "all" && <th>Notes</th>}
              {activeTab === "all" && <th>Sign-off Details</th>}
              {activeTab === "pending" && <th style={{ textAlign: "right" }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={activeTab === "all" ? 10 : 8} style={{ textAlign: "center", padding: "2rem" }}>
                  <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Loading approvals...
                </td>
              </tr>
            ) : (tasks || []).length === 0 ? (
              <tr>
                <td colSpan={activeTab === "all" ? 10 : 8} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                  {activeTab === "pending"
                    ? "No pending approvals requiring your electronic signature."
                    : "No approval history recorded."}
                </td>
              </tr>
            ) : (
              (tasks || []).map((t) => {
                const resBadge =
                  t.result === "APPROVED"
                    ? "badge-ok"
                    : t.result === "REJECTED"
                    ? "badge-err"
                    : t.result === "SKIPPED"
                    ? "badge-gray"
                    : "badge-warn";

                return (
                  <tr key={t.approvalId}>
                    <td>
                      <span className="badge badge-info">{t.stage}</span>
                    </td>
                    <td>
                      <Link href={`/gap-analysis/${t.gapId}?from=/approvals`} style={{ fontWeight: 700 }}>
                        {t.gapNo}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.legalNumber}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{t.regulationTitle}</div>
                    </td>
                    <td>
                      <span className="badge badge-gray">{t.siteCode}</span>
                    </td>
                    {activeTab === "all" && (
                      <td>
                        <span className="badge badge-gray">Round {t.cycleNo}</span>
                      </td>
                    )}
                    <td>
                      <div>{t.roleName}</div>
                      {t.departmentCode && (
                        <span className="badge badge-gray">{t.departmentCode}</span>
                      )}
                    </td>
                    <td>{t.assignedUserName}</td>
                    <td>
                      <span className={`badge ${resBadge}`}>{t.result}</span>
                    </td>
                    {activeTab === "all" && <td style={{ maxWidth: "200px" }}>{t.notes || "—"}</td>}
                    {activeTab === "all" && (
                      <td>
                        {t.actedByName ? (
                          <div style={{ fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                            {t.result === "APPROVED" && <ApprovedStamp width={58} height={17} />}
                            <div>
                              <strong>{t.actedByName}</strong>
                            </div>
                            <span className="muted">
                              {t.actedAt ? new Date(t.actedAt).toLocaleString() : ""}
                            </span>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
                    {activeTab === "pending" && (
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {t.canAct && t.result === "PENDING" ? (
                          <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.6rem" }}
                              onClick={() => openSignModal(t, "APPROVE")}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.6rem", color: "var(--err-text)" }}
                              onClick={() => openSignModal(t, "REJECT")}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <Link
                            href={`/gap-analysis/${t.gapId}?from=/approvals`}
                            className="btn btn-ghost"
                            style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.6rem" }}
                          >
                            View Gap
                          </Link>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Electronic Signature Modal */}
      {selectedTask && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">
                {decision === "APPROVE" ? "Electronic Signature Approval" : "Reject Document"}
              </h2>
              <button type="button" className="modal-close" onClick={() => setSelectedTask(null)}>
                ×
              </button>
            </div>

            {actionErr && <div className="alert alert-error">{actionErr}</div>}

            <form onSubmit={handleSignSubmit}>
              <div style={{ padding: "0.75rem", background: "var(--surface-2)", borderRadius: "8px", marginBottom: "1rem" }}>
                <div>
                  <strong>{selectedTask.gapNo}</strong> — {selectedTask.stage}
                </div>
                <div className="muted small">{selectedTask.regulationTitle}</div>
                <div className="muted small">Acting as: {selectedTask.roleName}</div>
              </div>

              <div className="field">
                <label htmlFor="signNotes">
                  {decision === "REJECT" ? (
                    <>
                      Rejection Reason <span style={{ color: "#c52a2a" }}>*</span>
                    </>
                  ) : (
                    "Approval Comments (Optional)"
                  )}
                </label>
                <textarea
                  id="signNotes"
                  rows={3}
                  className="filter-input"
                  style={{ width: "100%", height: "auto" }}
                  placeholder={
                    decision === "REJECT"
                      ? "Explanation for rejection and required revisions..."
                      : "Approval Notes..."
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required={decision === "REJECT"}
                />
              </div>

              <div className="field">
                <label htmlFor="signPw">
                  Account Password Confirmation<span style={{ color: "#c52a2a" }}>*</span>
                </label>
                <input
                  id="signPw"
                  type="password"
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTask(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${decision === "APPROVE" ? "btn-primary" : "btn-ghost"}`}
                  style={decision === "REJECT" ? { color: "var(--err-text)", borderColor: "var(--err-text)" } : {}}
                  disabled={submitting}
                >
                  {submitting
                    ? "Signing..."
                    : decision === "APPROVE"
                    ? "Sign & Approve"
                    : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
