# Tramilex - PRD

## Stack: React + FastAPI + MongoDB + Emergent Object Storage + Groq (Chatbot)

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

## Colecciones MongoDB
users, documents, companies, company_workers, company_documents, company_tramites, company_emails, sign_requests, tasks, notifications, chat_messages, audit_logs, settings, tramite_overrides, custom_tramites

## Backlog
- Empresas ven requisitos del tramite asignado para subir docs
- Integrar lectura de correos IMAP para notificaciones
- Refactorizar server.py en modulos
