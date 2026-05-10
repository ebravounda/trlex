# Tramilex - PRD

## Problema Original
Sistema de gestion documental para abogado de inmigracion. Clientes y empresas suben documentos, el admin gestiona todo.

## Stack: React + FastAPI + MongoDB + Emergent Object Storage

## Funcionalidades Implementadas
- Auth JWT (clientes, admin, empresas con CIF/NIF)
- Dashboard Cliente con requisitos colapsables en movil
- Dashboard Admin completo (clientes, documentos, ficha PDF, audit, SMTP, tramites)
- Modulo Empresas: admin crea empresas, empresa crea trabajadores con datos extendidos (NIE, DNI, Pasaporte, RUT, nombres, apellidos, telefono, direccion, pais origen/residencia, padre, madre, hijos)
- Documentos firmados: boton "Subir documento firmado" (categoria firmado), admin ve todos los docs firmados
- Descarga masiva ZIP por trabajador
- Envio de credenciales por email con historial
- Tramites por empresa con estados (pendiente, en proceso, completado, rechazado)
- Panel empresa: ver tramites, trabajadores, subir docs, ver estado revision
- Landing page con video

## Colecciones MongoDB
users, documents, companies, company_workers, company_documents, company_tramites, company_emails, audit_logs, settings, tramite_overrides, custom_tramites

## Backlog
- Refactorizar server.py en modulos
