import { createContext, useContext, useState } from 'react';

const API_URL = "http://localhost:3000/api/login"; // change if your backend runs elsewhere
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const login = async (username, password) => {
    // TODO use axios
    const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
        setIsAuthenticated(true);
    } else {
        throw new Error(data?.error || "Login failed. Please check your credentials.");
    }
  }

  const logout = () => {
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
