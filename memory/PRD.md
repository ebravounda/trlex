# Tramilex - Sistema de Gestion Documental para Inmigracion

## Problema Original
Sistema para un abogado de inmigracion donde los clientes puedan registrarse con pasaporte/NIE, subir documentos (PDF/imagenes), y el abogado pueda gestionar todo desde un panel admin. Modulo de empresas para gestion de trabajadores y tramites corporativos.

## Stack Tecnico
- Frontend: React + Tailwind CSS + Shadcn UI
- Backend: FastAPI + Motor (async MongoDB)
- DB: MongoDB
- Storage: Emergent Object Storage
- PDF: fpdf2

## Funcionalidades Implementadas

### Autenticacion
- JWT con bcrypt (clientes, admin, empresas)
- Registro extendido (datos personales, familia, empresa)
- Impersonacion de clientes por admin
- Login de empresas con CIF/NIF + contrasena autogenerada
- Doble cuenta admin

### Dashboard Cliente
- Subida de documentos (PDF, imagenes incl. HEIC, max 5MB)
- Categorias de documentos
- Vista de estado de documentos
- Requisitos del tramite (colapsable en movil, completo en desktop)

### Dashboard Admin
- Lista de clientes con busqueda/filtros
- Detalle de cliente con documentos
- Preview/descarga/renombrar/eliminar documentos
- Generacion de Ficha PDF
- Envio de emails via SMTP configurable
- Logs de auditoria
- Gestion de tramites (sistema + personalizados)

### Modulo de Empresas (NUEVO)
- Admin crea empresas con CIF/NIF, contrasena autogenerada
- Admin agrega/elimina trabajadores por empresa
- Admin asigna tramites a empresas (historial con estados)
- Subida de documentos por trabajador (admin y empresa)
- Descarga masiva de documentos por trabajador (ZIP)
- Revision de documentos (marcar revisado/pendiente)
- Envio de credenciales por email (registro o personalizado)
- Historial de correos enviados con reenvio
- Panel de empresa (CompanyDashboard) para que la empresa vea sus trabajadores, suba documentos y vea estado

### Landing Page
- Diseno corporativo con video informativo

### Tramites
- Tramites estaticos por pais (Chile/Espana)
- Tramites personalizados por admin
- Edicion de requisitos

## Arquitectura
```
/app/backend/server.py          - API principal (~2000+ lineas)
/app/backend/tramites_data.py   - Datos estaticos de tramites
/app/frontend/src/pages/
  ├── LandingPage.js
  ├── AuthPage.js               - Login (persona/empresa) + registro
  ├── ClientDashboard.js        - Panel cliente
  ├── CompanyDashboard.js       - Panel empresa (NUEVO)
  ├── AdminClients.js           - Lista clientes
  ├── AdminClientDetail.js      - Detalle cliente
  ├── AdminEmpresas.js          - Lista empresas (NUEVO)
  ├── AdminEmpresaDetail.js     - Detalle empresa (NUEVO)
  ├── AdminSettings.js
  ├── AdminAudit.js
  ├── AdminTramites.js
  └── AdminEmail.js
```

## Colecciones MongoDB
- `users` - Clientes y admins
- `documents` - Documentos de clientes
- `companies` - Empresas (NUEVO)
- `company_workers` - Trabajadores por empresa (NUEVO)
- `company_documents` - Documentos por trabajador (NUEVO)
- `company_tramites` - Tramites asignados a empresas (NUEVO)
- `company_emails` - Historial de correos enviados (NUEVO)
- `audit_logs` - Logs de auditoria
- `settings` - Configuracion SMTP
- `tramite_overrides` - Personalizaciones de tramites
- `custom_tramites` - Tramites personalizados

## Backlog
- [ ] Refactorizar server.py en modulos (routes, models, utils) - Opcional
- [ ] Mejoras adicionales segun solicitud del usuario

## Despliegue
Usuario despliega en servidor Plesk propio (tramilex.goroky.es).
Ruta: /var/www/vhosts/goroky.com/tramilex.goroky.es/
Ver /app/DEPLOY_GUIDE.md
