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

type DashboardData = {
  overallCompliance: ComplianceMetric;
  activeRegulations: number;
  pendingApprovals: number;
  overdueActionPlans: number;
  bySite: GroupedMetric[];
  byCategory: GroupedMetric[];
  userPendingApprovals: any[];
  userOutstandingPlans: any[];
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

        {/* My Tasks: Pending Approvals & Outstanding Plans */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div className="progress-bar" style={{ flex: 1, margin: 0 }}>
                        <div
                          className="progress-fill progress-fill-ok"
                          style={{ width: `${p.progressPct}%` }}
                        />
                      </div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{p.progressPct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No outstanding action plans assigned to you.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
