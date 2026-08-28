import { useState, useRef } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FileDown, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function AdminCompresor() {
  const [file, setFile] = useState(null);
  const [targetMb, setTargetMb] = useState(2);
  const [compressing, setCompressing] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef();

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.toLowerCase().endsWith('.pdf')) {
        toast.error('Solo se aceptan archivos PDF');
        return;
      }
      setFile(f);
      setResult(null);
    }
  };

  const handleCompress = async () => {
    if (!file) { toast.error('Selecciona un PDF'); return; }
    setCompressing(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('target_mb', targetMb.toString());

      const res = await api.post('/compress-pdf', formData, {
        responseType: 'blob',
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      });

      const originalSize = parseInt(res.headers['x-original-size'] || '0');
      const compressedSize = parseInt(res.headers['x-compressed-size'] || '0');
      const alreadySmall = res.headers['x-already-small'] === 'true';
      const overTarget = res.headers['x-over-target'] === 'true';

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      setResult({ url, originalSize, compressedSize, alreadySmall, overTarget, filename: `comprimido_${file.name}` });

      if (alreadySmall) {
        toast.info('El archivo ya es menor al limite seleccionado');
      } else if (overTarget) {
        toast.warning('Se comprimio al maximo posible pero no alcanzo el objetivo');
      } else {
        toast.success('PDF comprimido exitosamente');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al comprimir';
      toast.error(typeof msg === 'string' ? msg : 'Error al comprimir el PDF');
    }
    setCompressing(false);
  };

  const handleDownload = () => {
    if (!result?.url) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.filename;
    a.click();
  };

  const reduction = result && result.originalSize > 0
    ? Math.round((1 - result.compressedSize / result.originalSize) * 100)
    : 0;

  return (
    <div className="max-w-2xl space-y-6" data-testid="admin-compresor-page">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Herramientas</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Compresor PDF</h1>
        <p className="text-sm text-slate-500 mt-1">Comprime documentos PDF para cumplir con los limites de las plataformas del gobierno</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {/* Upload area */}
        <div
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            file ? 'border-slate-300 bg-slate-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
          }`}
          data-testid="pdf-drop-zone"
        >
          <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" data-testid="pdf-file-input" />
          {file ? (
            <div className="space-y-1">
              <FileDown className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">{file.name}</p>
              <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
              <p className="text-xs text-slate-400 mt-2">Clic para cambiar archivo</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-600 font-medium">Selecciona un archivo PDF</p>
              <p className="text-xs text-slate-400">Haz clic aqui para subir</p>
            </div>
          )}
        </div>

        {/* Target size */}
        <div>
          <Label className="text-sm text-slate-700 font-medium mb-2 block">Tamano maximo</Label>
          <div className="flex gap-3">
            {[2, 4].map(mb => (
              <button
                key={mb}
                onClick={() => setTargetMb(mb)}
                className={`flex-1 h-11 rounded-lg border text-sm font-semibold transition-all ${
                  targetMb === mb
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
                data-testid={`target-${mb}mb-btn`}
              >
                {mb} MB
              </button>
            ))}
          </div>
        </div>

        {/* Compress button */}
        <Button
          onClick={handleCompress}
          disabled={!file || compressing}
          className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-lg font-medium gap-2"
          data-testid="compress-btn"
        >
          {compressing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          {compressing ? 'Comprimiendo...' : 'Comprimir PDF'}
        </Button>

        {/* Result */}
        {result && (
          <div className={`rounded-xl p-5 space-y-3 ${
            result.alreadySmall ? 'bg-blue-50 border border-blue-200' :
            result.overTarget ? 'bg-amber-50 border border-amber-200' :
            'bg-emerald-50 border border-emerald-200'
          }`} data-testid="compress-result">
            <div className="flex items-center gap-2">
              {result.overTarget ? (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              )}
              <p className="text-sm font-semibold text-slate-900">
                {result.alreadySmall ? 'Archivo ya cumple el limite' :
                 result.overTarget ? 'Compresion maxima alcanzada' :
                 'Compresion exitosa'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500">Original</p>
                <p className="text-sm font-bold text-slate-900">{formatSize(result.originalSize)}</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500">Comprimido</p>
                <p className="text-sm font-bold text-slate-900">{formatSize(result.compressedSize)}</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500">Reduccion</p>
                <p className="text-sm font-bold text-emerald-600">{reduction}%</p>
              </div>
            </div>

            <Button
              onClick={handleDownload}
              className="w-full h-10 bg-slate-900 hover:bg-slate-800 rounded-lg font-medium gap-2"
              data-testid="download-compressed-btn"
            >
              <FileDown className="w-4 h-4" /> Descargar PDF comprimido
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
