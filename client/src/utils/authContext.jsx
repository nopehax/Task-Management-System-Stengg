import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";

const AuthContext = createContext(null);
axios.defaults.withCredentials = true;

// Use relative paths; configure a dev proxy or CORS on the API.
const API_LOGIN  = "http://localhost:3000/api/login";
const API_ME     = "http://localhost:3000/api/me";
const API_LOGOUT = "http://localhost:3000/api/logout";

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // user shape: { username, email, userGroups: string[], active: boolean }
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Re-hydrate session from HttpOnly cookie by calling /api/me
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(API_ME);
        const me = res?.data?.user ?? null;

        if (!cancelled) {
          if (me && me.username && Array.isArray(me.userGroups) && me.active) {
            setIsAuthenticated(true);
            setUser(me);
            localStorage.setItem("authUser", JSON.stringify(me));
          } else {
            setIsAuthenticated(false);
            setUser(null);
            localStorage.removeItem("authUser");
          }
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

  // Login: sets HttpOnly cookie on success; store returned user locally
  const login = async (username, password) => {
    try {
      const res = await axios.post(
        API_LOGIN,
        { username, password },
        { headers: { "Content-Type": "application/json" } }
      );
      const me = res?.data?.user ?? null;

      if (me && me.username && Array.isArray(me.userGroups) && me.active) {
        setIsAuthenticated(true);
        setUser(me);
        localStorage.setItem("authUser", JSON.stringify(me));
      } else {
        // Defensive: treat missing/invalid shape as failure
        throw new Error("Login failed. Please check your credentials.");
      }
      return me;
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

  // Helper: OR semantics—true if user has ANY allowed group
  const hasAnyGroup = useCallback((...allowed) => {
    if (!user || !Array.isArray(user.userGroups)) return false;
    if (!allowed || allowed.length === 0) return false;
    const mine = user.userGroups
    return allowed.some((g) => mine.includes(g));
  }, [user]);


  const value = useMemo(
    () => ({ isAuthenticated, ready, user, login, logout, hasAnyGroup }),
    [isAuthenticated, ready, user, hasAnyGroup]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
};
