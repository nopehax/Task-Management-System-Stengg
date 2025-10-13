import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

// Use relative paths; configure a dev proxy or CORS on the API.
const API_LOGIN  = "http://localhost:3000/api/login";
const API_ME     = "http://localhost:3000/api/me";
const API_LOGOUT = "http://localhost:3000/api/logout";

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Re-hydrate session from HttpOnly cookie by calling /api/me
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API_ME, { method: "GET", credentials: "include" });
        if (!res.ok) {
          // not logged in / cookie missing/invalid
          if (!cancelled) {
            setIsAuthenticated(false);
            setUser(null);
            localStorage.removeItem("authUser");
          }
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setIsAuthenticated(true);
          setUser(data?.user ?? null);
          if (data?.user) localStorage.setItem("authUser", JSON.stringify(data.user));
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
          setUser(null);
          localStorage.removeItem("authUser");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Login: sets HttpOnly cookie on success; we also store the returned user locally
  const login = async (username, password) => {
    const res = await fetch(API_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // IMPORTANT: receive/set cookie
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Login failed. Please check your credentials.");

    setIsAuthenticated(true);
    setUser(data?.user ?? null);
    if (data?.user) localStorage.setItem("authUser", JSON.stringify(data.user));
    return data;
  };

  // Logout: clear cookie on server and local state
  const logout = async () => {
    try {
      await fetch(API_LOGOUT, { method: "POST", credentials: "include" });
    } catch {
      // ignore network errors on logout
    } finally {
      setIsAuthenticated(false);
      setUser(null);
      localStorage.removeItem("authUser");
    }
  };

  const value = useMemo(
    () => ({ isAuthenticated, ready, user, login, logout }),
    [isAuthenticated, ready, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
};
