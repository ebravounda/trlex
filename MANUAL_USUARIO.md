# Manual de Usuario - Tramilex
## Sistema de Gestion Documental para Inmigracion

---

## 1. ACCESO AL SISTEMA

### 1.1 Para Clientes

1. Abre **https://tramilex.goroky.es/login**
2. Si ya tienes cuenta: introduce tu email y contrasena
3. Si eres nuevo: pulsa **"Registrate"**

### 1.2 Para el Abogado (Administrador)

1. Abre **https://tramilex.goroky.es/login**
2. Introduce las credenciales de administrador
3. Seras redirigido al **Panel de Administracion**

---

## 2. REGISTRO DE CLIENTES

Al registrarse, el cliente debe completar:

### Datos obligatorios:
- **Nombre completo** *
- **Email** *
- **Contrasena** * (minimo 6 caracteres)

### Datos opcionales:
- **NIE** (Numero de Identidad de Extranjero)
- **Pasaporte**
- **Telefono**
- **Direccion**
- **Ciudad**
- **Pais de origen** (seleccionar de la lista)
- **Pais de residencia** (seleccionar de la lista)

### Datos familiares (opcionales):
- **Nombre completo del padre**
- **Nombre completo de la madre**
- **Hijos**: Pulsar el boton **"+ Agregar hijo"** para anadir hijos. Se pueden agregar tantos como sea necesario. Para eliminar uno, pulsar el icono de papelera rojo.

---

## 3. PORTAL DEL CLIENTE

Despues de iniciar sesion, el cliente ve su panel personal.

### 3.1 Subir documentos

1. **Seleccionar categoria**: Antes de subir, elige la categoria del documento:
   - Identificacion
   - Residencia
   - Trabajo
   - Contrato
   - Fiscal
   - Otros

2. **Subir archivo**: Dos opciones:
   - **Arrastrar y soltar** el archivo en la zona de carga
   - **Hacer clic** en la zona para seleccionar archivo

3. **Formatos permitidos**: PDF, JPG, JPEG, PNG, GIF, WEBP, HEIC
4. **Tamano maximo**: 5 MB por archivo
   - Si el archivo pesa mas, aparecera un mensaje con el peso exacto y un enlace a **ilovepdf.com** para comprimir el PDF

5. Se pueden subir varios archivos a la vez

### 3.2 Ver documentos

La tabla de documentos muestra:
- **Archivo**: Nombre del documento
- **Categoria**: Tipo de documento
- **Subido por**: "Yo" (si lo subio el cliente) o "Abogado" (si lo subio el abogado)
- **Fecha**: Fecha y hora de carga
- **Estado**:
  - **Pendiente de revision**: El abogado aun no lo ha revisado
  - **Revisado**: El abogado ya lo reviso

### 3.3 Descargar documentos

Pulsar el icono de descarga junto a cada documento.

### 3.4 Notificaciones por email

El cliente recibe un email cuando:
- El abogado **sube un documento** a su perfil (resoluciones, etc.)
- El abogado **cambia el estado** de un documento a "Revisado"

### 3.5 Cerrar sesion

Pulsar el boton **"Salir"** en la esquina superior derecha.

---

## 4. PANEL DE ADMINISTRACION (ABOGADO)

El panel tiene 3 secciones en el menu lateral:
- **Clientes**: Gestion de clientes y documentos
- **Auditoria**: Registro de todas las acciones
- **Configuracion**: SMTP y cambio de contrasena

### 4.1 Lista de Clientes

Muestra todos los clientes registrados con:
- Nombre
- NIE / Pasaporte
- Email
- Pais de origen
- Numero de documentos

#### Filtros disponibles:
- **Busqueda**: Escribe para buscar por nombre, NIE, pasaporte o email
- **Pais de origen**: Filtra por pais usando el desplegable

#### Acciones:
- **Click en un cliente**: Abre su perfil detallado
- **Icono papelera**: Elimina al cliente y todos sus documentos (pide confirmacion)

### 4.2 Perfil del Cliente (Vista Detallada)

Muestra toda la informacion del cliente organizada en secciones:

#### Datos personales:
- Email, telefono, NIE, pasaporte, direccion, ciudad, pais de origen, pais de residencia

#### Datos familiares:
- Nombre del padre, nombre de la madre, nombres de los hijos

#### Boton "Descargar Ficha PDF":
- Genera un documento PDF titulado **"FICHA INTERNA TRAMILEX"** con todos los datos del cliente
- Incluye: datos personales, direccion, familia, fecha de registro
- El PDF es de uso interno del despacho

### 4.3 Gestion de Documentos del Cliente

#### Ver documentos:
La tabla muestra: archivo, categoria, quien lo subio, fecha, estado

#### Previsualizar:
- Pulsar el **icono de ojo** para ver el documento sin descargarlo
- Se abre un visor: PDFs en iframe, imagenes en pantalla completa
- Desde el visor se puede descargar directamente

#### Descargar:
- Pulsar el **icono de descarga** junto a cada documento

#### Renombrar:
- Pasar el mouse sobre el nombre del archivo → aparece un **icono de lapiz**
- Click para editar el nombre visible (no cambia el archivo original)
- **Enter** para guardar, **Escape** para cancelar
- El nuevo nombre se muestra tanto al abogado como al cliente

