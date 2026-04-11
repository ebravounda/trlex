from fpdf import FPDF
from datetime import datetime

class ManualPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(150, 150, 150)
        self.cell(0, 8, "Manual de Usuario - Tramilex", align="R", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Pagina {self.page_no()}/{{nb}} | Creado por GoRoky.com", align="C")

    def section_title(self, num, title):
        self.ln(6)
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(15, 23, 42)
        self.cell(0, 10, f"{num}. {title}", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(2, 132, 199)
        self.set_line_width(0.8)
        self.line(10, self.get_y(), 80, self.get_y())
        self.set_line_width(0.2)
        self.ln(6)

    def sub_title(self, title):
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(30, 41, 59)
        self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(51, 65, 85)
        self.set_x(10)
        self.multi_cell(0, 6, text)
        self.ln(2)

    def bullet(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(51, 65, 85)
        self.set_x(10)
        self.multi_cell(0, 6, "   - " + text)

    def bold_bullet(self, bold, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(51, 65, 85)
        self.set_x(10)
        self.multi_cell(0, 6, "   - " + bold + text)

    def table_row(self, col1, col2, header=False):
        self.set_font("Helvetica", "B" if header else "", 9)
        if header:
            self.set_fill_color(241, 245, 249)
            self.set_text_color(71, 85, 105)
        else:
            self.set_text_color(51, 65, 85)
        w1 = 55
        w2 = 130
        self.cell(w1, 7, col1, border=1, fill=header)
        self.set_font("Helvetica", "" if not header else "B", 9)
        self.cell(w2, 7, col2, border=1, new_x="LMARGIN", new_y="NEXT", fill=header)

    def label_text(self, label):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(30, 41, 59)
        self.cell(0, 7, label, new_x="LMARGIN", new_y="NEXT")

    def accent_label(self, label):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(2, 132, 199)
        self.cell(0, 7, label, new_x="LMARGIN", new_y="NEXT")


pdf = ManualPDF()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)

# === COVER PAGE ===
pdf.add_page()
pdf.ln(40)
pdf.set_font("Helvetica", "B", 32)
pdf.set_text_color(15, 23, 42)
pdf.cell(0, 15, "TRAMILEX", new_x="LMARGIN", new_y="NEXT", align="C")
pdf.set_font("Helvetica", "", 14)
pdf.set_text_color(71, 85, 105)
pdf.cell(0, 10, "Sistema de Gestion Documental", new_x="LMARGIN", new_y="NEXT", align="C")
pdf.cell(0, 8, "para Inmigracion", new_x="LMARGIN", new_y="NEXT", align="C")
pdf.ln(10)
pdf.set_draw_color(2, 132, 199)
pdf.set_line_width(1)
pdf.line(70, pdf.get_y(), 140, pdf.get_y())
pdf.set_line_width(0.2)
pdf.ln(15)
pdf.set_font("Helvetica", "B", 16)
pdf.set_text_color(15, 23, 42)
pdf.cell(0, 10, "Manual de Usuario", new_x="LMARGIN", new_y="NEXT", align="C")
pdf.ln(30)
pdf.set_font("Helvetica", "", 10)
pdf.set_text_color(120, 120, 120)
pdf.cell(0, 6, f"Version 1.0 - {datetime.now().strftime('%d/%m/%Y')}", new_x="LMARGIN", new_y="NEXT", align="C")
pdf.cell(0, 6, "Creado por GoRoky.com", new_x="LMARGIN", new_y="NEXT", align="C")

# === 1. ACCESO ===
pdf.add_page()
pdf.section_title("1", "ACCESO AL SISTEMA")

pdf.sub_title("1.1 Para Clientes")
pdf.body_text("Abrir https://tramilex.goroky.es/login")
pdf.bullet("Si ya tienes cuenta: introduce tu email y contrasena")
pdf.bullet("Si eres nuevo: pulsa Registrate")
pdf.ln(4)

pdf.sub_title("1.2 Para el Abogado (Administrador)")
pdf.body_text("Abrir https://tramilex.goroky.es/login con las credenciales de administrador. Seras redirigido al Panel de Administracion.")

# === 2. REGISTRO ===
pdf.section_title("2", "REGISTRO DE CLIENTES")
pdf.body_text("Al registrarse, el cliente debe completar los siguientes campos:")

pdf.sub_title("Datos obligatorios:")
pdf.bold_bullet("Nombre completo: ", "requerido")
pdf.bold_bullet("Email: ", "requerido")
pdf.bold_bullet("Contrasena: ", "minimo 6 caracteres")
pdf.ln(2)

pdf.sub_title("Datos opcionales:")
pdf.bold_bullet("NIE: ", "Numero de Identidad de Extranjero")
pdf.bold_bullet("Pasaporte: ", "numero de pasaporte")
pdf.bold_bullet("Telefono: ", "con prefijo internacional")
pdf.bold_bullet("Direccion: ", "direccion completa")
pdf.bold_bullet("Ciudad: ", "ciudad de residencia")
pdf.bold_bullet("Pais de origen: ", "seleccionar de lista")
pdf.bold_bullet("Pais de residencia: ", "seleccionar de lista")
pdf.ln(2)

pdf.sub_title("Datos familiares (opcionales):")
pdf.bold_bullet("Padre: ", "nombre completo del padre")
pdf.bold_bullet("Madre: ", "nombre completo de la madre")
pdf.bold_bullet("Hijos: ", "pulsar + Agregar hijo para anadir. Sin limite. Icono papelera para eliminar.")

# === 3. PORTAL CLIENTE ===
pdf.section_title("3", "PORTAL DEL CLIENTE")

pdf.sub_title("3.1 Subir documentos")
pdf.body_text("1. Seleccionar la categoria del documento antes de subir:")
pdf.bullet("Identificacion, Residencia, Trabajo, Contrato, Fiscal, Otros")
pdf.ln(1)
pdf.body_text("2. Subir archivo: arrastrar y soltar en la zona de carga, o hacer clic para seleccionar.")
pdf.body_text("3. Formatos permitidos: PDF, JPG, PNG, GIF, WEBP, HEIC")
pdf.body_text("4. Tamano maximo: 5 MB por archivo.")
pdf.body_text("Si el archivo pesa mas, el sistema muestra el peso exacto y un enlace a ilovepdf.com para comprimirlo.")
pdf.ln(2)

pdf.sub_title("3.2 Ver documentos")
pdf.body_text("La tabla muestra: nombre del archivo, categoria, quien lo subio (Yo o Abogado), fecha/hora, y estado (Pendiente de revision o Revisado).")
pdf.ln(2)

pdf.sub_title("3.3 Notificaciones por email")
pdf.body_text("El cliente recibe un email cuando:")
pdf.bullet("El abogado sube un documento a su perfil")
pdf.bullet("El abogado cambia el estado de un documento a Revisado")
pdf.ln(2)

pdf.sub_title("3.4 Cerrar sesion")
pdf.body_text("Pulsar el boton Salir en la esquina superior derecha.")

# === 4. PANEL ADMIN ===
pdf.add_page()
pdf.section_title("4", "PANEL DE ADMINISTRACION")
pdf.body_text("El panel tiene 3 secciones en el menu lateral: Clientes, Auditoria y Configuracion.")

pdf.sub_title("4.1 Lista de Clientes")
pdf.body_text("Muestra todos los clientes registrados con: nombre, NIE/pasaporte, email, pais de origen y numero de documentos.")
pdf.ln(1)
pdf.label_text("Filtros disponibles:")
pdf.bullet("Busqueda por nombre, NIE, pasaporte o email")
pdf.bullet("Filtro por pais de origen (desplegable)")
pdf.ln(1)
pdf.label_text("Acciones:")
pdf.bullet("Click en un cliente: abre su perfil detallado")
pdf.bullet("Icono papelera: elimina al cliente y todos sus documentos")
pdf.ln(4)

pdf.sub_title("4.2 Perfil del Cliente")
pdf.body_text("Muestra toda la informacion: datos personales, direccion, datos familiares (padre, madre, hijos).")
pdf.ln(1)
pdf.accent_label("Boton Descargar Ficha PDF:")
pdf.body_text("Genera un PDF titulado FICHA INTERNA TRAMILEX con todos los datos del cliente. Uso interno del despacho.")
pdf.ln(4)

pdf.sub_title("4.3 Gestion de Documentos")

pdf.label_text("Previsualizar:")
pdf.body_text("Icono de ojo para ver el documento sin descargarlo. PDFs en visor, imagenes en pantalla completa.")

pdf.label_text("Renombrar:")
pdf.body_text("Mouse sobre el nombre > icono lapiz > editar. Enter para guardar, Escape para cancelar. No cambia el archivo original.")

pdf.label_text("Cambiar estado:")
pdf.body_text("Click sobre el badge de estado para cambiar entre Pendiente y Revisado. Al marcar Revisado, el cliente recibe email.")

pdf.label_text("Eliminar documento:")
pdf.body_text("Icono tres puntos > Eliminar documento. El cliente podra volver a subir.")

pdf.label_text("Subir documento al cliente:")
pdf.body_text("Seleccionar categoria, pulsar Seleccionar archivos. Aparece con etiqueta Abogado. El cliente recibe email.")

pdf.label_text("Descarga masiva:")
pdf.body_text("Boton Descargar todos (ZIP) descarga todos los documentos organizados por categoria.")

# === 4.4 AUDITORIA ===
pdf.ln(2)
pdf.sub_title("4.4 Auditoria")
pdf.body_text("Registro completo de todas las acciones en el sistema:")
pdf.ln(1)

pdf.table_row("Accion", "Descripcion", header=True)
pdf.table_row("Documento subido", "Un cliente subio un documento")
pdf.table_row("Documento eliminado", "El admin elimino un documento")
pdf.table_row("Estado cambiado", "Se cambio el estado de un documento")
pdf.table_row("Doc renombrado", "Se cambio el nombre visible")
pdf.table_row("Admin subio doc", "El admin subio documento al cliente")
pdf.table_row("Cliente eliminado", "Se elimino un cliente y sus documentos")
pdf.table_row("SMTP actualizado", "Se actualizo la configuracion de email")
pdf.table_row("Descarga masiva", "Se descargaron todos los docs de un cliente")
pdf.table_row("Contrasena cambiada", "Se cambio la contrasena de acceso")
pdf.ln(2)
pdf.body_text("Se puede filtrar por tipo de accion y navegar con paginacion.")

# === 4.5 CONFIG ===
pdf.add_page()
pdf.sub_title("4.5 Configuracion SMTP")
pdf.body_text("Para que las notificaciones por email funcionen, configurar:")
pdf.ln(1)

pdf.table_row("Campo", "Descripcion", header=True)
pdf.table_row("Host SMTP", "Servidor de correo (ej: smtp.tudominio.com)")
pdf.table_row("Puerto", "Puerto del servidor (ej: 587)")
pdf.table_row("Usuario SMTP", "Email de autenticacion")
pdf.table_row("Contrasena SMTP", "Contrasena del email")
pdf.table_row("Email remitente", "Direccion que envia (quien envia)")
pdf.table_row("Email del abogado", "Donde llegan avisos (quien recibe)")
pdf.ln(2)
pdf.body_text("Sin configurar el SMTP no se enviaran notificaciones.")

pdf.ln(4)
pdf.sub_title("4.6 Cambiar contrasena")
pdf.body_text("En Configuracion: introducir contrasena actual, nueva contrasena (min. 6 caracteres), confirmar y pulsar Cambiar contrasena.")

# === 5. CATEGORIAS ===
pdf.section_title("5", "CATEGORIAS DE DOCUMENTOS")
pdf.ln(2)
pdf.table_row("Categoria", "Uso recomendado", header=True)
pdf.table_row("Identificacion", "DNI, pasaporte, NIE, fotos carnet")
pdf.table_row("Residencia", "Permisos de residencia, tarjetas")
pdf.table_row("Trabajo", "Contratos laborales, nominas, vida laboral")
pdf.table_row("Resolucion", "Resoluciones administrativas, sentencias")
pdf.table_row("Contrato", "Contratos de alquiler, compraventa")
pdf.table_row("Fiscal", "Declaraciones, certificados tributarios")
pdf.table_row("Otros", "Cualquier otro documento")

# === 6. LIMITES ===
pdf.section_title("6", "LIMITES Y RESTRICCIONES")
pdf.ln(2)
pdf.table_row("Concepto", "Limite", header=True)
pdf.table_row("Tamano maximo por archivo", "5 MB")
pdf.table_row("Formatos permitidos", "PDF, JPG, PNG, GIF, WEBP, HEIC")
pdf.table_row("Archivos por subida", "Sin limite")
pdf.table_row("Hijos en registro", "Sin limite")
pdf.ln(4)
pdf.body_text("Si un archivo supera los 5 MB, el sistema muestra el peso exacto y un enlace a ilovepdf.com para comprimirlo.")

# === 7. SOPORTE ===
pdf.section_title("7", "SOPORTE TECNICO")
pdf.body_text("Para soporte tecnico contactar: soporte@goroky.com")

pdf.ln(15)
pdf.set_draw_color(200, 200, 200)
pdf.line(10, pdf.get_y(), 200, pdf.get_y())
pdf.ln(5)
pdf.set_font("Helvetica", "I", 8)
pdf.set_text_color(150, 150, 150)
pdf.cell(0, 5, "Tramilex - Sistema de Gestion Documental de Inmigracion | Creado por GoRoky.com", align="C")

pdf.output("/app/Manual_Tramilex.pdf")
print("PDF generado correctamente")
