import { useState, useRef, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  FolderOpen, FolderPlus, Plus, Upload, Download, Trash2, ArrowLeft,
  FileText, Image as ImageIcon, Pencil, Check, X, Eye, RefreshCw
} from 'lucide-react';

const FOLDER_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#ef4444', '#06b6d4', '#f97316', '#6366f1', '#64748b'
];

function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return '-'; }
}

export default function DocumentFolders({ companyId, workerId = null }) {
  const [folders, setFolders] = useState([]);
  const [docs, setDocs] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [folderName, setFolderName] = useState('Nueva carpeta');
  const [folderColor, setFolderColor] = useState('#3b82f6');
  const [editingFolder, setEditingFolder] = useState(null);
  const [editName, setEditName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [editingDocName, setEditingDocName] = useState(null);
  const [docNewName, setDocNewName] = useState('');
  const replaceRef = useRef(null);
  const [replacingDocId, setReplacingDocId] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(false);
  const fileRef = useRef(null);

  const fetchFolders = async () => {
    try {
      const params = workerId ? `?worker_id=${workerId}` : '';
      const res = await api.get(`/companies/${companyId}/folders${params}`);
      setFolders(res.data);
    } catch {}
  };

  const fetchDocs = async (folderId = null) => {
    try {
      const folderParam = folderId ? `folder_id=${folderId}` : '';
      let url;
      if (workerId) {
        url = `/companies/${companyId}/workers/${workerId}/documents${folderParam ? '?' + folderParam : ''}`;
      } else {
        url = `/companies/${companyId}/documents${folderParam ? '?' + folderParam : ''}`;
      }
      const res = await api.get(url);
      setDocs(res.data);
    } catch {}
  };

  useEffect(() => {
    fetchFolders();
    fetchDocs();
  }, [companyId, workerId]);

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    try {
      await api.post(`/companies/${companyId}/folders`, { name: folderName, color: folderColor, worker_id: workerId });
      setShowCreateFolder(false);
      setFolderName('Nueva carpeta');
      fetchFolders();
      toast.success('Carpeta creada');
    } catch { toast.error('Error'); }
  };

  const handleRenameFolder = async (folderId) => {
    if (!editName.trim()) return;
    try {
      await api.put(`/companies/${companyId}/folders/${folderId}`, { name: editName });
      setEditingFolder(null);
      fetchFolders();
    } catch { toast.error('Error'); }
  };

  const handleColorChange = async (folderId, color) => {
    try {
      await api.put(`/companies/${companyId}/folders/${folderId}`, { color });
      fetchFolders();
    } catch {}
  };

  const handleDeleteFolder = async (folderId) => {
    if (!window.confirm('Eliminar carpeta? Los documentos se moveran a la raiz.')) return;
    try {
      await api.delete(`/companies/${companyId}/folders/${folderId}`);
      fetchFolders();
      fetchDocs(currentFolder);
      toast.success('Carpeta eliminada');
    } catch { toast.error('Error'); }
  };

  const openFolder = (folder) => {
    setCurrentFolder(folder.id);
    fetchDocs(folder.id);
  };

  const goBack = () => {
    setCurrentFolder(null);
    fetchDocs(null);
  };

  const [draggingDoc, setDraggingDoc] = useState(null);
  const [dragOverFolder, setDragOverFolder] = useState(null);

  const handleMoveDocToFolder = async (docId, folderId) => {
    try {
      await api.put(`/companies/${companyId}/documents/${docId}/move`, { folder_id: folderId });
      fetchDocs(currentFolder);
      fetchFolders();
      toast.success('Documento movido');
    } catch { toast.error('Error moviendo'); }
  };

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    let count = 0;
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) { toast.error(`${file.name} supera 50MB`); continue; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'otros');
      if (currentFolder) fd.append('folder_id', currentFolder);
      const uploadUrl = workerId
        ? `/companies/${companyId}/workers/${workerId}/documents/upload`
        : `/companies/${companyId}/documents/upload`;
      try { await api.post(uploadUrl, fd); count++; } catch { toast.error(`Error: ${file.name}`); }
    }
    if (count > 0) { toast.success(`${count} doc(s) subido(s)`); fetchDocs(currentFolder); }
    setUploading(false);
  };

  const handleDownload = async (doc) => {
    try {
      const res = await api.get(`/company-documents/${doc.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = doc.original_filename; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Error'); }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Eliminar documento?')) return;
    try {
      await api.delete(`/companies/${companyId}/documents/${docId}`);
      fetchDocs(currentFolder);
      toast.success('Eliminado');
    } catch { toast.error('Error'); }
  };

  const handlePreview = async (doc) => {
    setPreviewDoc(doc);
    try {
      const res = await api.get(`/company-documents/${doc.id}/preview`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      setPreviewUrl(url);
    } catch {
      toast.error('Error cargando preview');
      setPreviewDoc(null);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  const isPreviewable = (ct) => {
    return ct?.startsWith('image/') || ct === 'application/pdf';
  };

  const handleRenameDoc = async (docId) => {
    if (!docNewName.trim()) return;
    try {
      await api.put(`/company-documents/${docId}/rename`, { name: docNewName.trim() });
      setEditingDocName(null);
      fetchDocs(currentFolder);
      toast.success('Nombre actualizado');
    } catch { toast.error('Error'); }
  };

  const handleReplaceDoc = async (docId, file) => {
    if (!file) return;
    setReplacingDocId(docId);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.put(`/company-documents/${docId}/replace`, fd);
      fetchDocs(currentFolder);
      toast.success('Documento reemplazado');
    } catch { toast.error('Error reemplazando'); }
    setReplacingDocId(null);
  };

  const currentFolderData = folders.find(f => f.id === currentFolder);

  return (
    <div data-testid="document-folders">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {currentFolder ? (
            <>
              <button onClick={goBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" data-testid="folder-back-btn">
                <ArrowLeft className="w-4 h-4" /> Carpetas
              </button>
              <span className="text-slate-300">/</span>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded" style={{ backgroundColor: currentFolderData?.color || '#64748b' }} />
                <span className="text-sm font-semibold text-slate-900">{currentFolderData?.name || 'Carpeta'}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Carpetas y documentos</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!currentFolder && (
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowCreateFolder(true)} data-testid="create-folder-btn">
              <FolderPlus className="w-3.5 h-3.5" /> Carpeta
            </Button>
          )}
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/*" className="hidden"
            onChange={e => { handleUpload(Array.from(e.target.files)); e.target.value = ''; }} />
          <Button size="sm" className="gap-1.5 h-8 text-xs bg-slate-900 hover:bg-slate-800" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="w-3.5 h-3.5" /> {uploading ? 'Subiendo...' : 'Subir'}
          </Button>
        </div>
      </div>

      {/* Folders Grid */}
      {!currentFolder && folders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-5">
          {folders.map(f => (
            <div key={f.id} className={`group relative bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${
              dragOverFolder === f.id ? 'border-sky-400 bg-sky-50 shadow-md ring-2 ring-sky-200' : 'border-slate-200 hover:border-slate-300'
            }`}
              onClick={() => openFolder(f)}
              onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) { /* file from explorer to folder */ } setDragOverFolder(f.id); }}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOverFolder(null); setDragOverZone(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                  // Files dropped from explorer onto folder - upload directly into it
                  const prev = currentFolder;
                  const uploadToFolder = async () => {
                    setUploading(true);
                    let count = 0;
                    for (const file of files) {
                      if (file.size > 50 * 1024 * 1024) { toast.error(`${file.name} supera 50MB`); continue; }
                      const fd = new FormData();
                      fd.append('file', file);
                      fd.append('category', 'otros');
                      fd.append('folder_id', f.id);
                      const uploadUrl = workerId
                        ? `/companies/${companyId}/workers/${workerId}/documents/upload`
                        : `/companies/${companyId}/documents/upload`;
                      try { await api.post(uploadUrl, fd); count++; } catch { toast.error(`Error: ${file.name}`); }
                    }
                    if (count > 0) { toast.success(`${count} doc(s) subido(s) a ${f.name}`); fetchFolders(); fetchDocs(prev); }
                    setUploading(false);
                  };
                  uploadToFolder();
                } else if (draggingDoc) {
                  handleMoveDocToFolder(draggingDoc, f.id); setDraggingDoc(null);
                }
              }}
              data-testid={`folder-${f.id}`}>
              {/* Color bar */}
              <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl" style={{ backgroundColor: f.color || '#64748b' }} />

              {/* Edit/Delete buttons */}
              <div className="absolute top-3 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditingFolder(f.id); setEditName(f.name); }} className="p-1 rounded hover:bg-slate-100">
                  <Pencil className="w-3 h-3 text-slate-400" />
                </button>
                <button onClick={() => handleDeleteFolder(f.id)} className="p-1 rounded hover:bg-red-50">
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              </div>

              <div className="flex items-center gap-3 mt-1">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: (f.color || '#64748b') + '20' }}>
                  <FolderOpen className="w-5 h-5" style={{ color: f.color || '#64748b' }} />
                </div>
                <div className="min-w-0 flex-1">
                  {editingFolder === f.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-xs" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(f.id); if (e.key === 'Escape') setEditingFolder(null); }} />
                      <button onClick={() => handleRenameFolder(f.id)} className="p-1"><Check className="w-3.5 h-3.5 text-emerald-600" /></button>
                      <button onClick={() => setEditingFolder(null)} className="p-1"><X className="w-3.5 h-3.5 text-slate-400" /></button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-900 truncate">{f.name}</p>
                      <p className="text-[11px] text-slate-400">{f.doc_count || 0} archivo(s)</p>
                    </>
                  )}
                </div>
              </div>

              {/* Color picker on hover */}
              {editingFolder === f.id && (
                <div className="flex gap-1 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
                  {FOLDER_COLORS.map(c => (
                    <button key={c} onClick={() => handleColorChange(f.id, c)}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${f.color === c ? 'border-slate-900 scale-110' : 'border-transparent hover:scale-110'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Documents */}
      <div
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.types.includes('Files')) setDragOverZone(true); }}
        onDragLeave={e => { e.preventDefault(); setDragOverZone(false); }}
        onDrop={e => { e.preventDefault(); setDragOverZone(false); const files = Array.from(e.dataTransfer.files); if (files.length > 0) handleUpload(files); }}
        className={`rounded-xl transition-all ${dragOverZone ? 'ring-2 ring-sky-400 bg-sky-50/50' : ''}`}
      >
      {docs.length === 0 && folders.length === 0 ? (
        <div className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOverZone ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}
          onClick={() => fileRef.current?.click()}>
          <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">{dragOverZone ? 'Suelta los archivos aqui' : 'Arrastra archivos o haz clic para subir'}</p>
          <p className="text-xs text-slate-400 mt-1">PDF, imagenes, Word, Excel — max 50MB — multiples archivos</p>
        </div>
      ) : docs.length === 0 && currentFolder ? (
        <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOverZone ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}
          onClick={() => fileRef.current?.click()}>
          <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">{dragOverZone ? 'Suelta los archivos aqui' : 'Carpeta vacia — arrastra archivos o haz clic'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm transition-shadow group cursor-grab active:cursor-grabbing"
              draggable
              onDragStart={() => setDraggingDoc(doc.id)}
              onDragEnd={() => { setDraggingDoc(null); setDragOverFolder(null); }}
              data-testid={`doc-${doc.id}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${doc.content_type?.startsWith('image/') ? 'bg-sky-50' : 'bg-red-50'}`}>
                {doc.content_type?.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-sky-500" /> : <FileText className="w-4 h-4 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                {editingDocName === doc.id ? (
                  <div className="flex items-center gap-1">
                    <Input value={docNewName} onChange={e => setDocNewName(e.target.value)} className="h-7 text-xs flex-1" autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleRenameDoc(doc.id); if (e.key === 'Escape') setEditingDocName(null); }} />
                    <button onClick={() => handleRenameDoc(doc.id)} className="p-0.5"><Check className="w-3.5 h-3.5 text-emerald-600" /></button>
                    <button onClick={() => setEditingDocName(null)} className="p-0.5"><X className="w-3.5 h-3.5 text-slate-400" /></button>
                  </div>
                ) : (
                  <p className={`text-sm font-medium text-slate-800 truncate ${isPreviewable(doc.content_type) ? 'cursor-pointer hover:text-sky-600' : ''}`}
                    onClick={() => isPreviewable(doc.content_type) && handlePreview(doc)}>
                    {doc.display_name || doc.original_filename}
                  </p>
                )}
                <span className="text-[11px] text-slate-400">{formatDate(doc.uploaded_at)}</span>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {isPreviewable(doc.content_type) && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handlePreview(doc)} title="Ver"><Eye className="w-3.5 h-3.5 text-sky-500" /></Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingDocName(doc.id); setDocNewName(doc.display_name || doc.original_filename); }} title="Renombrar"><Pencil className="w-3.5 h-3.5 text-slate-400" /></Button>
                <input type="file" className="hidden" ref={el => { if (replacingDocId === doc.id) replaceRef.current = el; }}
                  onChange={e => { handleReplaceDoc(doc.id, e.target.files?.[0]); e.target.value = ''; }} />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setReplacingDocId(doc.id); setTimeout(() => { const input = document.createElement('input'); input.type = 'file'; input.onchange = (e) => handleReplaceDoc(doc.id, e.target.files?.[0]); input.click(); }, 0); }} title="Reemplazar">
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${replacingDocId === doc.id ? 'animate-spin' : ''}`} />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(doc)} title="Descargar"><Download className="w-3.5 h-3.5 text-slate-500" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteDoc(doc.id)} title="Eliminar"><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={closePreview}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-3 min-w-0">
              {previewDoc?.content_type?.startsWith('image/') 
                ? <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />
                : <FileText className="w-4 h-4 text-red-500 shrink-0" />}
              <p className="text-sm font-medium text-slate-900 truncate">{previewDoc?.display_name || previewDoc?.original_filename}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1 text-xs h-8" onClick={() => { if (previewDoc) handleDownload(previewDoc); }}>
                <Download className="w-3 h-3" /> Descargar
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center" style={{ height: 'calc(85vh - 56px)' }}>
            {!previewUrl ? (
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
            ) : previewDoc?.content_type?.startsWith('image/') ? (
              <img src={previewUrl} alt={previewDoc?.original_filename} className="max-w-full max-h-full object-contain" />
            ) : previewDoc?.content_type === 'application/pdf' ? (
              <iframe src={previewUrl} className="w-full h-full" title="Preview PDF" />
            ) : (
              <p className="text-sm text-slate-500">Preview no disponible</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader><DialogTitle className="text-lg">Nueva carpeta</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Nombre</label>
              <Input value={folderName} onChange={e => setFolderName(e.target.value)} className="h-10" autoFocus data-testid="folder-name-input"
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-2 block">Color</label>
              <div className="flex gap-2 flex-wrap">
                {FOLDER_COLORS.map(c => (
                  <button key={c} onClick={() => setFolderColor(c)}
                    className={`w-8 h-8 rounded-lg border-2 transition-all ${folderColor === c ? 'border-slate-900 scale-110 shadow-sm' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: folderColor + '20' }}>
                <FolderOpen className="w-5 h-5" style={{ color: folderColor }} />
              </div>
              <p className="text-sm font-medium text-slate-900">{folderName || 'Nueva carpeta'}</p>
            </div>
            <Button onClick={handleCreateFolder} className="w-full h-10 bg-slate-900 hover:bg-slate-800 rounded-lg" data-testid="submit-folder-btn">
              Crear carpeta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
