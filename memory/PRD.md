# Tramilex - Sistema de Gestion Documental para Inmigracin

## Problema Original
Sistema para un abogado de inmigracion donde los clientes puedan registrarse con pasaporte/NIE, subir documentos (PDF/imagenes), y el abogado pueda gestionar todo desde un panel admin.

## Stack Tecnico
- Frontend: React + Tailwind CSS + Shadcn UI
- Backend: FastAPI + Motor (async MongoDB)
- DB: MongoDB
- Storage: Emergent Object Storage
- PDF: fpdf2

## Funcionalidades Implementadas

### Autenticacion
- JWT con bcrypt
- Registro extendido (datos personales, familia, empresa)
- Impersonacion de clientes por admin
- Doble cuenta admin (malcafuz@tramilex.es, soporte@goroky.com)

### Dashboard Cliente
- Subida de documentos (PDF, imagenes incl. HEIC, max 5MB)
- Categorias de documentos
- Vista de estado de documentos
- Requisitos del tramite seleccionado (colapsable en movil, completo en desktop)

### Dashboard Admin
- Lista de clientes con busqueda/filtros
- Detalle de cliente con documentos
- Preview/descarga/renombrar/eliminar documentos
- Generacion de Ficha PDF (fpdf2)
- Envio de emails via SMTP configurable
- Logs de auditoria
- Gestion de tramites (sistema + personalizados)

### Landing Page
- Diseno corporativo con video informativo
- Botones "Ingresar" y "Comenzar tramite"

### Tramites
- Tramites estaticos por pais (Chile/Espana) via tramites_data.py
- Tramites personalizados por admin
- Edicion de requisitos por tramite

## Arquitectura
```
/app/backend/server.py      - API monolitica (~1367 lineas)
/app/backend/tramites_data.py - Datos estaticos de tramites
/app/frontend/src/pages/     - Paginas React
/app/frontend/src/context/   - AuthContext
```

## Tareas Completadas (Abril 2026)
- [x] MVP completo (auth, dashboards, documentos)
- [x] Landing page con video
- [x] Tramites por pais (Chile/Espana)
- [x] Datos empresa/familia en registro
- [x] Ficha PDF
- [x] Impersonacion admin
- [x] SMTP configurable
- [x] Requisitos mobile-friendly (boton colapsable)
- [x] Bug fix: login no cargaba country/tramite_type del usuario

## Backlog
- [ ] Refactorizar server.py en modulos (routes, models, utils) - Opcional
- [ ] Mejoras adicionales segun solicitud del usuario

## Despliegue
Usuario despliega en servidor Plesk propio (tramilex.goroky.es) via GitHub + SSH.
Ver /app/DEPLOY_GUIDE.md para instrucciones detalladas.
