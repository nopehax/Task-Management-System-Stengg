// protectedRoute.jsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./authContext";

/**
 * Usage:
 *   <Route element={<ProtectedRoute allow={['admin','project_lead']} />}>
 *     <Route path="/admin" element={<AdminPage />} />
 *   </Route>
 *
 *   // No group restriction (just needs to be logged in):
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/applications" element={<ApplicationsPage />} />
 *   </Route>
 */
const ProtectedRoute = ({ allow }) => {
  const { isAuthenticated, ready, user } = useAuth();
  const location = useLocation();

  if (!ready) return null; // wait for auth hydration to avoid flicker

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // Group check (optional): if "allow" provided, enforce membership
  if (allow && allow.length) {
    const allowed = Array.isArray(allow) ? allow : [allow];
    const allowedSet = new Set(allowed.map((g) => String(g).toLowerCase()));
    const userGroup = String(user?.userGroup ?? "").toLowerCase();

    if (!userGroup || !allowedSet.has(userGroup)) {
      // Not authorized for this route
      return <Navigate to="/403" replace state={{ from: location }} />;
    }
  }

  return <Outlet />;
};

export default ProtectedRoute;