#### Cambiar estado:
- Click sobre el **badge de estado** (Pendiente / Revisado)
- Se abre un menu desplegable con las opciones:
  - **Pendiente de revision**
  - **Revisado**
- Al cambiar a "Revisado", el cliente recibe un email de notificacion

#### Eliminar documento:
- Pulsar el **icono de tres puntos** → "Eliminar documento"
- El documento se marca como eliminado (no se borra fisicamente)
- El cliente puede volver a subir el documento

#### Subir documento al cliente:
- En la seccion **"Subir documento al cliente"**:
  1. Seleccionar la **categoria** (Resolucion, Contrato, etc.)
  2. Pulsar **"Seleccionar archivos"**
  3. El documento aparecera con la etiqueta "Abogado" en la columna "Subido por"
  4. El cliente recibe un email notificandole del nuevo documento

#### Descarga masiva:
- Pulsar **"Descargar todos (ZIP)"** para descargar todos los documentos del cliente en un archivo ZIP
- Los archivos se organizan por categoria dentro del ZIP

### 4.4 Auditoria

Registro completo de todas las acciones realizadas en el sistema:

| Accion | Descripcion |
|--------|-------------|
| Documento subido | Un cliente subio un documento |
| Documento eliminado | El admin elimino un documento |
| Estado cambiado | Se cambio el estado de un documento |
| Doc renombrado | Se cambio el nombre visible de un documento |
| Admin subio documento | El admin subio un documento al perfil de un cliente |
| Cliente eliminado | Se elimino un cliente y sus documentos |
| SMTP actualizado | Se actualizo la configuracion de email |
| Descarga masiva | Se descargaron todos los docs de un cliente |
| Contrasena cambiada | Se cambio la contrasena de acceso |

#### Filtros:
- Filtrar por tipo de accion usando el desplegable
- Paginacion para navegar entre registros

### 4.5 Configuracion

#### Servidor SMTP (Notificaciones por email):

Para que las notificaciones funcionen, configurar:

| Campo | Descripcion | Ejemplo |
|-------|-------------|---------|
| Host SMTP | Servidor de correo saliente | smtp.tudominio.com |
| Puerto | Puerto del servidor | 587 |
| Usuario SMTP | Email de autenticacion | correo@tudominio.com |
| Contrasena SMTP | Contrasena del email | ******** |
| Email remitente (quien envia) | Direccion que aparece como remitente | notificaciones@tudominio.com |
| Email del abogado (quien recibe) | Donde llegan las notificaciones | malcafuz@tramilex.es |

**Importante**: Sin configurar el SMTP, no se enviaran notificaciones por email.

#### Cambiar contrasena:

1. Introducir la contrasena actual
2. Escribir la nueva contrasena (minimo 6 caracteres)
3. Confirmar la nueva contrasena
4. Pulsar **"Cambiar contrasena"**

---

## 5. CATEGORIAS DE DOCUMENTOS

| Categoria | Uso recomendado |
|-----------|----------------|
| Identificacion | DNI, pasaporte, NIE, fotos carnet |
| Residencia | Permisos de residencia, tarjetas, autorizaciones |
| Trabajo | Contratos laborales, nominas, vida laboral |
| Resolucion | Resoluciones administrativas, sentencias |
| Contrato | Contratos de alquiler, compraventa |
| Fiscal | Declaraciones, certificados tributarios |
| Otros | Cualquier otro documento |

---

## 6. LIMITES Y RESTRICCIONES

| Concepto | Limite |
|----------|--------|
| Tamano maximo por archivo | 5 MB |
| Formatos permitidos | PDF, JPG, PNG, GIF, WEBP, HEIC |
| Numero de archivos por subida | Sin limite |
| Numero de hijos en registro | Sin limite |

**Si un archivo supera los 5 MB**: El sistema mostrara el peso exacto del archivo y un enlace a https://www.ilovepdf.com/es/comprimir_pdf para comprimirlo.

---

## 7. PREGUNTAS FRECUENTES

**P: Un cliente olvido su contrasena, que hago?**
R: Actualmente no hay recuperacion de contrasena automatica. El administrador puede eliminar al cliente y pedirle que se registre de nuevo.

**P: Puedo eliminar un documento para que el cliente lo suba de nuevo?**
R: Si. En el perfil del cliente, pulsa los tres puntos junto al documento y selecciona "Eliminar documento". El cliente podra subir uno nuevo.

**P: Los emails llegan a spam?**
R: Depende de la configuracion SMTP. Para evitarlo, usa un email de un dominio con SPF, DKIM y DMARC configurados.

**P: Puedo cambiar el nombre de un archivo?**
R: Si. Pasa el mouse sobre el nombre del archivo y pulsa el icono de lapiz. El nombre visible cambiara pero el archivo original se mantiene.

**P: Puedo acceder desde el movil?**
R: Si. El sistema es responsive y funciona en moviles y tablets. Se pueden subir fotos directamente desde la camara.

---

## 8. SOPORTE TECNICO

Para soporte tecnico contactar: **soporte@goroky.com**

---

*Documento generado para Tramilex - Sistema de Gestion Documental de Inmigracion*
*Creado por GoRoky.com*
