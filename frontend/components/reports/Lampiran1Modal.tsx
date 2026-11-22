"use client";

import React, { useEffect, useState } from "react";
import ApprovedStamp from "./ApprovedStamp";
import { exportToPdf } from "./pdfHelper";
import { api } from "@/lib/api";

type EvidenceItem = {
  evidenceId: number;
  actionPlanId: number;
  evidenceType: "FILE" | "TEXT";
  evidenceText: string;
  fileName: string;
  mimeType: string;
};

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
  evidences?: EvidenceItem[];
  apVerifiedByName?: string;
  apVerifiedByInitials?: string;
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
  assignedInitials?: string;
  actedByInitials?: string;
  onBehalfOfInitials?: string;
  result: string;
  actedAt: string | null;
  signatureMeaning: string;
};

type ChangeNote = {
  changeNoteId: number;
  gapId?: number;
  gapNo?: string;
  revisionNo?: number;
  effectiveDate?: string;
  newCount: number;
  changedCount: number;
  deletedCount: number;
  changePoints: string;
  createdAt?: string;
};

type GapDocDetail = {
  gapId: number;
  gapNo: string;
  revisionNo?: number;
  legalNumber: string;
  regulationTitle: string;
  siteCode: string;
  siteName: string;
  effectiveDate: string;
  createdAt?: string | null;
  createdByName: string;
  createdByInitials?: string;
  verifiedByName?: string;
  verifiedByInitials?: string;
  verifiedAt?: string | null;
  clauses: Clause[];
  changeNotes?: ChangeNote[];
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
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatReviewDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "-";
    d.setFullYear(d.getFullYear() + 3);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

function formatTimestampWIB(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${month} ${day} ${year} ${hours}:${mins} WIB`;
  } catch {
    return "";
  }
}

function getDisplayInitials(explicitInitials?: string, fullName?: string): string {
  if (explicitInitials && explicitInitials.trim()) {
    return explicitInitials.trim().toUpperCase();
  }
  if (!fullName || !fullName.trim()) return "-";
  const clean = fullName
    .replace(/\(.*?\)/g, "")
    .replace(/^(dr\.|drg\.|prof\.|ir\.)\s*/i, "")
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return fullName.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  if (words.length === 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase();
}

export default function Lampiran1Modal({ doc, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [evidenceMap, setEvidenceMap] = useState<Record<number, EvidenceItem[]>>({});

  useEffect(() => {
    if (!doc.gapId) return;
    api<any[]>(`/api/gap-documents/${doc.gapId}/action-plans`)
      .then((plans) => {
        const m: Record<number, EvidenceItem[]> = {};
        for (const p of plans || []) {
          if (p.actionPlanId && p.evidences) {
            m[p.actionPlanId] = p.evidences;
          }
        }
        setEvidenceMap(m);
      })
      .catch(() => {});
  }, [doc.gapId]);

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
  const latestStage1Cycle = allStage1.reduce((mx, a) => Math.max(mx, a.cycleNo || 1), 0);
  const stage1Approvals = latestStage1Cycle > 0
    ? allStage1.filter((a) => (a.cycleNo || 1) === latestStage1Cycle)
    : allStage1;

  // Pick the latest STAGE2 approval cycle (only present if document proceeded to Stage 2)
  const allStage2 = (doc.approvals || []).filter((a) => a.stage === "STAGE2");
  const latestStage2Cycle = allStage2.reduce((mx, a) => Math.max(mx, a.cycleNo || 1), 0);
  const stage2Approvals = latestStage2Cycle > 0
    ? allStage2.filter((a) => (a.cycleNo || 1) === latestStage2Cycle)
    : allStage2;
  const hasStage2 = stage2Approvals.length > 0;

  const buildApprovalSlots = (
    list: Approval[],
    includeQoHead: boolean
  ): { key: string; roleLabel: string; item?: Approval }[] => {
    const managerAreas = list.filter((a) => a.roleCode === "MANAGER_AREA");
    const mgrQs = list.find((a) => a.roleCode === "CO_GAP_MANAGER");
    const mgrQa = list.find(
      (a) => a.roleCode === "QA_MANAGER" && a.result !== "SKIPPED"
    );
    const headQo = includeQoHead
      ? list.find((a) => a.roleCode === "QO_HEAD")
      : undefined;

    return [
      { key: "qs-mgr", roleLabel: "QS Manager", item: mgrQs },
      ...(mgrQa
        ? [
            {
              key: "qa-mgr",
              roleLabel: doc.siteCode ? `QA Manager ${doc.siteCode}` : "QA Manager",
              item: mgrQa,
            },
          ]
        : []),
      ...(managerAreas.length > 0
        ? managerAreas.map((m, idx) => ({
            key: `mgr-area-${m.approvalId}-${idx}`,
            roleLabel: m.departmentCode ? `Manager Area (${m.departmentCode})` : "Manager Area",
            item: m,
          }))
        : [{ key: "mgr-area-empty", roleLabel: "Manager Area", item: undefined }]),
      ...(includeQoHead ? [{ key: "qo-head", roleLabel: "QO Div. Head", item: headQo }] : []),
    ];
  };

  const stage1Slots = buildApprovalSlots(stage1Approvals, true);
  const stage2Slots = hasStage2 ? buildApprovalSlots(stage2Approvals, false) : [];

  const renderApprovalGrid = (
    slots: { key: string; roleLabel: string; item?: Approval }[]
  ) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))`,
        gap: "6px",
      }}
    >
      {slots.map((slot) => {
        const isApproved = slot.item?.result === "APPROVED";
        const signerInitial = slot.item
          ? slot.item.onBehalfOfName
            ? `${getDisplayInitials(slot.item.actedByInitials, slot.item.actedByName)} (o/b ${getDisplayInitials(slot.item.onBehalfOfInitials, slot.item.onBehalfOfName)})`
            : getDisplayInitials(
                slot.item.actedByInitials || slot.item.assignedInitials,
                slot.item.actedByName || slot.item.assignedName
              )
          : "-";
        const timestampStr = isApproved ? formatTimestampWIB(slot.item?.actedAt) : "";

        return (
          <div key={slot.key} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "5pt", color: "#333333", minHeight: "11px", lineHeight: 1.1 }}>
              {timestampStr}
            </div>
            <div
              style={{
                minHeight: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isApproved ? <ApprovedStamp width={62} height={18} /> : <div style={{ height: "18px" }} />}
            </div>
            <div
              style={{
                fontWeight: 700,
                marginTop: "2px",
                fontSize: "7.5pt",
                letterSpacing: "0.5px",
              }}
            >
              {signerInitial}
            </div>
            <div style={{ fontSize: "6pt", color: "#111111" }}>({slot.roleLabel})</div>
          </div>
        );
      })}
    </div>
  );

  const thStyle: React.CSSProperties = {
    backgroundColor: "#00b050",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "5.5pt",
    textAlign: "center",
    verticalAlign: "middle",
    border: "1px solid #000000",
    padding: "3px 2px",
    lineHeight: 1.15,
    wordBreak: "break-word",
  };

  const tdBase: React.CSSProperties = {
    border: "1px solid #000000",
    padding: "2.5px 2.5px",
    fontSize: "5.5pt",
    lineHeight: 1.2,
    verticalAlign: "middle",
    color: "#000000",
    wordBreak: "break-word",
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
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? "Preparing PDF..." : "Download PDF"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div
          id="lampiran-1-document"
          style={{
            background: "#ffffff",
            color: "#000000",
            fontFamily: "Arial, Helvetica, sans-serif",
            padding: "14px 16px 56px 16px",
            position: "relative",
            minHeight: "640px",
            boxSizing: "border-box",
          }}
        >
          {/* Top Document Title & Metadata matching PDF template */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "170px 1fr 220px",
              alignItems: "center",
              marginBottom: "8px",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <img
                src="/logo-kch.png"
                alt="Kalbe Consumer Health"
                style={{
                  maxHeight: "42px",
                  maxWidth: "165px",
                  objectFit: "contain",
                }}
              />
            </div>
            <div style={{ textAlign: "center" }}>
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
                <tr>
                  <td style={{ padding: "1px 6px 1px 0", textAlign: "left" }}>Review Date</td>
                  <td style={{ padding: "1px 4px" }}>:</td>
                  <td style={{ padding: "1px 0", textAlign: "left" }}>
                    {formatReviewDate(doc.effectiveDate)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Signatures Area ("Dibuat Oleh," & "Disetujui Oleh,") */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.7fr 3.3fr",
              gap: "12px",
              marginBottom: "8px",
              fontSize: "6.5pt",
              color: "#000000",
            }}
          >
            {/* Dibuat Oleh (Dapat memuat Staff pembuat & Supervisor pemeriksa) */}
            <div>
              <div style={{ textAlign: "center", marginBottom: "3px", fontWeight: 600 }}>Dibuat Oleh,</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {/* 1. Co Gap / QS Staff (Pembuat / Drafter) */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "5pt", color: "#333333", minHeight: "11px", lineHeight: 1.1 }}>
                    {formatTimestampWIB(doc.createdAt || doc.effectiveDate)}
                  </div>
                  <div
                    style={{
                      minHeight: "22px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {doc.createdByName ? <ApprovedStamp width={58} height={17} /> : <div style={{ height: "17px" }} />}
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      marginTop: "2px",
                      fontSize: "7.5pt",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {getDisplayInitials(doc.createdByInitials, doc.createdByName)}
                  </div>
                  <div style={{ fontSize: "6pt", color: "#111111" }}>(QS Staff)</div>
                </div>

                {/* 2. Co Gap / QS Supervisor (Pemeriksa / Verifikator) */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "5pt", color: "#333333", minHeight: "11px", lineHeight: 1.1 }}>
                    {doc.verifiedByName ? formatTimestampWIB(doc.verifiedAt) : ""}
                  </div>
                  <div
                    style={{
                      minHeight: "22px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {doc.verifiedByName ? <ApprovedStamp width={58} height={17} /> : <div style={{ height: "17px" }} />}
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      marginTop: "2px",
                      fontSize: "7.5pt",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {doc.verifiedByName
                      ? getDisplayInitials(doc.verifiedByInitials, doc.verifiedByName)
                      : "-"}
                  </div>
                  <div style={{ fontSize: "6pt", color: "#111111" }}>(QS Supervisor)</div>
                </div>
              </div>
            </div>

            {/* Disetujui Oleh (Stage 1, dan Stage 2 jika melewati tahap Closure) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div>
                <div style={{ textAlign: "center", marginBottom: "3px", fontWeight: 600 }}>
                  {hasStage2 ? "Disetujui Oleh — Stage 1 (Gap & Action Plan)," : "Disetujui Oleh,"}
                </div>
                {renderApprovalGrid(stage1Slots)}
              </div>

              {hasStage2 && (
                <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "5px" }}>
                  <div style={{ textAlign: "center", marginBottom: "3px", fontWeight: 600 }}>
                    Disetujui Oleh — Stage 2 (Closure),
                  </div>
                  {renderApprovalGrid(stage2Slots)}
                </div>
              )}
            </div>
          </div>

          {/* Historical Change Notes Summary Table (for Revised Regulations — URS 005E & 007C) */}
          {(() => {
            const notes = [...(doc.changeNotes || [])].sort(
              (a, b) => (a.revisionNo ?? 0) - (b.revisionNo ?? 0) || a.changeNoteId - b.changeNoteId
            );
            const isRevised =
              (doc.revisionNo ?? 0) > 0 ||
              notes.length > 1 ||
              notes.some((n) => (n.revisionNo ?? 0) > 0);
            if (!isRevised || notes.length === 0) return null;

            return (
              <div style={{ marginBottom: "8px" }}>
                <div
                  style={{
                    fontSize: "6pt",
                    fontWeight: 700,
                    marginBottom: "3px",
                    textTransform: "uppercase",
                    letterSpacing: "0.2px",
                  }}
                >
                  Riwayat Perubahan / Change Notes
                </div>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    tableLayout: "fixed",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: "5%" }}>Rev</th>
                      <th style={{ ...thStyle, width: "16%" }}>No. Dokumen Gap</th>
                      <th style={{ ...thStyle, width: "12%" }}>Effective Date</th>
                      <th style={{ ...thStyle, width: "6%" }}>New</th>
                      <th style={{ ...thStyle, width: "7%" }}>Changed</th>
                      <th style={{ ...thStyle, width: "7%" }}>Deleted</th>
                      <th style={{ ...thStyle, width: "47%" }}>Change Points Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((cn) => (
                      <tr key={cn.changeNoteId} style={{ backgroundColor: "#ffffff" }}>
                        <td style={{ ...tdBase, textAlign: "center", fontWeight: 700 }}>
                          {String(cn.revisionNo ?? 0).padStart(2, "0")}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center", fontWeight: 600 }}>
                          {cn.gapNo || doc.gapNo}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          {formatDateShort(cn.effectiveDate || cn.createdAt)}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>{cn.newCount}</td>
                        <td style={{ ...tdBase, textAlign: "center" }}>{cn.changedCount}</td>
                        <td style={{ ...tdBase, textAlign: "center" }}>{cn.deletedCount}</td>
                        <td style={{ ...tdBase, whiteSpace: "pre-wrap" }}>
                          {cn.changePoints || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

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
                <th style={{ ...thStyle, width: "3.0%" }}>Clause</th>
                <th style={{ ...thStyle, width: "16.0%" }}>{doc.legalNumber}</th>
                <th style={{ ...thStyle, width: "3.0%" }}>Applicability</th>
                <th style={{ ...thStyle, width: "4.2%" }}>Dept In Control</th>
                <th style={{ ...thStyle, width: "4.2%" }}>Co-Dept In Control</th>
                <th style={{ ...thStyle, width: "3.6%" }}>Included In Procedure</th>
                <th style={{ ...thStyle, width: "4.0%" }}>Is Performed In Actual Practices</th>
                <th style={{ ...thStyle, width: "3.6%" }}>Fulfillment Status</th>
                <th style={{ ...thStyle, width: "7.0%" }}>Related Document</th>
                <th style={{ ...thStyle, width: "9.8%" }}>Actual Condition/Gap</th>
                <th style={{ ...thStyle, width: "9.2%" }}>Action Plan</th>
                <th style={{ ...thStyle, width: "2.6%" }}>PIC</th>
                <th style={{ ...thStyle, width: "4.4%" }}>Due Date</th>
                <th style={{ ...thStyle, width: "14.0%" }}>Bukti Pemenuhan</th>
                <th style={{ ...thStyle, width: "7.0%" }}>QS Verification</th>
                <th style={{ ...thStyle, width: "4.4%" }}>Status</th>
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
                    fontSize: "6pt",
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
                            fontSize: "6pt",
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
                        <td style={{ ...tdBase, textAlign: "center", fontWeight: 700 }}>INFO</td>
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
                        <td style={{ ...tdBase, verticalAlign: "top", textAlign: "left" }}>
                          {(() => {
                            if (naCell) return "";
                            const planEvidences =
                              (c.actionPlanId && evidenceMap[c.actionPlanId]) ||
                              c.evidences ||
                              [];

                            if (planEvidences.length > 0) {
                              return (
                                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                  {planEvidences.map((ev) => {
                                    const isImg =
                                      ev.evidenceType === "FILE" &&
                                      (ev.mimeType?.startsWith("image/") ||
                                        /\.(png|jpe?g|webp|gif|bmp)$/i.test(ev.fileName || ""));

                                    return (
                                      <div key={ev.evidenceId} style={{ textAlign: "center" }}>
                                        {isImg ? (
                                          <div>
                                            <img
                                              src={`/api/evidences/${ev.evidenceId}/file`}
                                              alt={ev.fileName || "Evidence"}
                                              crossOrigin="anonymous"
                                              style={{
                                                maxWidth: "100%",
                                                maxHeight: "70px",
                                                height: "auto",
                                                objectFit: "contain",
                                                display: "block",
                                                margin: "0 auto 2px",
                                                borderRadius: "2px",
                                                border: "1px solid #777",
                                                backgroundColor: "#ffffff",
                                              }}
                                            />
                                          </div>
                                        ) : ev.evidenceType === "FILE" ? (
                                          <div style={{ fontSize: "5pt", fontWeight: 600, color: "#111", wordBreak: "break-all" }}>
                                            {ev.fileName}
                                          </div>
                                        ) : null}

                                        {ev.evidenceText ? (
                                          <div
                                            style={{
                                              fontSize: "4.8pt",
                                              color: "#111",
                                              whiteSpace: "pre-wrap",
                                              wordBreak: "break-word",
                                              textAlign: "left",
                                              marginTop: "1px",
                                            }}
                                          >
                                            {ev.evidenceText}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }

                            if (c.evidenceSummary) {
                              return (
                                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "5pt" }}>
                                  {c.evidenceSummary}
                                </div>
                              );
                            }

                            return "-";
                          })()}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center", fontWeight: 600 }}>
                          {naCell
                            ? ""
                            : c.apVerifiedByName || c.apVerifiedByInitials
                            ? getDisplayInitials(c.apVerifiedByInitials, c.apVerifiedByName)
                            : ""}
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>{execStatusLabel}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {/* Table footer spacer to reserve clearance for fixed page footer */}
            <tfoot>
              <tr>
                <td
                  colSpan={16}
                  style={{
                    border: "none",
                    height: "46px",
                    padding: 0,
                  }}
                />
              </tr>
            </tfoot>
          </table>

          {/* True Page Footer fixed at bottom */}
          <div
            className="lampiran-page-footer"
            style={{
              position: "absolute",
              bottom: "10px",
              left: "16px",
              right: "16px",
              backgroundColor: "#ffffff",
              paddingTop: "4px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "start",
                fontSize: "5.5pt",
                color: "#111111",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ lineHeight: 1.25, fontWeight: 500 }}>
                  Dokumen ini telah ditandatangani secara elektronik menggunakan aplikasi FUPD Online dengan melampirkan lembar persetujuan elektronik
                </div>
                <div style={{ lineHeight: 1.25, fontWeight: 500 }}>
                  milik Kalbe Consumer Health ( A Kalbe Company )
                </div>
                <div style={{ marginTop: "4px" }}>
                  <ApprovedStamp width={66} height={19} />
                </div>
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: "5.5pt",
                  whiteSpace: "nowrap",
                  paddingLeft: "12px",
                }}
              >
                <div style={{ fontWeight: 700 }}>Lampiran 1 :WI-QO-QS-1023 rev.03</div>
                <div style={{ marginTop: "14px", color: "#333333" }}>Halaman : 1/1</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
