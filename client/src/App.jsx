// App.jsx
import React from "react";
import LoginPage from "./pages/LoginPage";

export default function App() {
  // TODO implement protected routes
  const handleLogin = ({ token, user }) => {
    console.log("Logged in:", user);
  };

  return (
    <div className="flex flex-col min-h-screen" >
      <header className="border-b-4 border-b-black">
          <h2 className="my-4 text-2xl font-medium ml-8">Task Management System</h2>
      </header>
      <LoginPage onLogin={handleLogin} />
    </div>
  );
}
