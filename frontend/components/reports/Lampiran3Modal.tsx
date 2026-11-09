"use client";

import React, { useState } from "react";
import { exportToPdf, printDocument } from "./pdfHelper";

type ActionPlan = {
  actionPlanId: number;
  gapNo: string;
  legalNumber: string;
  regulationTitle: string;
  clauseNo: string;
  requirementText: string;
  actualCondition: string;
  planText: string;
  picInitials: string;
  picName: string;
  dueDate: string;
  progressPct: number;
  progressNotes: string;
  closeDate: string | null;
  monitoringStatus: string;
  verifiedByName: string;
  verifiedAt: string | null;
  fulfillmentNotes: string;
};

type Props = {
  gapNo: string;
  legalNumber: string;
  regulationTitle?: string;
  plans: ActionPlan[];
  onClose: () => void;
};

export default function Lampiran3Modal({
  gapNo,
  legalNumber,
  regulationTitle,
  plans,
  onClose,
}: Props) {
  const [downloading, setDownloading] = useState(false);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    const filename = `${gapNo ? gapNo.replace(/\s+/g, "_") : "EXECUTION"}_Lampiran3_Bukti_Pemenuhan_Gap`;
    await exportToPdf("lampiran-3-document", filename);
    setDownloading(false);
  };

  return (
    <div className="report-modal-backdrop">
      <div className="report-modal-content">
        <div className="report-modal-toolbar">
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              Lampiran 3: Bukti Pemenuhan Gap (Action Plan Execution)
            </h3>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Dokumen Resmi WI-QO-QS-1023.04 (URS 009B/C & 010A) • {gapNo || "All Outstanding"}
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
              {downloading ? "Mengunduh PDF..." : "📥 Download PDF (Lampiran 3)"}
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

        <div className="report-container" id="lampiran-3-document">
          {/* Header Box Lampiran 3 WI */}
          <div className="report-header-box" style={{ padding: "10px 14px", marginBottom: "0.85rem" }}>
            <div className="report-title-main" style={{ borderBottom: "none", paddingBottom: "4px" }}>
              Bukti Pemenuhan Gap
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "9pt" }}>
              <div>
                <strong>Legal Number :</strong> {legalNumber || "-"}
                {regulationTitle && <span style={{ marginLeft: "6px", color: "#475569" }}>({regulationTitle})</span>}
              </div>
              <div>
                <strong>No Doc :</strong> {gapNo || "-"}
              </div>
            </div>
          </div>

          {/* Action Plans Table (11 Kolom Lampiran 3) */}
          <table className="report-table-wi">
            <thead>
              <tr>
                <th style={{ width: "5%" }}>Clausul</th>
                <th style={{ width: "24%" }}>Legal & Other Requirement Reference</th>
                <th style={{ width: "16%" }}>Gap</th>
                <th style={{ width: "16%" }}>Action Plan</th>
                <th style={{ width: "4%" }}>PIC</th>
                <th style={{ width: "7%" }}>Due Date</th>
                <th style={{ width: "10%" }}>QS Verification</th>
                <th style={{ width: "6%" }}>Status</th>
                <th style={{ width: "12%" }}>Catatan bila diperlukan</th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "1.5rem", color: "#64748b" }}>
                    Tidak ada action plan / bukti pemenuhan pada dokumen ini (seluruh klausul sudah terpenuhi 100%).
                  </td>
                </tr>
              ) : (
                plans.map((p, idx) => {
                  const isClosed = p.closeDate !== null || p.progressPct === 100;
                  const statusLabel = isClosed ? "Closed" : p.progressPct > 0 ? "On Progress" : "Open";

                  return (
                    <tr key={p.actionPlanId || idx}>
                      <td style={{ textAlign: "center", fontWeight: 600 }}>{p.clauseNo}</td>
                      <td style={{ whiteSpace: "pre-wrap" }}>{p.requirementText}</td>
                      <td>{p.actualCondition || "-"}</td>
                      <td>{p.planText}</td>
                      <td style={{ textAlign: "center", fontWeight: 600 }}>{p.picInitials || p.picName}</td>
                      <td style={{ textAlign: "center" }}>{formatDate(p.dueDate)}</td>
                      <td>
                        {p.verifiedByName ? (
                          <div style={{ fontSize: "7.5pt" }}>
                            <strong>Verified:</strong> {p.verifiedByName}
                            {p.verifiedAt && <div>{formatDate(p.verifiedAt)}</div>}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                      <td style={{ textAlign: "center", fontWeight: "bold" }}>
                        <span
                          style={{
                            color:
                              statusLabel === "Closed"
                                ? "#15803d"
                                : statusLabel === "On Progress"
                                ? "#b45309"
                                : "#b91c1c",
                          }}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td>{p.fulfillmentNotes || p.progressNotes || "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Signatures Box Lampiran 3 (Dibuat QS Supervisor, Ditinjau Manager Terkait, Disetujui QA Manager & QS Manager) */}
          <table className="report-table-wi" style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th style={{ width: "25%" }}>Dibuat oleh :</th>
                <th style={{ width: "25%" }}>Ditinjau oleh :</th>
                <th style={{ width: "25%" }}>Disetujui oleh :</th>
                <th style={{ width: "25%" }}>Disetujui oleh :</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="signature-box" style={{ height: "70px" }}>
                  <span className="stamp-badge">✓ E-SIGNATURE</span>
                  <div style={{ fontWeight: 600 }}>QS Supervisor</div>
                </td>
                <td className="signature-box" style={{ height: "70px" }}>
                  <span className="stamp-badge">✓ E-SIGNATURE</span>
                  <div style={{ fontWeight: 600 }}>Manager Terkait</div>
                </td>
                <td className="signature-box" style={{ height: "70px" }}>
                  <span className="stamp-badge">✓ E-SIGNATURE</span>
                  <div style={{ fontWeight: 600 }}>Manager QA</div>
                </td>
                <td className="signature-box" style={{ height: "70px" }}>
                  <span className="stamp-badge">✓ E-SIGNATURE</span>
                  <div style={{ fontWeight: 600 }}>Manager QS</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
