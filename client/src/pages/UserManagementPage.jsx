// src/pages/UserManagementPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import HeaderPage from "../components/Header";
import ChipsMultiSelect from "../components/ChipsMultiSelect";
import SimpleToggle from "../components/SimpleToggle";

axios.defaults.baseURL = "http://localhost:3000";
axios.defaults.withCredentials = true;


const normalizeStr = (name) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .slice(0, 50);

export default function UserManagementPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [groups, setGroups] = useState([]);
  const [groupLoading, setGroupLoading] = useState(false);

  // inline add-group UI state
  const [newGroupName, setNewGroupName] = useState("");
  const [groupErr, setGroupErr] = useState("");
  const [groupAdding, setGroupAdding] = useState(false);

  const [pageError, setPageError] = useState("");

  // New user row state
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    userGroups: ["dev team"],
    password: "",
    active: true,
  });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  const canCreate = useMemo(() => {
    return (
      newUser.username &&
      newUser.email &&
      newUser.password &&
      Array.isArray(newUser.userGroups) &&
      newUser.userGroups.length > 0 &&
      !creating
    );
  }, [newUser, creating]);

  const setField = (username, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.username === username ? { ...r, [field]: value } : r))
    );
  };

  const toggleActive = (row) => {
    const nextActive = !row.active;
    setRows((prev) =>
      prev.map((r) =>
        r.username === row.username
          ? { ...r, active: nextActive, rowErr: "" }
          : r
      )
    );
  };

  // Load session + users on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      setPageError("");
      try {
        // get current user
        const me = await axios.get("/api/me", {
          headers: { Accept: "application/json" },
        });
        setCurrentUser(me?.data?.user || null);

        // get users
        const { data } = await axios.get("/api/users", {
          headers: { Accept: "application/json" },
        });
        const normalized = (data || []).map((u) => ({
          username: u.username ?? "",
          email: u.email ?? "",
          userGroups: Array.isArray(u.userGroups) ? u.userGroups : [],
          active: !!u.active,
          password: "",
          saving: false,
          rowErr: "",
          savedTick: false,
          __orig: {
            username: u.username ?? "",
            email: u.email ?? "",
            userGroups: Array.isArray(u.userGroups) ? u.userGroups : [],
            active: !!u.active,
          },
        }));
        setRows(normalized);
      } catch (e) {
        setPageError(
          (e instanceof Error ? e.message : String(e)) +
            ". Please try again later."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch userGroup catalog on mount
  async function refreshGroups() {
    setGroupLoading(true);
    try {
      const res = await axios.get("/api/usergroups", {
        headers: { Accept: "application/json" },
      });
      const arr = Array.isArray(res.data) ? res.data : [];
      const mapped = arr
        .map((g) => (typeof g === "string" ? g : g.name))
        .filter(Boolean);
      setGroups(mapped);
    } catch {
      setGroups([]);
    } finally {
      setGroupLoading(false);
    }
  }
  useEffect(() => {
    refreshGroups();
  }, []);

  const validateRow = (r, isNew = false) => {
    if (!r.username?.trim()) return "Username is required.";
    if (!r.email?.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return "Email looks invalid.";

    const selected = Array.isArray(r.userGroups)
      ? r.userGroups.map(normalizeStr)
      : [];
    if (selected.length === 0) return "At least one group is required.";

    // Must all exist in catalog
    const catalog = new Set(groups);
    const invalid = selected.filter((g) => !catalog.has(g));
    if (invalid.length) return "Unknown groups: " + invalid.join(", ");

    // Password policy 8–10 (only required for create)
    if (isNew) {
      if (!r.password || r.password.length < 8 || r.password.length > 10)
        return "Password must be 8-10 characters.";
    } else if (r.password && (r.password.length < 8 || r.password.length > 10)) {
      return "Password must be 8-10 characters.";
    }
    return "";
  };

  const saveRow = async (row) => {
    const isAdminRow = row.username === "admin";
    const isSuperAdmin = (currentUser?.username || "") === "admin";
    const disabledRow = isAdminRow && !isSuperAdmin;
    if (disabledRow) return; // no-op for safety

    const err = validateRow(row, false);
    setRows((prev) =>
      prev.map((r) => (r.username === row.username ? { ...r, rowErr: err } : r))
    );
    if (err) return;

    // Determine changes vs __orig (username is immutable)
    const allowed = ["email", "userGroups", "active"];
    const diff = {};
    for (const k of allowed) {
      const prevVal = row.__orig ? row.__orig[k] : undefined;
      if (k === "userGroups") {
        const a = JSON.stringify((row[k] || []).map(normalizeStr));
        const b = JSON.stringify((prevVal || []).map(normalizeStr));
        if (a !== b) diff[k] = (row[k] || []).map(normalizeStr);
      } else if (row[k] !== prevVal) {
        diff[k] = row[k];
      }
    }
    if (row.password) diff.password = row.password;

    if (Object.keys(diff).length === 0) {
      setRows((prev) =>
        prev.map((r) =>
          r.username === row.username
            ? { ...r, rowErr: "No changes to save." }
            : r
        )
      );
      return;
    }

    setRows((prev) =>
      prev.map((r) =>
        r.username === row.username ? { ...r, saving: true, rowErr: "" } : r
      )
    );
    try {
      const { data: updated } = await axios.patch(
        `/api/users/${encodeURIComponent(row.username)}`,
        diff,
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      setRows((prev) =>
        prev.map((r) => {
          if (r.username !== row.username) return r;
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
            userGroups: Array.isArray(merged.userGroups)
              ? merged.userGroups
              : [],
            active: !!merged.active,
          };
          return merged;
        })
      );

      setTimeout(() => {
        setRows((prev) =>
          prev.map((r) =>
            r.username === row.username ? { ...r, savedTick: false } : r
          )
        );
      }, 5000);
    } catch (e) {
      setRows((prev) =>
        prev.map((r) =>
          r.username === row.username
            ? {
                ...r,
                saving: false,
                rowErr:
                  e?.response?.data?.error ||
                  (e instanceof Error ? e.message : String(e)),
              }
            : r
        )
      );
    }
  };

  const createUser = async () => {
    const err = validateRow(newUser, true);
    setCreateErr(err);
    if (err) return;

    setCreating(true);
    try {
      const payload = {
        username: normalizeStr(newUser.username),
        email: newUser.email,
        password: newUser.password,
        userGroups: newUser.userGroups || [],
        active: !!newUser.active,
      };
      const { data: created } = await axios.post("/api/users", payload, {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });

      const newRow = {
        username: created.username ?? newUser.username,
        email: created.email ?? newUser.email,
        userGroups: Array.isArray(created.userGroups)
          ? created.userGroups
          : newUser.userGroups || [],
        active:
          typeof created.active === "boolean" ? created.active : newUser.active,
        password: "",
        saving: false,
        rowErr: "",
        savedTick: true,
        __orig: {
          username: created.username ?? newUser.username,
          email: created.email ?? newUser.email,
          userGroups: Array.isArray(created.userGroups)
            ? created.userGroups
            : newUser.userGroups || [],
          active:
            typeof created.active === "boolean"
              ? created.active
              : newUser.active,
        },
      };

      setRows((prev) =>
        [newRow, ...prev]
      );

      // reset add row
      setNewUser({
        username: "",
        email: "",
        userGroups: ["dev team"],
        password: "",
        active: true,
      });
      setCreateErr("");

      setTimeout(() => {
        setRows((prev) =>
          prev.map((r) =>
            r.username === newRow.username ? { ...r, savedTick: false } : r
          )
        );
      }, 5000);
    } catch (e) {
      setCreateErr(
        e?.response?.data?.error ||
          (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setCreating(false);
    }
  };

  // inline add-group (input + button)
  const addNewGroup = async () => {
    setGroupErr("");
    const normalized = normalizeStr(newGroupName);
    if (!normalized) {
      setGroupErr("Invalid group name.");
      return;
    }
    if (normalized.length > 50) {
      setGroupErr("Max length is 50.");
      return;
    }
    if (groups.includes(normalized)) {
      setGroupErr("Group already exists.");
      return;
    }

    setGroupAdding(true);
    try {
      await axios.post(
        "/api/usergroups",
        { groupName: normalized },
        { headers: { "Content-Type": "application/json" } }
      );
      await refreshGroups();
      setNewGroupName("");
    } catch (e) {
      setGroupErr(
        e?.response?.data?.error ||
          (e instanceof Error ? e.message : String(e)) ||
          "Failed to add group"
      );
    } finally {
      setGroupAdding(false);
    }
  };

  if (loading && groupLoading) return <div className="p-6">Loading users…</div>;

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
                <th className="text-left px-4 py-3">Username</th>

                <th className="text-left px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span>Groups</span>
                    {/* inline add-group input + button */}
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => {
                        setGroupErr("");
                        setNewGroupName(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addNewGroup();
                      }}
                      placeholder="new group"
                      className="h-8 w-40 rounded-md border border-slate-300 px-2 py-1 outline-none focus:border-blue-500"
                      maxLength={50}
                    />
                    <button
                      className="h-8 px-3 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 disabled:opacity-60"
                      onClick={addNewGroup}
                      disabled={groupAdding}
                      title="Add Group"
                    >
                      {groupAdding ? "Adding…" : "Add"}
                    </button>
                  </div>
                  {groupErr && (
                    <div className="mt-1 text-red-600 text-xs">{groupErr}</div>
                  )}
                </th>

                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Password</th>
                <th className="text-left px-4 py-3">Active</th>
                <th className="text-left px-4 py-3"></th>
              </tr>
            </thead>

            <tbody className="text-sm">
              {!pageError && (
                <tr className="bg-blue-100">
                  {/* New user row */}
                  <td className="px-4 py-2">
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none bg-white focus:border-blue-500"
                      value={newUser.username}
                      onChange={(e) =>
                        setNewUser((s) => ({ ...s, username: e.target.value }))
                      }
                      placeholder="new username"
                      maxLength={50}
                    />
                  </td>

                  <td className="px-4 py-2">
                    <ChipsMultiSelect
                      options={groups}
                      value={newUser.userGroups}
                      onChange={(arr) =>
                        setNewUser((s) => ({ ...s, userGroups: arr }))
                      }
                      placeholder="Select groups…"
                      disabled={creating}
                    />
                  </td>

                  <td className="px-4 py-2">
                    <input
                      type="email"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      value={newUser.email}
                      onChange={(e) =>
                        setNewUser((s) => ({ ...s, email: e.target.value }))
                      }
                      placeholder="user@example.com"
                    />
                  </td>

                  <td className="px-4 py-2">
                    <input
                      type="password"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      value={newUser.password}
                      onChange={(e) =>
                        setNewUser((s) => ({ ...s, password: e.target.value }))
                      }
                      placeholder="8–10 chars only"
                    />
                  </td>

                  <td className="px-4 py-2">
                    <SimpleToggle
                      checked={newUser.active}
                      onChange={(v) => setNewUser((s) => ({ ...s, active: v }))}
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
              )}

              {createErr && (
                <tr>
                  <td colSpan={6} className="px-4 pt-1 pb-2 text-red-600">
                    {createErr}
                  </td>
                </tr>
              )}

              {/* Existing users */}
              {rows.map((r, idx) => {
                const isAdminRow = r.username === "admin";
                const isSuperAdmin = (currentUser?.username || "") === "admin";
                const disabledRow = isAdminRow && !isSuperAdmin;

                return (
                  <React.Fragment key={r.username}>
                    <tr className={idx % 2 ? "bg-slate-50/50" : "bg-white"}>
                      <td className="px-4 py-2">
                        {/* Username is immutable (disabled) */}
                        <input
                          className="w-full rounded-md border border-slate-300 px-3 py-2 bg-slate-300 text-slate-500"
                          value={r.username}
                          onChange={() => {}}
                          disabled
                        />
                      </td>

                      <td className="px-4 py-2">
                        <ChipsMultiSelect
                          options={groups}
                          value={r.userGroups}
                          disabled={r.saving || disabledRow}
                          onChange={(arr) =>
                            !disabledRow &&
                            setField(r.username, "userGroups", arr)
                          }
                          placeholder="Select groups…"
                        />
                      </td>

                      <td className="px-4 py-2">
                        <input
                          type="email"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                          value={r.email}
                          onChange={(e) =>
                            !disabledRow &&
                            setField(r.username, "email", e.target.value)
                          }
                          disabled={disabledRow}
                        />
                      </td>

                      <td className="px-4 py-2">
                        <input
                          type="password"
                          placeholder="(leave blank to keep)"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                          value={r.password}
                          onChange={(e) =>
                            !disabledRow &&
                            setField(r.username, "password", e.target.value)
                          }
                          disabled={disabledRow}
                        />
                      </td>

                      <td className="px-4 py-2">
                        {/* For admin row when not super-admin: show true + disabled */}
                        <SimpleToggle
                          checked={disabledRow ? true : r.active}
                          onChange={() => (disabledRow ? null : toggleActive(r))}
                          disabled={r.saving || disabledRow}
                        />
                      </td>

                      <td className="px-4 py-2">
                        <button
                          className="rounded-md bg-blue-600 px-3 py-2 text-white disabled:opacity-60 block w-full"
                          disabled={r.saving || disabledRow}
                          onClick={() => saveRow(r)}
                        >
                          {r.saving
                            ? "Saving…"
                            : r.savedTick
                            ? "✓ Saved"
                            : "Save"}
                        </button>
                      </td>
                    </tr>

                    {r.rowErr && (
                      <tr>
                        <td colSpan={6} className="px-4 pt-1 pb-2 text-red-600">
                          {r.rowErr}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
