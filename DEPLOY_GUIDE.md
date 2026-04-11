# Guia de Despliegue - Tramilex en Plesk (tramilex.goroky.es)

## Arquitectura del Sistema
```
tramilex.goroky.es
├── Backend: FastAPI (Python 3.11+) → puerto 8001
├── Frontend: React (build estatico) → servido por Nginx
└── Base de datos: MongoDB
```

---

## PASO 1: Preparar el Servidor

### 1.1 Requisitos del servidor
- Ubuntu 20.04+ o Debian 11+
- Plesk Obsidian
- Python 3.11+
- Node.js 18+ y Yarn
- MongoDB 6+
- Acceso SSH root

### 1.2 Instalar MongoDB (si no esta instalado)
```bash
# Ubuntu/Debian
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

### 1.3 Instalar Python 3.11+ (si no esta)
```bash
sudo apt-get install -y python3.11 python3.11-venv python3-pip
```

### 1.4 Instalar Node.js y Yarn
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g yarn
```

---

## PASO 2: Crear el subdominio en Plesk

1. Entra en Plesk → **Websites & Domains**
2. Click en **Add Subdomain**
3. Nombre: `tramilex` (quedara `tramilex.goroky.es`)
4. Root del documento: `/var/www/vhosts/goroky.es/tramilex.goroky.es`
5. Activa **SSL/TLS** con Let's Encrypt

---

## PASO 3: Subir el codigo

### 3.1 Crear estructura de carpetas
```bash
# Conectar por SSH
ssh root@tu-servidor

# Crear directorios
mkdir -p /var/www/vhosts/goroky.es/tramilex.goroky.es/app
cd /var/www/vhosts/goroky.es/tramilex.goroky.es/app

# Crear subcarpetas
mkdir -p backend frontend
```

### 3.2 Subir archivos
Puedes usar SCP, SFTP (FileZilla) o git. Sube toda la carpeta `/app/backend/` y `/app/frontend/` al servidor.

```bash
# Opcion 1: SCP desde tu maquina local
scp -r /ruta/local/backend/ root@tu-servidor:/var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend/
scp -r /ruta/local/frontend/ root@tu-servidor:/var/www/vhosts/goroky.es/tramilex.goroky.es/app/frontend/
```

---

## PASO 4: Configurar el Backend

### 4.1 Crear entorno virtual e instalar dependencias
```bash
cd /var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend

python3.11 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
```

### 4.2 Crear archivo .env de produccion
```bash
cat > .env << 'EOF'
MONGO_URL="mongodb://localhost:27017"
DB_NAME="tramilex_prod"
CORS_ORIGINS="https://tramilex.goroky.es"
JWT_SECRET="GENERA_UNA_CLAVE_ALEATORIA_DE_64_CARACTERES"
ADMIN_EMAIL="malcsfuz@tramilex.es"
ADMIN_PASSWORD="Admin123!"
SUPPORT_EMAIL="soporte@goroky.com"
SUPPORT_PASSWORD="Ed$2526759"
EMERGENT_LLM_KEY="sk-emergent-8D26a14423aF8B2046"
EOF
```

> **IMPORTANTE**: Genera un JWT_SECRET unico:
> ```bash
> python3 -c "import secrets; print(secrets.token_hex(32))"
> ```

### 4.3 Probar que el backend arranca
```bash
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001
# Deberia mostrar: "Application startup complete"
# Ctrl+C para detener
```

### 4.4 Crear servicio systemd para el backend
```bash
sudo cat > /etc/systemd/system/tramilex-backend.service << 'EOF'
[Unit]
Description=Tramilex Backend API
After=network.target mongod.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend
Environment=PATH=/var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend/venv/bin
ExecStart=/var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tramilex-backend
sudo systemctl start tramilex-backend
sudo systemctl status tramilex-backend
```

---

## PASO 5: Compilar el Frontend

### 5.1 Configurar .env del frontend
```bash
cd /var/www/vhosts/goroky.es/tramilex.goroky.es/app/frontend

cat > .env << 'EOF'
REACT_APP_BACKEND_URL=https://tramilex.goroky.es
EOF
```

### 5.2 Instalar dependencias y compilar
```bash
yarn install
yarn build
```

Esto genera la carpeta `build/` con los archivos estaticos.

