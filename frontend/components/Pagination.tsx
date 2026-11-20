"use client";

import React from "react";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  pageSizeOptions?: number[];
  disabled?: boolean;
};

export function getPageNumbers(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [];
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, "...", totalPages);
  } else if (current >= totalPages - 3) {
    pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
  } else {
    pages.push(1, "...", current - 1, current, current + 1, "...", totalPages);
  }
  return pages;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  disabled = false,
}: PaginationProps) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startRecord = (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);
  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: "1.25rem",
        padding: "0.5rem 0",
        flexWrap: "wrap",
        gap: "1rem",
        fontSize: "0.85rem",
        color: "var(--muted)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        {onPageSizeChange && (
          <>
            <span>Rows per page:</span>
            <select
              className="filter-select"
              style={{ minHeight: "32px", padding: "0 0.5rem", fontSize: "0.85rem", width: "auto" }}
              value={pageSize}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </>
        )}
        <span>
          Showing <strong>{startRecord}</strong>–<strong>{endRecord}</strong> of <strong>{total}</strong> records (Page{" "}
          <strong>{page}</strong> of <strong>{totalPages}</strong>)
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: "32px", padding: "0 0.6rem", fontSize: "0.85rem" }}
          disabled={page <= 1 || disabled}
          onClick={() => onPageChange(1)}
          title="First Page"
        >
          «
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: "32px", padding: "0 0.75rem", fontSize: "0.85rem" }}
          disabled={page <= 1 || disabled}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          title="Previous Page"
        >
          ‹ Prev
        </button>

        {pageNumbers.map((p, idx) =>
          p === "..." ? (
            <span key={`ellipsis-${idx}`} style={{ padding: "0 0.4rem", color: "var(--muted)" }}>
              …
            </span>
          ) : (
            <button
              key={`page-${p}`}
              type="button"
              className={`btn ${page === p ? "btn-primary" : "btn-ghost"}`}
              style={{
                minHeight: "32px",
                minWidth: "32px",
                padding: "0 0.6rem",
                fontSize: "0.85rem",
                fontWeight: page === p ? 700 : 500,
              }}
              disabled={disabled}
              onClick={() => onPageChange(Number(p))}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: "32px", padding: "0 0.75rem", fontSize: "0.85rem" }}
          disabled={page >= totalPages || disabled}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          title="Next Page"
        >
          Next ›
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: "32px", padding: "0 0.6rem", fontSize: "0.85rem" }}
          disabled={page >= totalPages || disabled}
          onClick={() => onPageChange(totalPages)}
          title="Last Page"
        >
          »
        </button>
      </div>
    </div>
  );
}
