import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { AuthProvider } from './utils/authContext';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ApplicationPage from './pages/ApplicationPage';
import ProtectedRoute from './utils/protectedRoute';
import UserManagementPage from './pages/UserManagementPage';
import NotAuthorizedPage from './pages/NotAuthorizedPage';
import UserProfilePage from './pages/UserProfilePage';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/403" element={<NotAuthorizedPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/applications" element={<ApplicationPage />} />
            <Route path="/user/:username" element={<UserProfilePage />} />
          </Route>

          <Route element={<ProtectedRoute allow={['admin']} />}>
            <Route path="/usermanage" element={<UserManagementPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);

reportWebVitals();
