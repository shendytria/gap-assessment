"use client";

import React, { useState } from "react";
import ApprovedStamp from "./ApprovedStamp";
import { exportToPdf, printDocument } from "./pdfHelper";

type Clause = {
  clauseNo: string;
  clauseTitle?: string;
  requirementText: string;
  isApplicable: boolean;
  deptInControlCode: string;
  deptInControlCodes?: string[];
  deptInControlAll?: boolean;
  coDeptCodes?: string[];
  coDeptAll?: boolean;
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
  actionPlanId?: number | null;
  executionStatus?: string;
  evidenceSummary?: string;
  apVerifiedByName?: string;
  chapter?: string;
  sortOrder?: number;
};

type Approval = {
  approvalId: number;
  stage: string;
  cycleNo?: number;
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
  approvals?: Approval[];
};

type Props = {
  doc: GapDocDetail;
  onClose: () => void;
};

function formatDateShort(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function Lampiran1Modal({ doc, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const filename = `${doc.gapNo.replace(/\s+/g, "_")}_Lampiran1_Gap_Analysis`;
      await exportToPdf("lampiran-1-document", filename);
    } finally {
      setDownloading(false);
    }
  };

  // Pick the latest STAGE1 approval cycle
  const allStage1 = (doc.approvals || []).filter((a) => a.stage === "STAGE1");
  const latestCycle = allStage1.reduce((mx, a) => Math.max(mx, a.cycleNo || 1), 0);
  const stage1Approvals = latestCycle > 0
    ? allStage1.filter((a) => (a.cycleNo || 1) === latestCycle)
    : allStage1;

  const managerAreas = stage1Approvals.filter((a) => a.roleCode === "MANAGER_AREA");
  const mgrQs = stage1Approvals.find((a) => a.roleCode === "CO_GAP_MANAGER");
  const mgrQa = stage1Approvals.find(
    (a) => a.roleCode === "QA_MANAGER" && a.result !== "SKIPPED"
  );
  const headQo = stage1Approvals.find((a) => a.roleCode === "QO_HEAD");

  const approvalSlots: { key: string; roleLabel: string; item?: Approval }[] = [
    ...(managerAreas.length > 0
      ? managerAreas.map((m, idx) => ({
          key: `mgr-area-${m.approvalId}-${idx}`,
          roleLabel: m.departmentCode ? `Manager Area (${m.departmentCode})` : "Manager Area",
          item: m,
        }))
      : [{ key: "mgr-area-empty", roleLabel: "Manager Area", item: undefined }]),
    { key: "qs-mgr", roleLabel: "QS Manager", item: mgrQs },
    ...(mgrQa ? [{ key: "qa-mgr", roleLabel: "QA Manager", item: mgrQa }] : []),
    { key: "qo-head", roleLabel: "QO Div. Head", item: headQo },
  ];

  const thStyle: React.CSSProperties = {
    backgroundColor: "#00b050",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "6.8pt",
    textAlign: "center",
    verticalAlign: "middle",
    border: "1px solid #000000",
    padding: "4px 3px",
    lineHeight: 1.2,
  };

  const tdBase: React.CSSProperties = {
    border: "1px solid #000000",
    padding: "3px 4px",
    fontSize: "6.8pt",
    lineHeight: 1.28,
    verticalAlign: "middle",
    color: "#000000",
  };

  return (
    <div className="report-modal-backdrop">
      <div className="report-modal-content">
        <div className="report-modal-toolbar">
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
              Lampiran 1: Identifikasi, Evaluasi dan Rencana Pemenuhan
            </h3>
            <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
              {doc.gapNo} • {doc.legalNumber}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-ghost" onClick={printDocument}>
              Cetak / Print
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? "Mengunduh PDF..." : "Download PDF (Lampiran 1)"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              ✕ Tutup
            </button>
          </div>
        </div>

        <div
          id="lampiran-1-document"
          style={{
            background: "#ffffff",
            color: "#000000",
            fontFamily: "Arial, Helvetica, sans-serif",
            padding: "14px 16px",
          }}
        >
          {/* Top Document Title & Metadata matching PDF template */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 220px",
              alignItems: "start",
              marginBottom: "6px",
            }}
          >
            <div style={{ textAlign: "center", paddingLeft: "110px" }}>
              <div style={{ fontSize: "10.5pt", fontWeight: 700, letterSpacing: "0.2px" }}>
                IDENTIFIKASI, EVALUASI DAN RENCANA PEMENUHAN
              </div>
              <div
                style={{
                  fontSize: "9.5pt",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  marginTop: "2px",
                }}
              >
                {doc.regulationTitle || "-"}
              </div>
            </div>
            <table
              style={{
                borderCollapse: "collapse",
                fontSize: "7.5pt",
                fontWeight: 700,
                justifySelf: "end",
              }}
            >
              <tbody>
                <tr>
                  <td style={{ padding: "1px 6px 1px 0", textAlign: "left" }}>No</td>
                  <td style={{ padding: "1px 4px" }}>:</td>
                  <td style={{ padding: "1px 0", textAlign: "left" }}>{doc.gapNo}</td>
                </tr>
                <tr>
                  <td style={{ padding: "1px 6px 1px 0", textAlign: "left" }}>Effective Date</td>
                  <td style={{ padding: "1px 4px" }}>:</td>
                  <td style={{ padding: "1px 0", textAlign: "left" }}>
                    {formatDateShort(doc.effectiveDate)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Signatures Area ("Dibuat Oleh," & "Disetujui Oleh,") */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 3fr",
              gap: "12px",
              marginBottom: "6px",
              fontSize: "7pt",
              color: "#000000",
            }}
          >
            {/* Dibuat Oleh */}
            <div>
              <div style={{ textAlign: "center", marginBottom: "4px" }}>Dibuat Oleh,</div>
              <div style={{ display: "flex", justifyContent: "center", gap: "18px" }}>
                <div style={{ textAlign: "center", minWidth: "95px" }}>
                  <div
                    style={{
                      minHeight: "24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {doc.verifiedByName ? <ApprovedStamp width={66} height={19} /> : null}
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      textDecoration: "underline",
                      marginTop: "2px",
                    }}
                  >
                    {doc.verifiedByName || doc.createdByName || "QS Supervisor"}
                  </div>
                  <div>(QS Supervisor)</div>
                </div>
              </div>
            </div>

            {/* Disetujui Oleh */}
            <div>
              <div style={{ textAlign: "center", marginBottom: "4px" }}>Disetujui Oleh,</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${approvalSlots.length}, minmax(0, 1fr))`,
                  gap: "8px",
                }}
              >
                {approvalSlots.map((slot) => {
                  const isApproved = slot.item?.result === "APPROVED";
                  const signerName = slot.item
                    ? slot.item.onBehalfOfName
                      ? `${slot.item.actedByName} (o/b ${slot.item.onBehalfOfName})`
                      : slot.item.actedByName || slot.item.assignedName
                    : "-";
                  return (
                    <div key={slot.key} style={{ textAlign: "center" }}>
                      <div
                        style={{
                          minHeight: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isApproved ? <ApprovedStamp width={66} height={19} /> : null}
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          textDecoration: "underline",
                          marginTop: "2px",
                        }}
                      >
                        {signerName}
                      </div>
                      <div>({slot.roleLabel})</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 16-Column Matrix Table matching PDF template colors & layout */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "3.6%" }}>Clausul</th>
                <th style={{ ...thStyle, width: "20%" }}>{doc.legalNumber}</th>
                <th style={{ ...thStyle, width: "4.6%" }}>Applicability</th>
                <th style={{ ...thStyle, width: "4.8%" }}>Dept In Control</th>
                <th style={{ ...thStyle, width: "4.8%" }}>Co-Dept In Control</th>
                <th style={{ ...thStyle, width: "4.6%" }}>Included In Procedure</th>
                <th style={{ ...thStyle, width: "5.2%" }}>Is Performed In Actual Practices</th>
                <th style={{ ...thStyle, width: "4.8%" }}>Fullfillment Status</th>
                <th style={{ ...thStyle, width: "9.4%" }}>Related Document</th>
                <th style={{ ...thStyle, width: "13%" }}>Actual Condition/Gap</th>
                <th style={{ ...thStyle, width: "10.2%" }}>Action Plan</th>
                <th style={{ ...thStyle, width: "3.4%" }}>PIC</th>
                <th style={{ ...thStyle, width: "4.4%" }}>Due Date</th>
                <th style={{ ...thStyle, width: "3.4%" }}>Bukti Pemenuhan</th>
                <th style={{ ...thStyle, width: "2.2%" }}>QS Verification</th>
                <th style={{ ...thStyle, width: "1.6%" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Light-blue Legal Number banner row */}
              <tr>
                <td
                  colSpan={16}
                  style={{
                    ...tdBase,
                    backgroundColor: "#9bc2e6",
                    fontWeight: 700,
                    fontSize: "7.2pt",
                    padding: "2px 4px",
                  }}
                >
                  {doc.legalNumber}
                </td>
              </tr>

              {doc.clauses.map((c, idx) => {
                const prevChapter = idx > 0 ? (doc.clauses[idx - 1].chapter || "").trim() : "";
                const currChapter = (c.chapter || "").trim();
                const showChapterBanner = currChapter !== "" && currChapter !== prevChapter;

                const statusRaw = c.isInfo
                  ? "INFO"
                  : !c.isApplicable
                  ? "NA"
                  : c.status || c.proposedStatus || "-";
                const formattedStatus =
                  statusRaw === "100"
                    ? "100%"
                    : statusRaw === "50"
                    ? "50%"
                    : statusRaw === "0"
                    ? "0%"
                    : statusRaw;

                const deptDisplay = c.deptInControlAll
                  ? "All dept"
                  : c.deptInControlCodes && c.deptInControlCodes.length > 0
                  ? c.deptInControlCodes.join(", ")
                  : c.deptInControlCode || "-";

                const coDeptDisplay = c.coDeptAll
                  ? "All dept"
                  : c.coDeptCodes && c.coDeptCodes.length > 0
                  ? c.coDeptCodes.join(", ")
                  : "-";

                const isComply100 =
                  c.isApplicable && !c.isInfo && c.inProcedure === true && c.inPractice === true;
                const naCell = isComply100 || !c.isApplicable || c.isInfo;

                const execStatusLabel = naCell
                  ? ""
                  : c.executionStatus === "VERIFIED"
                  ? "Closed"
                  : c.executionStatus === "PENDING_VERIFICATION"
                  ? "Pending"
                  : c.actionPlanId
                  ? "Open"
                  : "";

                return (
                  <React.Fragment key={`${c.clauseNo}-${idx}`}>
                    {showChapterBanner && (
                      <tr>
                        <td
                          colSpan={16}
                          style={{
                            ...tdBase,
                            backgroundColor: "#ffff00",
                            fontWeight: 700,
                            fontSize: "7.2pt",
                            padding: "2px 4px",
                          }}
                        >
                          {currChapter}
                        </td>
                      </tr>
                    )}

                    {c.isInfo ? (
                      <tr style={{ backgroundColor: "#e2efda" }}>
                        <td style={{ ...tdBase, textAlign: "center", fontWeight: 700 }}>
                          {c.clauseNo}
                        </td>
                        <td style={{ ...tdBase, whiteSpace: "pre-wrap" }}>
                          {c.clauseTitle ? (
                            <div style={{ fontWeight: 700 }}>{c.clauseTitle}</div>
                          ) : null}
                          {c.requirementText}
                        </td>
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={{ ...tdBase, fontWeight: 600 }}>Bersifat informatif</td>
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={tdBase} />
                        <td style={tdBase} />
                      </tr>
                    ) : (
                      <tr style={{ backgroundColor: "#ffffff" }}>
                        <td style={{ ...tdBase, textAlign: "center" }}>{c.clauseNo}</td>
                        <td style={{ ...tdBase, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {c.clauseTitle ? (
                            <div style={{ fontWeight: 700, marginBottom: "1px" }}>
                              {c.clauseTitle}
                            </div>
                          ) : null}
                          {c.requirementText}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          {c.isApplicable ? "YA" : "TIDAK"}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>{deptDisplay}</td>
                        <td style={{ ...tdBase, textAlign: "center" }}>{coDeptDisplay}</td>
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          {!c.isApplicable
                            ? "-"
                            : c.inProcedure === true
                            ? "YA"
                            : c.inProcedure === false
                            ? "TIDAK"
                            : "-"}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          {!c.isApplicable
                            ? "-"
                            : c.inPractice === true
                            ? "YA"
                            : c.inPractice === false
                            ? "TIDAK"
                            : "-"}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center", fontWeight: 600 }}>
                          {formattedStatus}
                        </td>
                        <td style={{ ...tdBase, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {c.relatedDocument || "-"}
                        </td>
                        <td style={{ ...tdBase, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {c.actualCondition || "-"}
                        </td>
                        <td style={{ ...tdBase, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {naCell ? "N/A" : c.actionPlanText || "-"}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          {naCell ? "N/A" : c.picInitials || "-"}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          {naCell ? "N/A" : c.dueDate ? formatDateShort(c.dueDate) : "-"}
                        </td>
                        <td style={{ ...tdBase, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {naCell ? "" : c.evidenceSummary || ""}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          {naCell ? "" : c.apVerifiedByName || ""}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>{execStatusLabel}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
