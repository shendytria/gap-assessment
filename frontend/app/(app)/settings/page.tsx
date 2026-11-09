"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";

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
  const { me } = useSession();
  const [tab, setTab] = useState<"users" | "departments" | "delegations">("users");

  const [sites, setSites] = useState<{ id: number; code: string; name: string }[]>([]);
  const [roles, setRoles] = useState<{ id: number; code: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);

  const [loading, setLoading] = useState(true);
  const [siteFilter, setSiteFilter] = useState("");
  const [search, setSearch] = useState("");

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

  useEffect(() => {
    Promise.all([
      api<{ id: number; code: string; name: string }[]>("/api/sites"),
      api<{ id: number; code: string; name: string }[]>("/api/roles"),
    ])
      .then(([s, r]) => {
        const safeS = s || [];
        const safeR = r || [];
        setSites(safeS);
        setRoles(safeR);
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
    loadData();
  }, [tab, siteFilter, search]);

  const isSupervisor = me?.user.role === "CO_GAP_SUPERVISOR";

  const openNewUserModal = () => {
    setEditingUser(null);
    setUserForm({
      username: "",
      fullName: "",
      email: "",
      jobTitle: "",
      initials: "",
      roleId: roles[0]?.id || 0,
      departmentId: departments[0]?.id || 0,
      siteId: sites[0]?.id || 0,
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
      siteId: u.siteId || 0,
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
            fullName: userForm.fullName,
            email: userForm.email,
            jobTitle: userForm.jobTitle,
            initials: userForm.initials,
            roleId: Number(userForm.roleId),
            departmentId: userForm.departmentId ? Number(userForm.departmentId) : null,
            siteId: userForm.siteId ? Number(userForm.siteId) : null,
            isActive: userForm.isActive,
          },
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

  const handleRevokeDelegation = async (id: number) => {
    if (!confirm("Are you sure you want to revoke this delegation?")) return;
    try {
      await api(`/api/delegations/${id}`, { method: "DELETE" });
      loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to revoke delegation");
    }
  };

  return (
    <main className="page">
      <div className="toolbar">
        <div>
          <h1 className="page-title">System Settings (Master Data & Delegations)</h1>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Kelola data Master Users, Departemen, dan Delegasi Wewenang Approval (URS 006A, 011A-D).
          </p>
        </div>
        <div>
          {isSupervisor && tab === "users" && (
            <button type="button" className="btn btn-primary" onClick={openNewUserModal}>
              + Request New User
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

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === "users" ? "active" : ""}`}
          onClick={() => setTab("users")}
        >
          Master List Users (006A / 011A)
        </button>
        <button
          type="button"
          className={`tab ${tab === "departments" ? "active" : ""}`}
          onClick={() => setTab("departments")}
        >
          Departments (011B)
        </button>
        <button
          type="button"
          className={`tab ${tab === "delegations" ? "active" : ""}`}
          onClick={() => setTab("delegations")}
        >
          Delegation Approval (011D)
        </button>
      </div>

      <div className="toolbar" style={{ marginTop: "1rem" }}>
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
                (users || []).map((u) => (
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
      )}

      {/* Departments Tab */}
      {tab === "departments" && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Department Code</th>
                <th>Department Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(departments || []).length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "2rem" }} className="muted">
                    No departments found matching filters.
                  </td>
                </tr>
              ) : (
                (departments || []).map((d) => (
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Delegations Tab */}
      {tab === "delegations" && (
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
                (delegations || []).map((dl) => (
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
                        onClick={() => handleRevokeDelegation(dl.id)}
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
                  <label htmlFor="u_username">Username (Unique)</label>
                  <input
                    id="u_username"
                    type="text"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    required
                  />
                  <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
                    Akun baru otomatis diberikan password default <code>KCH12345</code> dan wajib ganti password saat login pertama.
                  </p>
                </div>
              )}

              <div className="field">
                <label htmlFor="u_fullname">Full Name</label>
                <input
                  id="u_fullname"
                  type="text"
                  value={userForm.fullName}
                  onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="u_email">Email</label>
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
                  <label htmlFor="u_title">Job Title (Jabatan)</label>
                  <input
                    id="u_title"
                    type="text"
                    value={userForm.jobTitle}
                    onChange={(e) => setUserForm({ ...userForm, jobTitle: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="u_initials">Initials (Inisial PIC)</label>
                  <input
                    id="u_initials"
                    type="text"
                    placeholder="mis. JD"
                    value={userForm.initials}
                    onChange={(e) => setUserForm({ ...userForm, initials: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", margin: 0 }}>
                <div className="field">
                  <label htmlFor="u_site">Site</label>
                  <select
                    id="u_site"
                    className="filter-select"
                    style={{ width: "100%" }}
                    value={userForm.siteId}
                    onChange={(e) => setUserForm({ ...userForm, siteId: Number(e.target.value) })}
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="u_role">Role</label>
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
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={userForm.isActive}
                      onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <span>Active Account (Nonaktifkan untuk deactive)</span>
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
              <h2 className="modal-title">Delegation of Authority (URS 011D)</h2>
              <button type="button" className="modal-close" onClick={() => setShowDelegationModal(false)}>
                ×
              </button>
            </div>

            {modalErr && <div className="alert alert-error">{modalErr}</div>}

            <form onSubmit={handleDelegationSubmit}>
              <div className="field">
                <label htmlFor="d_site">Site</label>
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
                <label htmlFor="d_role">Role to Delegate</label>
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
                <label htmlFor="d_principal">Principal Approver (Approver Asli)</label>
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
                <label htmlFor="d_delegate">Delegate Approver (Pengganti Berwenang)</label>
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
                  <label htmlFor="d_start">Start Date</label>
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
                <label htmlFor="d_reason">Reason for Delegation</label>
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
    </main>
  );
}
