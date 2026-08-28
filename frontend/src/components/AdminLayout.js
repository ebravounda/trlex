import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { Users, Settings, LogOut, Menu, X, ClipboardList, FileText, Mail, Building2, ListTodo, UserCog, Inbox, DollarSign, CalendarCheck, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback } from 'react';

import ChatBot from '@/components/ChatBot';
import NotificationBell from '@/components/NotificationBell';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import InteractiveTutorial from '@/components/InteractiveTutorial';

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'Buenos dias';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

const LOGO_URL = "https://customer-assets-lxgj4vgw.emergentagent.net/job_inmigra-docs/artifacts/8hv3nj18_tramilex_logo_1600x900.png";

const navItems = [
  { to: '/admin/clients', label: 'Clientes', icon: Users },
  { to: '/admin/empresas', label: 'Empresas', icon: Building2 },
  { to: '/admin/citas', label: 'Citas', icon: CalendarCheck },
  { to: '/admin/tareas', label: 'Tareas', icon: ListTodo },
  { to: '/admin/contabilidad', label: 'Contabilidad', icon: DollarSign },
  { to: '/admin/presupuestos', label: 'Presupuestos', icon: FileSpreadsheet },
  { to: '/admin/tramites', label: 'Tramites', icon: FileText },
  { to: '/admin/equipo', label: 'Equipo', icon: UserCog, adminOnly: true },
  { to: '/admin/inbox', label: 'Notificaciones email', icon: Inbox },
  { to: '/admin/email', label: 'Enviar correo', icon: Mail },
  { to: '/admin/audit', label: 'Auditoria', icon: ClipboardList },
  { to: '/admin/settings', label: 'Configuracion', icon: Settings, adminOnly: true },
];

function SidebarContent({ onClose, inboxUnread, citasCount, userRole }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <img src={LOGO_URL} alt="Tramilex" className="h-14 object-contain" data-testid="admin-logo" />
          {onClose && (
            <button onClick={onClose} className="md:hidden" data-testid="close-sidebar-btn">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.filter(item => !item.adminOnly || userRole === 'admin').map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            data-testid={`nav-${label.toLowerCase()}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Icon className="w-4 h-4" strokeWidth={1.5} />
            {label}
            {to === '/admin/inbox' && inboxUnread > 0 && (
              <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse-badge">{inboxUnread > 9 ? '9+' : inboxUnread}</span>
            )}
            {to === '/admin/citas' && citasCount > 0 && (
              <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse-badge" data-testid="citas-badge">{citasCount > 9 ? '9+' : citasCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-600 hover:text-red-600 hover:bg-red-50"
          onClick={handleLogout}
          data-testid="admin-logout-btn"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} />
          Cerrar sesion
        </Button>
        <p className="text-[10px] text-slate-400 text-center mt-3">
          Creado por <a href="https://goroky.com" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-700">GoRoky.com</a>
        </p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [citasCount, setCitasCount] = useState(0);
  const [showForcePw, setShowForcePw] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  const checkInbox = useCallback(async () => {
    try {
      const res = await api.get('/inbox');
      const readIds = JSON.parse(localStorage.getItem('tramilex_read_emails') || '[]');
      const unread = res.data.filter(e => !readIds.includes(e.id)).length;
      setInboxUnread(unread);
    } catch {}
  }, []);

  const checkCitas = useCallback(async () => {
    try {
      const res = await api.get('/citas/unconfirmed-count');
      setCitasCount(res.data.count || 0);
    } catch {}
  }, []);

  useEffect(() => {
    checkInbox();
    checkCitas();
    const interval = setInterval(() => { checkInbox(); checkCitas(); }, 60000);
    return () => clearInterval(interval);
  }, [checkInbox, checkCitas]);

  useEffect(() => {
    if (user?.must_change_password) setShowForcePw(true);
    else if (user && !user.tutorial_seen) setShowTutorial(true);
  }, [user]);

  const greeting = getGreeting();
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div className="min-h-screen bg-slate-50 flex" data-testid="admin-layout">
      {showForcePw && (
        <ForcePasswordChange
          currentPassword={sessionStorage.getItem('tramilex_temp_pw') || ''}
          onComplete={() => { setShowForcePw(false); sessionStorage.removeItem('tramilex_temp_pw'); if (!user?.tutorial_seen) setShowTutorial(true); }}
        />
      )}
      {showTutorial && !showForcePw && (
        <InteractiveTutorial role={user?.role || 'admin'} onComplete={() => setShowTutorial(false)} />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col fixed inset-y-0 left-0 z-30">
        <SidebarContent inboxUnread={inboxUnread} citasCount={citasCount} userRole={user?.role} />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl z-50">
            <SidebarContent onClose={() => setSidebarOpen(false)} inboxUnread={inboxUnread} citasCount={citasCount} userRole={user?.role} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 md:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1.5 rounded-md hover:bg-slate-100"
              onClick={() => setSidebarOpen(true)}
              data-testid="open-sidebar-btn"
            >
              <Menu className="w-5 h-5 text-slate-700" />
            </button>
            <span className="text-sm text-slate-700 font-medium" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }} data-testid="admin-greeting">
              {greeting}, <span className="font-semibold">{firstName}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center">
              <span className="text-xs text-white font-semibold">
                {(user?.name || 'A').charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="text-sm text-slate-700 font-medium hidden sm:inline">{user?.name}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 md:p-8">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      <ChatBot context="admin" />
    </div>
  );
}
