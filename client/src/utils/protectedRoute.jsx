// protectedRoute.jsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./authContext";

// local normalizer (mirrors server rules)
const normalizeGroup = (name) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .slice(0, 50);

const ProtectedRoute = ({ allow }) => {
  const { isAuthenticated, ready, user, hasAnyGroup } = useAuth();
  const location = useLocation();

  // Avoid flicker until /api/me finishes
  if (!ready) return null;

  if (!isAuthenticated || !user?.active) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // If no allow list, it's just an auth gate
  if (!allow || (Array.isArray(allow) && allow.length === 0)) {
    return <Outlet />;
  }

  // OR semantics: pass if user has ANY of the allowed groups
  const allowed = Array.isArray(allow) ? allow : [allow];

  // prefer context helper if available
  const ok =
    typeof hasAnyGroup === "function"
      ? hasAnyGroup(...allowed)
      : (() => {
          const mine = Array.isArray(user.userGroups)
            ? user.userGroups.map(normalizeGroup)
            : [];
          const want = allowed.map(normalizeGroup);
          return want.some((g) => mine.includes(g));
        })();

  if (!ok) {
    return <Navigate to="/403" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
