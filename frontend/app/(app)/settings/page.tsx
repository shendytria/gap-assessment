"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import { Pagination } from "@/components/Pagination";
import { Toast } from "@/components/Toast";

type UserSummary = {
  id: number;
  username: string;
  fullName: string;
  email: string;
  jobTitle: string;
  initials: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  departmentId: number | null;
  departmentCode: string;
  departmentName: string;
  siteId: number | null;
  siteCode: string;
  siteName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type Department = {
  id: number;
  code: string;
  name: string;
  siteId: number;
  siteCode: string;
  siteName: string;
  isActive: boolean;
};

type Delegation = {
  id: number;
  gapId: number | null;
  gapNo: string;
  siteId: number;
  siteCode: string;
  roleId: number;
  roleCode: string;
  departmentId: number | null;
  departmentCode: string;
  principalUserId: number;
  principalName: string;
  delegateUserId: number;
  delegateName: string;
  startDate: string;
  endDate: string | null;
  reason: string;
  isRevoked: boolean;
  createdByName: string;
  createdAt: string;
};

export default function SettingsPage() {
  const { me, can } = useSession();
  const [tab, setTab] = useState<"users" | "departments" | "delegations">("users");

  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);
  const [roles, setRoles] = useState<{ id: number; code: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);

  const [loading, setLoading] = useState(true);
  const [siteFilter, setSiteFilter] = useState("");
  const [search, setSearch] = useState("");

  // Pagination states per tab
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(20);
  const [deptPage, setDeptPage] = useState(1);
  const [deptPageSize, setDeptPageSize] = useState(20);
  const [delegationPage, setDelegationPage] = useState(1);
  const [delegationPageSize, setDelegationPageSize] = useState(20);

  // User modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [userForm, setUserForm] = useState({
    username: "",
    fullName: "",
    email: "",
    jobTitle: "",
    initials: "",
    roleId: 0,
    departmentId: 0,
    siteId: 0,
    isActive: true,
  });

  // Department modal state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({
    siteId: 0,
    code: "",
    name: "",
    isActive: true,
  });

  // Delegation modal
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [delegationForm, setDelegationForm] = useState({
    siteId: 0,
    roleId: 0,
    principalUserId: 0,
    delegateUserId: 0,
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    reason: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Delegation | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 4000);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const loadAllDepartments = () => {
    api<Department[]>("/api/departments")
      .then((d) => setAllDepartments(d || []))
      .catch(() => setAllDepartments([]));
  };

  useEffect(() => {
    Promise.all([
      api<{ id: number; code: string; name: string }[]>("/api/sites"),
      api<{ id: number; code: string; name: string }[]>("/api/roles"),
      api<Department[]>("/api/departments"),
    ])
      .then(([s, r, depts]) => {
        const safeS = s || [];
        const safeR = r || [];
        const safeD = depts || [];
        setSites(safeS);
        setRoles(safeR);
        setAllDepartments(safeD);
        if (safeS.length > 0) {
          setUserForm((prev) => ({ ...prev, siteId: safeS[0].id }));
          setDelegationForm((prev) => ({ ...prev, siteId: safeS[0].id }));
        }
        if (safeR.length > 0) {
          setUserForm((prev) => ({ ...prev, roleId: safeR[0].id }));
          setDelegationForm((prev) => ({ ...prev, roleId: safeR[0].id }));
        }
      })
      .catch(() => {
        setSites([]);
        setRoles([]);
        setAllDepartments([]);
      });
  }, []);

  const loadData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (siteFilter) params.set("siteId", siteFilter);
    if (search) params.set("q", search);

    if (tab === "users") {
      api<UserSummary[]>(`/api/users?${params.toString()}`)
        .then((u) => setUsers(u || []))
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    } else if (tab === "departments") {
      api<Department[]>(`/api/departments?${params.toString()}`)
        .then((d) => setDepartments(d || []))
        .catch(() => setDepartments([]))
        .finally(() => setLoading(false));
    } else if (tab === "delegations") {
      api<Delegation[]>(`/api/delegations?${params.toString()}`)
        .then((dl) => setDelegations(dl || []))
        .catch(() => setDelegations([]))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    setUserPage(1);
    setDeptPage(1);
    setDelegationPage(1);
    loadData();
  }, [tab, siteFilter, search]);

  const pagedUsers = (users || []).slice((userPage - 1) * userPageSize, userPage * userPageSize);
  const pagedDepts = (departments || []).slice((deptPage - 1) * deptPageSize, deptPage * deptPageSize);
  const pagedDelegations = (delegations || []).slice((delegationPage - 1) * delegationPageSize, delegationPage * delegationPageSize);

  const isSupervisor =
    me?.user.role === "CO_GAP_SUPERVISOR" ||
    me?.user.username === "admin" ||
    (can ? can("SETTING", "edit") : false);

  const openNewUserModal = () => {
    setEditingUser(null);
    const initialSiteId = sites[0]?.id || 1;
    const initialDepts = allDepartments.filter((d) => d.isActive && d.siteId === initialSiteId);
    setUserForm({
      username: "",
      fullName: "",
      email: "",
      jobTitle: "",
      initials: "",
      roleId: roles[0]?.id || 0,
      departmentId: initialDepts[0]?.id || 0,
      siteId: initialSiteId,
      isActive: true,
    });
    setModalErr(null);
    setShowUserModal(true);
  };

  const openEditUserModal = (u: UserSummary) => {
    setEditingUser(u);
    setUserForm({
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      jobTitle: u.jobTitle,
      initials: u.initials,
      roleId: u.roleId,
      departmentId: u.departmentId || 0,
      siteId: u.siteId || sites[0]?.id || 1,
      isActive: u.isActive,
    });
    setModalErr(null);
    setShowUserModal(true);
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalErr(null);

    try {
      if (editingUser) {
        await api(`/api/users/${editingUser.id}`, {
          method: "PUT",
          body: {
            fullName: userForm.fullName.trim(),
            email: userForm.email.trim(),
            jobTitle: userForm.jobTitle.trim(),
            initials: userForm.initials.trim(),
            roleId: Number(userForm.roleId),
            departmentId: userForm.departmentId ? Number(userForm.departmentId) : null,
            siteId: userForm.siteId ? Number(userForm.siteId) : null,
            isActive: userForm.isActive,
          },
        });
        setToastMessage({
          type: "ok",
          text: `User "${userForm.fullName}" updated successfully.`,
        });
      } else {
        await api("/api/users", {
          method: "POST",
          body: {
            username: userForm.username.trim(),
            fullName: userForm.fullName.trim(),
            email: userForm.email.trim(),
            jobTitle: userForm.jobTitle.trim(),
            initials: userForm.initials.trim(),
            roleId: Number(userForm.roleId),
            departmentId: userForm.departmentId ? Number(userForm.departmentId) : null,
            siteId: userForm.siteId ? Number(userForm.siteId) : null,
          },
        });
        setToastMessage({
          type: "ok",
          text: `User "${userForm.fullName}" created successfully. Default password is Gap12345.`,
        });
      }
      setShowUserModal(false);
      loadData();
    } catch (err: any) {
      setModalErr(err?.message || "Failed to save user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelegationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalErr(null);

    try {
      await api("/api/delegations", {
        method: "POST",
        body: {
          siteId: Number(delegationForm.siteId),
          roleId: Number(delegationForm.roleId),
          principalUserId: Number(delegationForm.principalUserId),
          delegateUserId: Number(delegationForm.delegateUserId),
          startDate: new Date(delegationForm.startDate),
          endDate: delegationForm.endDate ? new Date(delegationForm.endDate) : null,
          reason: delegationForm.reason.trim(),
        },
      });
      setShowDelegationModal(false);
      loadData();
    } catch (err: any) {
      setModalErr(err?.message || "Failed to create delegation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeDelegation = (dl: Delegation) => {
    setRevokeTarget(dl);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setSubmitting(true);
    try {
      await api(`/api/delegations/${revokeTarget.id}`, { method: "DELETE" });
      setToastMessage({
        type: "ok",
        text: `Pendelegasian wewenang untuk ${revokeTarget.principalName} berhasil dicabut (Revoked).`,
      });
      setRevokeTarget(null);
      loadData();
    } catch (err: any) {
      setToastMessage({
        type: "err",
        text: err?.message || "Gagal mencabut pendelegasian wewenang.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Department actions
  const openNewDeptModal = () => {
    setEditingDept(null);
    setDeptForm({
      siteId: sites[0]?.id || 1,
      code: "",
      name: "",
      isActive: true,
    });
    setModalErr(null);
    setShowDeptModal(true);
  };

  const openEditDeptModal = (d: Department) => {
    setEditingDept(d);
    setDeptForm({
      siteId: d.siteId,
      code: d.code,
      name: d.name,
      isActive: d.isActive,
    });
    setModalErr(null);
    setShowDeptModal(true);
  };

  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalErr(null);

    const isEdit = !!editingDept;

    try {
      await api("/api/departments", {
        method: "POST",
        body: {
          id: isEdit ? editingDept.id : 0,
          siteId: Number(deptForm.siteId),
          code: deptForm.code.trim().toUpperCase(),
          name: deptForm.name.trim(),
          isActive: deptForm.isActive,
        },
      });
      setShowDeptModal(false);
      loadData();
      loadAllDepartments();
      setToastMessage({
        type: "ok",
        text: isEdit
          ? `Department "${deptForm.name}" updated successfully.`
          : `Department "${deptForm.name}" (${deptForm.code.toUpperCase()}) created successfully.`,
      });
    } catch (err: any) {
      setModalErr(err?.message || "Failed to save department");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDeptStatus = async (d: Department) => {
    try {
      await api("/api/departments", {
        method: "POST",
        body: {
          id: d.id,
          siteId: d.siteId,
          code: d.code,
          name: d.name,
          isActive: !d.isActive,
        },
      });
      loadData();
      loadAllDepartments();
      setToastMessage({
        type: "ok",
        text: `Department "${d.name}" ${d.isActive ? "deactivated" : "reactivated"} successfully.`,
      });
    } catch (err: any) {
      setToastMessage({
        type: "err",
        text: err?.message || "Failed to update department status",
      });
    }
  };

  return (
    <main className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Manage users, departments, and approval delegations.
          </p>
        </div>
        <div>
          {isSupervisor && tab === "users" && (
            <button type="button" className="btn btn-primary" onClick={openNewUserModal}>
              + Add User
            </button>
          )}
          {isSupervisor && tab === "departments" && (
            <button type="button" className="btn btn-primary" onClick={openNewDeptModal}>
              + Add Department
            </button>
          )}
          {isSupervisor && tab === "delegations" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setModalErr(null);
                setShowDelegationModal(true);
              }}
            >
              + Add Delegation
            </button>
          )}
        </div>
      </div>

      <Toast toast={toastMessage} onClose={() => setToastMessage(null)} />

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === "users" ? "active" : ""}`}
          onClick={() => setTab("users")}
        >
          Users
        </button>
        <button
          type="button"
          className={`tab ${tab === "departments" ? "active" : ""}`}
          onClick={() => setTab("departments")}
        >
          Departments
        </button>
        <button
          type="button"
          className={`tab ${tab === "delegations" ? "active" : ""}`}
          onClick={() => setTab("delegations")}
        >
          Approval Delegation
        </button>
      </div>

      <div className="toolbar" style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <div className="filter-group">
          {tab === "users" && (
            <input
              type="search"
              placeholder="Search user name or username..."
              className="filter-input"
              style={{ minWidth: "220px" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
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
        </div>
      </div>

      {/* Users Tab */}
      {tab === "users" && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Job Title & Initials</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Site</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: "2rem" }}>
                      <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Loading users...
                    </td>
                  </tr>
                ) : (users || []).length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                      No users found matching filters.
                    </td>
                  </tr>
                ) : (
                  pagedUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.fullName}</strong>
                      </td>
                      <td>
                        <code>{u.username}</code>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <div>{u.jobTitle || "—"}</div>
                        {u.initials && <span className="badge badge-gray">{u.initials}</span>}
                      </td>
                      <td>
                        <span className="badge badge-info">{u.roleName}</span>
                      </td>
                      <td>{u.departmentCode ? `${u.departmentCode} - ${u.departmentName}` : "—"}</td>
                      <td>{u.siteCode || "—"}</td>
                      <td>
                        <span className={`badge ${u.isActive ? "badge-ok" : "badge-err"}`}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {isSupervisor ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.6rem" }}
                            onClick={() => openEditUserModal(u)}
                          >
                            Edit
                          </button>
                        ) : (
                          <span className="muted small">View-only</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={userPage}
            pageSize={userPageSize}
            total={(users || []).length}
            disabled={loading}
            onPageChange={setUserPage}
            onPageSizeChange={(s) => {
              setUserPageSize(s);
              setUserPage(1);
            }}
          />
        </>
      )}

      {/* Departments Tab */}
      {tab === "departments" && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Department Code</th>
                  <th>Department Name</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(departments || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                      No departments found matching filters.
                    </td>
                  </tr>
                ) : (
                  pagedDepts.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <span className="badge badge-info">{d.siteCode}</span>
                      </td>
                      <td>
                        <code>{d.code}</code>
                      </td>
                      <td>
                        <strong>{d.name}</strong>
                      </td>
                      <td>
                        <span className={`badge ${d.isActive ? "badge-ok" : "badge-err"}`}>
                          {d.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {isSupervisor ? (
                          <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{
                                minHeight: "30px",
                                fontSize: "0.8rem",
                                padding: "0 0.65rem",
                                border: "1px solid var(--border)",
                                fontWeight: 600,
                              }}
                              onClick={() => openEditDeptModal(d)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{
                                minHeight: "30px",
                                fontSize: "0.8rem",
                                padding: "0 0.65rem",
                                background: "var(--surface)",
                                color: d.isActive ? "var(--err-text)" : "var(--ok)",
                                border: `1px solid ${d.isActive ? "var(--err-border)" : "var(--info-border)"}`,
                                fontWeight: 600,
                              }}
                              onClick={() => handleToggleDeptStatus(d)}
                              title={d.isActive ? "Deactivate Department" : "Activate Department"}
                            >
                              {d.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        ) : (
                          <span className="muted small">View-only</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={deptPage}
            pageSize={deptPageSize}
            total={(departments || []).length}
            disabled={loading}
            onPageChange={setDeptPage}
            onPageSizeChange={(s) => {
              setDeptPageSize(s);
              setDeptPage(1);
            }}
          />
        </>
      )}

      {/* Delegations Tab */}
      {tab === "delegations" && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Role</th>
                  <th>Principal (Approver Asli)</th>
                  <th>Delegate (Pengganti)</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(delegations || []).length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                      No active or past delegations recorded.
                    </td>
                  </tr>
                ) : (
                  pagedDelegations.map((dl) => (
                    <tr key={dl.id}>
                      <td>
                        <span className="badge badge-info">{dl.siteCode}</span>
                      </td>
                      <td>{dl.roleCode}</td>
                      <td>
                        <strong>{dl.principalName}</strong>
                      </td>
                      <td>
                        <strong>{dl.delegateName}</strong>
                      </td>
                      <td>{new Date(dl.startDate).toLocaleDateString()}</td>
                      <td>{dl.endDate ? new Date(dl.endDate).toLocaleDateString() : "Indefinite"}</td>
                      <td>{dl.reason}</td>
                      <td>
                        <span className={`badge ${dl.isRevoked ? "badge-err" : "badge-ok"}`}>
                          {dl.isRevoked ? "Revoked" : "Active"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {!dl.isRevoked && isSupervisor && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ minHeight: "30px", fontSize: "0.8rem", padding: "0 0.6rem", color: "var(--err-text)" }}
                            onClick={() => handleRevokeDelegation(dl)}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  )))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={delegationPage}
            pageSize={delegationPageSize}
            total={(delegations || []).length}
            disabled={loading}
            onPageChange={setDelegationPage}
            onPageSizeChange={(s) => {
              setDelegationPageSize(s);
              setDelegationPage(1);
            }}
          />
        </>
      )}

      {/* Add / Edit User Modal */}
      {showUserModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">{editingUser ? "Edit User" : "Request New User"}</h2>
              <button type="button" className="modal-close" onClick={() => setShowUserModal(false)}>
                ×
              </button>
            </div>

            {modalErr && <div className="alert alert-error">{modalErr}</div>}

            <form onSubmit={handleUserSubmit}>
              {!editingUser && (
                <div className="field">
                  <label htmlFor="u_username">Username (Unique) <span style={{ color: "#c52a2a" }}>*</span></label>
                  <input
                    id="u_username"
                    type="text"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    required
                  />
                  <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
                    New accounts are assigned default password <code>Gap12345</code> and must change it on first login.
                  </p>
                </div>
              )}

              <div className="field">
                <label htmlFor="u_fullname">Full Name <span style={{ color: "#c52a2a" }}>*</span></label>
                <input
                  id="u_fullname"
                  type="text"
                  value={userForm.fullName}
                  onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="u_email">Email <span style={{ color: "#c52a2a" }}>*</span></label>
                <input
                  id="u_email"
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", margin: 0 }}>
                <div className="field">
                  <label htmlFor="u_title">Job Title</label>
                  <input
                    id="u_title"
                    type="text"
                    value={userForm.jobTitle}
                    onChange={(e) => setUserForm({ ...userForm, jobTitle: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="u_initials">Initials</label>
                  <input
                    id="u_initials"
                    type="text"
                    placeholder="e.g. JD"
                    value={userForm.initials}
                    onChange={(e) => setUserForm({ ...userForm, initials: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", margin: 0 }}>
                <div className="field">
                  <label htmlFor="u_site">Site <span style={{ color: "#c52a2a" }}>*</span></label>
                  <select
                    id="u_site"
                    className="filter-select"
                    style={{ width: "100%" }}
                    value={userForm.siteId}
                    onChange={(e) => {
                      const newSiteId = Number(e.target.value);
                      const deptStillValid = allDepartments.some(
                        (d) => d.id === userForm.departmentId && d.siteId === newSiteId
                      );
                      setUserForm({
                        ...userForm,
                        siteId: newSiteId,
                        departmentId: deptStillValid ? userForm.departmentId : 0,
                      });
                    }}
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="u_department">Department</label>
                  <select
                    id="u_department"
                    className="filter-select"
                    style={{ width: "100%" }}
                    value={userForm.departmentId}
                    onChange={(e) => setUserForm({ ...userForm, departmentId: Number(e.target.value) })}
                  >
                    {allDepartments
                      .filter((d) => d.isActive && (!userForm.siteId || d.siteId === userForm.siteId))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} - {d.name} ({d.siteCode})
                        </option>
                      ))}
                  </select>
                  {allDepartments.filter((d) => d.isActive && (!userForm.siteId || d.siteId === userForm.siteId)).length === 0 && (
                    <small className="muted" style={{ display: "block", marginTop: "0.25rem", fontSize: "0.75rem" }}>
                      There are no active departments on this site. Add them via the Departments tab if require departmens.
                    </small>
                  )}
                </div>
              </div>

              <div className="grid" style={{ gridTemplateColumns: "1fr", margin: 0 }}>
                <div className="field">
                  <label htmlFor="u_role">Role <span style={{ color: "#c52a2a" }}>*</span></label>
                  <select
                    id="u_role"
                    className="filter-select"
                    style={{ width: "100%" }}
                    value={userForm.roleId}
                    onChange={(e) => setUserForm({ ...userForm, roleId: Number(e.target.value) })}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {editingUser && (
                <div className="field">
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={userForm.isActive}
                      onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                      style={{ width: "18px", height: "18px", margin: 0, accentColor: "var(--primary)", cursor: "pointer" }}
                    />
                    <span style={{ fontWeight: 600 }}>Active Account</span>
                  </label>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowUserModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Save User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Delegation Modal */}
      {showDelegationModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Delegation of Authority</h2>
              <button type="button" className="modal-close" onClick={() => setShowDelegationModal(false)}>
                ×
              </button>
            </div>

            {modalErr && <div className="alert alert-error">{modalErr}</div>}

            <form onSubmit={handleDelegationSubmit}>
              <div className="field">
                <label htmlFor="d_site">Site <span style={{ color: "#c52a2a" }}>*</span></label>
                <select
                  id="d_site"
                  className="filter-select"
                  style={{ width: "100%" }}
                  value={delegationForm.siteId}
                  onChange={(e) => setDelegationForm({ ...delegationForm, siteId: Number(e.target.value) })}
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="d_role">Role to Delegate <span style={{ color: "#c52a2a" }}>*</span></label>
                <select
                  id="d_role"
                  className="filter-select"
                  style={{ width: "100%" }}
                  value={delegationForm.roleId}
                  onChange={(e) => setDelegationForm({ ...delegationForm, roleId: Number(e.target.value) })}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="d_principal">Principal Approver (Approver Asli) <span style={{ color: "#c52a2a" }}>*</span></label>
                <select
                  id="d_principal"
                  className="filter-select"
                  style={{ width: "100%" }}
                  value={delegationForm.principalUserId}
                  onChange={(e) => setDelegationForm({ ...delegationForm, principalUserId: Number(e.target.value) })}
                  required
                >
                  <option value="">— Select Principal —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.roleName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="d_delegate">Delegate Approver (Pengganti Berwenang) <span style={{ color: "#c52a2a" }}>*</span></label>
                <select
                  id="d_delegate"
                  className="filter-select"
                  style={{ width: "100%" }}
                  value={delegationForm.delegateUserId}
                  onChange={(e) => setDelegationForm({ ...delegationForm, delegateUserId: Number(e.target.value) })}
                  required
                >
                  <option value="">— Select Delegate —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.roleName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", margin: 0 }}>
                <div className="field">
                  <label htmlFor="d_start">Start Date <span style={{ color: "#c52a2a" }}>*</span></label>
                  <input
                    id="d_start"
                    type="date"
                    value={delegationForm.startDate}
                    onChange={(e) => setDelegationForm({ ...delegationForm, startDate: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="d_end">End Date (Optional)</label>
                  <input
                    id="d_end"
                    type="date"
                    value={delegationForm.endDate}
                    onChange={(e) => setDelegationForm({ ...delegationForm, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="d_reason">Reason for Delegation <span style={{ color: "#c52a2a" }}>*</span></label>
                <textarea
                  id="d_reason"
                  rows={2}
                  className="filter-input"
                  style={{ width: "100%", height: "auto" }}
                  placeholder="mis. Cuti tahunan / Dinas luar kota..."
                  value={delegationForm.reason}
                  onChange={(e) => setDelegationForm({ ...delegationForm, reason: e.target.value })}
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowDelegationModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Create Delegation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Department Modal */}
      {showDeptModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">
                {editingDept ? "Edit Department" : "Add New Department"}
              </h2>
              <button type="button" className="modal-close" onClick={() => setShowDeptModal(false)}>
                ×
              </button>
            </div>

            {modalErr && <div className="alert alert-error">{modalErr}</div>}

            <form onSubmit={handleDeptSubmit}>
              <div className="field">
                <label htmlFor="dept_site">Target Site <span style={{ color: "#c52a2a" }}>*</span></label>
                <select
                  id="dept_site"
                  className="filter-select"
                  style={{ width: "100%" }}
                  value={deptForm.siteId}
                  onChange={(e) => setDeptForm({ ...deptForm, siteId: Number(e.target.value) })}
                  disabled={!!editingDept}
                  required
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="dept_code">Department Code (e.g. QC, QA, PR, WH) <span style={{ color: "#c52a2a" }}>*</span></label>
                <input
                  id="dept_code"
                  type="text"
                  maxLength={10}
                  placeholder="e.g. QC"
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
                  disabled={!!editingDept}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="dept_name">Department Name <span style={{ color: "#c52a2a" }}>*</span></label>
                <input
                  id="dept_name"
                  type="text"
                  placeholder="e.g. Quality Control"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  required
                />
              </div>

              {editingDept && (
                <div className="field">
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={deptForm.isActive}
                      onChange={(e) => setDeptForm({ ...deptForm, isActive: e.target.checked })}
                      style={{ width: "18px", height: "18px", margin: 0, accentColor: "var(--primary)", cursor: "pointer" }}
                    />
                    <span style={{ fontWeight: 600 }}>Active Status</span>
                  </label>
                  <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
                    Deactivating a department preserves historical audit and assessment records.
                  </p>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowDeptModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingDept ? "Save Changes" : "Create Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Revoke Delegation Confirmation Modal */}
      {revokeTarget && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#b91c1c" }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Revoke Delegation
              </h2>
              <button type="button" className="modal-close" onClick={() => setRevokeTarget(null)}>
                ×
              </button>
            </div>
            <div style={{ padding: "0.5rem 0 1rem", fontSize: "0.9rem", color: "var(--text)" }}>
              Apakah Anda yakin ingin mencabut (<strong>Revoke</strong>) pendelegasian wewenang approval dari{" "}
              <strong>{revokeTarget.principalName}</strong> ke <strong>{revokeTarget.delegateName}</strong> ({revokeTarget.siteCode})?
              <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.85rem", background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: "6px", fontSize: "0.82rem", color: "#991b1b" }}>
                Wewenang approval akan langsung dikembalikan ke Approver Asli dan tindakan pencabutan ini akan dicatat ke dalam Audit Trail.
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRevokeTarget(null)} disabled={submitting}>
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
                disabled={submitting}
                onClick={confirmRevoke}
              >
                {submitting ? "Memproses..." : "Ya, Revoke Delegasi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}