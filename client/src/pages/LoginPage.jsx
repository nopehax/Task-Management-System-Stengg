import React, { useState } from "react";

const API_URL = "http://localhost:3000/api/login"; // change if your backend runs elsewhere

const LoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState([]);   // array of strings
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = [];

    if (!username.trim()) newErrors.push("Username is required.");
    if (!password) newErrors.push("Password is required.");

    if (newErrors.length) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors([]);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors([data?.error || "Login failed. Please check your credentials."]);
        return;
      }
      // if (typeof onLogin === "function") onLogin(data);
      sessionStorage.setItem("authToken", data); // TODO Remove after implementing JWT
    } catch (err) {
      setErrors([`${err}\nNetwork error. Please try again.`]);
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="flex flex-col flex-auto justify-center items-center min-h-0 overflow-auto">
        <form className="flex flex-col flex-initial" onSubmit={handleSubmit} noValidate >
          <h1 className="text-2xl font-medium mb-4">Sign in</h1>
          <div style={{display: 'flex',flexDirection: 'column'}}>
            <label className="" htmlFor="username">Username</label>
            <input
              id="username"
              className="border-2 border-black rounded-md text-sm"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
            />

            <label className="label" htmlFor="password" style={{marginTop: '10px'}}>Password</label>
            <input
              id="password"
              className="border-2 border-black rounded-md text-sm"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />

            <button className="my-8 bg-gray-300 self-center px-8 py-1 rounded-md" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>

          </div>
        </form>
        <div className="flex text-sm justify-center font-medium text-red-500" aria-live="polite">
          {errors.length > 0 && (
            <ul>
              {errors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
  );
}

export default LoginPage;