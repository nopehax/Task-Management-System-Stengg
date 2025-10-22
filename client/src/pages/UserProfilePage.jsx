import React, { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../utils/authContext";
import HeaderPage from "../components/Header";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true,
  headers: { Accept: "application/json" },
});

export default function UserProfilePage() {
  // expects user shape: { username, email, userGroups: string[], active }
  const { user, ready } = useAuth();
  const { username: routeUsername } = useParams();

  const [form, setForm] = useState({
    email: "",
    currentPassword: "",
    password: "",
    confirmPassword: "",
  });
  const [orig, setOrig] = useState({ email: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Hydrate form from context user
  useEffect(() => {
    if (!ready || !user) return;
    if (routeUsername !== user.username) return;

    const email = user.email || "";
    setForm((f) => ({ ...f, email }));
    setOrig({ email });
  }, [ready, user, routeUsername]);

  const onChange = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    if (!form.email?.trim()) return "Email is required.";
    const emailRe = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRe.test(form.email)) return "Email must be valid.";

    const wantsPwd =
      form.password.length > 0 ||
      form.confirmPassword.length > 0 ||
      form.currentPassword.length > 0;

    if (wantsPwd) {
      if (!form.currentPassword) return "Current password is required.";
      if (!/^(?=.{8,10}$)(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])\S+$/.test(form.password))
        return "Password must be 8–10 characters long and include at least one letter, one number, and one special character.";
      if (form.password !== form.confirmPassword)
        return "Passwords do not match.";
    }
    return "";
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const v = validate();
    if (v) {
      setError(v);
      setTimeout(() => setError(""), 5000);
      return;
    }

    const payload = {};
    if (form.email !== orig.email) payload.email = form.email;

    const wantsPwd =
      form.password || form.confirmPassword || form.currentPassword;
    if (wantsPwd) {
      payload.password = form.password;
      payload.currentPassword = form.currentPassword; // backend validates this
    }

    if (Object.keys(payload).length === 0) {
      setError("No changes to save.");
      setTimeout(() => setError(""), 5000);
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.patch(`/user/${user.username}`, payload);
      const newEmail = data?.email ?? payload.email ?? form.email;

      // Reset form & snapshot; clear password fields
      setOrig({ email: newEmail || "" });
      setForm((f) => ({
        ...f,
        email: newEmail || "",
        currentPassword: "",
        password: "",
        confirmPassword: "",
      }));
      setSuccess("Profile updated.");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Save failed. Please try again.";
      setError(msg);
      setTimeout(() => setError(""), 5000);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <div className="p-6">Loading…</div>;
  if (!user || routeUsername !== user.username) {
    return <Navigate to="/403" replace />;
  }

  const groups = Array.isArray(user.userGroups)
    ? user.userGroups
    : [];

  return (
    <div className="p-6">
      <HeaderPage />
      <h1 className="text-center text-2xl font-semibold my-6">Update Profile</h1>

      <div className="max-w-md mx-auto rounded-xl border border-slate-200 p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Read-only identity */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Username</label>
            <input
              className="w-full rounded-md border border-slate-300 bg-slate-100 text-slate-500 px-3 py-2"
              value={user.username || ""}
              disabled
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Groups</label>
            <input
              className="w-full rounded-md border border-slate-300 bg-slate-100 text-slate-500 px-3 py-2"
              value={groups.join(", ")}
              disabled
            />
          </div>

          {/* Editable: Email */}
          <div className="pt-2">
            <label className="block text-sm text-slate-700 mb-1">Email</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
              value={form.email}
              onChange={onChange("email")}
              placeholder="you@example.com"
            />
          </div>

          {/* Editable: Passwords (current + new + confirm) */}
          <div className="pt-2">
            <label className="block text-sm text-slate-700 mb-1">
              Current Password
            </label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
              value={form.currentPassword}
              onChange={onChange("currentPassword")}
              placeholder="********"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">New Password</label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
              value={form.password}
              onChange={onChange("password")}
              placeholder="********"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
              value={form.confirmPassword}
              onChange={onChange("confirmPassword")}
              placeholder="********"
            />
          </div>

          {/* Messages */}
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {success && <div className="text-emerald-600 text-sm">{success}</div>}

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="mt-2 w-full rounded-md bg-slate-900 text-white px-4 py-2 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}
