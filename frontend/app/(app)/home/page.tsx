"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";

type ComplianceMetric = {
  totalApplicable: number;
  count100: number;
  count50: number;
  count0: number;
  pct100: number;
  pct50: number;
  pct0: number;
};

type GroupedMetric = {
  key: string;
  label: string;
  totalApplicable: number;
  count100: number;
  count50: number;
  count0: number;
  pct100: number;
  pct50: number;
  pct0: number;
};

type OutstandingGapTask = {
  gapId: number;
  gapNo: string;
  legalNumber: string;
  regulationTitle: string;
  siteCode: string;
  categoryCode: string;
  workflowStatus: string;
  taskType:
    | "DRAFT"
    | "RETURNED_DRAFT"
    | "SUPERVISOR_VERIFICATION"
    | "ACTION_PLAN"
    | "STAFF_REVIEW";
  returnNotes: string;
  returnedByName: string;
  returnedAt: string | null;
  submittedAt: string | null;
  updatedAt: string;
};

type DashboardData = {
  overallCompliance: ComplianceMetric;
  activeRegulations: number;
  pendingApprovals: number;
  overdueActionPlans: number;
  bySite: GroupedMetric[];
  byCategory: GroupedMetric[];
  userPendingApprovals: any[];
  userOutstandingPlans: any[];
  userOutstandingDocs: OutstandingGapTask[];
  userExecutionVerifications: any[];
};

