import { useState } from 'react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff } from 'lucide-react';

export default function ForcePasswordChange({ currentPassword, onComplete }) {
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPw.length < 6) { toast.error('Minimo 6 caracteres'); return; }
    if (newPw !== confirmPw) { toast.error('Las contrasenas no coinciden'); return; }
    setSaving(true);
    try {
      await api.put('/auth/change-password', { current_password: currentPassword, new_password: newPw });
      toast.success('Contrasena actualizada correctamente');
      onComplete();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error cambiando contrasena');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" data-testid="force-password-modal">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="bg-slate-900 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Cambiar contrasena</h2>
              <p className="text-xs text-slate-300">Por seguridad, cambia tu contrasena temporal</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600">Esta es tu primera vez accediendo al sistema. Por favor, elige una nueva contrasena segura.</p>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Nueva contrasena *</label>
            <div className="relative">
              <Input type={show ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 6 caracteres" className="pr-10" data-testid="force-new-pw" autoFocus />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Confirmar contrasena *</label>
            <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repetir contrasena" data-testid="force-confirm-pw" />
          </div>
          {newPw && confirmPw && newPw !== confirmPw && (
            <p className="text-xs text-red-500">Las contrasenas no coinciden</p>
          )}
          <Button type="submit" disabled={saving || !newPw || !confirmPw} className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-lg font-medium" data-testid="force-pw-submit">
            {saving ? 'Guardando...' : 'Cambiar contrasena'}
          </Button>
        </form>
      </div>
    </div>
  );
}
