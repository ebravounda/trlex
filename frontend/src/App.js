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
import AdminCompresor from '@/pages/AdminCompresor';
import AdminServidor from '@/pages/AdminServidor';
import AdminFormularios from '@/pages/AdminFormularios';
import AdminTramites from '@/pages/AdminTramites';
import AdminEmail from '@/pages/AdminEmail';
import AdminEmpresas from '@/pages/AdminEmpresas';
import AdminEmpresaDetail from '@/pages/AdminEmpresaDetail';
import AdminTareas from '@/pages/AdminTareas';
import AdminStaff from '@/pages/AdminStaff';
import AdminInbox from '@/pages/AdminInbox';
import AdminContabilidad from '@/pages/AdminContabilidad';
import AdminCitas from '@/pages/AdminCitas';
import AdminPresupuestos from '@/pages/AdminPresupuestos';
import AdminTeamChat from '@/pages/AdminTeamChat';
import BookingPage from '@/pages/BookingPage';
import PaymentSuccess from '@/pages/PaymentSuccess';
import PaymentCancel from '@/pages/PaymentCancel';
import CompanyDashboard from '@/pages/CompanyDashboard';
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
            ? <Navigate to={user.role === 'admin' || user.role === 'staff' ? '/admin/clients' : user.role === 'company' ? '/empresa' : '/dashboard'} replace />
            : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/login"
        element={
          user
            ? <Navigate to={user.role === 'admin' || user.role === 'staff' ? '/admin/clients' : user.role === 'company' ? '/empresa' : '/dashboard'} replace />
            : <AuthPage />
        }
      />
      <Route path="/citas/reservar" element={<BookingPage />} />
      <Route path="/citas/confirmada" element={<PaymentSuccess />} />
      <Route path="/citas/cancelada" element={<PaymentCancel />} />
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
        <Route path="empresas" element={<AdminEmpresas />} />
        <Route path="empresas/:companyId" element={<AdminEmpresaDetail />} />
        <Route path="tareas" element={<AdminTareas />} />
        <Route path="equipo" element={<AdminStaff />} />
        <Route path="inbox" element={<AdminInbox />} />
        <Route path="contabilidad" element={<AdminContabilidad />} />
        <Route path="citas" element={<AdminCitas />} />
        <Route path="presupuestos" element={<AdminPresupuestos />} />
        <Route path="chat" element={<AdminTeamChat />} />
        <Route path="tramites" element={<AdminTramites />} />
        <Route path="email" element={<AdminEmail />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="compresor" element={<AdminCompresor />} />
        <Route path="servidor" element={<AdminServidor />} />
        <Route path="formularios" element={<AdminFormularios />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
      <Route
        path="/empresa"
        element={
          <ProtectedRoute requiredRole="company">
            <CompanyDashboard />
          </ProtectedRoute>
        }
      />
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
