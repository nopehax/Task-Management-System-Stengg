import React, { useState, useEffect } from "react";
import { useAuth } from "../utils/authContext";
import { useNavigate, useLocation } from "react-router-dom";

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isOnlyAdmin = (u) =>
    !!u &&
    Array.isArray(u.userGroups) &&
    u.userGroups.length === 1 &&
    u.userGroups[0] === "admin";

  useEffect(() => {
    if (isAuthenticated && user?.username) {
      if (isOnlyAdmin(user)) {
        navigate("/usermanage", { replace: true });
      } else {
        const from = location.state?.from || "/tasks";
        navigate(from, { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = [];

    if (!username.trim() || !password) newErrors.push("Invalid username or password.");

    if (newErrors.length) {
      setErrors(newErrors);
      setTimeout(() => setErrors([]), 5000);
      return;
    }

    setLoading(true);
    setErrors([]);

    try {
      await login(username, password);
    } catch (err) {
      const msg = err?.message || "Login failed. Please check your credentials.";
      setErrors([msg]);
      setTimeout(() => setErrors([]), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <form
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-8 sm:p-10"
        onSubmit={handleSubmit}
        noValidate
        autoComplete="off"
      >
        <h1 className="text-3xl font-semibold text-slate-800 text-center mb-8">
          Login
        </h1>

        <div className="space-y-5">
          <div className="flex flex-col">
            <label htmlFor="username" className="text-sm font-medium text-slate-600">
              Username
            </label>
            <input
              id="username"
              className="mt-2 h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-300/60"
              type="text"
              autoComplete="new-password"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="flex flex-col">
            <label htmlFor="password" className="text-sm font-medium text-slate-600">
              Password
            </label>
            <input
              id="password"
              className="mt-2 h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-300/60"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <button
            className="mt-2 h-11 w-full rounded-xl bg-gray-500 text-white font-semibold shadow-md hover:bg-gray-600 disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Log In"}
          </button>
        </div>

        {/* Errors */}
        <div className="mt-6 text-center text-sm font-medium text-red-600 min-h-5" aria-live="polite">
          {errors.length > 0 && (
            <ul className="space-y-1">
              {errors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </div>
  );
};

export default LoginPage;
