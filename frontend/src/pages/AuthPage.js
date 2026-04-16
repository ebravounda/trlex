import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Eye, EyeOff, Plus, Trash2, Building2, User } from 'lucide-react';

const LOGO_URL = "https://tramilex.es/wp-content/uploads/2024/07/logo-tramilex-v3-1.jpg";
const BG_URL = "https://images.unsplash.com/photo-1567030561392-0e0691af044b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwyfHxtb2Rlcm4lMjBjb3Jwb3JhdGUlMjBvZmZpY2UlMjBidWlsZGluZyUyMG1pbmltYWwlMjBsaWdodHxlbnwwfHx8fDE3NzU5Mjg0NzB8MA&ixlib=rb-4.1.0&q=85";

const COUNTRIES = [
  "Alemania", "Argentina", "Bolivia", "Brasil", "Chile", "China", "Colombia",
  "Costa Rica", "Cuba", "Ecuador", "El Salvador", "Espana", "Estados Unidos",
  "Filipinas", "Francia", "Guatemala", "Honduras", "India", "Italia", "Marruecos",
  "Mexico", "Nicaragua", "Nigeria", "Pakistan", "Panama", "Paraguay", "Peru",
  "Portugal", "Reino Unido", "Republica Dominicana", "Rumania", "Rusia",
  "Senegal", "Ucrania", "Uruguay", "Venezuela"
];

