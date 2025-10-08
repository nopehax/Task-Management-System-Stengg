import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);
const API_URL = "http://localhost:3000/api/login"; // use dev proxy or point to your API port

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  // Re-hydrate on first mount
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    setIsAuthenticated(Boolean(token));
    setReady(true);
  }, []);

  const login = async (username, password) => {
    // TODO use axios for requests
    const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || "Login failed. Please check your credentials.");
    }

    // Expecting data.token from your backend; persist it
    if (data.token) {
      localStorage.setItem("authToken", data.token);
    } 
    setIsAuthenticated(true);
  };

  const logout = async () => {
    localStorage.removeItem("authToken");
    setIsAuthenticated(false);
  };

  const value = { isAuthenticated, ready, login, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
};
