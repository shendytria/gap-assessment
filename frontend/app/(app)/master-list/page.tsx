"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import Lampiran2Modal from "@/components/reports/Lampiran2Modal";

type MasterListItem = {
  masterListItemId: number;
  masterListDocId: number;
  listNo: string;
  siteId: number;
  siteCode: string;
  siteName: string;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  itemNo: number;
  legalNumber: string;
  legalTitle: string;
  publishedDate: string | null;
  needGapAnalysis: boolean;
  interestedParties: string[];
  regulationId: number | null;
  gapId: number | null;
  gapNo: string;
  gapWorkflowStatus: string;
  fulfillmentStatus: "Open" | "On Progress" | "Closed";
  compliancePct100: number;
  createdAt: string;
};

export default function MasterListPage() {
  const { me } = useSession();
  const [items, setItems] = useState<MasterListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);

  const canDownload =
    me?.user.role === "CO_GAP_STAFF" || me?.user.role === "CO_GAP_SUPERVISOR";

  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; code: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      api<{ id: number; code: string; name: string }[]>("/api/sites"),
      api<{ id: number; code: string; name: string }[]>("/api/categories"),
    ])
      .then(([s, c]) => {
        setSites(s || []);
        setCategories(c || []);
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
    if (yearFilter) params.set("year", yearFilter);
    if (search) params.set("q", search);

    api<MasterListItem[]>(`/api/master-list?${params.toString()}`)
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [siteFilter, catFilter, yearFilter, search]);

  return (
    <main className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Master List (List Legal Requirements)</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Daftar peraturan/standar legalitas dan kepatuhan.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {canDownload && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowReportModal(true)}
              title="Download PDF Master List Legal Requirements"
            >
              Download PDF
            </button>
          )}
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: "1rem" }}>
        <div className="filter-group">
          <input
            type="search"
            placeholder="Search legal number / title..."
            className="filter-input"
            style={{ minWidth: "220px" }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
          Showing <strong>{(items || []).length}</strong> items
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "40px" }}>No</th>
              <th>Site</th>
              <th>Doc No</th>
              <th>Legal Number</th>
              <th>Legal Title</th>
              <th>Interested Parties</th>
              <th>Published Date</th>
              <th>Need Gap?</th>
              <th>Fulfillment Status</th>
              <th>Gap Analysis</th>
              <th>Compliance (100%)</th>
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
                  No regulations registered in the Master List matching filters.
                </td>
              </tr>
            ) : (
              (items || []).map((item, idx) => {
                const badgeClass =
                  item.fulfillmentStatus === "Closed"
                    ? "badge-ok"
                    : item.fulfillmentStatus === "On Progress"
                    ? "badge-warn"
                    : "badge-gray";
                return (
                  <tr key={item.masterListItemId}>
                    <td>{idx + 1}</td>
                    <td>
                      <span className="badge badge-info">{item.siteCode}</span>
                    </td>
                    <td>
                      <code>{item.listNo}</code>
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.legalNumber}</td>
                    <td>{item.legalTitle}</td>
                    <td>
                      {item.interestedParties && item.interestedParties.length > 0 ? (
                        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                          {item.interestedParties.map((p) => (
                            <span key={p} className="badge badge-gray">
                              {p}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{item.publishedDate ? new Date(item.publishedDate).toLocaleDateString() : "—"}</td>
                    <td>{item.needGapAnalysis ? "Yes" : "No"}</td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{item.fulfillmentStatus}</span>
                    </td>
                    <td>
                      {item.gapId ? (
                        <Link href={`/gap-analysis/${item.gapId}`} style={{ fontWeight: 600 }}>
                          {item.gapNo}
                        </Link>
                      ) : (
                        <span className="muted">Not started</span>
                      )}
                    </td>
                    <td>
                      {item.gapId ? (
                        <span style={{ fontWeight: 600, color: "var(--ok)" }}>
                          {item.compliancePct100.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Official Master List Report Modal (WI-QO-QS-1023.04 Lampiran 2) */}
      {showReportModal && (
        <Lampiran2Modal
          categoryCode={categories.find((c) => c.id === Number(catFilter))?.code || ""}
          categoryName={categories.find((c) => c.id === Number(catFilter))?.name || ""}
          siteCode={sites.find((s) => s.id === Number(siteFilter))?.code || ""}
          siteName={sites.find((s) => s.id === Number(siteFilter))?.name || ""}
          items={items}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </main>
  );
}
