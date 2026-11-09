"use client";

import React, { useState } from "react";
import { exportToPdf, printDocument } from "./pdfHelper";

type Clause = {
  clauseNo: string;
  requirementText: string;
  isApplicable: boolean;
  deptInControlCode: string;
  coDeptCodes?: string[];
  inProcedure: boolean | null;
  inPractice: boolean | null;
  status: string | null;
  proposedStatus?: string | null;
  isInfo?: boolean;
  relatedDocument: string;
  actualCondition: string;
  actionPlanText: string;
  picInitials: string;
  dueDate: string | null;
  chapter?: string;
  sortOrder?: number;
};

type ChangeNote = {
  changeNoteId: number;
  newCount: number;
  changedCount: number;
  deletedCount: number;
  changePoints: string;
};

type Approval = {
  approvalId: number;
  stage: string;
  roleCode: string;
  roleName: string;
  departmentCode: string;
  assignedName: string;
  actedByName: string;
  onBehalfOfName: string;
  result: string;
  actedAt: string | null;
  signatureMeaning: string;
};

type GapDocDetail = {
  gapId: number;
  gapNo: string;
  legalNumber: string;
  regulationTitle: string;
  siteCode: string;
  siteName: string;
  effectiveDate: string;
  createdByName: string;
  verifiedByName?: string;
  verifiedAt?: string | null;
  clauses: Clause[];
  changeNotes?: ChangeNote[];
  approvals?: Approval[];
};

type Props = {
  doc: GapDocDetail;
  onClose: () => void;
};

