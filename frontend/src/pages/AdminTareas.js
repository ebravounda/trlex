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
import {
  Plus, ListTodo, MessageSquare, Trash2, User, Send, CalendarDays,
  CircleDot, CheckCircle2, Timer, Search, LayoutGrid, List, Clock
} from 'lucide-react';

const PRIORITIES = [
  { value: 'baja', label: 'Baja', color: 'text-slate-500', bg: 'bg-slate-100', dot: 'bg-slate-400' },
  { value: 'media', label: 'Media', color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  { value: 'alta', label: 'Alta', color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' },
];

const COLUMNS = [
  { key: 'pendiente', label: 'Pendientes', icon: CircleDot, accent: 'amber', dot: 'bg-amber-500', headerBg: 'bg-amber-50', headerBorder: 'border-amber-200', headerText: 'text-amber-800' },
  { key: 'en_proceso', label: 'En proceso', icon: Timer, accent: 'blue', dot: 'bg-blue-500', headerBg: 'bg-blue-50', headerBorder: 'border-blue-200', headerText: 'text-blue-800' },
  { key: 'completada', label: 'Completadas', icon: CheckCircle2, accent: 'emerald', dot: 'bg-emerald-500', headerBg: 'bg-emerald-50', headerBorder: 'border-emerald-200', headerText: 'text-emerald-800' },
];

const STATUSES = [
  { value: 'pendiente', label: 'Pendiente', dot: 'bg-amber-500', icon: CircleDot },
  { value: 'en_proceso', label: 'En proceso', dot: 'bg-blue-500', icon: Timer },
  { value: 'completada', label: 'Completada', dot: 'bg-emerald-500', icon: CheckCircle2 },
];

function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return '-'; }
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso);
  if (diff < 60000) return 'Ahora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['bg-violet-600', 'bg-sky-600', 'bg-rose-600', 'bg-teal-600', 'bg-orange-600', 'bg-indigo-600', 'bg-pink-600', 'bg-cyan-600'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function TaskCard({ task, onStatusChange, onDelete, onExpand, isExpanded, taskDetail, newComment, setNewComment, onAddComment, user }) {
  const pri = PRIORITIES.find(x => x.value === task.priority) || PRIORITIES[1];
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completada';

  return (
    <div className={`bg-white rounded-xl border transition-all duration-200 hover:shadow-md ${isExpanded ? 'border-slate-300 shadow-md' : 'border-slate-200 shadow-sm'}`}
      data-testid={`task-card-${task.id}`}>
      <div className="p-4 cursor-pointer" onClick={() => onExpand(task.id)}>
        {/* Priority + Due */}
        <div className="flex items-center justify-between mb-2.5">
          <Badge className={`text-[10px] font-bold uppercase tracking-wider ${pri.bg} ${pri.color} border-0 px-2 py-0.5`}>
            {pri.label}
          </Badge>
          <div className="flex items-center gap-2">
            {task.comments_count > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                <MessageSquare className="w-3 h-3" /> {task.comments_count}
              </span>
            )}
            <span className="text-[11px] text-slate-400">{timeAgo(task.created_at)}</span>
          </div>
        </div>

        {/* Title */}
        <p className={`text-sm font-semibold leading-snug mb-3 ${task.status === 'completada' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
          {task.title}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full ${avatarColor(task.assigned_to_name)} flex items-center justify-center`}>
              <span className="text-[9px] font-bold text-white">{getInitials(task.assigned_to_name)}</span>
            </div>
            <span className="text-xs text-slate-500 truncate max-w-[120px]">{task.assigned_to_name}</span>
          </div>
          {task.due_date && (
            <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${
              isOverdue ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'
            }`}>
              <CalendarDays className="w-3 h-3" /> {task.due_date}
            </span>
          )}
        </div>
      </div>

      {/* Expanded */}
      {isExpanded && taskDetail && (
        <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50 rounded-b-xl">
          {taskDetail.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{taskDetail.description}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>Creada por <strong>{taskDetail.created_by_name}</strong></span>
            <span>{formatDate(taskDetail.created_at)}</span>
          </div>

          {/* Status change */}
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <Select value={task.status} onValueChange={v => onStatusChange(task.id, v)}>
              <SelectTrigger className="h-8 text-xs rounded-lg flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map(st => (
                  <SelectItem key={st.value} value={st.value}>
                    <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${st.dot}`} /> {st.label}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-500" onClick={e => { e.stopPropagation(); onDelete(task.id); }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Comments */}
          {taskDetail.comments?.length > 0 && (
            <div className="space-y-2 pt-1">
              {taskDetail.comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <div className={`w-6 h-6 rounded-full ${avatarColor(c.user_name)} flex items-center justify-center shrink-0 mt-0.5`}>
                    <span className="text-[8px] font-bold text-white">{getInitials(c.user_name)}</span>
                  </div>
                  <div className="flex-1 bg-white rounded-lg border border-slate-200 p-2.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] font-semibold text-slate-700">{c.user_name}</span>
                      <span className="text-[10px] text-slate-400">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-xs text-slate-600">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          <div className="flex items-center gap-2 pt-1">
            <div className={`w-6 h-6 rounded-full ${avatarColor(user?.name)} flex items-center justify-center shrink-0`}>
              <span className="text-[8px] font-bold text-white">{getInitials(user?.name)}</span>
            </div>
            <Input value={newComment} onChange={e => setNewComment(e.target.value)}
              placeholder="Comentar..." className="flex-1 h-8 text-xs bg-white rounded-lg"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddComment(task.id); } }}
              data-testid="task-comment-input" />
            <Button size="sm" className="h-8 w-8 p-0 bg-slate-900 hover:bg-slate-800 rounded-lg" onClick={() => onAddComment(task.id)}>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminTareas() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedTask, setExpandedTask] = useState(null);
  const [taskDetail, setTaskDetail] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('kanban');
  const [form, setForm] = useState({ title: '', description: '', priority: 'media', assigned_to: '', due_date: '' });

  const fetchTasks = useCallback(async () => {
    try { const res = await api.get('/tasks'); setTasks(res.data); } catch { toast.error('Error cargando tareas'); }
  }, []);
  const fetchStaff = useCallback(async () => {
    try { const res = await api.get('/staff'); setStaff(res.data); } catch {}
  }, []);
  useEffect(() => { fetchTasks(); fetchStaff(); }, [fetchTasks, fetchStaff]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.assigned_to) { toast.error('Titulo y asignado son obligatorios'); return; }
    try {
      await api.post('/tasks', form);
      setForm({ title: '', description: '', priority: 'media', assigned_to: '', due_date: '' });
      setShowCreate(false);
      fetchTasks();
      toast.success('Tarea creada');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try { await api.put(`/tasks/${taskId}`, { status: newStatus }); fetchTasks(); } catch { toast.error('Error'); }
  };

  const toggleTask = async (taskId) => {
    if (expandedTask === taskId) { setExpandedTask(null); setTaskDetail(null); return; }
    setExpandedTask(taskId);
    try { const res = await api.get(`/tasks/${taskId}`); setTaskDetail(res.data); } catch {}
  };

  const handleAddComment = async (taskId) => {
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${taskId}/comments`, { text: newComment });
      setNewComment('');
      const res = await api.get(`/tasks/${taskId}`);
      setTaskDetail(res.data);
      fetchTasks();
    } catch { toast.error('Error'); }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Eliminar esta tarea?')) return;
    try { await api.delete(`/tasks/${taskId}`); fetchTasks(); setExpandedTask(null); toast.success('Eliminada'); } catch { toast.error('Error'); }
  };

  const filtered = tasks.filter(t =>
    !search.trim() || t.title.toLowerCase().includes(search.toLowerCase()) || t.assigned_to_name.toLowerCase().includes(search.toLowerCase())
  );

  const total = tasks.length;
  const doneCount = tasks.filter(t => t.status === 'completada').length;
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="space-y-6" data-testid="admin-tareas">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Gestion</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Tareas</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('kanban')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`} data-testid="view-kanban-btn">
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`} data-testid="view-list-btn">
              <List className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800 gap-2 h-10 px-5 rounded-lg text-sm" data-testid="create-task-btn">
            <Plus className="w-4 h-4" /> Nueva tarea
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{total}</p>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Total</p>
            </div>
            {COLUMNS.map(col => {
              const count = tasks.filter(t => t.status === col.key).length;
              return (
                <div key={col.key} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                  <div>
                    <p className="text-lg font-bold text-slate-900">{count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">{col.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-emerald-600">{progress}%</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Progreso</p>
          </div>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-1">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <Input placeholder="Buscar tarea o persona..." value={search} onChange={e => setSearch(e.target.value)}
          className="border-0 focus-visible:ring-0 p-0 h-10 text-sm" data-testid="task-search" />
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {COLUMNS.map(col => {
            const colTasks = filtered.filter(t => t.status === col.key);
            const ColIcon = col.icon;
            return (
              <div key={col.key} className="space-y-3" data-testid={`column-${col.key}`}>
                {/* Column header */}
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${col.headerBg} ${col.headerBorder}`}>
                  <div className="flex items-center gap-2">
                    <ColIcon className={`w-4 h-4 ${col.headerText}`} strokeWidth={2} />
                    <span className={`text-sm font-semibold ${col.headerText}`}>{col.label}</span>
                  </div>
                  <span className={`text-xs font-bold ${col.headerText} bg-white/60 px-2 py-0.5 rounded-md`}>{colTasks.length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-3 min-h-[100px]">
                  {colTasks.length === 0 && (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                      <p className="text-xs text-slate-400">Sin tareas</p>
                    </div>
                  )}
                  {colTasks.map(task => (
                    <TaskCard key={task.id} task={task}
                      onStatusChange={handleStatusChange} onDelete={handleDelete}
                      onExpand={toggleTask} isExpanded={expandedTask === task.id}
                      taskDetail={expandedTask === task.id ? taskDetail : null}
                      newComment={newComment} setNewComment={setNewComment}
                      onAddComment={handleAddComment} user={user} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
              <ListTodo className="w-12 h-12 text-slate-200 mx-auto mb-4" strokeWidth={1} />
              <p className="text-sm text-slate-500">No hay tareas</p>
            </div>
          ) : filtered.map(task => (
            <TaskCard key={task.id} task={task}
              onStatusChange={handleStatusChange} onDelete={handleDelete}
              onExpand={toggleTask} isExpanded={expandedTask === task.id}
              taskDetail={expandedTask === task.id ? taskDetail : null}
              newComment={newComment} setNewComment={setNewComment}
              onAddComment={handleAddComment} user={user} />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Nueva tarea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Titulo *</label>
              <Input placeholder="Que se necesita hacer?" value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                className="h-10 bg-white" data-testid="task-title-input" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Descripcion</label>
              <Textarea placeholder="Detalles adicionales..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="bg-white" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">Prioridad</label>
                <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(pr => (
                      <SelectItem key={pr.value} value={pr.value}>
                        <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${pr.dot}`} /> {pr.label}</div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">Fecha limite</label>
                <Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="h-10" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Asignar a *</label>
              <Select value={form.assigned_to} onValueChange={v => setForm({...form, assigned_to: v})}>
                <SelectTrigger className="h-10" data-testid="task-assign-select"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {staff.map(st => (
                    <SelectItem key={st.id} value={st.id}>
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full ${avatarColor(st.name)} flex items-center justify-center`}>
                          <span className="text-[8px] font-bold text-white">{getInitials(st.name)}</span>
                        </div>
                        {st.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-xl font-medium" data-testid="submit-task-btn">
              Crear tarea
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
