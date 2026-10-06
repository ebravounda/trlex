import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { UserPlus, Users, Trash2, Plus, Pencil, Phone, MessageCircle } from 'lucide-react';

export default function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', whatsapp: '', position: '' });
  const [editForm, setEditForm] = useState({ name: '', phone: '', whatsapp: '', position: '' });

  const fetchStaff = useCallback(async () => {
    try {
      const res = await api.get('/staff');
      setStaff(res.data);
    } catch { toast.error('Error cargando usuarios'); }
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      toast.error('Nombre, email y contrasena son obligatorios');
      return;
    }
    try {
      await api.post('/staff', form);
      setForm({ name: '', email: '', password: '', phone: '', whatsapp: '', position: '' });
      setShowCreate(false);
      fetchStaff();
      toast.success('Usuario creado');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleEdit = (s) => {
    setEditForm({ name: s.name, phone: s.phone || '', whatsapp: s.whatsapp || '', position: s.position || '' });
    setEditingStaff(s);
  };

  const handleSaveEdit = async () => {
    try {
      await api.put(`/staff/${editingStaff.id}`, editForm);
      setEditingStaff(null);
      fetchStaff();
      toast.success('Usuario actualizado');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Eliminar usuario "${name}"?`)) return;
    try {
      await api.delete(`/staff/${id}`);
      fetchStaff();
      toast.success('Usuario eliminado');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  return (
    <div className="space-y-6" data-testid="admin-staff">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Equipo</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona los usuarios del despacho</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800 gap-2" data-testid="create-staff-btn">
          <Plus className="w-4 h-4" /> Nuevo usuario
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center">
          <Users className="w-5 h-5 text-sky-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{staff.length}</p>
          <p className="text-xs uppercase tracking-wider text-slate-500">Miembros del equipo</p>
        </div>
      </div>

      {staff.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <UserPlus className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No hay usuarios registrados</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Nombre</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Cargo</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Telefono</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">WhatsApp</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="py-3 px-4">
                    <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm text-slate-600">{s.email}</TableCell>
                  <TableCell className="py-3 px-4">
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">{s.position || '-'}</Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm text-slate-600">
                    {s.phone ? (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" />{s.phone}</span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm">
                    {s.whatsapp ? (
                      <span className="flex items-center gap-1 text-green-600 font-medium">
                        <MessageCircle className="w-3 h-3" />{s.whatsapp}
                      </span>
                    ) : (
                      <span className="text-amber-500 text-xs font-medium">Sin configurar</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {s.position !== 'Administrador' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(s)} data-testid={`edit-staff-${s.id}`}>
                            <Pencil className="w-4 h-4 text-slate-400" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id, s.name)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo usuario del equipo</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Input placeholder="Nombre completo *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} data-testid="staff-name-input" />
            <Input placeholder="Email *" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} data-testid="staff-email-input" />
            <Input placeholder="Contrasena *" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} data-testid="staff-password-input" />
            <Input placeholder="Cargo (ej: Asistente legal)" value={form.position} onChange={e => setForm({...form, position: e.target.value})} />
            <Input placeholder="Telefono" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            <div className="relative">
              <Input placeholder="WhatsApp (ej: 34612345678)" value={form.whatsapp} onChange={e => setForm({...form, whatsapp: e.target.value})} data-testid="staff-whatsapp-input" />
              <MessageCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
            </div>
            <p className="text-[10px] text-slate-400">El WhatsApp debe incluir codigo de pais sin + (ej: 34612345678 para Espana)</p>
            <Button onClick={handleCreate} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="submit-staff-btn">
              Crear usuario
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingStaff} onOpenChange={(v) => { if (!v) setEditingStaff(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Input placeholder="Nombre completo" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
            <Input placeholder="Cargo" value={editForm.position} onChange={e => setEditForm({...editForm, position: e.target.value})} />
            <Input placeholder="Telefono" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
            <div className="relative">
              <Input placeholder="WhatsApp (ej: 34612345678)" value={editForm.whatsapp} onChange={e => setEditForm({...editForm, whatsapp: e.target.value})} data-testid="edit-staff-whatsapp" />
              <MessageCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
            </div>
            <p className="text-[10px] text-slate-400">Codigo de pais sin + (ej: 34612345678). Al crear tareas, se enviara WhatsApp automaticamente.</p>
            <Button onClick={handleSaveEdit} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="save-staff-btn">
              Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