### 5.3 Copiar build al document root de Plesk
```bash
# Copiar el contenido del build al directorio web del subdominio
cp -r build/* /var/www/vhosts/goroky.es/tramilex.goroky.es/
```

---

## PASO 6: Configurar Nginx en Plesk

### 6.1 Configuracion de Nginx (Apache & Nginx Settings)

En Plesk, ve a: **tramilex.goroky.es → Apache & Nginx Settings**

En la seccion **Additional Nginx directives**, pega:

```nginx
# Proxy para el backend API
location /api/ {
    proxy_pass http://127.0.0.1:8001/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    client_max_body_size 15M;
}

# SPA: redirigir todas las rutas al index.html
location / {
    try_files $uri $uri/ /index.html;
}
```

### 6.2 Si usas Apache en lugar de Nginx

Crea un archivo `.htaccess` en el document root:
```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    
    # No reescribir archivos o directorios existentes
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    
    # Proxy para API
    RewriteRule ^api/(.*)$ http://127.0.0.1:8001/api/$1 [P,L]
    
    # SPA fallback
    RewriteRule ^ /index.html [L]
</IfModule>

# Para proxy inverso con Apache
<IfModule mod_proxy.c>
    ProxyPass /api/ http://127.0.0.1:8001/api/
    ProxyPassReverse /api/ http://127.0.0.1:8001/api/
</IfModule>
```

---

## PASO 7: Verificar el despliegue

### 7.1 Verificar el backend
```bash
curl https://tramilex.goroky.es/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"malcsfuz@tramilex.es","password":"Admin123!"}'
```
Debe devolver un JSON con token.

### 7.2 Verificar el frontend
Abre `https://tramilex.goroky.es/login` en el navegador. Debe mostrar la pagina de login de Tramilex.

### 7.3 Verificar login admin
Login con `malcsfuz@tramilex.es` / `Admin123!` → debe redirigir a `/admin/clients`

---

## PASO 8: Mantenimiento

### Reiniciar el backend
```bash
sudo systemctl restart tramilex-backend
```

### Ver logs del backend
```bash
sudo journalctl -u tramilex-backend -f
```

### Actualizar el codigo
```bash
# Backend
cd /var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart tramilex-backend

# Frontend
cd /var/www/vhosts/goroky.es/tramilex.goroky.es/app/frontend
yarn install
yarn build
cp -r build/* /var/www/vhosts/goroky.es/tramilex.goroky.es/
```

### Backup de MongoDB
```bash
mongodump --db tramilex_prod --out /backups/tramilex/$(date +%Y%m%d)
```

### Restaurar MongoDB
```bash
mongorestore --db tramilex_prod /backups/tramilex/20260211/tramilex_prod/
```

---

## Resumen de Puertos y URLs

| Componente | Puerto | URL |
|-----------|--------|-----|
| Frontend | 443 (HTTPS via Plesk) | https://tramilex.goroky.es |
| Backend API | 8001 (interno) | https://tramilex.goroky.es/api/ |
| MongoDB | 27017 (localhost) | mongodb://localhost:27017 |

## Credenciales

| Rol | Email | Password |
|-----|-------|----------|
| Admin principal | malcsfuz@tramilex.es | Admin123! |
| Soporte (oculto) | soporte@goroky.com | Ed$2526759 |

---

## Solucion de Problemas

### El frontend muestra pagina en blanco
- Verifica que los archivos de `build/` estan en el document root
- Verifica la directiva Nginx `try_files $uri $uri/ /index.html`

### Error 502 Bad Gateway en /api/
- El backend no esta corriendo: `sudo systemctl status tramilex-backend`
- Reiniciar: `sudo systemctl restart tramilex-backend`
- Ver logs: `sudo journalctl -u tramilex-backend -n 50`

### Error de CORS
- Verifica que CORS_ORIGINS en `.env` del backend tiene `https://tramilex.goroky.es`
- Reiniciar backend despues de cambiar .env

### MongoDB no conecta
- Verifica que MongoDB esta corriendo: `sudo systemctl status mongod`
- Verifica MONGO_URL en `.env` del backend

### Subida de archivos falla
- Verifica `client_max_body_size 15M;` en Nginx
- Verifica que EMERGENT_LLM_KEY esta en `.env` del backend
