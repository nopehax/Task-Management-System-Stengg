import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../utils/authContext";
import { useNavigate } from "react-router-dom";

export default function HeaderPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  // click-away + ESC
  useEffect(() => {
    const onDocClick = (e) => {
      if (!open) return;
      if (menuRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/", { replace: true });
  };

  const handleProfile = () => {
    setOpen(false);
    const id = user?.id;
    navigate(id ? `/user/${id}` : "/user/me");
  };

  return (
    <header className="w-full border-b-4 border-black">
      {/* Flex container keeps title and avatar vertically centered */}
      <div className="mx-auto flex items-center justify-between px-6 py-3">
        <h2 className="text-2xl font-medium">Task Management System</h2>

        {/* Avatar + menu anchor */}
        <div className="relative">
          <button
            ref={btnRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="User menu"
            className="grid place-items-center w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <svg
              className="w-7 h-7 text-gray-700"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21a8 8 0 0 0-16 0" />
              <circle cx="12" cy="8" r="4" />
            </svg>
          </button>

          {open && (
            <div
              ref={menuRef}
              role="menu"
              aria-orientation="vertical"
              className="absolute right-0 mt-3 w-56 rounded-lg shadow-md bg-purple-200 p-2"
            >
              <button
                type="button"
                onClick={handleProfile}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-purple-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
                role="menuitem"
              >
                Update Profile
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-1 w-full text-left px-3 py-2 rounded-md hover:bg-purple-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
                role="menuitem"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
