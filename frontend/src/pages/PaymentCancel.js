import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

const LOGO_URL = "/logo.png";

export default function PaymentCancel() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" data-testid="payment-cancel-page">
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <img src={LOGO_URL} alt="Tramilex" className="h-10 object-contain cursor-pointer" onClick={() => navigate('/')} />
        </div>
      </nav>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Pago cancelado</h2>
          <p className="text-sm text-slate-500">El proceso de pago fue cancelado. Su cita no ha sido reservada.</p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={() => navigate('/citas/reservar')} className="bg-slate-900 hover:bg-slate-800">
              Intentar de nuevo
            </Button>
            <Button onClick={() => navigate('/')} variant="outline">
              Volver al inicio
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
