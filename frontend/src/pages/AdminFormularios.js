import { FileText, Download, ExternalLink } from 'lucide-react';

const FORMULARIOS = [
  { modelo: "EX00", desc: "Autorizacion de estancia de larga duracion", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex00-formulario-autorizacion-de-estancia-de-larga-duracion", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex00-formulario-autorizacion-de-estancia-de-larga-duracion-editable" },
  { modelo: "EX01", desc: "Residencia temporal no lucrativa", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex01-formulario-autorizacion-de-residencia-temporal-no-lucrativa-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex01-formulario-autorizacion-de-residencia-temporal-no-lucrativa-editable-1" },
  { modelo: "EX02", desc: "Residencia temporal por reagrupacion familiar", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex02.pdf", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex02-formulario-autorizacion-de-residencia-temporal-por-reagrupacion-familiar.pdf" },
  { modelo: "EX03", desc: "Residencia temporal y trabajo por cuenta ajena", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex03-formulario-autorizacion-de-residencia-temporal-y-trabajo-por-cuenta-ajena-o-autorizacion-de-trabajo-por-cuenta-ajena-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex03-formulario-autorizacion-de-residencia-temporal-y-trabajo-por-cuenta-ajena-o-autorizacion-de-trabajo-por-cuenta-ajena-editable-1" },
  { modelo: "EX04", desc: "Residencia para practicas", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex04-formulario-autorizacion-de-residencia-para-pacticas", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex04-formulario-autorizacion-de-residencia-para-pacticas-editable" },
  { modelo: "EX06", desc: "Residencia y trabajo para actividades de temporada", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex06-formulario-autorizacion-de-residencia-y-trabajo-para-actividades-temporada", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex06-formulario-autorizacion-de-residencia-y-trabajo-para-actividades-temporada-editable" },
  { modelo: "EX07", desc: "Residencia temporal y trabajo por cuenta propia", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex07-formulario-autorizacion-de-residencia-temporal-y-trabajo-por-cuenta-propia", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex07-formulario-autorizacion-de-residencia-temporal-y-trabajo-por-cuenta-propia-editable" },
  { modelo: "EX09", desc: "Residencia temporal con excepcion de autorizacion de trabajo", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex09-formulario-autorizacion-de-residencia-temporal-con-excepcion-de-la-autorizacion-de-trabajo", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex09-formulario-autorizacion-de-residencia-temporal-con-excepcion-de-la-autorizacion-de-trabajo-editable" },
  { modelo: "EX10", desc: "Residencia por circunstancias excepcionales", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex10-formulario-autorizacion-de-residencia-por-circunstancias-excepcionales-", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex10.pdf" },
  { modelo: "EX11", desc: "Residencia de larga duracion o larga duracion-UE", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex11-formulario-autorizacion-de-residencia-de-larga-duracion-o-de-larga-duracion-ue-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex11-formulario-autorizacion-de-residencia-de-larga-duracion-o-de-larga-duracion-ue-editable-1" },
  { modelo: "EX13", desc: "Autorizacion de regreso", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex13-formulario-autorizacion-de-regreso-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex13-formulario-autorizacion-de-regreso-editable-1" },
  { modelo: "EX15", desc: "NIE y certificados", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex15-formulario-solicitud-numero-de-identidad-de-extranjero-y-certificados", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex15-formulario-solicitud-numero-de-identidad-de-extranjero-y-certificados-editable" },
  { modelo: "EX16", desc: "Cedula de inscripcion o titulo de viaje", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex16-formulario-solicitud-cedula-de-inscripcion-o-titulo-de-viaje", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex16-formulario-solicitud-cedula-de-inscripcion-o-titulo-de-viaje-editable" },
  { modelo: "EX17", desc: "Tarjeta de Identidad de Extranjero (TIE)", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex17-formulario-solicitud-tarjeta-de-identidad-de-extranjero", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex17-formulario-solicitud-tarjeta-de-identidad-de-extranjero-editable" },
  { modelo: "EX18", desc: "Inscripcion RCE, residencia ciudadano UE", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex18-formulario-inscripcion-en-el-rce-residencia-ciudadano-de-la-ue-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex18-formulario-inscripcion-en-el-rce-residencia-ciudadano-de-la-ue-editable" },
  { modelo: "EX19", desc: "Tarjeta de residencia familiar ciudadano UE", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex19-formulario-tarjeta-de-residencia-de-familiar-de-ciudadano-de-la-ue", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex19-formulario-tarjeta-de-residencia-de-familiar-de-ciudadano-de-la-ue-editable" },
  { modelo: "EX20", desc: "Residencia Art. 50 TUE nacionales Reino Unido", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex20-formulario-residencia-articulo-50-tue-para-nacionales-del-reino-unido-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex20-formulario-residencia-articulo-50-tue-para-nacionales-del-reino-unido-editable" },
  { modelo: "EX21", desc: "Residencia Art. 50 TUE familiares nacionales Reino Unido", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex21-formulario-residencia-articulo-50-tue-para-3-s-paises-familiares-nacionales-reino-unido-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex21-formulario-residencia-articulo-50-tue-para-3-s-paises-familiares-nacionales-reino-unido-editable" },
  { modelo: "EX22", desc: "Permiso Art. 50 TUE trabajador fronterizo Reino Unido", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex22-formulario-permiso-articulo-50-tue-para-trabajador-fronterizo-del-reino-unido-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex22-formulario-permiso-articulo-50-tue-para-trabajador-fronterizo-del-reino-unido-editable" },
  { modelo: "EX23", desc: "Tarjeta Art. 18.4 Acuerdo de Retirada", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex23-formulario-solicitud-de-tarjeta-art-18-4-del-acuerdo-de-retirada-", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex23-formulario-solicitud-tarjeta-art-18-4-del-acuerdo-de-retirada-editable" },
  { modelo: "EX24", desc: "Residencia temporal familiares de espanoles", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex24-formulario-autorizacion-de-residencia-temporal-de-familiares-de-personas-con-nacionalidad-espanola-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex24-formulario-autorizacion-de-residencia-temporal-de-familiares-de-personas-con-nacionalidad-espanola-editable-1" },
  { modelo: "EX25", desc: "Residencia temporal y desplazamiento de menores extranjeros", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex25-formulario-autorizacion-de-residencia-temporal-y-desplazamiento-temporal-de-menores-extranjeros-", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex25.pdf" },
  { modelo: "EX26", desc: "Modificacion de autorizacion de residencia o estancia", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex26-formulario-de-solicitud-modificacion-de-autorizacion-de-residencia-o-estancia-1", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex26-formulario-de-solicitud-modificacion-de-autorizacion-de-residencia-o-estancia-editable-1" },
  { modelo: "EX28", desc: "Solicitud aplicacion DT 2a RD 1155-2024", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex28-formulario-solicitud-de-aplicacion-de-la-dt-2-rd-1155-2024", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex28-formulario-solicitud-de-aplicacion-de-la-dt-2-rd-1155-2024-editable" },
  { modelo: "EX29", desc: "Prorroga de estancia de corta duracion", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex29-formulario-solicitud-de-prorroga-de-estancia-de-corta-duracion", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex29-formulario-solicitud-de-prorroga-de-estancia-de-corta-duracion-editable" },
  { modelo: "EX31", desc: "Residencia excepcional por arraigo - Solicitantes PI (DA20a)", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex31-formulario-autorizacion-de-residencia-por-circunstancias-excepcionales-por-razon-de-arraigo.pdf", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex31-formulario-autorizacion-de-residencia-por-circunstancias-excepcionales-por-razon-de-arraigo-solicitantes-pi-da20-.pdf" },
  { modelo: "EX32", desc: "Residencia excepcional por arraigo extraordinario (DA21a)", pdf: "https://www.inclusion.gob.es/documents/d/migraciones/ex32-formulario-autorizacion-de-residencia-circunstancias-excepcionales-arraigo-extraordina-da21-", editable: "https://www.inclusion.gob.es/documents/d/migraciones/ex32-formulario-autorizacion-de-residencia-circunstancias-excepcionales-arraigo-extraordina-da21-editable" },
];

export default function AdminFormularios() {
  return (
    <div className="space-y-6" data-testid="admin-formularios-page">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Documentacion oficial</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Formularios</h1>
          <p className="text-sm text-slate-500 mt-1">Modelos oficiales del Ministerio de Migraciones de Espana</p>
        </div>
        <a href="https://www.inclusion.gob.es/web/migraciones/modelos-generales" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium shrink-0 mt-2">
          <ExternalLink className="w-3.5 h-3.5" /> Ver en inclusion.gob.es
        </a>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-5 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Modelo</p>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Descripcion</p>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 text-center">PDF</p>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Editable</p>
        </div>

        <div className="divide-y divide-slate-100">
          {FORMULARIOS.map((f, i) => (
            <div key={f.modelo + i} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-center px-5 py-3 hover:bg-slate-50 transition-colors" data-testid={`form-${f.modelo}`}>
              <span className="text-sm font-bold text-slate-900 font-mono w-12">{f.modelo}</span>
              <span className="text-sm text-slate-600">{f.desc}</span>
              <a href={f.pdf} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md transition-colors">
                <Download className="w-3 h-3" /> PDF
              </a>
              <a href={f.editable} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 px-2.5 py-1.5 rounded-md transition-colors">
                <FileText className="w-3 h-3" /> Editable
              </a>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">Fuente: Ministerio de Inclusion, Seguridad Social y Migraciones</p>
    </div>
  );
}
