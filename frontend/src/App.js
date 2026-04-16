import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import LandingPage from '@/pages/LandingPage';
import AuthPage from '@/pages/AuthPage';
import ClientDashboard from '@/pages/ClientDashboard';
import AdminClients from '@/pages/AdminClients';
import AdminClientDetail from '@/pages/AdminClientDetail';
import AdminSettings from '@/pages/AdminSettings';
import AdminAudit from '@/pages/AdminAudit';
import AdminTramites from '@/pages/AdminTramites';
import AdminEmail from '@/pages/AdminEmail';
import AdminLayout from '@/components/AdminLayout';
import { Toaster } from 'sonner';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          user
            ? <Navigate to={user.role === 'admin' ? '/admin/clients' : '/dashboard'} replace />
            : <LandingPage />
        }
      />
      <Route
        path="/login"
        element={
          user
            ? <Navigate to={user.role === 'admin' ? '/admin/clients' : '/dashboard'} replace />
            : <AuthPage />
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requiredRole="client">
            <ClientDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="clients" replace />} />
        <Route path="clients" element={<AdminClients />} />
        <Route path="clients/:clientId" element={<AdminClientDetail />} />
        <Route path="tramites" element={<AdminTramites />} />
        <Route path="email" element={<AdminEmail />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" richColors />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
