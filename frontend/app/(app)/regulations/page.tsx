"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type RegulationItem = {
  id: number;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  regulationType: string;
  docStatus: string;
  legalNumber: string;
  title: string;
  publishedDate: string | null;
  pdfFilePath?: string;
  readMode: string;
  uploadedByName: string;
  clauseCount: number;
  createdAt: string;
};

export default function RegulationsPage() {
  const [items, setItems] = useState<RegulationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [categories, setCategories] = useState<{ id: number; code: string; name: string }[]>([]);

  useEffect(() => {
    api<{ id: number; code: string; name: string }[]>("/api/categories")
      .then((cats) => setCategories(cats || []))
      .catch(() => setCategories([]));
  }, []);

  const loadData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (catFilter) params.set("categoryId", catFilter);
    if (search) params.set("q", search);

    api<RegulationItem[]>(`/api/regulations?${params.toString()}`)
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [catFilter, search]);

  return (
    <main className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Regulations & Requirements</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Dokumen regulasi, standar bernomor, dan panduan internal (URS 007A-E).
          </p>
        </div>
        <div>
          <Link href="/regulations/new" className="btn btn-primary">
            + New Regulation Upload
          </Link>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: "1rem" }}>
        <div className="filter-group">
          <input
            type="search"
            placeholder="Search legal number / title..."
            className="filter-input"
            style={{ minWidth: "240px" }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
        <div className="muted small">
          Total <strong>{(items || []).length}</strong> regulations
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Legal Number</th>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>Clauses</th>
              <th>Read Mode</th>
              <th>Document</th>
              <th>Uploaded By</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "2rem" }}>
                  <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Loading...
                </td>
              </tr>
            ) : (items || []).length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                  No regulations registered. Click "+ New Regulation Upload" to add one.
                </td>
              </tr>
            ) : (
              (items || []).map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="badge badge-info">{r.categoryCode}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.legalNumber}</td>
                  <td>{r.title}</td>
                  <td>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{r.regulationType}</span>
                  </td>
                  <td>
                    <span className={`badge ${r.docStatus === "NEW" ? "badge-ok" : "badge-warn"}`}>
                      {r.docStatus}
                    </span>
                  </td>
                  <td>
                    <strong>{r.clauseCount}</strong> clauses
                  </td>
                  <td>
                    <span className="badge badge-gray">{r.readMode}</span>
                  </td>
                  <td>
                    {r.pdfFilePath ? (
                      <a
                        href={`/api/regulations/${r.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", textDecoration: "none" }}
                        title="Download / View PDF"
                      >
                        📄 View PDF
                      </a>
                    ) : (
                      <span className="muted" style={{ fontSize: "0.75rem" }}>—</span>
                    )}
                  </td>
                  <td>{r.uploadedByName}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
