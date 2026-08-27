import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, ListTodo, MessageSquare, Trash2, Clock, User, ChevronDown, ChevronUp, Send } from 'lucide-react';

const PRIORITIES = [
  { value: 'baja', label: 'Baja', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'media', label: 'Media', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'alta', label: 'Alta', color: 'bg-red-100 text-red-700 border-red-200' },
];

const STATUSES = [
  { value: 'pendiente', label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  { value: 'en_proceso', label: 'En proceso', color: 'bg-sky-100 text-sky-700' },
  { value: 'completada', label: 'Completada', color: 'bg-emerald-100 text-emerald-700' },
];

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminTareas() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedTask, setExpandedTask] = useState(null);
  const [taskDetail, setTaskDetail] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [filter, setFilter] = useState('all');

  const [form, setForm] = useState({ title: '', description: '', priority: 'media', assigned_to: '', due_date: '' });

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get('/tasks');
      setTasks(res.data);
    } catch { toast.error('Error cargando tareas'); }
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await api.get('/staff');
      setStaff(res.data);
    } catch {}
  }, []);

  useEffect(() => { fetchTasks(); fetchStaff(); }, [fetchTasks, fetchStaff]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.assigned_to) {
      toast.error('Titulo y asignado son obligatorios');
      return;
    }
    try {
      await api.post('/tasks', form);
      setForm({ title: '', description: '', priority: 'media', assigned_to: '', due_date: '' });
      setShowCreate(false);
      fetchTasks();
      toast.success('Tarea creada');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      fetchTasks();
    } catch { toast.error('Error'); }
  };

  const toggleTask = async (taskId) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
      setTaskDetail(null);
    } else {
      setExpandedTask(taskId);
      try {
        const res = await api.get(`/tasks/${taskId}`);
        setTaskDetail(res.data);
      } catch {}
    }
  };

  const handleAddComment = async (taskId) => {
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${taskId}/comments`, { text: newComment });
      setNewComment('');
      const res = await api.get(`/tasks/${taskId}`);
      setTaskDetail(res.data);
      fetchTasks();
      toast.success('Comentario agregado');
    } catch { toast.error('Error'); }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Eliminar esta tarea?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      fetchTasks();
      setExpandedTask(null);
      toast.success('Tarea eliminada');
    } catch { toast.error('Error'); }
  };

  const userId = user?._id || user?.id;
  const filtered = tasks.filter(t => {
    if (filter === 'mine') return t.assigned_to === userId;
    if (filter === 'created') return t.created_by === userId;
    if (filter === 'pendiente') return t.status === 'pendiente';
    if (filter === 'en_proceso') return t.status === 'en_proceso';
    if (filter === 'completada') return t.status === 'completada';
    return true;
  });

  const priorityColor = (p) => PRIORITIES.find(x => x.value === p)?.color || '';
  const statusObj = (s) => STATUSES.find(x => x.value === s) || STATUSES[0];

  return (
    <div className="space-y-6" data-testid="admin-tareas">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Tareas</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona y asigna tareas al equipo</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800 gap-2" data-testid="create-task-btn">
          <Plus className="w-4 h-4" /> Nueva tarea
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {[
          { v: 'all', l: 'Todas' }, { v: 'mine', l: 'Mis tareas' }, { v: 'created', l: 'Creadas por mi' },
          { v: 'pendiente', l: 'Pendientes' }, { v: 'en_proceso', l: 'En proceso' }, { v: 'completada', l: 'Completadas' }
        ].map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f.v ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{tasks.filter(t => t.status === 'pendiente').length}</p>
          <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Pendientes</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-sky-600">{tasks.filter(t => t.status === 'en_proceso').length}</p>
          <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">En proceso</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{tasks.filter(t => t.status === 'completada').length}</p>
          <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Completadas</p>
        </div>
      </div>

      {/* Tasks List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <ListTodo className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No hay tareas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <div key={t.id} className={`bg-white border rounded-lg overflow-hidden ${t.priority === 'alta' ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => toggleTask(t.id)}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-8 rounded-full shrink-0 ${t.priority === 'alta' ? 'bg-red-500' : t.priority === 'media' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${t.status === 'completada' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-500"><User className="w-3 h-3 inline mr-1" />{t.assigned_to_name}</span>
                      <Badge className={`text-[10px] ${priorityColor(t.priority)}`}>{t.priority}</Badge>
                      <Badge className={`text-[10px] ${statusObj(t.status).color}`}>{statusObj(t.status).label}</Badge>
                      {t.comments_count > 0 && <span className="text-xs text-slate-400"><MessageSquare className="w-3 h-3 inline mr-0.5" />{t.comments_count}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Select value={t.status} onValueChange={v => handleStatusChange(t.id, v)}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                  {expandedTask === t.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {expandedTask === t.id && taskDetail && (
                <div className="border-t border-slate-200 p-4 bg-slate-50/50 space-y-4">
                  {taskDetail.description && <p className="text-sm text-slate-700">{taskDetail.description}</p>}
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>Creada por: <strong>{taskDetail.created_by_name}</strong></span>
                    <span>Asignada a: <strong>{taskDetail.assigned_to_name}</strong></span>
                    {taskDetail.due_date && <span>Vence: <strong>{taskDetail.due_date}</strong></span>}
                    <span>Creada: {formatDate(taskDetail.created_at)}</span>
                  </div>

                  {/* Comments */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Comentarios</p>
                    {taskDetail.comments?.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin comentarios</p>
                    ) : (
                      <div className="space-y-2 mb-3">
                        {taskDetail.comments.map(c => (
                          <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-700">{c.user_name}</span>
                              <span className="text-xs text-slate-400">{formatDate(c.created_at)}</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">{c.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Escribe un comentario..." className="flex-1 h-9 text-sm"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddComment(t.id); }}} data-testid="task-comment-input" />
                      <Button size="sm" className="h-9 bg-slate-900 hover:bg-slate-800" onClick={() => handleAddComment(t.id)} data-testid="task-comment-send">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Task Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Input placeholder="Titulo de la tarea *" value={form.title} onChange={e => setForm({...form, title: e.target.value})} data-testid="task-title-input" />
            <Textarea placeholder="Descripcion (opcional)" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
              <SelectTrigger><SelectValue placeholder="Prioridad" /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.assigned_to} onValueChange={v => setForm({...form, assigned_to: v})}>
              <SelectTrigger data-testid="task-assign-select"><SelectValue placeholder="Asignar a..." /></SelectTrigger>
              <SelectContent>
                {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.position || s.email})</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
            <Button onClick={handleCreate} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="submit-task-btn">
              Crear tarea
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
