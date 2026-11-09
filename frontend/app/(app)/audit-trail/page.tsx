"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type AuditItem = {
  logId: number;
  occurredAt: string;
  userId: number | null;
  username: string;
  userFullName: string;
  action: string;
  activity: string;
  gapId: number | null;
  gapNo: string;
  entityTable: string;
  entityId: string;
  description: string;
  siteId: number | null;
  siteCode: string;
  onBehalfOfName: string;
  ipAddress: string;
};

type AuditResponse = {
  items: AuditItem[];
  total: number;
};

export default function AuditTrailPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [siteFilter, setSiteFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);

  useEffect(() => {
    api<{ id: number; code: string; name: string }[]>("/api/sites")
      .then((s) => setSites(s || []))
      .catch(() => setSites([]));
  }, []);

  const loadAudit = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (siteFilter) params.set("siteId", siteFilter);
    if (activityFilter) params.set("activity", activityFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (monthFilter) params.set("month", monthFilter);
    if (yearFilter) params.set("year", yearFilter);
    params.set("limit", "100");

    api<AuditResponse>(`/api/audit-trail?${params.toString()}`)
      .then((res) => {
        setItems(res?.items || []);
        setTotal(res?.total || 0);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAudit();
  }, [siteFilter, activityFilter, actionFilter, monthFilter, yearFilter]);

  const getActionBadge = (act: string) => {
    switch (act) {
      case "ADD":
      case "NEW":
        return <span className="badge badge-ok">{act}</span>;
      case "EDIT":
      case "UPDATE":
      case "REVISE":
        return <span className="badge badge-info">{act}</span>;
      case "VERIFY":
      case "APPROVE":
        return <span className="badge badge-ok">{act}</span>;
      case "REJECT":
      case "DELETE":
      case "DEACTIVATE":
        return <span className="badge badge-err">{act}</span>;
      case "DELEGATION":
        return <span className="badge badge-warn">{act}</span>;
      default:
        return <span className="badge badge-gray">{act}</span>;
    }
  };

  return (
    <main className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Audit Trail (Log History)</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Append-only audit trail logging every creation, modification, verification, and approval (URS 004A, ERES).
          </p>
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
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
          >
            <option value="">All Activities</option>
            <option value="MASTER_LIST">Master List</option>
            <option value="UPLOAD_REGULATION">Upload Regulation</option>
            <option value="GAP_ANALYSIS_ACTION_PLAN">Gap Analysis & Action Plan</option>
            <option value="APPROVAL_STAGE1">Approval Stage 1</option>
            <option value="APPROVAL_STAGE2">Approval Stage 2</option>
            <option value="SETTING_USERS">Setting: Users</option>
            <option value="SETTING_DEPARTMENT">Setting: Department</option>
            <option value="SETTING_CATEGORY_SITE">Setting: Category & Site</option>
            <option value="SETTING_DELEGATION">Setting: Delegation</option>
            <option value="AUTH">Authentication</option>
          </select>

          <select
            className="filter-select"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All Actions</option>
            <option value="ADD">ADD / NEW</option>
            <option value="EDIT">EDIT / UPDATE / REVISE</option>
            <option value="VERIFY">VERIFY</option>
            <option value="APPROVE">APPROVE</option>
            <option value="REJECT">REJECT</option>
            <option value="DELEGATION">DELEGATION</option>
            <option value="DELETE">DELETE / DEACTIVATE</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
          </select>

          <select
            className="filter-select"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="">All Months</option>
            {[
              "Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
            ].map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="">All Years</option>
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="muted small">
          Showing <strong>{(items || []).length}</strong> of <strong>{total}</strong> records
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Activity</th>
              <th>Site</th>
              <th>Gap No</th>
              <th>Description</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2rem" }}>
                  <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Loading audit trail...
                </td>
              </tr>
            ) : (items || []).length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                  No audit log entries matching filters.
                </td>
              </tr>
            ) : (
              (items || []).map((log) => (
                <tr key={log.logId}>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                    {new Date(log.occurredAt).toLocaleString()}
                  </td>
                  <td>
                    <strong>{log.userFullName || log.username || "System"}</strong>
                    {log.onBehalfOfName && (
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        (on behalf of {log.onBehalfOfName})
                      </div>
                    )}
                  </td>
                  <td>{getActionBadge(log.action)}</td>
                  <td>
                    <span className="badge badge-gray">{log.activity}</span>
                  </td>
                  <td>
                    {log.siteCode ? <span className="badge badge-info">{log.siteCode}</span> : "—"}
                  </td>
                  <td>
                    {log.gapNo ? <code>{log.gapNo}</code> : <span className="muted">—</span>}
                  </td>
                  <td style={{ maxWidth: "340px", fontSize: "0.825rem" }}>{log.description}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{log.ipAddress || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
