import { useAuth } from '../utils/authContext';
import { useNavigate } from 'react-router-dom';

const HeaderPage = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();
    
    const handleLogout = async () => {
        await logout();
        navigate("/", { replace: true });
    }
    return (
        <header className="border-b-4 border-b-black w-screen">
          <h2 className="my-4 text-2xl font-medium ml-8">Task Management System</h2>
          <button className="absolute right-8 top-4 bg-gray-300 self-center px-4 py-1 rounded-md" onClick={handleLogout}>Logout</button>
        </header>
    );
};

export default HeaderPage;
