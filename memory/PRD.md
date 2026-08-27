# Tramilex - PRD

## Stack: React + FastAPI + MongoDB + Emergent Object Storage + Groq (Chatbot) + Stripe (Payments)

## Funcionalidades Implementadas
- Auth JWT (clientes, admin, empresas CIF/NIF, staff)
- Dashboard Cliente con requisitos colapsables en movil
- Dashboard Admin completo
- Modulo Empresas (CRUD, trabajadores, documentos, tramites, credenciales, firma)
- Chatbot asistente con Groq (Llama 3.3 70B)
- **Staff/Equipo**: Admin crea usuarios del despacho con rol "staff"
- **Sistema de Tareas**: Crear/asignar tareas con prioridad (baja/media/alta), estados, comentarios
- **Notificaciones**: Campanita con contador, notificaciones al asignar tareas/comentarios
- Documentos firmados (flujo descargar-firmar-subir)
- Panel empresa (tramites, trabajadores, documentos, firma)
- **Inbox Outlook**: Lectura de correos via Microsoft Graph API (msal)
- **Contabilidad**: Modulo de facturacion y control de cobros/pagos
- **Sistema de Citas**: Reserva de consultas de 45 min con pago via Stripe
  - Pagina publica de reserva (/citas/reservar) - enlace compartible
  - Seleccion de ubicacion: Chile (Oficina Santiago) / Espana (Oficina Madrid)
  - Calendario con horarios disponibles (configurables por admin)
  - Formulario: nombres, apellidos, correo, telefono, pais origen/residencia, direccion, documento, terminos
  - Pago obligatorio via Stripe para confirmar cita
  - Email de confirmacion post-pago
  - Panel admin con estadisticas, filtros, configuracion de dias bloqueados
  - Badge rojo en menu "Citas" para nuevas citas confirmadas

## Colecciones MongoDB
users, documents, companies, company_workers, company_documents, company_tramites, company_emails, sign_requests, tasks, notifications, chat_messages, audit_logs, settings, tramite_overrides, custom_tramites, billing, appointments, appointment_settings, payment_transactions

## 3rd Party Integrations
- Emergent Object Storage (file uploads)
- Microsoft Graph API / msal (Outlook inbox)
- Groq API (Chatbot LLM)
- Stripe (Appointment payments - Sandbox Mode)
  - Sandbox ID: 2049dda9-4749-48c6-8e69-fa36a3aea7ee
  - Account: acct_1U94PdBIgGBPaKKO (ES)

## Backlog
- P1: Welcome Email con Mailgun (admin configura credenciales desde panel)
- P1: Generar Facturas PDF desde Contabilidad
- P2: Refactorizar server.py en modulos/routers (>3600 lineas)
- P2: Validacion email format con Pydantic EmailStr
- P3: Mejoras UI/UX adicionales
