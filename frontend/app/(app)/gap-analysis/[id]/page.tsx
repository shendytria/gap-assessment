"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import Lampiran1Modal from "@/components/reports/Lampiran1Modal";

type DeptOption = { id: number; code: string; name: string };

type GapAnalysisRow = {
  gapAnalysisId: number;
  gapId: number;
  clauseId: number;
  sortOrder: number;
  chapter: string;
  clauseNo: string;
  clauseTitle: string;
  requirementText: string;
  isInfo: boolean;
  isApplicable: boolean;
  deptInControlId: number | null;
  deptInControlCode: string;
  deptInControlName: string;
  deptInControlAll: boolean;
  deptInControlIds: number[];
  deptInControlCodes: string[];
  coDeptAll: boolean;
  coDeptIds: number[];
  coDeptCodes: string[];
  inProcedure: boolean | null;
  inPractice: boolean | null;
  actualCondition: string;
  relatedDocument: string;
  proposedStatus: string | null;
  status: string | null;
  actionPlanId: number | null;
  actionPlanText: string;
  picUserId: number | null;
  picInitials: string;
  dueDate: string | null;
  verifiedByName: string;
  verifiedAt: string | null;
  verificationNotes: string;
};

type GapDocDetail = {
  gapId: number;
  gapNo: string;
  regulationId: number;
  legalNumber: string;
  regulationTitle: string;
  siteId: number;
  siteCode: string;
  siteName: string;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  workflowStatus: string;
  revisionNo: number;
  effectiveDate: string;
  totalClauses: number;
  totalApplicable: number;
  count100: number;
  count50: number;
  count0: number;
  pct100: number;
  pct50: number;
  pct0: number;
  createdByName: string;
  createdAt: string;
  verifiedByName?: string;
  verifiedAt?: string | null;
  returnNotes?: string;
  returnedAt?: string | null;
  returnedByName?: string;
  changeNotes?: any[];
  approvals?: any[];
  clauses: GapAnalysisRow[];
};

