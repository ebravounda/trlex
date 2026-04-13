import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, FileText, Globe, ClipboardList } from 'lucide-react';

export default function AdminTramites() {
  const [tramites, setTramites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', country: '', requirements: [''], docs_persona: [''], docs_empresa: ['']
  });

  const fetchTramites = useCallback(async () => {
    try {
      const res = await api.get('/admin/tramites');
      setTramites(res.data);
    } catch (err) {
      toast.error('Error cargando tramites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTramites(); }, [fetchTramites]);

  const resetForm = () => {
    setForm({ name: '', country: '', requirements: [''], docs_persona: [''], docs_empresa: [''] });
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.country) {
      toast.error('Nombre y pais son obligatorios');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/tramites', {
        name: form.name.trim(),
        country: form.country,
        requirements: form.requirements.filter(r => r.trim()),
        docs_persona: form.docs_persona.filter(d => d.trim()),
        docs_empresa: form.docs_empresa.filter(d => d.trim()),
      });
      toast.success('Tramite creado');
      setDialogOpen(false);
      resetForm();
      fetchTramites();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error creando tramite');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Eliminar tramite "${name}"?`)) return;
    try {
      await api.delete(`/admin/tramites/${id}`);
      toast.success('Tramite eliminado');
      fetchTramites();
    } catch (err) {
      toast.error('Error eliminando tramite');
    }
  };

  const updateList = (field, idx, value) => {
    setForm(prev => {
      const updated = [...prev[field]];
      updated[idx] = value;
      return { ...prev, [field]: updated };
    });
  };

  const addToList = (field) => {
    setForm(prev => ({ ...prev, [field]: [...prev[field], ''] }));
  };

  const removeFromList = (field, idx) => {
    setForm(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }));
  };

  const customTramites = tramites.filter(t => t.source === 'personalizado');
  const systemTramites = tramites.filter(t => t.source === 'sistema');

  return (
    <div data-testid="admin-tramites-page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Tramites
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona los tramites disponibles para los clientes</p>
        </div>
        <Button
          className="bg-slate-900 hover:bg-slate-800 text-white gap-2"
          onClick={() => { resetForm(); setDialogOpen(true); }}
          data-testid="new-tramite-btn"
        >
          <Plus className="w-4 h-4" /> Nuevo tramite
        </Button>
      </div>

      {/* Custom Tramites */}
      {customTramites.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-slate-800 mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Tramites personalizados ({customTramites.length})
          </h2>
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Nombre</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Pais</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Requisitos</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Docs</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customTramites.map(t => (
                  <TableRow key={t.id} className="hover:bg-slate-50">
                    <TableCell className="py-3 px-4 text-sm font-medium text-slate-800">{t.name}</TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge className="text-xs bg-slate-100 text-slate-600 border-slate-200">{t.country_label}</Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm text-slate-500">{t.requirements?.length || 0}</TableCell>
                    <TableCell className="py-3 px-4 text-sm text-slate-500">{(t.docs_persona?.length || 0) + (t.docs_empresa?.length || 0)}</TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(t.id, t.name)} data-testid={`delete-tramite-${t.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* System Tramites */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
        </div>
      ) : (
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Tramites del sistema ({systemTramites.length})
          </h2>
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Nombre</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Pais</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Docs persona</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Docs empresa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {systemTramites.map(t => (
                  <TableRow key={t.id} className="hover:bg-slate-50">
                    <TableCell className="py-3 px-4 text-sm font-medium text-slate-800">{t.name}</TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge className="text-xs bg-slate-100 text-slate-600 border-slate-200">{t.country_label}</Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm text-slate-500">{t.docs_persona?.length || 0}</TableCell>
                    <TableCell className="py-3 px-4 text-sm text-slate-500">{t.docs_empresa?.length || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Create Tramite Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Nuevo tramite
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700 text-sm font-medium">Nombre del tramite *</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Solicitud Visa de Estudios" className="mt-1.5 h-10 bg-white border-slate-300"
                  data-testid="tramite-name-input" />
              </div>
              <div>
                <Label className="text-slate-700 text-sm font-medium">Pais *</Label>
                <Select value={form.country} onValueChange={v => setForm(p => ({ ...p, country: v }))}>
                  <SelectTrigger className="mt-1.5 h-10 bg-white border-slate-300" data-testid="tramite-country-select">
                    <SelectValue placeholder="Seleccionar pais" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chile">Chile</SelectItem>
                    <SelectItem value="espana">Espana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Requirements */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 text-sm font-medium">Requisitos</Label>
                <button type="button" onClick={() => addToList('requirements')}
                  className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium" data-testid="add-requirement-btn">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              <div className="space-y-2">
                {form.requirements.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={r} onChange={e => updateList('requirements', i, e.target.value)}
                      placeholder={`Requisito ${i + 1}`} className="h-9 bg-white border-slate-300 text-sm flex-1"
                      data-testid={`requirement-${i}-input`} />
                    {form.requirements.length > 1 && (
                      <button onClick={() => removeFromList('requirements', i)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Docs Persona */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 text-sm font-medium">Documentos requeridos (persona)</Label>
                <button type="button" onClick={() => addToList('docs_persona')}
                  className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium" data-testid="add-doc-persona-btn">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              <div className="space-y-2">
                {form.docs_persona.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={d} onChange={e => updateList('docs_persona', i, e.target.value)}
                      placeholder={`Documento ${i + 1}`} className="h-9 bg-white border-slate-300 text-sm flex-1"
                      data-testid={`doc-persona-${i}-input`} />
                    {form.docs_persona.length > 1 && (
                      <button onClick={() => removeFromList('docs_persona', i)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Docs Empresa */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 text-sm font-medium">Documentos requeridos (empresa)</Label>
                <button type="button" onClick={() => addToList('docs_empresa')}
                  className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium" data-testid="add-doc-empresa-btn">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              <div className="space-y-2">
                {form.docs_empresa.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={d} onChange={e => updateList('docs_empresa', i, e.target.value)}
                      placeholder={`Documento empresa ${i + 1}`} className="h-9 bg-white border-slate-300 text-sm flex-1"
                      data-testid={`doc-empresa-${i}-input`} />
                    {form.docs_empresa.length > 1 && (
                      <button onClick={() => removeFromList('docs_empresa', i)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button className="bg-slate-900 hover:bg-slate-800 text-white gap-2" onClick={handleCreate} disabled={saving}
                data-testid="save-tramite-btn">
                {saving ? 'Guardando...' : 'Crear tramite'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