export default function Lampiran1Modal({ doc, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);

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

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    const filename = `${doc.gapNo.replace(/\s+/g, "_")}_Lampiran1_Gap_Analysis`;
    await exportToPdf("lampiran-1-document", filename);
    setDownloading(false);
  };

  // Find stage 1 approvals
  const stage1Approvals = (doc.approvals || []).filter(
    (a) => a.stage === "STAGE1"
  );
  const managerArea = stage1Approvals.find((a) => a.roleCode === "MANAGER_AREA");
  const mgrQs = stage1Approvals.find((a) => a.roleCode === "CO_GAP_MANAGER");
  const mgrQa = stage1Approvals.find((a) => a.roleCode === "QA_MANAGER");
  const headQo = stage1Approvals.find((a) => a.roleCode === "QO_HEAD");

  return (
    <div className="report-modal-backdrop">
      <div className="report-modal-content">
        <div className="report-modal-toolbar">
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              Lampiran 1: Form Identifikasi, Evaluasi dan Rencana Pemenuhan
            </h3>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Dokumen Resmi WI-QO-QS-1023.04 (URS 010A/B) • {doc.gapNo}
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
              {downloading ? "Mengunduh PDF..." : "📥 Download PDF (Lampiran 1)"}
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

        <div className="report-container" id="lampiran-1-document">
          {/* Header Box */}
          <div className="report-header-box">
            <div className="report-title-main">
              IDENTIFIKASI, EVALUASI DAN RENCANA PEMENUHAN
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "55% 45%" }}>
              <div style={{ padding: "8px 12px", borderRight: "1px solid #000" }}>
                <strong>Judul :</strong> {doc.regulationTitle || "-"}
              </div>
              <div style={{ padding: "8px 12px" }}>
                <div style={{ marginBottom: "3px" }}>
                  <strong>Legal Number :</strong> {doc.legalNumber}
                </div>
                <div style={{ marginBottom: "3px" }}>
                  <strong>No Doc :</strong> {doc.gapNo}
                </div>
                <div>
                  <strong>Effective Date:</strong> {formatDate(doc.effectiveDate)}
                </div>
              </div>
            </div>
          </div>

          {/* Electronic Signatures Box (WI Lampiran 1 & URS 010B) */}
          <table className="report-table-wi" style={{ marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th style={{ width: "20%" }}>Dibuat oleh,</th>
                <th colSpan={4} style={{ width: "80%" }}>Disetujui oleh,</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {/* Dibuat oleh: QS Supervisor */}
                <td className="signature-box" style={{ width: "20%" }}>
                  <div style={{ fontWeight: 600 }}>QS Supervisor</div>
                  <div style={{ minHeight: "45px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    {doc.verifiedByName ? (
                      <span className="stamp-badge">
                        ✓ VERIFIED ERES<br />
                        {doc.verifiedByName}<br />
                        {formatDateTime(doc.verifiedAt)}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(Belum diverifikasi)</span>
                    )}
                  </div>
                  <div>( {doc.verifiedByName || "QS Supervisor"} )</div>
                </td>

                {/* Manager Terkait */}
                <td className="signature-box" style={{ width: "20%" }}>
                  <div style={{ fontWeight: 600 }}>Manager Terkait</div>
                  <div style={{ minHeight: "45px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    {managerArea?.result === "APPROVED" ? (
                      <span className="stamp-badge">
                        ✓ APPROVED ERES<br />
                        {managerArea.onBehalfOfName ? `Approved by ${managerArea.actedByName} on behalf of ${managerArea.onBehalfOfName}` : managerArea.actedByName || managerArea.assignedName}<br />
                        {formatDateTime(managerArea.actedAt)}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(Pending)</span>
                    )}
                  </div>
                  <div>( {managerArea?.actedByName || managerArea?.assignedName || "Manager Terkait"} )</div>
                </td>

                {/* QS Manager */}
                <td className="signature-box" style={{ width: "20%" }}>
                  <div style={{ fontWeight: 600 }}>QS Manager</div>
                  <div style={{ minHeight: "45px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    {mgrQs?.result === "APPROVED" ? (
                      <span className="stamp-badge">
                        ✓ APPROVED ERES<br />
                        {mgrQs.onBehalfOfName ? `Approved by ${mgrQs.actedByName} on behalf of ${mgrQs.onBehalfOfName}` : mgrQs.actedByName || mgrQs.assignedName}<br />
                        {formatDateTime(mgrQs.actedAt)}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(Pending)</span>
                    )}
                  </div>
                  <div>( {mgrQs?.actedByName || mgrQs?.assignedName || "QS Manager"} )</div>
                </td>

                {/* QA Manager Site */}
                <td className="signature-box" style={{ width: "20%" }}>
                  <div style={{ fontWeight: 600 }}>QA Manager Site</div>
                  <div style={{ minHeight: "45px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    {mgrQa?.result === "APPROVED" ? (
                      <span className="stamp-badge">
                        ✓ APPROVED ERES<br />
                        {mgrQa.onBehalfOfName ? `Approved by ${mgrQa.actedByName} on behalf of ${mgrQa.onBehalfOfName}` : mgrQa.actedByName || mgrQa.assignedName}<br />
                        {formatDateTime(mgrQa.actedAt)}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(Pending)</span>
                    )}
                  </div>
                  <div>( {mgrQa?.actedByName || mgrQa?.assignedName || "QA Manager Site"} )</div>
                </td>

                {/* QO Head */}
                <td className="signature-box" style={{ width: "20%" }}>
                  <div style={{ fontWeight: 600 }}>QO Head</div>
                  <div style={{ minHeight: "45px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    {headQo?.result === "APPROVED" ? (
                      <span className="stamp-badge">
                        ✓ FINAL APPROVED ERES<br />
                        {headQo.onBehalfOfName ? `Approved by ${headQo.actedByName} on behalf of ${headQo.onBehalfOfName}` : headQo.actedByName || headQo.assignedName}<br />
                        {formatDateTime(headQo.actedAt)}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(Pending)</span>
                    )}
                  </div>
                  <div>( {headQo?.actedByName || headQo?.assignedName || "QO Head"} )</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Matrix Clauses Table (19 Kolom WI Lampiran 1) */}
          <table className="report-table-wi">
            <thead>
              <tr>
                <th style={{ width: "4%" }}>Clausul</th>
                <th style={{ width: "22%" }}>Legal & other requirement Reference</th>
                <th style={{ width: "5%" }}>Applicability</th>
                <th style={{ width: "5%" }}>Dept In Control</th>
                <th style={{ width: "5%" }}>Co-Dept In Control</th>
                <th style={{ width: "5%" }}>Included in Procedure</th>
                <th style={{ width: "6%" }}>Is Performed In Actual Practice?</th>
                <th style={{ width: "5%" }}>Fulfillment Status</th>
                <th style={{ width: "10%" }}>Related Document</th>
                <th style={{ width: "13%" }}>Actual Condition / Gap</th>
                <th style={{ width: "11%" }}>Action Plan</th>
                <th style={{ width: "4%" }}>PIC</th>
                <th style={{ width: "5%" }}>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {doc.clauses.map((c, i) => {
                const statusVal = c.status || c.proposedStatus || (c.isInfo ? "INFO" : !c.isApplicable ? "N/A" : "-");
                const formattedStatus = statusVal === "100" ? "100%" : statusVal === "50" ? "50%" : statusVal === "0" ? "0%" : statusVal;

                return (
                  <tr key={i}>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{c.clauseNo}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>
                      {c.chapter && (
                        <div style={{ fontWeight: "bold", fontSize: "7.5pt", color: "#475569", marginBottom: "2px" }}>
                          [{c.chapter}]
                        </div>
                      )}
                      {c.requirementText}
                    </td>
                    <td style={{ textAlign: "center" }}>{c.isApplicable ? "Ya" : "Tidak"}</td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{c.deptInControlCode || "-"}</td>
                    <td style={{ textAlign: "center" }}>{(c.coDeptCodes && c.coDeptCodes.length > 0) ? c.coDeptCodes.join(", ") : "-"}</td>
                    <td style={{ textAlign: "center" }}>
                      {c.isInfo ? "-" : c.inProcedure === true ? "YA" : c.inProcedure === false ? "TIDAK" : "-"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {c.isInfo ? "-" : c.inPractice === true ? "YA" : c.inPractice === false ? "TIDAK" : "-"}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: "bold" }}>{formattedStatus}</td>
                    <td>{c.relatedDocument || "-"}</td>
                    <td>{c.actualCondition || "-"}</td>
                    <td>{c.actionPlanText || "-"}</td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{c.picInitials || "-"}</td>
                    <td style={{ textAlign: "center" }}>{c.dueDate ? formatDate(c.dueDate) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Catatan Perubahan (Kolom 19 WI Lampiran 1) */}
          <div style={{ marginTop: "1rem" }}>
            <div style={{ fontWeight: "bold", marginBottom: "4px", fontSize: "9pt" }}>
              Catatan Perubahan :
            </div>
            <table className="report-table-wi" style={{ maxWidth: "650px" }}>
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>No Doc</th>
                  <th style={{ width: "60%" }}>Poin Perubahan</th>
                </tr>
              </thead>
              <tbody>
                {doc.changeNotes && doc.changeNotes.length > 0 ? (
                  doc.changeNotes.map((cn) => (
                    <tr key={cn.changeNoteId}>
                      <td style={{ fontWeight: 600 }}>{doc.gapNo}</td>
                      <td>{cn.changePoints || "Dokumen baru"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td style={{ fontWeight: 600 }}>{doc.gapNo}</td>
                    <td>Dokumen baru</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
