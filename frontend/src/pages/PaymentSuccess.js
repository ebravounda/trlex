import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { CheckCircle2, Loader2, Calendar, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LOGO_URL = "https://customer-assets-lxgj4vgw.emergentagent.net/job_inmigra-docs/artifacts/8hv3nj18_tramilex_logo_1600x900.png";

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId) { setStatus('error'); return; }
    let attempts = 0;
    const check = async () => {
      try {
        const res = await api.get(`/citas/payment-status/${sessionId}`);
        if (res.data.payment_status === 'paid') {
          setStatus('confirmed');
        } else if (attempts < 10) {
          attempts++;
          setTimeout(check, 2000);
        } else {
          setStatus('pending');
        }
      } catch {
        if (attempts < 5) { attempts++; setTimeout(check, 2000); }
        else setStatus('error');
      }
    };
    check();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" data-testid="payment-success-page">
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <img src={LOGO_URL} alt="Tramilex" className="h-10 object-contain cursor-pointer" onClick={() => navigate('/')} />
        </div>
      </nav>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          {status === 'checking' && (
            <div className="space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-slate-400 mx-auto" />
              <h2 className="text-xl font-semibold text-slate-900">Verificando pago...</h2>
              <p className="text-sm text-slate-500">Esto puede tardar unos segundos</p>
            </div>
          )}
          {status === 'confirmed' && (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Cita Confirmada!</h2>
              <p className="text-sm text-slate-500">Su pago ha sido procesado y su cita ha sido confirmada exitosamente. Recibira un correo de confirmacion con los detalles.</p>
              <Button onClick={() => navigate('/')} className="bg-slate-900 hover:bg-slate-800 mt-4">
                Volver al inicio
              </Button>
            </div>
          )}
          {status === 'pending' && (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">Pago en proceso</h2>
              <p className="text-sm text-slate-500">Su pago esta siendo procesado. Recibira un correo cuando su cita sea confirmada.</p>
              <Button onClick={() => navigate('/')} variant="outline" className="mt-4">Volver al inicio</Button>
            </div>
          )}
          {status === 'error' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-900">Error</h2>
              <p className="text-sm text-slate-500">Hubo un problema verificando su pago. Contacte a soporte si el problema persiste.</p>
              <Button onClick={() => navigate('/')} variant="outline" className="mt-4">Volver al inicio</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
