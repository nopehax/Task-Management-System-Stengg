import { createContext, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

const AuthContext = createContext(null);
axios.defaults.withCredentials = true;

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
        const res = await axios.get(API_ME);
        if (!cancelled) {
          setIsAuthenticated(true);
          setUser(res.data?.user ?? null);
          if (res.data?.user) localStorage.setItem("authUser", JSON.stringify(res.data.user));
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
    try {
      const res = await axios.post(
        API_LOGIN,
        { username, password },
        { headers: { "Content-Type": "application/json" } }
      );
      setIsAuthenticated(true);
      setUser(res.data?.user ?? null);
      if (res.data?.user) localStorage.setItem("authUser", JSON.stringify(res.data.user));
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.error || "Login failed. Please check your credentials.";
      throw new Error(msg);
    }
  };

  // Logout: clear cookie on server and local state
  const logout = async () => {
    try {
      await axios.post(API_LOGOUT);
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
