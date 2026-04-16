import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ArrowRight, Shield, FileText, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LOGO_URL = "https://tramilex.es/wp-content/uploads/2024/07/logo-tramilex-v3-1.jpg";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleIngresar = () => {
    if (user) {
      navigate(user.role === 'admin' ? '/admin/clients' : '/dashboard');
    } else {
      navigate('/login');
    }
  };

  const handleComenzar = () => {
    navigate('/login?mode=register');
  };

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src={LOGO_URL} alt="Tramilex" className="h-9 object-contain" data-testid="landing-logo" />
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-slate-700 hover:text-slate-900 font-medium text-sm"
              onClick={handleIngresar}
              data-testid="landing-login-btn"
            >
              Ingresar
            </Button>
            <Button
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-6 text-sm font-medium gap-2"
              onClick={handleComenzar}
              data-testid="landing-register-btn"
            >
              Comenzar tramite
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-sky-50 text-sky-700 rounded-full px-4 py-1.5 text-xs font-medium mb-8 border border-sky-100">
            <Globe className="w-3.5 h-3.5" />
            Chile y Espana
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Tu tramite de
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-sky-800 to-slate-900">
              inmigracion simplificado
            </span>
          </h1>
          <p className="text-base md:text-lg text-slate-500 mt-6 max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
            Gestiona tus documentos de forma segura, rapida y desde cualquier dispositivo. Tramilex conecta a clientes con su abogado de inmigracion.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Button
              className="h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-full px-8 text-base font-medium gap-2 shadow-lg shadow-slate-900/10"
              onClick={handleComenzar}
              data-testid="hero-register-btn"
            >
              Comenzar tramite
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-full px-8 text-base font-medium border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={handleIngresar}
              data-testid="hero-login-btn"
            >
              Ingresar a mi cuenta
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center mb-5">
                <FileText className="w-6 h-6 text-white" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Sube tus documentos
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                Carga pasaportes, NIE, contratos y mas en formato PDF o imagen desde cualquier dispositivo.
              </p>
            </div>
            <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center mb-5">
                <Shield className="w-6 h-6 text-white" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Seguro y confidencial
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                Tus datos estan protegidos. Solo tu y tu abogado tienen acceso a tus documentos.
              </p>
            </div>
            <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center mb-5">
                <Globe className="w-6 h-6 text-white" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Chile y Espana
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                Tramites de visados, residencia, regularizacion y mas en ambos paises.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-100">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <img src={LOGO_URL} alt="Tramilex" className="h-7 object-contain opacity-60" />
          <p className="text-xs text-slate-400" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
            Creado por <a href="https://goroky.com" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-700 font-medium">GoRoky.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