export default function HomePage() {
  const { me } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [siteFilter, setSiteFilter] = useState<string>("");
  const [catFilter, setCatFilter] = useState<string>("");
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
    api<DashboardData>(`/api/dashboard?${params.toString()}`)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [siteFilter, catFilter]);

  if (!me) return null;

  const oc = data?.overallCompliance;

  return (
    <main className="page">
      <div className="toolbar" style={{ alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 className="page-title">Compliance Dashboard</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Real-time compliance monitoring across Cikarang, Pulogadung, and Pulomas sites.
          </p>
        </div>
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
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Comply (100%)</div>
          <div className="stat-value" style={{ color: "var(--ok)" }}>
            {loading ? "..." : `${oc?.pct100.toFixed(1) ?? 0}%`}
          </div>
          <div className="stat-sub">
            {oc?.count100 ?? 0} of {oc?.totalApplicable ?? 0} applicable clauses
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill progress-fill-ok"
              style={{ width: `${oc?.pct100 ?? 0}%` }}
            />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Partially Comply (50%)</div>
          <div className="stat-value" style={{ color: "#d99b00" }}>
            {loading ? "..." : `${oc?.pct50.toFixed(1) ?? 0}%`}
          </div>
          <div className="stat-sub">
            {oc?.count50 ?? 0} clauses requiring action plan
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill progress-fill-warn"
              style={{ width: `${oc?.pct50 ?? 0}%` }}
            />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Not Comply (0%)</div>
          <div className="stat-value" style={{ color: "#c52a2a" }}>
            {loading ? "..." : `${oc?.pct0.toFixed(1) ?? 0}%`}
          </div>
          <div className="stat-sub">
            {oc?.count0 ?? 0} clauses requiring full corrective plan
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill progress-fill-err"
              style={{ width: `${oc?.pct0 ?? 0}%` }}
            />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Regulations</div>
          <div className="stat-value">{loading ? "..." : data?.activeRegulations ?? 0}</div>
          <div className="stat-sub">Under gap analysis / execution</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Pending Approvals</div>
          <div className="stat-value" style={{ color: "var(--primary)" }}>
            {loading ? "..." : data?.pendingApprovals ?? 0}
          </div>
          <div className="stat-sub">Awaiting your electronic review</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Overdue Action Plans</div>
          <div className="stat-value" style={{ color: "#c52a2a" }}>
            {loading ? "..." : data?.overdueActionPlans ?? 0}
          </div>
          <div className="stat-sub">Past completion due date</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.2fr 1fr", marginTop: "2rem" }}>
        {/* Compliance by Site & Category */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <section className="card">
            <h2>Compliance by Site</h2>
            <p className="muted small" style={{ margin: "0 0 1rem" }}>
              Percentage of fully complying clauses (Status 100%) per production site.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {data?.bySite?.map((s) => (
                <div key={s.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                    <strong>
                      {s.key} - {s.label}
                    </strong>
                    <span>
                      {s.pct100.toFixed(1)}% ({s.count100}/{s.totalApplicable})
                    </span>
                  </div>
                  <div className="progress-bar" style={{ height: "10px" }}>
                    <div
                      className="progress-fill progress-fill-ok"
                      style={{ width: `${s.pct100}%` }}
                    />
                  </div>
                </div>
              ))}
              {(!data?.bySite || data.bySite.length === 0) && (
                <p className="muted small">No site data available.</p>
              )}
            </div>
          </section>

          <section className="card">
            <h2>Compliance by Category</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "1rem" }}>
              {data?.byCategory?.map((c) => (
                <div
                  key={c.key}
                  style={{
                    padding: "0.85rem",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    background: "var(--surface-2)",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{c.key}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.4rem" }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ok)" }}>
                    {c.pct100.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {c.count100} / {c.totalApplicable} clauses
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* My Tasks: My Outstanding (Draft / Returned / Verification / Execution) & Pending Approvals */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {(me.user.role === "CO_GAP_STAFF" ||
            me.user.role === "CO_GAP_SUPERVISOR" ||
            me.user.role === "PIC_AREA" ||
            (data?.userOutstandingDocs && data.userOutstandingDocs.length > 0)) && (
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h2>My Outstanding</h2>
                <Link
                  href="/gap-analysis"
                  className="btn btn-ghost"
                  style={{ fontSize: "0.8rem", minHeight: "32px", padding: "0 0.6rem" }}
                >
                  View All
                </Link>
              </div>

              {(() => {
                const docs = data?.userOutstandingDocs || [];
                const execVerifs = data?.userExecutionVerifications || [];
                const totalItems = docs.length + execVerifs.length;

                if (totalItems === 0) {
                  return (
                    <p className="muted small">
                      {me.user.role === "CO_GAP_SUPERVISOR"
                        ? "No outstanding documents or action plans waiting for verification."
                        : me.user.role === "CO_GAP_STAFF"
                        ? "No drafts or returned documents waiting to be worked on."
                        : me.user.role === "PIC_AREA"
                        ? "No documents waiting for Action Plan submission."
                        : "No outstanding tasks."}
                    </p>
                  );
                }

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                    {docs.slice(0, 5).map((d) => {
                      const isReturned = d.taskType === "RETURNED_DRAFT";
                      const isSupVerify = d.taskType === "SUPERVISOR_VERIFICATION";
                      const isStaffReview = d.taskType === "STAFF_REVIEW";
                      const isActionPlan = d.taskType === "ACTION_PLAN";
                      const badgeClass = isReturned
                        ? "badge-err"
                        : isSupVerify || isStaffReview
                        ? "badge-warn"
                        : "badge-info";
                      const badgeText = isReturned
                        ? "Returned by Supervisor"
                        : isSupVerify
                        ? "Submitted for Verification"
                        : isStaffReview
                        ? "Action Plan Check"
                        : isActionPlan
                        ? "Action Plan Needed"
                        : "Draft";
                      const actionLabel = isSupVerify
                        ? "Verify Document"
                        : isReturned
                        ? "Perbaiki Return"
                        : isStaffReview
                        ? "Periksa Action Plan"
                        : isActionPlan
                        ? "Isi Action Plan"
                        : "Lanjutkan Draft";

                      return (
                        <div
                          key={`doc-${d.gapId}`}
                          style={{
                            padding: "0.75rem",
                            border: `1px solid ${isReturned ? "#fca5a5" : "var(--border)"}`,
                            borderRadius: "8px",
                            background: isReturned ? "#fef2f2" : "var(--surface-2)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                            <span className={`badge ${badgeClass}`}>{badgeText}</span>
                            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                              {d.siteCode} • {d.categoryCode}
                            </span>
                          </div>
                          <div style={{ fontWeight: 700, marginTop: "0.35rem" }}>{d.gapNo}</div>
                          <div style={{ fontSize: "0.84rem", color: "var(--muted)" }}>
                            {d.legalNumber} — {d.regulationTitle}
                          </div>
                          {(isReturned || isActionPlan) && d.returnNotes && (
                            <div
                              style={{
                                marginTop: "0.4rem",
                                padding: "0.45rem 0.6rem",
                                borderRadius: "6px",
                                background: "#fff8e1",
                                color: "#6b4f00",
                                fontSize: "0.8rem",
                              }}
                            >
                              <strong>Catatan Return{d.returnedByName ? ` (${d.returnedByName})` : ""}:</strong>{" "}
                              {d.returnNotes}
                            </div>
                          )}
                          <div style={{ marginTop: "0.55rem" }}>
                            <Link
                              href={`/gap-analysis/${d.gapId}?from=/home`}
                              className="btn btn-primary"
                              style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.75rem" }}
                            >
                              {actionLabel}
                            </Link>
                          </div>
                        </div>
                      );
                    })}

                    {execVerifs.slice(0, 5).map((p) => (
                      <div
                        key={`exec-${p.actionPlanId}`}
                        style={{
                          padding: "0.75rem",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          background: "var(--surface-2)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                          <span className="badge badge-warn">
                            {p.executionStatus === "PENDING_VERIFICATION"
                              ? "Execution Verification (Stage 2)"
                              : "Due Date Change Request"}
                          </span>
                          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            {p.siteCode} • {p.deptCode}
                          </span>
                        </div>
                        <div style={{ fontWeight: 700, marginTop: "0.35rem" }}>
                          {p.gapNo} — Clause {p.clauseNo}
                        </div>
                        <div style={{ fontSize: "0.84rem", color: "var(--muted)" }}>
                          PIC: <strong>{p.picName}</strong> • {p.planText}
                        </div>
                        {p.closeDate && (
                          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                            Close Date: {new Date(p.closeDate).toLocaleDateString()}
                            {p.leadTimeDays !== null ? ` (Lead time: ${p.leadTimeDays} hari)` : ""}
                          </div>
                        )}
                        <div style={{ marginTop: "0.55rem" }}>
                          <Link
                            href="/execution"
                            className="btn btn-primary"
                            style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.75rem" }}
                          >
                            {p.executionStatus === "PENDING_VERIFICATION"
                              ? "Verify Action Plan"
                              : "Verify Due Date"}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>
          )}

          {(data?.userPendingApprovals?.length || 0) > 0 ||
          (me.user.role !== "CO_GAP_STAFF" && me.user.role !== "CO_GAP_SUPERVISOR" && me.user.role !== "PIC_AREA") ? (
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h2>My Pending Approvals</h2>
                <Link href="/approvals" className="btn btn-ghost" style={{ fontSize: "0.8rem", minHeight: "32px", padding: "0 0.6rem" }}>
                  View All
                </Link>
              </div>
              {data?.userPendingApprovals && data.userPendingApprovals.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {data.userPendingApprovals.slice(0, 4).map((a) => (
                    <div
                      key={a.approvalId}
                      style={{
                        padding: "0.75rem",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="badge badge-info">{a.stage}</span>
                        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{a.siteCode}</span>
                      </div>
                      <div style={{ fontWeight: 600, marginTop: "0.3rem" }}>{a.gapNo}</div>
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{a.regulationTitle}</div>
                      <div style={{ marginTop: "0.5rem" }}>
                        <Link href={`/approvals`} className="btn btn-primary" style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.75rem" }}>
                          Review & Sign
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No pending approval requests assigned to you.</p>
              )}
            </section>
          ) : null}

          {(me.user.role === "PIC_AREA" || (data?.userOutstandingPlans?.length || 0) > 0) && (
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h2>My Outstanding Action Plans</h2>
                <Link href="/execution" className="btn btn-ghost" style={{ fontSize: "0.8rem", minHeight: "32px", padding: "0 0.6rem" }}>
                  View All
                </Link>
              </div>
              {data?.userOutstandingPlans && data.userOutstandingPlans.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {data.userOutstandingPlans.slice(0, 4).map((p) => (
                    <div
                      key={p.actionPlanId}
                      style={{
                        padding: "0.75rem",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className={`badge ${p.monitoringStatus === "Overdue" ? "badge-err" : "badge-warn"}`}>
                          {p.monitoringStatus} {p.overdueDays > 0 ? `(${p.overdueDays}d)` : ""}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                          Due: {new Date(p.dueDate).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, marginTop: "0.3rem" }}>
                        {p.gapNo} — Clause {p.clauseNo}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.2rem 0 0.5rem" }}>
                        {p.planText}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        <span
                          className={`badge ${
                            p.executionStatus === "VERIFIED"
                              ? "badge-ok"
                              : p.executionStatus === "PENDING_VERIFICATION"
                              ? "badge-warn"
                              : "badge-info"
                          }`}
                        >
                          {p.executionStatus === "VERIFIED"
                            ? "Verified (Stage 2)"
                            : p.executionStatus === "PENDING_VERIFICATION"
                            ? "Completed – Submit for Verification"
                            : "In Progress"}
                        </span>
                        <Link
                          href="/execution"
                          className="btn btn-ghost"
                          style={{ minHeight: "28px", fontSize: "0.78rem", padding: "0 0.6rem" }}
                        >
                          Open Execution
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No outstanding action plans assigned to you.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