function DeptMultiSelect({
  departments,
  selectedIds,
  isAll,
  disabled,
  allLabel = "All dept",
  onChange,
}: {
  departments: DeptOption[];
  selectedIds: number[];
  isAll: boolean;
  disabled: boolean;
  allLabel?: string;
  onChange: (nextIds: number[], nextCodes: string[], nextAll: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; minWidth: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    const updatePosition = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuWidth = Math.max(230, rect.width);
      const preferredHeight = 220;
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const openUpward = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(preferredHeight, openUpward ? spaceAbove : spaceBelow));
      const top = openUpward
        ? Math.max(margin, rect.top - maxHeight - 4)
        : Math.min(window.innerHeight - maxHeight - margin, rect.bottom + 4);
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin));
      setCoords({ top, left, minWidth: menuWidth, maxHeight });
    };

    updatePosition();

    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      setOpen(false);
    };

    const onResize = () => setOpen(false);

    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const selectedDepts = departments.filter((d) => selectedIds.includes(d.id));
  const summaryText = isAll
    ? allLabel
    : selectedDepts.length > 0
    ? selectedDepts.map((d) => d.code).join(", ")
    : "— Select —";

  const toggleAll = () => {
    if (isAll) {
      onChange([], [], false);
    } else {
      onChange([], [], true);
    }
  };

  const toggleDept = (dept: DeptOption) => {
    const exists = selectedIds.includes(dept.id);
    const nextIds = exists ? selectedIds.filter((id) => id !== dept.id) : [...selectedIds, dept.id];
    const nextCodes = departments.filter((d) => nextIds.includes(d.id)).map((d) => d.code);
    onChange(nextIds, nextCodes, false);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="filter-select"
        style={{
          width: "100%",
          minHeight: "38px",
          height: "38px",
          padding: "0 0.55rem",
          fontSize: "0.8rem",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.35rem",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
        title={isAll ? allLabel : selectedDepts.map((d) => `${d.code} - ${d.name}`).join(", ") || "Select departments"}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summaryText}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, color: "var(--text)" }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        !disabled &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            onWheel={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 9999,
              minWidth: `${coords.minWidth}px`,
              maxHeight: `${coords.maxHeight}px`,
              overflowY: "auto",
              overscrollBehavior: "contain",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
              padding: "0.35rem",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.3rem 0.4rem",
                borderBottom: "1px solid var(--border)",
                marginBottom: "0.25rem",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.78rem",
              }}
            >
              <input
                type="checkbox"
                checked={isAll}
                onChange={toggleAll}
                style={{ width: "14px", height: "14px", margin: 0, accentColor: "var(--primary)" }}
              />
              <span>{allLabel}</span>
            </label>
            {departments.map((d) => {
              const checked = !isAll && selectedIds.includes(d.id);
              return (
                <label
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.25rem 0.4rem",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    background: checked ? "var(--info-bg)" : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDept(d)}
                    style={{ width: "14px", height: "14px", margin: 0, accentColor: "var(--primary)" }}
                  />
                  <span>
                    <strong>{d.code}</strong> - {d.name}
                  </span>
                </label>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

function RelatedDocsEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (nextValue: string) => void;
}) {
  const docs = value ? value.split("\n") : [""];

  const updateAt = (idx: number, next: string) => {
    const copy = [...docs];
    copy[idx] = next;
    onChange(copy.join("\n"));
  };

  const addDoc = () => {
    onChange([...docs, ""].join("\n"));
  };

  const removeAt = (idx: number) => {
    const copy = docs.filter((_, i) => i !== idx);
    onChange(copy.length > 0 ? copy.join("\n") : "");
  };

  if (disabled) {
    return (
      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.78rem", color: "var(--muted)" }}>
        {value?.trim() ? value : "—"}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {docs.map((item, idx) => (
        <div key={idx} style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
          <input
            type="text"
            className="filter-input"
            placeholder={idx === 0 ? "e.g., WI-QO-QS-1024 ..." : "Other related docs..."}
            style={{ flex: 1, padding: "0.2rem 0.45rem", height: "28px", fontSize: "0.78rem" }}
            value={item}
            onChange={(e) => updateAt(idx, e.target.value)}
          />
          {docs.length > 1 && (
            <button
              type="button"
              onClick={() => removeAt(idx)}
              title="Remove document"
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "0 0.35rem",
                height: "28px",
                fontSize: "0.75rem",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addDoc}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "1px dashed var(--border)",
          borderRadius: "4px",
          padding: "0.15rem 0.45rem",
          fontSize: "0.72rem",
          color: "var(--primary)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + Add Doc
      </button>
    </div>
  );
}

function DecisionOptionCard({
  name,
  selected,
  tone = "primary",
  title,
  description,
  onSelect,
}: {
  name: string;
  selected: boolean;
  tone?: "primary" | "danger";
  title: string;
  description: string;
  onSelect: () => void;
}) {
  const accent = tone === "danger" ? "#c52a2a" : "var(--primary)";
  const activeBg = tone === "danger" ? "#fef2f2" : "var(--ok-bg)";
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.65rem",
        padding: "0.72rem 0.9rem",
        borderRadius: "10px",
        border: selected ? `1px solid ${accent}` : "1px solid var(--border)",
        boxShadow: selected ? `inset 0 0 0 1px ${accent}` : "none",
        background: selected ? activeBg : "var(--surface)",
        cursor: "pointer",
        margin: 0,
      }}
    >
      <input
        type="radio"
        name={name}
        style={{ marginTop: "0.18rem", width: "16px", height: "16px", accentColor: accent, flexShrink: 0 }}
        checked={selected}
        onChange={onSelect}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>{title}</span>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.35, fontWeight: 400 }}>
          {description}
        </span>
      </div>
    </label>
  );
}

export default function GapAnalysisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { me } = useSession();
  const gapId = params?.id;

  const [doc, setDoc] = useState<GapDocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [users, setUsers] = useState<
    {
      id: number;
      fullName: string;
      initials: string;
      roleCode?: string;
      departmentId?: number | null;
      departmentCode?: string;
      isActive?: boolean;
    }[]
  >([]);

  // Verification modal state (for Co Gap Supervisor)
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyDecision, setVerifyDecision] = useState<"SEND_PIC" | "STAGE1" | "RETURN_DRAFT">("STAGE1");
  const [returnNotes, setReturnNotes] = useState("");
  const [showStaffReviewModal, setShowStaffReviewModal] = useState(false);
  const [staffReviewDecision, setStaffReviewDecision] = useState<"SUBMIT_SPV" | "RETURN_PIC">("SUBMIT_SPV");
  const [returnPicNotes, setReturnPicNotes] = useState("");
  const [showLampiran1, setShowLampiran1] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "submit_next" | "leave_unsaved" | null
  >(null);
  const [backTarget, setBackTarget] = useState("/gap-analysis");

  useEffect(() => {
    const fromParam = new URLSearchParams(window.location.search).get("from");
    if (fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//")) {
      setBackTarget(fromParam);
      return;
    }
    if (document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (
          ref.origin === window.location.origin &&
          ref.pathname.startsWith("/") &&
          ref.pathname !== window.location.pathname
        ) {
          setBackTarget(`${ref.pathname}${ref.search}`);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!msg) return;
    const ms = msg.type === "ok" ? 4000 : 6500;
    const timer = setTimeout(() => setMsg(null), ms);
    return () => clearTimeout(timer);
  }, [msg]);

  const loadDoc = () => {
    if (!gapId) return;
    setLoading(true);
    api<GapDocDetail>(`/api/gap-documents/${gapId}`)
      .then((data) => {
        setDoc(data);
        setHasUnsavedChanges(false);
        // Load departments for this site
        if (data.siteId) {
          api<DeptOption[]>(`/api/departments?siteId=${data.siteId}`)
            .then((d) => setDepartments((d || []).filter((x: any) => x.isActive !== false)))
            .catch(() => {});
          api<
            {
              id: number;
              fullName: string;
              initials: string;
              roleCode?: string;
              departmentId?: number | null;
              departmentCode?: string;
              isActive?: boolean;
            }[]
          >(`/api/users?siteId=${data.siteId}`)
            .then((u) => setUsers((u || []).filter((x) => x.isActive !== false)))
            .catch(() => {});
        }
      })
      .catch((err) => setMsg({ type: "err", text: err.message || "Failed to load gap document" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDoc();
  }, [gapId]);

  const role = me?.user.role;
  const isStaff = role === "CO_GAP_STAFF";
  const isSupervisor = role === "CO_GAP_SUPERVISOR";
  const isPic = role === "PIC_AREA";
  const mySiteMatch =
    !!doc &&
    ((!!me?.user.siteId && doc.siteId === me.user.siteId) ||
      (!!me?.user.site && doc.siteCode === me.user.site));
  const myDeptId = me?.user.departmentId;

  const isClauseInPicDept = (c: GapAnalysisRow) =>
    !!c.deptInControlAll ||
    (!!myDeptId &&
      ((c.deptInControlIds || []).includes(myDeptId) || c.deptInControlId === myDeptId));

  const canEditFull =
    !!doc &&
    ((isStaff && (doc.workflowStatus === "DRAFT" || doc.workflowStatus === "STAFF_REVIEW")) ||
      (isSupervisor && (doc.workflowStatus === "DRAFT" || doc.workflowStatus === "SUPERVISOR_VERIFICATION")));
  const canEditActionPlanOnly =
    !!doc && isPic && doc.workflowStatus === "ACTION_PLAN" && mySiteMatch;
  const canEditAny = canEditFull || canEditActionPlanOnly;

  useEffect(() => {
    if (!hasUnsavedChanges || !canEditAny) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges, canEditAny]);

  if (loading) {
    return (
      <main className="page splash">
        <span className="spinner" /> Loading gap matrix...
      </main>
    );
  }

  if (!doc) {
    return (
      <main className="page">
        <div className="alert alert-error">Gap Document not found.</div>
        <Link href={backTarget} className="btn btn-ghost">
          Back to List
        </Link>
      </main>
    );
  }

  const buildAnalysisItems = (clauses: GapAnalysisRow[]) =>
    clauses.map((c) => {
      const cleanRelated = (c.relatedDocument || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n");
      return {
        gapAnalysisId: c.gapAnalysisId,
        isApplicable: c.isApplicable,
        deptInControlId: c.deptInControlIds?.[0] ?? c.deptInControlId ?? null,
        deptInControlIds: c.deptInControlIds || [],
        deptInControlAll: !!c.deptInControlAll,
        coDeptIds: c.coDeptIds || [],
        coDeptAll: !!c.coDeptAll,
        inProcedure: c.inProcedure,
        inPractice: c.inPractice,
        actualCondition: c.actualCondition,
        relatedDocument: cleanRelated,
        actionPlanText: c.actionPlanText,
        picUserId: c.picUserId,
        picInitials: c.picInitials,
        dueDate: c.dueDate ? new Date(c.dueDate) : null,
      };
    });

  const findIncompleteActionPlanClause = (clauses: GapAnalysisRow[]) =>
    clauses.find(
      (c) =>
        c.isApplicable &&
        !c.isInfo &&
        (c.inProcedure === false || c.inPractice === false) &&
        (!c.actionPlanText?.trim() || !c.picUserId || !c.dueDate)
    );

  const validateGapEvaluationAndDept = (
    clauses: GapAnalysisRow[],
    deptMissingTail = "is required."
  ): string | null => {
    const missingEval = clauses.find(
      (c) => c.isApplicable && !c.isInfo && (c.inProcedure === null || c.inPractice === null)
    );
    if (missingEval) {
      return `Clause ${missingEval.clauseNo}: Included In Procedure and Is Performed in Actual Practices are required.`;
    }
    const missingDept = clauses.find(
      (c) =>
        c.isApplicable &&
        !c.isInfo &&
        (c.inProcedure === false || c.inPractice === false) &&
        !c.deptInControlAll &&
        (!c.deptInControlIds || c.deptInControlIds.length === 0) &&
        !c.deptInControlId
    );
    if (missingDept) {
      return `Clause ${missingDept.clauseNo} is below 100%, so Dept In Control ${deptMissingTail}`;
    }
    return null;
  };

  const hasAnyActionPlanData = doc.clauses.some(
    (c) => !!c.actionPlanText?.trim() || !!c.picUserId || !!c.dueDate
  );
  const showActionPlanColumns =
    doc.workflowStatus === "ACTION_PLAN" ||
    hasAnyActionPlanData ||
    (doc.workflowStatus !== "DRAFT" && doc.workflowStatus !== "SUPERVISOR_VERIFICATION");

  const handleBackClick = () => {
    if (hasUnsavedChanges && canEditAny) {
      setConfirmAction("leave_unsaved");
      return;
    }
    router.push(backTarget);
  };

  const updateClausePatch = (idx: number, patch: Partial<GapAnalysisRow>) => {
    if (!doc || !canEditAny) return;
    const updated = [...doc.clauses];
    const item: GapAnalysisRow = { ...updated[idx], ...patch };

    if (
      "isApplicable" in patch ||
      "inProcedure" in patch ||
      "inPractice" in patch
    ) {
      item.status = null;
    }

    if (!item.isApplicable || item.isInfo) {
      item.inProcedure = null;
      item.inPractice = null;
      item.proposedStatus = null;
      item.actionPlanText = "";
      item.picUserId = null;
      item.picInitials = "";
      item.dueDate = null;
    } else if (item.inProcedure !== null && item.inPractice !== null) {
      if (item.inProcedure && item.inPractice) {
        item.proposedStatus = "100";
        // When both Yes (100% comply), Action Plan / PIC / Due Date are inactive / NA
        item.actionPlanText = "";
        item.picUserId = null;
        item.picInitials = "";
        item.dueDate = null;
      } else if (!item.inProcedure && !item.inPractice) {
        item.proposedStatus = "0";
      } else {
        item.proposedStatus = "50";
      }
    } else {
      item.proposedStatus = null;
    }

    updated[idx] = item;

    // Recalculate stats
    let totalApp = 0,
      c100 = 0,
      c50 = 0,
      c0 = 0;
    for (const c of updated) {
      if (c.isApplicable && !c.isInfo) {
        totalApp++;
        const st = c.status || c.proposedStatus;
        if (st === "100") c100++;
        else if (st === "50") c50++;
        else if (st === "0") c0++;
      }
    }

    setHasUnsavedChanges(true);
    setDoc({
      ...doc,
      clauses: updated,
      totalApplicable: totalApp,
      count100: c100,
      count50: c50,
      count0: c0,
      pct100: totalApp > 0 ? (c100 / totalApp) * 100 : 0,
      pct50: totalApp > 0 ? (c50 / totalApp) * 100 : 0,
      pct0: totalApp > 0 ? (c0 / totalApp) * 100 : 0,
    });
  };

  const handleSaveDraft = async (redirectToList = true): Promise<boolean> => {
    if (!doc) return false;
    setSaving(true);
    setMsg(null);
    try {
      await api(`/api/gap-documents/${doc.gapId}/analysis`, {
        method: "PUT",
        body: { items: buildAnalysisItems(doc.clauses) },
      });

      setHasUnsavedChanges(false);
      setConfirmAction(null);
      if (redirectToList) {
        router.push("/gap-analysis");
      }
      return true;
    } catch (err: any) {
      setMsg({ type: "err", text: err.message || "Failed to save draft." });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const hasBelow100 = doc.clauses.some(
    (c) =>
      c.isApplicable &&
      !c.isInfo &&
      (c.inProcedure === false || c.inPractice === false)
  );

  const getEligiblePics = (c: GapAnalysisRow) => {
    const activePics = users.filter(
      (u) => u.isActive !== false && u.roleCode === "PIC_AREA"
    );
    const deptIds = new Set<number>(
      c.deptInControlIds?.length
        ? c.deptInControlIds
        : c.deptInControlId
        ? [c.deptInControlId]
        : []
    );
    const filtered = c.deptInControlAll
      ? activePics
      : deptIds.size > 0
      ? activePics.filter(
          (u) => u.departmentId != null && deptIds.has(u.departmentId)
        )
      : activePics;
    if (c.picUserId && !filtered.some((u) => u.id === c.picUserId)) {
      const current = users.find((u) => u.id === c.picUserId);
      if (current) return [current, ...filtered];
    }
    return filtered;
  };

  const handleSubmitClick = () => {
    if (!doc) return;
    if (isStaff && (doc.workflowStatus === "DRAFT" || doc.workflowStatus === "STAFF_REVIEW")) {
      const evalErr = validateGapEvaluationAndDept(doc.clauses, "is required before sending to PIC Area.");
      if (evalErr) {
        setMsg({ type: "err", text: evalErr });
        return;
      }
      if (doc.workflowStatus === "STAFF_REVIEW") {
        const missingAp = findIncompleteActionPlanClause(doc.clauses);
        if (missingAp) {
          setMsg({
            type: "err",
            text: `Clause ${missingAp.clauseNo} still lacks Action Plan, PIC, or Due Date. Return to PIC Area if incomplete.`,
          });
          return;
        }
      }
      setConfirmAction("submit_next");
      return;
    }

    if (isPic && doc.workflowStatus === "ACTION_PLAN") {
      const myMissingRow = doc.clauses.find(
        (c) =>
          c.isApplicable &&
          !c.isInfo &&
          (c.inProcedure === false || c.inPractice === false) &&
          isClauseInPicDept(c) &&
          (!c.actionPlanText?.trim() || !c.picUserId || !c.dueDate)
      );
      if (myMissingRow) {
        setMsg({
          type: "err",
          text: `Clause ${myMissingRow.clauseNo} (your department) requires Action Plan, PIC, and Due Date.`,
        });
        return;
      }
      setConfirmAction("submit_next");
    }
  };

  const performSubmitNext = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const ok = await handleSaveDraft(false);
      if (!ok) return;
      const res = await api<{ ok: boolean; workflowStatus?: string }>(
        `/api/gap-documents/${doc.gapId}/submit`,
        { method: "POST" }
      );
      setHasUnsavedChanges(false);
      setConfirmAction(null);
      setMsg({
        type: "ok",
        text:
          res?.workflowStatus === "STAFF_REVIEW"
            ? "Action Plan submitted to Co Gap Staff for completeness check."
            : "Assessment submitted to Co Gap Supervisor for verification.",
      });
      loadDoc();
    } catch (err: any) {
      setConfirmAction(null);
      setMsg({ type: "err", text: err.message || "Failed to submit." });
      loadDoc();
    } finally {
      setSaving(false);
    }
  };

  const openStaffReviewModal = () => {
    if (!doc) return;
    const missingAp = findIncompleteActionPlanClause(doc.clauses);
    setStaffReviewDecision(missingAp ? "RETURN_PIC" : "SUBMIT_SPV");
    setShowStaffReviewModal(true);
  };

  const handleStaffReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc) return;
    if (staffReviewDecision === "RETURN_PIC") {
      if (!returnPicNotes.trim()) {
        setMsg({ type: "err", text: "Return / Revision Notes are required." });
        return;
      }
      setSaving(true);
      try {
        await api(`/api/gap-documents/${doc.gapId}/return-pic`, {
          method: "POST",
          body: { returnNotes: returnPicNotes },
        });
        setShowStaffReviewModal(false);
        setReturnPicNotes("");
        setHasUnsavedChanges(false);
        setMsg({
          type: "ok",
          text: "Returned to PIC Area with revision notes.",
        });
        loadDoc();
      } catch (err: any) {
        setMsg({ type: "err", text: err.message || "Failed to return to PIC Area." });
      } finally {
        setSaving(false);
      }
      return;
    }

    const evalErr = validateGapEvaluationAndDept(doc.clauses);
    if (evalErr) {
      setShowStaffReviewModal(false);
      setMsg({ type: "err", text: evalErr });
      return;
    }
    const missingAp = findIncompleteActionPlanClause(doc.clauses);
    if (missingAp) {
      setShowStaffReviewModal(false);
      setMsg({
        type: "err",
        text: `Clause ${missingAp.clauseNo} still lacks Action Plan, PIC, or Due Date. Select "Return to PIC Area" if incomplete.`,
      });
      return;
    }

    setSaving(true);
    try {
      const ok = await handleSaveDraft(false);
      if (!ok) return;
      await api<{ ok: boolean; workflowStatus?: string }>(
        `/api/gap-documents/${doc.gapId}/submit`,
        { method: "POST" }
      );
      setShowStaffReviewModal(false);
      setHasUnsavedChanges(false);
      setMsg({
        type: "ok",
        text: "Assessment submitted to Co Gap Supervisor for verification.",
      });
      loadDoc();
    } catch (err: any) {
      setShowStaffReviewModal(false);
      setMsg({ type: "err", text: err.message || "Failed to submit to Supervisor." });
      loadDoc();
    } finally {
      setSaving(false);
    }
  };

  const openVerifyModal = () => {
    if (!doc) return;
    const incompleteAp = findIncompleteActionPlanClause(doc.clauses);
    if (hasBelow100 && incompleteAp) {
      setVerifyDecision("SEND_PIC");
    } else {
      setVerifyDecision("STAGE1");
    }
    setShowVerifyModal(true);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc) return;

    if (verifyDecision === "RETURN_DRAFT") {
      if (!returnNotes.trim()) {
        setMsg({ type: "err", text: "Return / Revision Notes are required." });
        return;
      }
    } else if (verifyDecision === "SEND_PIC") {
      const evalErr = validateGapEvaluationAndDept(
        doc.clauses,
        "must be selected before sending to PIC Area."
      );
      if (evalErr) {
        setShowVerifyModal(false);
        setMsg({ type: "err", text: evalErr });
        return;
      }
      if (!hasBelow100) {
        setMsg({
          type: "err",
          text: "All clauses are 100% or N/A. Please choose Approve Verification (Stage 1).",
        });
        return;
      }
    } else {
      const missingRow = findIncompleteActionPlanClause(doc.clauses);
      if (missingRow) {
        setShowVerifyModal(false);
        setMsg({
          type: "err",
          text: `Clause ${missingRow.clauseNo} is below 100% and Action Plan / PIC / Due Date are not filled yet. Please select "Send to PIC Area" first.`,
        });
        return;
      }
    }

    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        returnDraft: verifyDecision === "RETURN_DRAFT",
        sendToPic: verifyDecision === "SEND_PIC",
        returnNotes,
        clauses: doc.clauses.map((c) => ({
          gapAnalysisId: c.gapAnalysisId,
          status: !c.isApplicable ? "NA" : c.proposedStatus || c.status || "50",
          notes: c.verificationNotes || "",
        })),
        items: buildAnalysisItems(doc.clauses),
      };
      await api(`/api/gap-documents/${doc.gapId}/verify`, {
        method: "POST",
        body: payload,
      });
      setHasUnsavedChanges(false);
      setShowVerifyModal(false);
      const toastParam =
        verifyDecision === "RETURN_DRAFT"
          ? "returned"
          : verifyDecision === "SEND_PIC"
          ? "sent_pic"
          : "verified";
      router.push(`/gap-analysis?toast=${toastParam}`);
    } catch (err: any) {
      setMsg({ type: "err", text: err.message || "Failed to complete verification." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page" style={{ maxWidth: "98vw" }}>
      {/* Header Info */}
      <div className="toolbar" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 24rem", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
            <span className="badge badge-info">{doc.siteCode} - {doc.siteName}</span>
            <span className="badge badge-gray">{doc.categoryCode}</span>
            <span className="badge badge-warn">{doc.workflowStatus}</span>
            {hasUnsavedChanges && canEditAny && (
              <span className="badge badge-err">Unsaved changes</span>
            )}
          </div>
          <h1 className="page-title" style={{ fontSize: "1.4rem" }}>
            {doc.regulationTitle} (<code>{doc.gapNo}</code>)
          </h1>
          <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
            Legal Number: <strong>{doc.legalNumber}</strong> | Effective Date: {new Date(doc.effectiveDate).toLocaleDateString()} | Created by: {doc.createdByName}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {(isStaff || isSupervisor) &&
            (doc.workflowStatus === "EXECUTION" ||
              doc.workflowStatus === "APPROVAL_STAGE2" ||
              doc.workflowStatus === "CLOSED") && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowLampiran1(true)}
              >
                Download PDF (Lampiran 1)
              </button>
            )}
          <button type="button" onClick={handleBackClick} className="btn btn-ghost">
            Back
          </button>
        </div>
      </div>

      {(doc.workflowStatus === "DRAFT" || doc.workflowStatus === "ACTION_PLAN") && doc.returnNotes && (
        <div
          className="alert"
          style={{
            background: "#fff8e1",
            border: "1px solid #f0d060",
            color: "#6b4f00",
            marginBottom: "0.75rem",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>
            Returned for Revision by {doc.returnedByName || "Co Gap Reviewer"}
            {doc.returnedAt ? ` (${new Date(doc.returnedAt).toLocaleString()})` : ""}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{doc.returnNotes}</div>
        </div>
      )}

      {canEditActionPlanOnly && (
        <div className="alert alert-info" style={{ marginBottom: "0.75rem" }}>
          Document is in the <strong>ACTION_PLAN</strong> stage. Please fill in{" "}
          <strong>Action Plan</strong>, <strong>PIC</strong>, and <strong>Due Date</strong> for clauses
          assigned to your department (marked with <span style={{ color: "#c52a2a", fontWeight: 700 }}>*</span>),
          then click <strong>Save Draft</strong> or <strong>Submit to Co Gap Staff</strong>.
        </div>
      )}

      {isStaff && doc.workflowStatus === "STAFF_REVIEW" && (
        <div className="alert alert-info" style={{ marginBottom: "0.75rem" }}>
          Document Action Plans have been submitted by PIC Area. Please check completeness of{" "}
          <strong>Action Plan</strong>, <strong>PIC</strong>, and <strong>Due Date</strong>, then click{" "}
          <strong>Review & Submit</strong> to forward to Supervisor or return to PIC Area.
        </div>
      )}

      {msg && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: "1.25rem",
            right: "1.25rem",
            zIndex: 10000,
            maxWidth: "380px",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.65rem",
            padding: "0.8rem 1rem",
            borderRadius: "10px",
            background: msg.type === "ok" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${msg.type === "ok" ? "#86efac" : "#fca5a5"}`,
            color: msg.type === "ok" ? "#14532d" : "#7f1d1d",
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            fontSize: "0.85rem",
            lineHeight: 1.4,
          }}
        >
          <span style={{ fontWeight: 700, flexShrink: 0 }}>
            {msg.type === "ok" ? "✓" : "!"}
          </span>
          <span style={{ flex: 1 }}>{msg.text}</span>
          <button
            type="button"
            onClick={() => setMsg(null)}
            aria-label="Close notification"
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: "1rem",
              lineHeight: 1,
              padding: 0,
              opacity: 0.7,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Compliance Level Banner (WI Formula) */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", margin: "1rem 0" }}>
        <div className="stat-card" style={{ padding: "0.85rem" }}>
          <div className="stat-label">Total Sub-Clauses</div>
          <div className="stat-value">{doc.totalApplicable} <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>app</span></div>
        </div>
        <div className="stat-card" style={{ padding: "0.85rem" }}>
          <div className="stat-label">Comply (100%)</div>
          <div className="stat-value" style={{ color: "var(--ok)" }}>
            {doc.pct100.toFixed(1)}%
          </div>
          <div className="stat-sub">{doc.count100} clauses</div>
        </div>
        <div className="stat-card" style={{ padding: "0.85rem" }}>
          <div className="stat-label">Partially Comply (50%)</div>
          <div className="stat-value" style={{ color: "#d99b00" }}>
            {doc.pct50.toFixed(1)}%
          </div>
          <div className="stat-sub">{doc.count50} clauses</div>
        </div>
        <div className="stat-card" style={{ padding: "0.85rem" }}>
          <div className="stat-label">Not Comply (0%)</div>
          <div className="stat-value" style={{ color: "#c52a2a" }}>
            {doc.pct0.toFixed(1)}%
          </div>
          <div className="stat-sub">{doc.count0} clauses</div>
        </div>
      </div>

      {/* WI Lampiran 1 Spreadsheet Matrix */}
      <div className="table-wrap" style={{ maxHeight: "70vh", overflow: "auto" }}>
        <table className="table" style={{ fontSize: "0.825rem" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr>
              <th style={{ minWidth: "85px" }}>Clausul</th>
              <th style={{ minWidth: "240px" }}>{doc.legalNumber || "Reference (Klausul)"}</th>
              <th style={{ minWidth: "90px" }}>Applicability</th>
              <th style={{ minWidth: "135px" }}>Dept In Control</th>
              <th style={{ minWidth: "135px" }}>Co-Dept In Control</th>
              <th style={{ minWidth: "105px" }}>Included In Procedure</th>
              <th style={{ minWidth: "115px" }}>Is Performed in Actual Practices</th>
              <th style={{ minWidth: "95px" }}>Fulfillment Status</th>
              <th style={{ minWidth: "200px" }}>Related Document</th>
              <th style={{ minWidth: "200px" }}>Actual Condition/Gap</th>
              {showActionPlanColumns && (
                <>
                  <th style={{ minWidth: "210px" }}>Action Plan</th>
                  <th style={{ minWidth: "120px" }}>PIC</th>
                  <th style={{ minWidth: "130px" }}>Due Date</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {doc.clauses.map((c, idx) => {
              const isInfoRow = c.isInfo;
              const isRowFullDisabled = !canEditFull || isInfoRow || !c.isApplicable;
              const isComply100 =
                c.isApplicable && !isInfoRow && c.inProcedure === true && c.inPractice === true;
              const needsActionPlan =
                c.isApplicable && !isInfoRow && (c.inProcedure === false || c.inPractice === false);
              const inMyPicDept = isClauseInPicDept(c);
              const canEditActionPlan =
                needsActionPlan && canEditActionPlanOnly && inMyPicDept;
              const eligiblePics = getEligiblePics(c);
              const displayStatus = c.isInfo
                ? "INFO"
                : !c.isApplicable
                ? "NA"
                : c.status || c.proposedStatus;

              return (
                <tr key={c.gapAnalysisId} style={{ background: isInfoRow ? "var(--surface-2)" : undefined }}>
                  <td>
                    <strong>{c.clauseNo}</strong>
                    {c.chapter && <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{c.chapter}</div>}
                    {isInfoRow && <span className="badge badge-gray" style={{ marginTop: "0.2rem" }}>INFO</span>}
                  </td>
                  <td>
                    <div style={{ maxHeight: "110px", overflowY: "auto", whiteSpace: "pre-wrap" }}>
                      {c.clauseTitle && <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>{c.clauseTitle}</div>}
                      {c.requirementText}
                    </div>
                  </td>
                  <td>
                    {isInfoRow ? (
                      <span className="muted">—</span>
                    ) : (
                      <select
                        className="filter-select"
                        style={{ padding: "0.2rem 0.4rem", height: "30px", fontSize: "0.8rem" }}
                        value={c.isApplicable ? "YES" : "NO"}
                        disabled={!canEditFull}
                        onChange={(e) => updateClausePatch(idx, { isApplicable: e.target.value === "YES" })}
                      >
                        <option value="YES">Yes</option>
                        <option value="NO">No (NA)</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {isInfoRow || !c.isApplicable ? (
                      <span className="muted">—</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <div style={{ flex: 1 }}>
                          <DeptMultiSelect
                            departments={departments}
                            selectedIds={c.deptInControlIds || (c.deptInControlId ? [c.deptInControlId] : [])}
                            isAll={!!c.deptInControlAll}
                            disabled={!canEditFull}
                            allLabel="All dept"
                            onChange={(nextIds, nextCodes, nextAll) =>
                              updateClausePatch(idx, {
                                deptInControlIds: nextIds,
                                deptInControlCodes: nextCodes,
                                deptInControlAll: nextAll,
                                deptInControlId: nextAll ? null : nextIds[0] ?? null,
                                deptInControlCode: nextAll ? "All dept" : nextCodes.join(", "),
                              })
                            }
                          />
                        </div>
                        {canEditFull && needsActionPlan && (
                          <span title="Required" style={{ color: "#c52a2a", fontWeight: 700 }}>*</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {isInfoRow || !c.isApplicable ? (
                      <span className="muted">—</span>
                    ) : (
                      <DeptMultiSelect
                        departments={departments}
                        selectedIds={c.coDeptIds || []}
                        isAll={!!c.coDeptAll}
                        disabled={!canEditFull}
                        allLabel="All dept"
                        onChange={(nextIds, nextCodes, nextAll) =>
                          updateClausePatch(idx, {
                            coDeptIds: nextIds,
                            coDeptCodes: nextCodes,
                            coDeptAll: nextAll,
                          })
                        }
                      />
                    )}
                  </td>
                  <td>
                    {isInfoRow || !c.isApplicable ? (
                      <span className="muted">—</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <select
                          className="filter-select"
                          style={{ padding: "0.2rem 0.4rem", height: "30px", fontSize: "0.8rem", width: "100%" }}
                          value={c.inProcedure === null ? "" : c.inProcedure ? "YES" : "NO"}
                          disabled={isRowFullDisabled}
                          onChange={(e) =>
                            updateClausePatch(idx, {
                              inProcedure: e.target.value === "" ? null : e.target.value === "YES",
                            })
                          }
                        >
                          <option value="">—</option>
                          <option value="YES">Yes</option>
                          <option value="NO">No</option>
                        </select>
                        {!isRowFullDisabled && (
                          <span title="Required" style={{ color: "#c52a2a", fontWeight: 700 }}>*</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {isInfoRow || !c.isApplicable ? (
                      <span className="muted">—</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <select
                          className="filter-select"
                          style={{ padding: "0.2rem 0.4rem", height: "30px", fontSize: "0.8rem", width: "100%" }}
                          value={c.inPractice === null ? "" : c.inPractice ? "YES" : "NO"}
                          disabled={isRowFullDisabled}
                          onChange={(e) =>
                            updateClausePatch(idx, {
                              inPractice: e.target.value === "" ? null : e.target.value === "YES",
                            })
                          }
                        >
                          <option value="">—</option>
                          <option value="YES">Yes</option>
                          <option value="NO">No</option>
                        </select>
                        {!isRowFullDisabled && (
                          <span title="Required" style={{ color: "#c52a2a", fontWeight: 700 }}>*</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {displayStatus === "INFO" ? (
                      <span className="badge badge-gray">INFO</span>
                    ) : displayStatus === "NA" ? (
                      <span className="badge badge-gray">NA</span>
                    ) : displayStatus ? (
                      <span
                        className={`badge ${
                          displayStatus === "100"
                            ? "badge-ok"
                            : displayStatus === "50"
                            ? "badge-warn"
                            : "badge-err"
                        }`}
                      >
                        {displayStatus}%
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <RelatedDocsEditor
                      value={c.relatedDocument || ""}
                      disabled={isRowFullDisabled}
                      onChange={(nextVal) => updateClausePatch(idx, { relatedDocument: nextVal })}
                    />
                  </td>
                  <td>
                    <textarea
                      rows={2}
                      className="filter-input"
                      placeholder={isRowFullDisabled ? "—" : "Actual condition & gap..."}
                      style={{ width: "100%", height: "auto", padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                      value={c.actualCondition}
                      disabled={isRowFullDisabled}
                      onChange={(e) => updateClausePatch(idx, { actualCondition: e.target.value })}
                    />
                  </td>
                  {showActionPlanColumns && (
                    <>
                      <td>
                        {isComply100 || isInfoRow || !c.isApplicable ? (
                          <span className="muted" style={{ fontSize: "0.8rem" }}>NA</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.25rem" }}>
                            <textarea
                              rows={2}
                              className="filter-input"
                              placeholder={
                                canEditActionPlan
                                  ? "Action plan..."
                                  : canEditActionPlanOnly && !inMyPicDept
                                  ? `Dept: ${c.deptInControlCodes?.join(", ") || c.deptInControlCode || "Other"}`
                                  : needsActionPlan && (isStaff || isSupervisor)
                                  ? "Filled by PIC Area"
                                  : "—"
                              }
                              style={{
                                width: "100%",
                                height: "auto",
                                padding: "0.25rem 0.5rem",
                                fontSize: "0.8rem",
                              }}
                              value={c.actionPlanText}
                              disabled={!canEditActionPlan}
                              onChange={(e) => updateClausePatch(idx, { actionPlanText: e.target.value })}
                            />
                            {canEditActionPlan && (
                              <span title="Required" style={{ color: "#c52a2a", fontWeight: 700 }}>*</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {isComply100 || isInfoRow || !c.isApplicable ? (
                          <span className="muted" style={{ fontSize: "0.8rem" }}>NA</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <select
                              className="filter-select"
                              style={{
                                padding: "0.2rem 0.4rem",
                                height: "30px",
                                fontSize: "0.8rem",
                                width: "100%",
                              }}
                              value={c.picUserId || ""}
                              disabled={!canEditActionPlan}
                              onChange={(e) => {
                                const uid = e.target.value ? Number(e.target.value) : null;
                                const userObj = users.find((u) => u.id === uid);
                                updateClausePatch(idx, {
                                  picUserId: uid,
                                  picInitials: userObj ? userObj.initials : "",
                                });
                              }}
                            >
                              <option value="">
                                {needsActionPlan && (isStaff || isSupervisor) ? "PIC Area" : "—"}
                              </option>
                              {eligiblePics.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.initials ? `[${u.initials}] ` : ""}{u.fullName}
                                </option>
                              ))}
                            </select>
                            {canEditActionPlan && (
                              <span title="Required" style={{ color: "#c52a2a", fontWeight: 700 }}>*</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {isComply100 || isInfoRow || !c.isApplicable ? (
                          <span className="muted" style={{ fontSize: "0.8rem" }}>NA</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <input
                              type="date"
                              className="filter-input"
                              style={{
                                padding: "0.2rem 0.4rem",
                                height: "30px",
                                fontSize: "0.8rem",
                              }}
                              value={c.dueDate ? c.dueDate.split("T")[0] : ""}
                              disabled={!canEditActionPlan}
                              onChange={(e) => updateClausePatch(idx, { dueDate: e.target.value || null })}
                            />
                            {canEditActionPlan && (
                              <span title="Required" style={{ color: "#c52a2a", fontWeight: 700 }}>*</span>
                            )}
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Action Bar */}
      {canEditAny ? (
        <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => handleSaveDraft(true)}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>
          {isStaff && doc.workflowStatus === "STAFF_REVIEW" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={openStaffReviewModal}
              disabled={saving}
            >
              Review & Submit
            </button>
          )}
          {!isSupervisor && !(isStaff && doc.workflowStatus === "STAFF_REVIEW") && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmitClick}
              disabled={saving}
            >
              {isPic && doc.workflowStatus === "ACTION_PLAN"
                ? "Submit to Co Gap Staff"
                : "Submit to Supervisor"}
            </button>
          )}
          {isSupervisor && (doc.workflowStatus === "DRAFT" || doc.workflowStatus === "SUPERVISOR_VERIFICATION") && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={openVerifyModal}
              disabled={saving}
            >
              Verify Assessment
            </button>
          )}
        </div>
      ) : null}

      {/* Supervisor Verification Modal */}
      {showVerifyModal && (() => {
        const needsPicActionPlan =
          hasBelow100 && !!findIncompleteActionPlanClause(doc.clauses);
        const primaryDecision = needsPicActionPlan ? "SEND_PIC" : "STAGE1";
        const isPrimarySelected = verifyDecision === primaryDecision;
        const isReturnSelected = verifyDecision === "RETURN_DRAFT";
        return (
          <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: "440px", padding: "1.25rem 1.4rem" }}>
              <div className="modal-header" style={{ marginBottom: "0.45rem" }}>
                <h2 className="modal-title" style={{ fontSize: "1.08rem" }}>Verify Gap Assessment</h2>
                <button type="button" className="modal-close" onClick={() => setShowVerifyModal(false)}>
                  ×
                </button>
              </div>
              <p style={{ margin: "0 0 0.85rem", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.45 }}>
                {needsPicActionPlan
                  ? "Clauses below 100% still need an Action Plan, PIC & Due Date."
                  : "All clauses are complete."}
              </p>
              <form onSubmit={handleVerifySubmit}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  <DecisionOptionCard
                    name="decision"
                    selected={isPrimarySelected}
                    title={needsPicActionPlan ? "Send to PIC Area" : "Approve Verification"}
                    description={
                      needsPicActionPlan
                        ? "PIC Area completes them per department."
                        : "Sends this assessment to Stage 1 Approval."
                    }
                    onSelect={() => setVerifyDecision(primaryDecision)}
                  />
                  <DecisionOptionCard
                    name="decision"
                    selected={isReturnSelected}
                    tone="danger"
                    title="Return to Draft"
                    description="Sends it back to Co Gap Staff for revision."
                    onSelect={() => setVerifyDecision("RETURN_DRAFT")}
                  />
                </div>

                {isReturnSelected && (
                  <div style={{ marginTop: "0.8rem" }}>
                    <label
                      htmlFor="returnNotes"
                      style={{ display: "block", fontWeight: 600, fontSize: "0.84rem", marginBottom: "0.35rem" }}
                    >
                      Revision Notes <span style={{ color: "#c52a2a" }}>*</span>
                    </label>
                    <textarea
                      id="returnNotes"
                      rows={3}
                      className="filter-input"
                      style={{ width: "100%", height: "auto", padding: "0.55rem 0.7rem", fontSize: "0.86rem" }}
                      placeholder="Describe discrepancies or missing clauses to be fixed..."
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div
                  className="modal-actions"
                  style={{ marginTop: "1.05rem", paddingTop: "0.8rem", borderTop: "1px solid var(--border)" }}
                >
                  <button type="button" className="btn btn-ghost" onClick={() => setShowVerifyModal(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                    style={isReturnSelected ? { background: "#c52a2a", borderColor: "#c52a2a" } : undefined}
                  >
                    {saving
                      ? "Processing..."
                      : isReturnSelected
                      ? "Return to Draft"
                      : needsPicActionPlan
                      ? "Send to PIC Area"
                      : "Confirm & Send to Stage 1"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      {/* Compact Confirmation Popup Modal */}
      {confirmAction && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: "390px", padding: "1.25rem 1.4rem" }}>
            <div className="modal-header" style={{ marginBottom: "0.75rem" }}>
              <h2 className="modal-title" style={{ fontSize: "1.05rem" }}>
                {confirmAction === "submit_next"
                  ? isPic && doc.workflowStatus === "ACTION_PLAN"
                    ? "Submit to Co Gap Staff"
                    : "Submit to Supervisor"
                  : "Unsaved Changes"}
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => !saving && setConfirmAction(null)}
              >
                ×
              </button>
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
              {confirmAction === "submit_next"
                ? isPic && doc.workflowStatus === "ACTION_PLAN"
                  ? "Submit your Action Plans to Co Gap Staff for completeness check?"
                  : doc.workflowStatus === "STAFF_REVIEW"
                  ? "Forward this completed Gap Analysis & Action Plan to Co Gap Supervisor for final verification before Stage 1?"
                  : "Submit this gap analysis to Co Gap Supervisor for checking and verification?"
                : "You have unsaved changes. Are you sure you want to leave this page?"}
            </p>
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => setConfirmAction(null)}
              >
                {confirmAction === "leave_unsaved" ? "Cancel" : "Cancel"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                style={
                  confirmAction === "leave_unsaved"
                    ? { background: "#c52a2a", borderColor: "#c52a2a" }
                    : undefined
                }
                onClick={() => {
                  if (confirmAction === "submit_next") {
                    performSubmitNext();
                  } else if (confirmAction === "leave_unsaved") {
                    setConfirmAction(null);
                    router.push(backTarget);
                  }
                }}
              >
                {saving
                  ? "Processing..."
                  : confirmAction === "submit_next"
                  ? "Yes, Submit"
                  : "Leave"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Action Plan Review Modal (for Co Gap Staff in STAFF_REVIEW) */}
      {showStaffReviewModal && (() => {
        const incompleteAp = findIncompleteActionPlanClause(doc.clauses);
        const isSubmitSelected = staffReviewDecision === "SUBMIT_SPV";
        const isReturnSelected = staffReviewDecision === "RETURN_PIC";
        return (
          <div className="modal-overlay" style={{ zIndex: 9999 }}>
            <div className="modal-card" style={{ maxWidth: "440px", padding: "1.25rem 1.4rem" }}>
              <div className="modal-header" style={{ marginBottom: "0.45rem" }}>
                <h2 className="modal-title" style={{ fontSize: "1.08rem" }}>Review Action Plan</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => !saving && setShowStaffReviewModal(false)}
                >
                  ×
                </button>
              </div>
              <p style={{ margin: "0 0 0.85rem", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.45 }}>
                {incompleteAp
                  ? `Clause ${incompleteAp.clauseNo} still needs an Action Plan, PIC & Due Date.`
                  : "	All Action Plans are complete."}
              </p>
              <form onSubmit={handleStaffReviewSubmit}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  <DecisionOptionCard
                    name="staffReviewDecision"
                    selected={isSubmitSelected}
                    title="Submit to Supervisor"
                    description="Sends the completed plans to Co Gap Supervisor for verification."
                    onSelect={() => setStaffReviewDecision("SUBMIT_SPV")}
                  />
                  <DecisionOptionCard
                    name="staffReviewDecision"
                    selected={isReturnSelected}
                    tone="danger"
                    title="Return to PIC Area"
                    description="PIC Area revises or completes the Action Plan."
                    onSelect={() => setStaffReviewDecision("RETURN_PIC")}
                  />
                </div>

                {isReturnSelected && (
                  <div style={{ marginTop: "0.8rem" }}>
                    <label
                      htmlFor="returnPicNotes"
                      style={{ display: "block", fontWeight: 600, fontSize: "0.84rem", marginBottom: "0.35rem" }}
                    >
                      Return / Revision Notes <span style={{ color: "#c52a2a" }}>*</span>
                    </label>
                    <textarea
                      id="returnPicNotes"
                      rows={3}
                      className="filter-input"
                      style={{ width: "100%", height: "auto", padding: "0.55rem 0.7rem", fontSize: "0.86rem" }}
                      placeholder="Describe what needs to be revised in the Action Plan..."
                      value={returnPicNotes}
                      onChange={(e) => setReturnPicNotes(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div
                  className="modal-actions"
                  style={{ marginTop: "1.05rem", paddingTop: "0.8rem", borderTop: "1px solid var(--border)" }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setShowStaffReviewModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                    style={isReturnSelected ? { background: "#c52a2a", borderColor: "#c52a2a" } : undefined}
                  >
                    {saving
                      ? "Processing..."
                      : isReturnSelected
                      ? "Return to PIC Area"
                      : "Submit to Supervisor"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {showLampiran1 && (
        <Lampiran1Modal doc={doc} onClose={() => setShowLampiran1(false)} />
      )}
    </main>
  );
}
