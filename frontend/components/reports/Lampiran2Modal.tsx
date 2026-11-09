"use client";

import React, { useState } from "react";
import { exportToPdf, printDocument } from "./pdfHelper";

type MasterListItem = {
  masterListItemId: number;
  itemNo: number;
  legalNumber: string;
  legalTitle: string;
  publishedDate: string | null;
  needGapAnalysis: boolean;
  interestedParties: string[];
  fulfillmentStatus: "Open" | "On Progress" | "Closed" | string;
};

type Props = {
  categoryCode: string;
  categoryName: string;
  siteCode: string;
  siteName: string;
  items: MasterListItem[];
  onClose: () => void;
};

export default function Lampiran2Modal({
  categoryCode,
  categoryName,
  siteCode,
  siteName,
  items,
  onClose,
}: Props) {
  const [downloading, setDownloading] = useState(false);

  const today = new Date();
  const issueDateFormatted = today.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const reviewDate = new Date(today);
  reviewDate.setFullYear(reviewDate.getFullYear() + 1);
  const reviewDateFormatted = reviewDate.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const docNo = `${categoryCode || "QU"} - 00`;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    const filename = `LEGAL_REQUIREMENT_LIST_${categoryCode || "ALL"}_${siteCode || "ALL"}`;
    await exportToPdf("lampiran-2-document", filename);
    setDownloading(false);
  };

  return (
    <div className="report-modal-backdrop">
      <div className="report-modal-content">
        <div className="report-modal-toolbar">
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              Lampiran 2: Legal Requirement List (Master List)
            </h3>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Dokumen Resmi WI-QO-QS-1023.04 (URS 010A) • Kategori: {categoryName || "All Categories"} ({siteCode || "All Sites"})
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={printDocument}
            >
              🖨️ Cetak / Print
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? "Mengunduh PDF..." : "📥 Download PDF (Lampiran 2)"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              ✕ Tutup
            </button>
          </div>
        </div>

        <div className="report-container" id="lampiran-2-document">
          {/* Header Box Lampiran 2 WI */}
          <table className="report-table-wi" style={{ marginBottom: "0.5rem" }}>
            <tbody>
              <tr>
                <td style={{ width: "65%", fontSize: "13pt", fontWeight: "bold", verticalAlign: "middle" }}>
                  LEGAL REQUIREMENT LIST<br />
                  <span style={{ fontSize: "11pt", fontWeight: "normal", color: "#334155" }}>
                    {categoryName ? categoryName.toUpperCase() : "GENERAL / ALL CATEGORIES"} — {siteName || "MULTI-SITE"}
                  </span>
                </td>
                <td style={{ width: "35%", fontSize: "8.5pt" }}>
                  <div style={{ marginBottom: "4px" }}>
                    <strong>ISSUE DATE :</strong> {issueDateFormatted}
                  </div>
                  <div>
                    <strong>REVIEW DATE :</strong> {reviewDateFormatted}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Created by & Reviewed by Box */}
          <table className="report-table-wi" style={{ marginBottom: "0.5rem" }}>
            <thead>
              <tr>
                <th style={{ width: "50%" }}>CREATED BY:</th>
                <th style={{ width: "50%" }}>REVIEWED BY:</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="signature-box" style={{ height: "65px" }}>
                  <span className="stamp-badge">✓ PREPARED BY ERES</span>
                  <div style={{ fontWeight: 600 }}>QS SUPERVISOR</div>
                </td>
                <td className="signature-box" style={{ height: "65px" }}>
                  <span className="stamp-badge">✓ REVIEWED BY ERES</span>
                  <div style={{ fontWeight: 600 }}>QS MANAGER</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Doc No & Change History Bar */}
          <table className="report-table-wi" style={{ marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th style={{ width: "25%" }}>NO DOC.</th>
                <th style={{ width: "25%" }}>DATE</th>
                <th style={{ width: "50%" }}>CHANGE HISTORY</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: "center", fontWeight: "bold" }}>{docNo}</td>
                <td style={{ textAlign: "center" }}>{issueDateFormatted}</td>
                <td>Dokumen Baru</td>
              </tr>
            </tbody>
          </table>

          {/* Legal Requirement List Table (12 Kolom WI) */}
          <table className="report-table-wi">
            <thead>
              <tr>
                <th style={{ width: "5%" }}>NO</th>
                <th style={{ width: "20%" }}>LEGAL NUMBER</th>
                <th style={{ width: "32%" }}>LEGAL TITLE</th>
                <th style={{ width: "16%" }}>INTERESTED PARTIES</th>
                <th style={{ width: "11%" }}>PUBLISHED DATE</th>
                <th style={{ width: "8%" }}>NEED GAP ANALYSIS?</th>
                <th style={{ width: "8%" }}>FULFILLMENT STATUS</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "1.5rem", color: "#64748b" }}>
                    Belum ada data regulasi yang terdaftar pada filter ini.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={item.masterListItemId || idx}>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{item.itemNo || idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.legalNumber}</td>
                    <td>{item.legalTitle}</td>
                    <td>
                      {item.interestedParties && item.interestedParties.length > 0
                        ? item.interestedParties.join(", ")
                        : "-"}
                    </td>
                    <td style={{ textAlign: "center" }}>{formatDate(item.publishedDate)}</td>
                    <td style={{ textAlign: "center", fontWeight: "bold" }}>
                      {item.needGapAnalysis ? "Yes" : "No"}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: "bold" }}>
                      <span
                        style={{
                          color:
                            item.fulfillmentStatus === "Closed"
                              ? "#15803d"
                              : item.fulfillmentStatus === "On Progress"
                              ? "#b45309"
                              : "#b91c1c",
                        }}
                      >
                        {item.fulfillmentStatus || "Open"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
