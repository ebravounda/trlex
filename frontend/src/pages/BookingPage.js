import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Calendar, Clock, MapPin, ArrowLeft, ArrowRight, CreditCard, CheckCircle2, Loader2, Shield } from 'lucide-react';

const LOGO_URL = "https://customer-assets-lxgj4vgw.emergentagent.net/job_inmigra-docs/artifacts/8hv3nj18_tramilex_logo_1600x900.png";

const STEPS = ['location', 'datetime', 'details', 'payment'];

const COUNTRIES = [
  'Afganistan','Albania','Alemania','Andorra','Angola','Argentina','Armenia','Australia','Austria',
  'Bolivia','Brasil','Bulgaria','Canada','Chile','China','Colombia','Costa Rica','Cuba','Dinamarca',
  'Ecuador','Egipto','El Salvador','Espana','Estados Unidos','Filipinas','Francia','Guatemala','Honduras',
  'India','Indonesia','Iran','Italia','Jamaica','Japon','Mexico','Nicaragua','Nigeria','Panama',
  'Paraguay','Peru','Polonia','Portugal','Reino Unido','Republica Dominicana','Rumania','Rusia',
  'Senegal','Suecia','Suiza','Turquia','Ucrania','Uruguay','Venezuela','Vietnam'
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

export default function BookingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    location: '',
    office: '',
    date: '',
    time: '',
    first_name: '',
    last_name: '',
    email: '',
    origin_country: '',
    residence_country: '',
    address: '',
    document_id: '',
    document_type: 'pasaporte',
    phone: '',
    accept_terms: false,
  });

  useEffect(() => {
    api.get('/citas/config').then(r => setConfig(r.data)).catch(() => {});
  }, []);

  const fetchSlots = useCallback(async (date, location) => {
    if (!date || !location) return;
    setLoadingSlots(true);
    try {
      const res = await api.get(`/citas/available-slots?date=${date}&location=${location}`);
      setSlots(res.data.blocked ? [] : res.data.slots);
      if (res.data.blocked) toast.error('Este dia no esta disponible para citas');
    } catch { setSlots([]); }
    setLoadingSlots(false);
  }, []);

  const handleLocationSelect = (loc) => {
    const office = config?.offices?.[loc];
    setForm(f => ({ ...f, location: loc, office: office ? `${office.name}, ${office.detail}` : '', date: '', time: '' }));
    setSlots([]);
    setStep(1);
  };

  const handleDateChange = (date) => {
    setForm(f => ({ ...f, date, time: '' }));
    fetchSlots(date, form.location);
  };

  const handleTimeSelect = (time) => {
    setForm(f => ({ ...f, time }));
    setStep(2);
  };

  const canProceedToPayment = () => {
    return form.first_name && form.last_name && form.email && form.phone &&
      form.origin_country && form.residence_country && form.address &&
      form.document_id && form.document_type && form.accept_terms;
  };

  const handleSubmit = async () => {
    if (!canProceedToPayment()) {
      toast.error('Por favor complete todos los campos obligatorios');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/citas/book', {
        ...form,
        origin_url: window.location.origin,
      });
      if (res.data.checkout_url) {
        window.location.href = res.data.checkout_url;
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear la cita');
      setSubmitting(false);
    }
  };

  const getMinDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const priceDisplay = config ? `${(config.price_amount / 100).toFixed(2)} ${config.price_currency.toUpperCase()}` : '50.00 EUR';

  return (
    <div className="min-h-screen bg-slate-50" data-testid="booking-page">
      {/* Header */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <img src={LOGO_URL} alt="Tramilex" className="h-10 object-contain cursor-pointer" onClick={() => navigate('/')} />
          <Badge className="bg-slate-100 text-slate-600 border-0 text-xs font-medium">Reserva de cita</Badge>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i <= step ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
              }`}>{i + 1}</div>
              {i < STEPS.length - 1 && <div className={`w-8 h-0.5 ${i < step ? 'bg-slate-900' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {/* Step 0: Location */}
        {step === 0 && (
          <div className="space-y-6" data-testid="step-location">
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Donde desea solicitar su cita?
              </h1>
              <p className="text-sm text-slate-500 mt-2">Seleccione la oficina mas conveniente para usted</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              {[
                { key: 'chile', flag: 'CL', label: 'Chile', office: 'Oficina Santiago', detail: 'Reg. Metropolitana' },
                { key: 'spain', flag: 'ES', label: 'Espana', office: 'Oficina Madrid', detail: 'Madrid' },
              ].map(loc => (
                <button key={loc.key} onClick={() => handleLocationSelect(loc.key)}
                  data-testid={`location-${loc.key}`}
                  className="bg-white border-2 border-slate-200 hover:border-slate-900 rounded-xl p-6 text-center transition-all hover:shadow-lg group">
                  <div className="text-3xl mb-3">{loc.flag === 'CL' ? '\ud83c\udde8\ud83c\uddf1' : '\ud83c\uddea\ud83c\uddf8'}</div>
                  <p className="text-lg font-semibold text-slate-900 group-hover:text-slate-900">{loc.label}</p>
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-sm text-slate-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{loc.office}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{loc.detail}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Date & Time */}
        {step === 1 && (
          <div className="space-y-6" data-testid="step-datetime">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => setStep(0)} className="p-1.5 rounded-md hover:bg-slate-200 transition-colors">
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <div>
                <h2 className="text-xl font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Seleccione fecha y hora</h2>
                <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> {form.office}
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4" /> Fecha
              </label>
              <Input type="date" min={getMinDate()} value={form.date}
                onChange={e => handleDateChange(e.target.value)}
                className="max-w-xs" data-testid="date-input" />
            </div>

            {form.date && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4" /> Horarios disponibles
                  <span className="text-xs text-slate-400 ml-auto">{formatDate(form.date)}</span>
                </label>
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">No hay horarios disponibles para esta fecha</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slots.map(t => (
                      <button key={t} onClick={() => handleTimeSelect(t)}
                        data-testid={`slot-${t}`}
                        className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-all ${
                          form.time === t
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Personal Details */}
        {step === 2 && (
          <div className="space-y-6" data-testid="step-details">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => setStep(1)} className="p-1.5 rounded-md hover:bg-slate-200 transition-colors">
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <div>
                <h2 className="text-xl font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Datos personales</h2>
                <p className="text-sm text-slate-500 mt-0.5">{form.office} - {formatDate(form.date)} a las {form.time}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Nombres *</label>
                  <Input value={form.first_name} onChange={e => setForm(f => ({...f, first_name: e.target.value}))} placeholder="Juan Carlos" data-testid="input-first-name" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Apellidos *</label>
                  <Input value={form.last_name} onChange={e => setForm(f => ({...f, last_name: e.target.value}))} placeholder="Garcia Lopez" data-testid="input-last-name" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Correo electronico *</label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="correo@ejemplo.com" data-testid="input-email" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Telefono *</label>
                <Input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="+34 612 345 678" data-testid="input-phone" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Pais de origen *</label>
                  <Select value={form.origin_country} onValueChange={v => setForm(f => ({...f, origin_country: v}))}>
                    <SelectTrigger data-testid="select-origin-country"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Pais de residencia *</label>
                  <Select value={form.residence_country} onValueChange={v => setForm(f => ({...f, residence_country: v}))}>
                    <SelectTrigger data-testid="select-residence-country"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Direccion *</label>
                <Input value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Calle, numero, ciudad" data-testid="input-address" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo de documento *</label>
                  <Select value={form.document_type} onValueChange={v => setForm(f => ({...f, document_type: v}))}>
                    <SelectTrigger data-testid="select-doc-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pasaporte">Pasaporte</SelectItem>
                      <SelectItem value="dni">DNI</SelectItem>
                      <SelectItem value="nie">NIE</SelectItem>
                      <SelectItem value="rut">RUT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Numero de documento *</label>
                  <Input value={form.document_id} onChange={e => setForm(f => ({...f, document_id: e.target.value}))} placeholder="AB123456" data-testid="input-document-id" />
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-slate-100">
                <Checkbox checked={form.accept_terms} onCheckedChange={v => setForm(f => ({...f, accept_terms: !!v}))} id="terms" data-testid="checkbox-terms" />
                <label htmlFor="terms" className="text-xs text-slate-600 cursor-pointer leading-relaxed">
                  Acepto los terminos y condiciones de tratamiento de datos personales. Sus datos seran tratados conforme a la normativa vigente de proteccion de datos.
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Atras
              </Button>
              <Button onClick={() => canProceedToPayment() ? setStep(3) : toast.error('Complete todos los campos')}
                className="bg-slate-900 hover:bg-slate-800 gap-2" data-testid="btn-to-payment">
                Continuar al pago <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Payment Summary */}
        {step === 3 && (
          <div className="space-y-6" data-testid="step-payment">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => setStep(2)} className="p-1.5 rounded-md hover:bg-slate-200 transition-colors">
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <h2 className="text-xl font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Resumen y pago</h2>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Detalles de la cita</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">Oficina:</span> <span className="font-medium text-slate-900">{form.office}</span></div>
                  <div><span className="text-slate-500">Fecha:</span> <span className="font-medium text-slate-900">{formatDate(form.date)}</span></div>
                  <div><span className="text-slate-500">Hora:</span> <span className="font-medium text-slate-900">{form.time}</span></div>
                  <div><span className="text-slate-500">Duracion:</span> <span className="font-medium text-slate-900">45 minutos</span></div>
                </div>
              </div>
              <div className="p-5 border-b border-slate-100">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Datos personales</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">Nombre:</span> <span className="font-medium text-slate-900">{form.first_name} {form.last_name}</span></div>
                  <div><span className="text-slate-500">Email:</span> <span className="font-medium text-slate-900">{form.email}</span></div>
                  <div><span className="text-slate-500">Telefono:</span> <span className="font-medium text-slate-900">{form.phone}</span></div>
                  <div><span className="text-slate-500">Documento:</span> <span className="font-medium text-slate-900">{form.document_type.toUpperCase()}: {form.document_id}</span></div>
                </div>
              </div>
              <div className="p-5 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total a pagar</p>
                  <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{priceDisplay}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Shield className="w-3.5 h-3.5" /> Pago seguro via Stripe
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Atras
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2 h-11 px-6" data-testid="btn-pay">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {submitting ? 'Procesando...' : `Pagar ${priceDisplay}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
