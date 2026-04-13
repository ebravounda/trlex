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
import { Plus, Trash2, Pencil, Search } from 'lucide-react';

function ListEditor({ label, items, onChange, placeholder, testPrefix }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-slate-700 text-sm font-medium">{label}</Label>
        <button type="button" onClick={() => onChange([...items, ''])}
          className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium" data-testid={`add-${testPrefix}-btn`}>
          <Plus className="w-3.5 h-3.5" /> Agregar
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={item} onChange={e => { const u = [...items]; u[i] = e.target.value; onChange(u); }}
              placeholder={`${placeholder} ${i + 1}`} className="h-9 bg-white border-slate-300 text-sm flex-1"
              data-testid={`${testPrefix}-${i}-input`} />
            {items.length > 1 && (
              <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-slate-400">Sin elementos. Pulsa Agregar.</p>
        )}
      </div>
    </div>
  );
}

export default function AdminTramites() {
  const [tramites, setTramites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [createForm, setCreateForm] = useState({
    name: '', country: '', requirements: [''], docs_persona: [''], docs_empresa: ['']
  });
  const [editForm, setEditForm] = useState({
    id: '', name: '', country: '', source: '', requirements: [], docs_persona: [], docs_empresa: []
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

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.country) {
      toast.error('Nombre y pais son obligatorios'); return;
    }
    setSaving(true);
    try {
      await api.post('/admin/tramites', {
        name: createForm.name.trim(), country: createForm.country,
        requirements: createForm.requirements.filter(r => r.trim()),
        docs_persona: createForm.docs_persona.filter(d => d.trim()),
        docs_empresa: createForm.docs_empresa.filter(d => d.trim()),
      });
      toast.success('Tramite creado');
      setCreateOpen(false);
      setCreateForm({ name: '', country: '', requirements: [''], docs_persona: [''], docs_empresa: [''] });
      fetchTramites();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  };

  const openEdit = (t) => {
    setEditForm({
      id: t.id, name: t.name, country: t.country, source: t.source,
      requirements: t.requirements?.length > 0 ? [...t.requirements] : [''],
      docs_persona: t.docs_persona?.length > 0 ? [...t.docs_persona] : [''],
      docs_empresa: t.docs_empresa?.length > 0 ? [...t.docs_empresa] : [],
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/tramites/${editForm.id}/edit`, {
        country: editForm.country, source: editForm.source,
        requirements: editForm.requirements.filter(r => r.trim()),
        docs_persona: editForm.docs_persona.filter(d => d.trim()),
        docs_empresa: editForm.docs_empresa.filter(d => d.trim()),
      });
      toast.success('Tramite actualizado');
      setEditOpen(false);
      fetchTramites();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Eliminar tramite "${name}"?`)) return;
    try {
      await api.delete(`/admin/tramites/${id}`);
      toast.success('Tramite eliminado');
      fetchTramites();
    } catch (err) { toast.error('Error'); }
  };

  const filtered = tramites.filter(t => {
    if (countryFilter && t.country !== countryFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const customTramites = filtered.filter(t => t.source === 'personalizado');
  const systemTramites = filtered.filter(t => t.source === 'sistema');

  return (
    <div data-testid="admin-tramites-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Tramites
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona tramites y sus requisitos</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800 text-white gap-2"
          onClick={() => { setCreateForm({ name: '', country: '', requirements: [''], docs_persona: [''], docs_empresa: [''] }); setCreateOpen(true); }}
          data-testid="new-tramite-btn">
          <Plus className="w-4 h-4" /> Nuevo tramite
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tramite..."
            className="pl-9 h-10 bg-white border-slate-300" data-testid="search-tramites-input" />
        </div>
        <Select value={countryFilter} onValueChange={v => setCountryFilter(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-48 h-10 bg-white border-slate-300" data-testid="filter-country-tramites">
            <SelectValue placeholder="Todos los paises" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos los paises</SelectItem>
            <SelectItem value="chile">Chile</SelectItem>
            <SelectItem value="espana">Espana</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Custom */}
          {customTramites.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wider">Personalizados ({customTramites.length})</h2>
              <TramiteTable tramites={customTramites} onEdit={openEdit} onDelete={handleDelete} showDelete />
            </div>
          )}

          {/* System */}
          <div>
            <h2 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wider">Del sistema ({systemTramites.length})</h2>
            <TramiteTable tramites={systemTramites} onEdit={openEdit} />
          </div>
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>Nuevo tramite</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700 text-sm font-medium">Nombre *</Label>
                <Input value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Nombre del tramite" className="mt-1.5 h-10 bg-white border-slate-300" data-testid="create-tramite-name" />
              </div>
              <div>
                <Label className="text-slate-700 text-sm font-medium">Pais *</Label>
                <Select value={createForm.country} onValueChange={v => setCreateForm(p => ({ ...p, country: v }))}>
                  <SelectTrigger className="mt-1.5 h-10 bg-white border-slate-300" data-testid="create-tramite-country">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chile">Chile</SelectItem>
                    <SelectItem value="espana">Espana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ListEditor label="Requisitos" items={createForm.requirements}
              onChange={v => setCreateForm(p => ({ ...p, requirements: v }))} placeholder="Requisito" testPrefix="create-req" />
            <ListEditor label="Documentos persona" items={createForm.docs_persona}
              onChange={v => setCreateForm(p => ({ ...p, docs_persona: v }))} placeholder="Documento" testPrefix="create-docp" />
            <ListEditor label="Documentos empresa" items={createForm.docs_empresa}
              onChange={v => setCreateForm(p => ({ ...p, docs_empresa: v }))} placeholder="Documento empresa" testPrefix="create-doce" />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={handleCreate} disabled={saving}
                data-testid="save-create-tramite">{saving ? 'Guardando...' : 'Crear tramite'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              Editar: {editForm.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <ListEditor label="Requisitos" items={editForm.requirements}
              onChange={v => setEditForm(p => ({ ...p, requirements: v }))} placeholder="Requisito" testPrefix="edit-req" />
            <ListEditor label="Documentos persona" items={editForm.docs_persona}
              onChange={v => setEditForm(p => ({ ...p, docs_persona: v }))} placeholder="Documento" testPrefix="edit-docp" />
            <ListEditor label="Documentos empresa (opcional)" items={editForm.docs_empresa}
              onChange={v => setEditForm(p => ({ ...p, docs_empresa: v }))} placeholder="Documento empresa" testPrefix="edit-doce" />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={handleEdit} disabled={saving}
                data-testid="save-edit-tramite">{saving ? 'Guardando...' : 'Guardar cambios'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TramiteTable({ tramites, onEdit, onDelete, showDelete }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/50">
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Nombre</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Pais</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 text-center">Requisitos</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 text-center">Docs</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tramites.map(t => (
            <TableRow key={`${t.source}-${t.id}`} className="hover:bg-slate-50">
              <TableCell className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{t.name}</span>
                  {t.has_override && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">editado</Badge>}
                </div>
              </TableCell>
              <TableCell className="py-3 px-4">
                <Badge className="text-xs bg-slate-100 text-slate-600 border-slate-200">{t.country_label}</Badge>
              </TableCell>
              <TableCell className="py-3 px-4 text-center text-sm text-slate-500">{t.requirements?.length || 0}</TableCell>
              <TableCell className="py-3 px-4 text-center text-sm text-slate-500">{(t.docs_persona?.length || 0) + (t.docs_empresa?.length || 0)}</TableCell>
              <TableCell className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-sky-600 hover:bg-sky-50"
                    onClick={() => onEdit(t)} data-testid={`edit-tramite-${t.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {showDelete && (
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => onDelete(t.id, t.name)} data-testid={`delete-tramite-${t.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
