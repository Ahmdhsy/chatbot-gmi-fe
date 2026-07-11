"use client";

import React, { useState, useEffect } from "react";
import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { apiFetch } from "@/app/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import {
  LocationHierarchy,
  areaNames,
  regionsForArea,
  nopsForRegion,
  optionsWithCurrent,
} from "@/app/lib/locationHierarchy";

interface UserType {
  user_id: string;
  email: string;
  username: string | null;
  role: string;
  is_active: boolean;
  area: string | null;
  region: string | null;
  nop: string | null;
  created_at: string | null;
}

const ROLE_OPTIONS = [
  { value: "user", label: "Operational User" },
  { value: "manager", label: "Manager" },
  { value: "executive", label: "Executive" },
  { value: "admin", label: "Admin" },
];

const SELECT_CLASS =
  "w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors";

/** Cascading Area -> Region -> NOP selects, shared by the add & edit modals. */
function LocationDropdowns({
  hierarchy,
  area,
  region,
  nop,
  onAreaChange,
  onRegionChange,
  onNopChange,
}: {
  hierarchy: LocationHierarchy | null;
  area: string;
  region: string;
  nop: string;
  onAreaChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onNopChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">Area</label>
        <select value={area} onChange={(e) => onAreaChange(e.target.value)} className={SELECT_CLASS}>
          <option value="" className="dark:bg-[#232220]">— Pilih Area —</option>
          {optionsWithCurrent(areaNames(hierarchy), area).map((a) => (
            <option key={a} value={a} className="dark:bg-[#232220]">{a}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">Region</label>
        <select
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          disabled={!area}
          className={SELECT_CLASS}
        >
          <option value="" className="dark:bg-[#232220]">— Pilih Region —</option>
          {optionsWithCurrent(regionsForArea(hierarchy, area), region).map((r) => (
            <option key={r} value={r} className="dark:bg-[#232220]">{r}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">NOP</label>
        <select
          value={nop}
          onChange={(e) => onNopChange(e.target.value)}
          disabled={!region}
          className={SELECT_CLASS}
        >
          <option value="" className="dark:bg-[#232220]">— Pilih NOP —</option>
          {optionsWithCurrent(nopsForRegion(hierarchy, area, region), nop).map((n) => (
            <option key={n} value={n} className="dark:bg-[#232220]">{n}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function ManageUsersPage() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formConfirmPassword, setFormConfirmPassword] = useState("");
  const [formRole, setFormRole] = useState("user"); // default to 'user' (Karyawan)
  const [formArea, setFormArea] = useState("");
  const [formRegion, setFormRegion] = useState("");
  const [formNop, setFormNop] = useState("");
  const [hierarchy, setHierarchy] = useState<LocationHierarchy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Edit & Delete states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resetFormFields = () => {
    setFormEmail("");
    setFormUsername("");
    setFormPassword("");
    setFormConfirmPassword("");
    setFormRole("user");
    setFormArea("");
    setFormRegion("");
    setFormNop("");
    setFormError(null);
    setFormSuccess(null);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    resetFormFields();
  };

  const handleOpenEditModal = async (u: UserType) => {
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(false);
    
    setFormEmail(u.email);
    setFormUsername(u.username ?? "");
    setFormRole(u.role);
    setFormArea(u.area ?? "");
    setFormRegion(u.region ?? "");
    setFormNop(u.nop ?? "");
    setFormPassword("");
    setFormConfirmPassword("");
    setEditingUserId(u.user_id);
    setShowEditModal(true);

    try {
      const res = await apiFetch(`/auth/users/${u.user_id}`);
      if (res.ok) {
        const freshUser = await res.json();
        setFormEmail(freshUser.email);
        setFormUsername(freshUser.username ?? "");
        setFormRole(freshUser.role);
        setFormArea(freshUser.area ?? "");
        setFormRegion(freshUser.region ?? "");
        setFormNop(freshUser.nop ?? "");
      }
    } catch (err) {
      console.error("Gagal mengambil detail user:", err);
    }
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingUserId(null);
    resetFormFields();
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!editingUserId) return;

    if (!formEmail.trim() || !formUsername.trim()) {
      setFormError("Email dan Username wajib diisi.");
      return;
    }

    if (formPassword) {
      if (formPassword.length < 8) {
        setFormError("Password minimal harus 8 karakter.");
        return;
      }
      if (!/[A-Z]/.test(formPassword)) {
        setFormError("Password harus memiliki minimal satu huruf besar (A-Z).");
        return;
      }
      if (!/\d/.test(formPassword)) {
        setFormError("Password harus memiliki minimal satu angka (0-9).");
        return;
      }
      if (formPassword !== formConfirmPassword) {
        setFormError("Konfirmasi password tidak sesuai.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: any = {
        email: formEmail.trim(),
        username: formUsername.trim(),
        role: formRole,
        area: formArea.trim() || null,
        region: formRegion.trim() || null,
        nop: formNop.trim() || null,
      };
      if (formPassword) {
        payload.password = formPassword;
      }

      const res = await apiFetch(`/auth/users/${editingUserId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFormSuccess("User berhasil diperbarui!");

        const refreshRes = await apiFetch("/auth/users");
        if (refreshRes.ok) {
          const freshData = await refreshRes.json();
          setUsers(freshData);
        }

        setTimeout(() => {
          handleCloseEditModal();
        }, 1200);
      } else {
        const body = await res.json().catch(() => null);
        const detail = body?.detail ?? "Gagal memperbarui user.";
        setFormError(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
    } catch (err) {
      console.error("Gagal mengirim request update user:", err);
      setFormError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDeleteModal = (u: UserType) => {
    setUserToDelete(u);
    setShowDeleteModal(true);
    setFormError(null);
    setFormSuccess(null);
  };

  const handleDeleteUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToDelete) return;
    setDeleting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const res = await apiFetch(`/auth/users/${userToDelete.user_id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setFormSuccess("User berhasil dihapus!");

        const refreshRes = await apiFetch("/auth/users");
        if (refreshRes.ok) {
          const freshData = await refreshRes.json();
          setUsers(freshData);
        }

        setTimeout(() => {
          setShowDeleteModal(false);
          setUserToDelete(null);
          setFormSuccess(null);
        }, 1200);
      } else {
        const body = await res.json().catch(() => null);
        const detail = body?.detail ?? "Gagal menghapus user.";
        setFormError(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
    } catch (err) {
      console.error("Gagal mengirim request delete user:", err);
      setFormError("Terjadi kesalahan jaringan.");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    // Validation checks
    if (!formEmail.trim() || !formUsername.trim() || !formPassword || !formConfirmPassword) {
      setFormError("Semua field wajib diisi.");
      return;
    }

    if (formPassword.length < 8) {
      setFormError("Password minimal harus 8 karakter.");
      return;
    }

    if (!/[A-Z]/.test(formPassword)) {
      setFormError("Password harus memiliki minimal satu huruf besar (A-Z).");
      return;
    }

    if (!/\d/.test(formPassword)) {
      setFormError("Password harus memiliki minimal satu angka (0-9).");
      return;
    }

    if (formPassword !== formConfirmPassword) {
      setFormError("Konfirmasi password tidak sesuai.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/auth/users", {
        method: "POST",
        body: JSON.stringify({
          email: formEmail.trim(),
          username: formUsername.trim(),
          password: formPassword,
          role: formRole,
          area: formArea.trim() || null,
          region: formRegion.trim() || null,
          nop: formNop.trim() || null,
        }),
      });

      if (res.ok) {
        setFormSuccess("User berhasil didaftarkan!");

        const refreshRes = await apiFetch("/auth/users");
        if (refreshRes.ok) {
          const freshData = await refreshRes.json();
          setUsers(freshData);
        }

        setTimeout(() => {
          handleCloseModal();
        }, 1200);
      } else {
        const body = await res.json().catch(() => null);
        const detail = body?.detail ?? "Gagal mendaftarkan user baru.";
        setFormError(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
    } catch (err) {
      console.error("Gagal mengirim request create user:", err);
      setFormError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    let active = true;

    const fetchUsers = async () => {
      try {
        const res = await apiFetch("/auth/users");
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setUsers(data);
            setLoading(false);
          }
        } else {
          if (active) {
            setError(`Gagal mengambil data user (status ${res.status}).`);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Gagal mengambil list user:", err);
        if (active) {
          setError("Terjadi kesalahan jaringan.");
          setLoading(false);
        }
      }
    };

    fetchUsers();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch("/auth/location-hierarchy")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (active && data) setHierarchy(data); })
      .catch(() => { /* dropdowns just stay empty; form still submits */ });
    return () => { active = false; };
  }, []);

  return (
    <>
      <Breadcrumb pageName="Manage User" />

      <div className="rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        
        {/* Header and Add User Button */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-dark dark:text-white">
            User Database Accounts
          </h3>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-[#FE6C11] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05b0a] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
            </svg>
            Add User
          </button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-500/10 p-4 text-center text-sm font-medium text-red-500 dark:bg-red-500/5">
            {error}
          </div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-gray-500 dark:text-[#8f8f8a]">
            No users registered in database.
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-none bg-[#F7F9FC] dark:bg-dark-2 [&>th]:py-4 [&>th]:text-base [&>th]:text-dark [&>th]:dark:text-white">
                  <TableHead className="xl:pl-7.5">User ID</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>NOP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="xl:pr-7.5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.user_id} className="border-[#eee] dark:border-dark-3">
                    <TableCell className="font-mono text-xs text-dark dark:text-white xl:pl-7.5">
                      {u.user_id}
                    </TableCell>

                    <TableCell>
                      <span className="font-medium text-dark dark:text-white">
                        {u.username || "-"}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-dark dark:text-white">
                        {u.email}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="capitalize font-medium text-dark dark:text-white">
                        {u.role}
                      </div>
                    </TableCell>

                    <TableCell className="text-dark dark:text-white">
                      {u.area || "-"}
                    </TableCell>

                    <TableCell className="text-dark dark:text-white">
                      {u.region || "-"}
                    </TableCell>

                    <TableCell className="text-dark dark:text-white">
                      {u.nop || "-"}
                    </TableCell>

                    <TableCell>
                      <div
                        className={cn(
                          "max-w-fit rounded-full px-3.5 py-1 text-sm font-medium",
                          u.is_active
                            ? "bg-[#219653]/[0.08] text-[#219653]"
                            : "bg-[#D34053]/[0.08] text-[#D34053]"
                        )}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </div>
                    </TableCell>

                    <TableCell className="text-dark dark:text-white">
                      {u.created_at ? dayjs(u.created_at).format("MMM DD, YYYY HH:mm") : "-"}
                    </TableCell>

                    <TableCell className="xl:pr-7.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEditModal(u)}
                          className="rounded p-1.5 text-blue-500 hover:bg-blue-500/10 transition-colors"
                          title="Edit User"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4.5 h-4.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        {/* Delete Button */}
                        <button
                          onClick={() => handleOpenDeleteModal(u)}
                          className="rounded p-1.5 text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Delete User"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4.5 h-4.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add User Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-[480px] rounded-[14px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-[#232220] dark:shadow-card animate-slideIn">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stroke pb-4 dark:border-dark-3">
              <h3 className="text-lg font-bold text-dark dark:text-white">
                Add New User
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-dark dark:text-[#8f8f8a] dark:hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddUserSubmit} className="mt-4 flex flex-col gap-4">
              
              {formError && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-500 dark:bg-red-500/5">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="rounded-lg bg-green-500/10 p-3 text-sm font-medium text-green-500 dark:bg-green-500/5">
                  {formSuccess}
                </div>
              )}

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="Enter email address"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                />
              </div>

              {/* Username */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter username"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min. 8 chars, 1 uppercase, 1 number"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                />
              </div>

              {/* Confirm Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Confirm password"
                  value={formConfirmPassword}
                  onChange={(e) => setFormConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                />
              </div>

              {/* Role Select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="dark:bg-[#232220]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location Identity */}
              <LocationDropdowns
                hierarchy={hierarchy}
                area={formArea}
                region={formRegion}
                nop={formNop}
                onAreaChange={(v) => { setFormArea(v); setFormRegion(""); setFormNop(""); }}
                onRegionChange={(v) => { setFormRegion(v); setFormNop(""); }}
                onNopChange={setFormNop}
              />

              {/* Actions */}
              <div className="mt-4 flex items-center justify-end gap-3 border-t border-stroke pt-4 dark:border-dark-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-lg border border-stroke px-4 py-2 text-sm font-semibold text-dark hover:bg-gray-100 dark:border-dark-3 dark:text-white dark:hover:bg-[#2d2a27] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#FE6C11] px-5 py-2 text-sm font-semibold text-white hover:bg-[#e05b0a] disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Saving..." : "Save User"}
                </button>
              </div>

            </form>
          </div>
          <style>{`@keyframes slideIn { from { opacity:0; transform:translateY(-20px) } to { opacity:1; transform:translateY(0) } } .animate-slideIn { animation: slideIn 0.2s ease-out forwards; }`}</style>
        </div>
      )}
      {/* Edit User Modal Dialog */}
      {showEditModal && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-[480px] rounded-[14px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-[#232220] dark:shadow-card animate-slideIn">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stroke pb-4 dark:border-dark-3">
              <h3 className="text-lg font-bold text-dark dark:text-white">
                Edit User
              </h3>
              <button
                onClick={handleCloseEditModal}
                className="text-gray-500 hover:text-dark dark:text-[#8f8f8a] dark:hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEditUserSubmit} className="mt-4 flex flex-col gap-4">
              
              {formError && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-500 dark:bg-red-500/5">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="rounded-lg bg-green-500/10 p-3 text-sm font-medium text-green-500 dark:bg-green-500/5">
                  {formSuccess}
                </div>
              )}

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="Enter email address"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                />
              </div>

              {/* Username */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter username"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Password (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Kosongkan jika tidak ingin mengubah password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                />
              </div>

              {/* Confirm Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Confirm Password
                </label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={formConfirmPassword}
                  onChange={(e) => setFormConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                />
              </div>

              {/* Role Select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="dark:bg-[#232220]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location Identity */}
              <LocationDropdowns
                hierarchy={hierarchy}
                area={formArea}
                region={formRegion}
                nop={formNop}
                onAreaChange={(v) => { setFormArea(v); setFormRegion(""); setFormNop(""); }}
                onRegionChange={(v) => { setFormRegion(v); setFormNop(""); }}
                onNopChange={setFormNop}
              />

              {/* Actions */}
              <div className="mt-4 flex items-center justify-end gap-3 border-t border-stroke pt-4 dark:border-dark-3">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="rounded-lg border border-stroke px-4 py-2 text-sm font-semibold text-dark hover:bg-gray-100 dark:border-dark-3 dark:text-white dark:hover:bg-[#2d2a27] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#FE6C11] px-5 py-2 text-sm font-semibold text-white hover:bg-[#e05b0a] disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Saving..." : "Update User"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-[480px] rounded-[14px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-[#232220] dark:shadow-card animate-slideIn">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stroke pb-4 dark:border-dark-3">
              <h3 className="text-lg font-bold text-dark dark:text-white">
                Delete User
              </h3>
              <button
                onClick={() => { setShowDeleteModal(false); setUserToDelete(null); }}
                className="text-gray-500 hover:text-dark dark:text-[#8f8f8a] dark:hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleDeleteUserSubmit} className="mt-4 flex flex-col gap-4">
              
              {formError && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-500 dark:bg-red-500/5">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="rounded-lg bg-green-500/10 p-3 text-sm font-medium text-green-500 dark:bg-green-500/5">
                  {formSuccess}
                </div>
              )}

              <p className="text-sm text-gray-500 dark:text-[#ece7dc]">
                Apakah anda yakin akan menghapus user tersebut atau tidak?
              </p>

              {userToDelete && (
                <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3.5 font-mono text-xs text-red-500 dark:bg-red-500/10">
                  <div className="grid grid-cols-3 gap-y-1">
                    <span className="font-semibold">ID:</span>
                    <span className="col-span-2 overflow-hidden text-ellipsis">{userToDelete.user_id}</span>
                    <span className="font-semibold">Username:</span>
                    <span className="col-span-2 overflow-hidden text-ellipsis">{userToDelete.username || "-"}</span>
                    <span className="font-semibold">Email:</span>
                    <span className="col-span-2 overflow-hidden text-ellipsis">{userToDelete.email}</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex items-center justify-end gap-3 border-t border-stroke pt-4 dark:border-dark-3">
                <button
                  type="button"
                  onClick={() => { setShowDeleteModal(false); setUserToDelete(null); }}
                  className="rounded-lg border border-stroke px-4 py-2 text-sm font-semibold text-dark hover:bg-gray-100 dark:border-dark-3 dark:text-white dark:hover:bg-[#2d2a27] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting}
                  className="rounded-lg bg-red-500 px-5 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Deleting..." : "Delete User"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </>
  );
}
