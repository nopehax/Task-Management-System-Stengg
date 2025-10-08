import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./authContext";

// TODO also check for userGroup if needed
const ProtectedRoute = () => {
    const { isAuthenticated, ready } = useAuth();
    const location = useLocation();

    if (!ready) return null;

    if (!isAuthenticated) {
        return <Navigate to="/" replace state={{from: location }}/>;
    }
    return <Outlet />;
};

export default ProtectedRoute;