function formatApiError(detail) {
  if (!detail) return "Algo salio mal. Intenta de nuevo.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get('mode') !== 'register');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [regForm, setRegForm] = useState({
    name: '', email: '', password: '', nie: '', passport_number: '',
    phone: '', address: '', city: '', origin_country: '', residence_country: '',
    father_name: '', mother_name: '', children: [],
    country: '', tramite_type: '', is_company: false, company_name: '', company_cif_nif: '', workers: []
  });
  const [tramitesList, setTramitesList] = useState([]);

  useEffect(() => {
    if (regForm.country) {
      api.get(`/tramites?country=${regForm.country}`).then(res => {
        setTramitesList(res.data);
      }).catch(() => setTramitesList([]));
    } else {
      setTramitesList([]);
    }
  }, [regForm.country]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(loginEmail, loginPassword);
      toast.success('Bienvenido');
      navigate(user.role === 'admin' ? '/admin/clients' : '/dashboard');
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regForm.name || !regForm.email || !regForm.password) {
      toast.error('Nombre, email y contrasena son obligatorios');
      return;
    }
    setLoading(true);
    try {
      await register(regForm);
      toast.success('Cuenta creada exitosamente');
      navigate('/dashboard');
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const updateReg = (field, value) => setRegForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen flex" data-testid="auth-page">
      {/* Left - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 md:px-16 lg:px-20 py-12 bg-white">
        <div className="max-w-md mx-auto w-full">
          <img src={LOGO_URL} alt="Tramilex" className="h-12 mb-10 object-contain" data-testid="auth-logo" />

          {isLogin ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Iniciar sesion
              </h1>
              <p className="text-sm text-slate-500 mb-8">
                Accede a tu cuenta para gestionar tus documentos
              </p>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <Label htmlFor="login-email" className="text-slate-700 text-sm font-medium">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="mt-1.5 h-10 bg-white border-slate-300 focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    data-testid="login-email-input"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="login-password" className="text-slate-700 text-sm font-medium">Contrasena</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="Tu contrasena"
                      className="h-10 bg-white border-slate-300 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 pr-10"
                      data-testid="login-password-input"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      onClick={() => setShowPassword(!showPassword)}
                      data-testid="toggle-password-btn"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium"
                  disabled={loading}
                  data-testid="login-submit-btn"
                >
                  {loading ? 'Entrando...' : 'Iniciar sesion'}
                </Button>
              </form>

              <p className="mt-6 text-sm text-slate-500 text-center">
                No tienes cuenta?{' '}
                <button
                  onClick={() => setIsLogin(false)}
                  className="text-slate-900 font-semibold hover:underline"
                  data-testid="switch-to-register-btn"
                >
                  Registrate
                </button>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Crear cuenta
              </h1>
              <p className="text-sm text-slate-500 mb-6">
                Registrate para subir tus documentos
              </p>

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <Label className="text-slate-700 text-sm font-medium">Nombre completo *</Label>
                  <Input
                    value={regForm.name}
                    onChange={e => updateReg('name', e.target.value)}
                    placeholder="Juan Perez"
                    className="mt-1.5 h-10 bg-white border-slate-300"
                    data-testid="register-name-input"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Email *</Label>
                    <Input
                      type="email"
                      value={regForm.email}
                      onChange={e => updateReg('email', e.target.value)}
                      placeholder="tu@email.com"
                      className="mt-1.5 h-10 bg-white border-slate-300"
                      data-testid="register-email-input"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Contrasena *</Label>
                    <Input
                      type="password"
                      value={regForm.password}
                      onChange={e => updateReg('password', e.target.value)}
                      placeholder="Min. 6 caracteres"
                      className="mt-1.5 h-10 bg-white border-slate-300"
                      data-testid="register-password-input"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">NIE</Label>
                    <Input
                      value={regForm.nie}
                      onChange={e => updateReg('nie', e.target.value)}
                      placeholder="X1234567A"
                      className="mt-1.5 h-10 bg-white border-slate-300"
                      style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
                      data-testid="register-nie-input"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Pasaporte</Label>
                    <Input
                      value={regForm.passport_number}
                      onChange={e => updateReg('passport_number', e.target.value)}
                      placeholder="AB1234567"
                      className="mt-1.5 h-10 bg-white border-slate-300"
                      style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
                      data-testid="register-passport-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Telefono</Label>
                    <Input
                      value={regForm.phone}
                      onChange={e => updateReg('phone', e.target.value)}
                      placeholder="+34 612 345 678"
                      className="mt-1.5 h-10 bg-white border-slate-300"
                      data-testid="register-phone-input"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Ciudad</Label>
                    <Input
                      value={regForm.city}
                      onChange={e => updateReg('city', e.target.value)}
                      placeholder="Madrid"
                      className="mt-1.5 h-10 bg-white border-slate-300"
                      data-testid="register-city-input"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-slate-700 text-sm font-medium">Direccion</Label>
                  <Input
                    value={regForm.address}
                    onChange={e => updateReg('address', e.target.value)}
                    placeholder="Calle Gran Via 1, 2A"
                    className="mt-1.5 h-10 bg-white border-slate-300"
                    data-testid="register-address-input"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Pais de origen</Label>
                    <Select value={regForm.origin_country} onValueChange={v => updateReg('origin_country', v)}>
                      <SelectTrigger className="mt-1.5 h-10 bg-white border-slate-300" data-testid="register-origin-country-select">
                        <SelectValue placeholder="Seleccionar pais" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Pais de residencia</Label>
                    <Select value={regForm.residence_country} onValueChange={v => updateReg('residence_country', v)}>
                      <SelectTrigger className="mt-1.5 h-10 bg-white border-slate-300" data-testid="register-residence-country-select">
                        <SelectValue placeholder="Seleccionar pais" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Pais y Tramite */}
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Pais y tramite</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Donde realizaras tu tramite? *</Label>
                    <Select value={regForm.country} onValueChange={v => { updateReg('country', v); updateReg('tramite_type', ''); }}>
                      <SelectTrigger className="mt-1.5 h-10 bg-white border-slate-300" data-testid="register-country-select">
                        <SelectValue placeholder="Seleccionar pais" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chile">Chile</SelectItem>
                        <SelectItem value="espana">Espana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Tramite a solicitar *</Label>
                    <Select value={regForm.tramite_type} onValueChange={v => updateReg('tramite_type', v)} disabled={!regForm.country}>
                      <SelectTrigger className="mt-1.5 h-10 bg-white border-slate-300" data-testid="register-tramite-select">
                        <SelectValue placeholder={regForm.country ? "Seleccionar tramite" : "Selecciona pais primero"} />
                      </SelectTrigger>
                      <SelectContent>
                        {tramitesList.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Tipo: Persona o Empresa */}
                <div>
                  <Label className="text-slate-700 text-sm font-medium mb-2 block">Tipo de registro</Label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => updateReg('is_company', false)}
                      className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium transition-colors ${!regForm.is_company ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                      data-testid="register-persona-btn"
                    >
                      <User className="w-4 h-4" /> Persona
                    </button>
                    <button
                      type="button"
                      onClick={() => updateReg('is_company', true)}
                      className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium transition-colors ${regForm.is_company ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                      data-testid="register-empresa-btn"
                    >
                      <Building2 className="w-4 h-4" /> Empresa
                    </button>
                  </div>
                </div>

                {regForm.is_company && (
                  <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-700 text-sm font-medium">Nombre de la empresa *</Label>
                        <Input
                          value={regForm.company_name}
                          onChange={e => updateReg('company_name', e.target.value)}
                          placeholder="Nombre de la empresa"
                          className="mt-1.5 h-10 bg-white border-slate-300"
                          data-testid="register-company-name-input"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-700 text-sm font-medium">CIF/NIF *</Label>
                        <Input
                          value={regForm.company_cif_nif}
                          onChange={e => updateReg('company_cif_nif', e.target.value)}
                          placeholder="B12345678"
                          className="mt-1.5 h-10 bg-white border-slate-300"
                          style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
                          data-testid="register-company-cif-input"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-slate-700 text-sm font-medium">Trabajadores para tramites de visado</Label>
                        <button
                          type="button"
                          onClick={() => updateReg('workers', [...regForm.workers, { name: '', nie: '', passport: '', rut_dni: '' }])}
                          className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
                          data-testid="add-worker-btn"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar trabajador
                        </button>
                      </div>
                      {regForm.workers.length === 0 && (
                        <p className="text-xs text-slate-400">Pulsa "+ Agregar trabajador" para registrar trabajadores.</p>
                      )}
                      <div className="space-y-3">
                        {regForm.workers.map((w, idx) => (
                          <div key={idx} className="p-3 bg-white rounded-md border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Trabajador {idx + 1}</span>
                              <button
                                type="button"
                                onClick={() => updateReg('workers', regForm.workers.filter((_, i) => i !== idx))}
                                className="text-red-400 hover:text-red-600"
                                data-testid={`remove-worker-${idx}-btn`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <Input
                                value={w.name || ''}
                                onChange={e => {
                                  const updated = [...regForm.workers];
                                  updated[idx] = { ...updated[idx], name: e.target.value };
                                  updateReg('workers', updated);
                                }}
                                placeholder="Nombres y apellidos *"
                                className="h-9 bg-white border-slate-300 text-sm"
                                data-testid={`worker-${idx}-name`}
                              />
                              <Input
                                value={w.rut_dni || ''}
                                onChange={e => {
                                  const updated = [...regForm.workers];
                                  updated[idx] = { ...updated[idx], rut_dni: e.target.value };
                                  updateReg('workers', updated);
                                }}
                                placeholder="RUT/DNI"
                                className="h-9 bg-white border-slate-300 text-sm"
                                style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
                                data-testid={`worker-${idx}-rut`}
                              />
                              <Input
                                value={w.nie || ''}
                                onChange={e => {
                                  const updated = [...regForm.workers];
                                  updated[idx] = { ...updated[idx], nie: e.target.value };
                                  updateReg('workers', updated);
                                }}
                                placeholder="NIE (si tiene)"
                                className="h-9 bg-white border-slate-300 text-sm"
                                style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
                                data-testid={`worker-${idx}-nie`}
                              />
                              <Input
                                value={w.passport || ''}
                                onChange={e => {
                                  const updated = [...regForm.workers];
                                  updated[idx] = { ...updated[idx], passport: e.target.value };
                                  updateReg('workers', updated);
                                }}
                                placeholder="N. Pasaporte"
                                className="h-9 bg-white border-slate-300 text-sm"
                                style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
                                data-testid={`worker-${idx}-passport`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Datos familiares */}
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Datos familiares</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Nombre completo del padre</Label>
                    <Input
                      value={regForm.father_name}
                      onChange={e => updateReg('father_name', e.target.value)}
                      placeholder="Nombre del padre"
                      className="mt-1.5 h-10 bg-white border-slate-300"
                      data-testid="register-father-input"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-700 text-sm font-medium">Nombre completo de la madre</Label>
                    <Input
                      value={regForm.mother_name}
                      onChange={e => updateReg('mother_name', e.target.value)}
                      placeholder="Nombre de la madre"
                      className="mt-1.5 h-10 bg-white border-slate-300"
                      data-testid="register-mother-input"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-slate-700 text-sm font-medium">Hijos (opcional)</Label>
                    <button
                      type="button"
                      onClick={() => updateReg('children', [...regForm.children, ''])}
                      className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
                      data-testid="add-child-btn"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar hijo
                    </button>
                  </div>
                  {regForm.children.length === 0 && (
                    <p className="text-xs text-slate-400">Sin hijos registrados. Pulsa "+ Agregar hijo" si deseas agregar.</p>
                  )}
                  <div className="space-y-2">
                    {regForm.children.map((child, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={child}
                          onChange={e => {
                            const updated = [...regForm.children];
                            updated[idx] = e.target.value;
                            updateReg('children', updated);
                          }}
                          placeholder={`Nombre completo del hijo/a ${idx + 1}`}
                          className="h-10 bg-white border-slate-300 flex-1"
                          data-testid={`register-child-${idx}-input`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = regForm.children.filter((_, i) => i !== idx);
                            updateReg('children', updated);
                          }}
                          className="text-red-400 hover:text-red-600 p-1"
                          data-testid={`remove-child-${idx}-btn`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium mt-2"
                  disabled={loading}
                  data-testid="register-submit-btn"
                >
                  {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                </Button>
              </form>

              <p className="mt-6 text-sm text-slate-500 text-center">
                Ya tienes cuenta?{' '}
                <button
                  onClick={() => setIsLogin(true)}
                  className="text-slate-900 font-semibold hover:underline"
                  data-testid="switch-to-login-btn"
                >
                  Inicia sesion
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Right - Image */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <img
          src={BG_URL}
          alt="Office"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-900/30" />
        <div className="absolute bottom-12 left-12 right-12">
          <p className="text-white/90 text-base font-medium leading-relaxed" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Gestiona tus documentos de inmigracion de forma segura y eficiente con Tramilex.
          </p>
        </div>
      </div>

      {/* Copyright */}
      <div className="fixed bottom-4 left-0 right-0 lg:right-1/2 text-center">
        <p className="text-xs text-slate-400">
          Creado por <a href="https://goroky.com" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-700 font-medium">GoRoky.com</a>
        </p>
      </div>
    </div>
  );
}
