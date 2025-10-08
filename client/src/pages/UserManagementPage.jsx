import React, { useEffect, useMemo, useState } from "react";
import HeaderPage from "../components/Header";

const API_BASE = "http://localhost:3000";
const authHeaders = {}; // e.g. { Authorization: `Bearer ${token}` }

const GROUPS = [
  { value: "admin",            label: "Admin" },
  { value: "project_lead",     label: "Project Lead" },
  { value: "project_manager",  label: "Project Manager" },
  { value: "dev_team",         label: "Dev Team" },
];

// Simple toggle UI
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={[
        "inline-flex h-6 w-11 items-center rounded-full transition",
        checked ? "bg-emerald-600" : "bg-slate-300",
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
      aria-pressed={checked}
      aria-label="Toggle Active"
    >
      <span
        className={[
          "h-5 w-5 rounded-full bg-white shadow transform transition",
          checked ? "translate-x-5" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

export default function UserManagementPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // New user row state
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    userGroup: "dev_team",
    password: "",
    active: true,
  });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // Load users on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      setPageError("");
      try {
        const res = await fetch(`${API_BASE}/api/users`, {
          headers: { Accept: "application/json", ...authHeaders },
        });
        if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
        const data = await res.json();
        const normalized = (data || [])
          .map(u => ({
            id: u.id,
            username: u.username ?? "",
            email: u.email ?? "",
            userGroup: u.userGroup ?? "dev_team",
            active: typeof u.active === "boolean" ? u.active : true,
            password: "",       // only send if user types a new one
            saving: false,
            rowErr: "",
            savedTick: false,
            __orig: {
              username: u.username,
              email: u.email,
              userGroup: u.userGroup,
              active: u.active,
            },
          }));
        setRows(normalized);
      } catch (e) {
        setPageError((e instanceof Error ? e.message : String(e)) + '. Please try again later.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setField = (id, field, value) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const validateRow = (r, isNew = false) => {
    if (!r.username?.trim()) return "Username is required.";
    if (!r.email?.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return "Email looks invalid.";
    if (!GROUPS.some(g => g.value === r.userGroup)) return "User group is invalid.";
    if (isNew && (!r.password || r.password.length < 8 || r.password.length > 10)) return "Password must be 8-10 characters.";
    if (!isNew && r.password && r.password.length < 8 || r.password.length > 10) return "Password must be 8-10 characters.";
    return "";
  };

  const saveRow = async (row) => {
    const err = validateRow(row, false);
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, rowErr: err } : r)));
    if (err) return;

    const allowed = ["username", "email", "userGroup"];
    const diff = {};
    for (const k of allowed) {
      const prevVal = row.__orig ? row.__orig[k] : undefined;
      if (row[k] !== prevVal) diff[k] = row[k];
    }
    if (row.password) diff.password = row.password;

    const payload = {...diff};
    if (Object.keys(payload).length === 0) {
      // if no changes
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, rowErr: "No changes to save." } : r));
      return;
    }

    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, saving: true, rowErr: "" } : r)));
    try {
      const res = await fetch(`${API_BASE}/api/users/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders },
        body: JSON.stringify(payload),
      });

      const updated = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(updated.error || `Save failed (${res.status})`);
      }
      // Merge response, clear password, refresh __orig snapshot
      setRows(prev => prev.map(r => {
        if (r.id !== row.id) return r;
        const merged = {
          ...r,
          ...updated,
          password: "",
          saving: false,
          savedTick: true,
        };
        merged.__orig = {
          username: merged.username,
          email: merged.email,
          userGroup: merged.userGroup,
          active: !!merged.active,
        };
        return merged;
      }));

      setTimeout(() => {
        setRows(prev => prev.map(r => (r.id === row.id ? { ...r, savedTick: false } : r)));
      }, 2000);
    } catch (e) {
      setRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, saving: false, rowErr: e instanceof Error ? e.message : String(e) } : r
      ));
    }
  };

  // send PATCH on toggle
  const toggleActive = async (row) => {
    const nextActive = !row.active;
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, active: nextActive, saving: true, rowErr: "" } : r)));
    try {
      const res = await fetch(`${API_BASE}/api/users/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders },
        body: JSON.stringify({ active: nextActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Toggle failed (${res.status})`);
      }
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, saving: false } : r)));
    } catch (e) {
      // revert on failure
      setRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, active: !nextActive, saving: false, rowErr: e instanceof Error ? e.message : String(e) } : r
      ));
    }
  };

  const createUser = async () => {
    const err = validateRow(newUser, true);
    setCreateErr(err);
    if (err) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders },
        body: JSON.stringify(newUser),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Create failed (${res.status})`);
      }
      const created = await res.json();
      // insert new user into table
      const newRow = {
        id: created.id,
        username: created.username ?? newUser.username,
        email: created.email ?? newUser.email,
        userGroup: created.userGroup ?? newUser.userGroup,
        active: typeof created.active === "boolean" ? created.active : newUser.active,
        password: "",
        saving: false,
        rowErr: "",
        savedTick: false,
      };
      setRows(prev =>
        [newRow, ...prev].sort((a,b) => a.id - b.id)
      );
      // reset add row
      setNewUser({ username: "", email: "", userGroup: "dev_team", password: "", active: true });
      setCreateErr("");
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const canCreate = newUser.username && newUser.email && newUser.password && !creating;

  if (loading) return <div className="p-6">Loading users…</div>;

  return (

    <>
    <HeaderPage />
    <div className="p-6">
      <h3 className="text-xl font-medium mb-4 pl-2">User Management</h3>
      {pageError && <div className="mb-4 text-red-600">{pageError}</div>}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50 text-slate-600 text-sm">
            <tr>
              <th className="text-left px-4 py-3">User ID</th>
              <th className="text-left px-4 py-3">Username</th>
              <th className="text-left px-4 py-3">User Group</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Password</th>
              <th className="text-left px-4 py-3">Active</th>
              <th className="text-left px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="text-sm">
            { !pageError &&
              // New user row
              <tr className="bg-white">
                <td className="px-4 py-2 text-slate-400">—</td>
                <td className="px-4 py-2">
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                    value={newUser.username}
                    onChange={(e) => setNewUser(s => ({ ...s, username: e.target.value }))}
                    placeholder="new username"
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                      value={newUser.userGroup}
                      onChange={(e) => setNewUser(s => ({ ...s, userGroup: e.target.value }))}
                    >
                      {GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">▾</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="email"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                    value={newUser.email}
                    onChange={(e) => setNewUser(s => ({ ...s, email: e.target.value }))}
                    placeholder="user@example.com"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="password"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                    value={newUser.password}
                    onChange={(e) => setNewUser(s => ({ ...s, password: e.target.value }))}
                    placeholder="8-10 chars only"
                  />
                </td>
                <td className="px-4 py-2">
                  <Toggle
                    checked={newUser.active}
                    onChange={(v) => setNewUser(s => ({ ...s, active: v }))}
                    disabled={creating}
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    className="rounded-md bg-emerald-600 px-3 py-2 text-white disabled:opacity-60 block w-full"
                    disabled={!canCreate}
                    onClick={createUser}
                  >
                    {creating ? "Creating…" : "Add User"}
                  </button>
                </td>
              </tr>
            }
            {createErr && (
              <tr>
                <td colSpan={7} className="px-4 pt-1 pb-2 text-red-600">{createErr}</td>
              </tr>
            )}

            {/* Existing users */}
            {rows.map((r, idx) => (
              <React.Fragment key={r.id}>
                <tr className={idx % 2 ? "bg-slate-50/50" : "bg-white"}>
                  <td className="px-4 py-2 align-middle text-slate-800">{r.id}</td>
                  <td className="px-4 py-2">
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      value={r.username}
                      onChange={(e) => setField(r.id, "username", e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="relative">
                      <select
                        className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                        value={r.userGroup}
                        onChange={(e) => setField(r.id, "userGroup", e.target.value)}
                      >
                        {GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">▾</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="email"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      value={r.email}
                      onChange={(e) => setField(r.id, "email", e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="password"
                      placeholder="(leave blank to keep)"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      value={r.password}
                      onChange={(e) => setField(r.id, "password", e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Toggle
                      checked={r.active}
                      onChange={() => toggleActive(r)}
                      disabled={r.saving}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      className="rounded-md bg-blue-600 px-3 py-2 text-white disabled:opacity-60 block w-full"
                      disabled={r.saving}
                      onClick={() => saveRow(r)}
                    >
                      {r.saving ? "Saving…" : r.savedTick ? "✓ Saved" : "Save"}
                    </button>
                  </td>
                </tr>
                {r.rowErr && (
                  <tr>
                    <td colSpan={7} className="px-4 pt-1 pb-2 text-red-600">{r.rowErr}</td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
