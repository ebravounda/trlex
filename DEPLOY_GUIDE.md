# Despliegue Tramilex en tramilex.goroky.es (Plesk)
# Solo afecta al subdominio - no toca otras cuentas

## Ya tienes: MongoDB, Python, Node.js, subdominio con SSL

---

## PASO 1: Subir el codigo al servidor

Conecta por SSH y ejecuta:

```bash
# Crear carpeta del proyecto DENTRO del subdominio
cd /var/www/vhosts/goroky.es/tramilex.goroky.es
mkdir -p app/backend app/frontend
```

### Opcion A: Subir con SFTP (FileZilla, WinSCP, etc.)
Conecta al servidor y sube:
- Carpeta `backend/` completa → `/var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend/`
- Carpeta `frontend/` completa → `/var/www/vhosts/goroky.es/tramilex.goroky.es/app/frontend/`

### Opcion B: Subir con SCP desde terminal
```bash
scp -r backend/ root@TU_SERVIDOR:/var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend/
scp -r frontend/ root@TU_SERVIDOR:/var/www/vhosts/goroky.es/tramilex.goroky.es/app/frontend/
```

---

## PASO 2: Configurar el Backend

```bash
# Entrar al servidor por SSH
ssh root@TU_SERVIDOR

# Ir a la carpeta del backend
cd /var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend

# Crear entorno virtual (aislado, no afecta nada mas)
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install --upgrade pip
pip install -r requirements.txt
```

### Crear .env de produccion
```bash
cat > /var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend/.env << 'EOF'
MONGO_URL="mongodb://localhost:27017"
DB_NAME="tramilex_prod"
CORS_ORIGINS="https://tramilex.goroky.es"
JWT_SECRET="CAMBIA_ESTO_POR_TU_CLAVE"
ADMIN_EMAIL="malcsfuz@tramilex.es"
ADMIN_PASSWORD="Admin123!"
SUPPORT_EMAIL="soporte@goroky.com"
SUPPORT_PASSWORD="Ed$2526759"
EMERGENT_LLM_KEY="sk-emergent-8D26a14423aF8B2046"
EOF
```

**Genera tu JWT_SECRET unico** (copia el resultado y pegalo en el .env):
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Verificar que arranca
```bash
source venv/bin/activate
cd /var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend
uvicorn server:app --host 127.0.0.1 --port 8001
# Debe mostrar: "Application startup complete"
# Ctrl+C para detener
```

---

## PASO 3: Crear servicio del backend (solo para este subdominio)

```bash
cat > /etc/systemd/system/tramilex-backend.service << 'EOF'
[Unit]
Description=Tramilex Backend API
After=network.target mongod.service

[Service]
Type=simple
WorkingDirectory=/var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend
ExecStart=/var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5
Environment=PATH=/var/www/vhosts/goroky.es/tramilex.goroky.es/app/backend/venv/bin:/usr/bin

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tramilex-backend
systemctl start tramilex-backend
systemctl status tramilex-backend
```

> El backend escucha SOLO en 127.0.0.1:8001 (no accesible desde fuera, solo Nginx lo conecta)

---

## PASO 4: Compilar el Frontend

```bash
cd /var/www/vhosts/goroky.es/tramilex.goroky.es/app/frontend

# Crear .env de produccion
cat > .env << 'EOF'
REACT_APP_BACKEND_URL=https://tramilex.goroky.es
EOF

# Instalar dependencias y compilar
yarn install
yarn build

# Copiar el build al document root del subdominio
cp -r build/* /var/www/vhosts/goroky.es/tramilex.goroky.es/
```

---

## PASO 5: Configurar Nginx en Plesk (SOLO este subdominio)

En Plesk:
1. Ve a **Websites & Domains**
2. Click en **tramilex.goroky.es**
3. Click en **Apache & Nginx Settings**
4. Busca la seccion **Additional Nginx directives**
5. Pega EXACTAMENTE esto:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    client_max_body_size 15M;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

6. Click **OK** / **Apply**

> Esto SOLO afecta a tramilex.goroky.es. Ningun otro dominio o subdominio se ve afectado.

---

## PASO 6: Verificar

### Desde tu terminal:
```bash
# Verificar API
curl -X POST https://tramilex.goroky.es/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"malcsfuz@tramilex.es","password":"Admin123!"}'

# Debe devolver JSON con token
```

### Desde el navegador:
1. Abre https://tramilex.goroky.es/login
2. Login con: malcsfuz@tramilex.es / Admin123!
3. Debe entrar al panel de admin

---

## Comandos utiles (mantenimiento)

```bash
# Ver estado del backend
systemctl status tramilex-backend

# Reiniciar backend (despues de cambios en .env o codigo)
systemctl restart tramilex-backend

# Ver logs del backend en tiempo real
journalctl -u tramilex-backend -f

# Ver ultimos 50 logs
journalctl -u tramilex-backend -n 50

# Recompilar frontend (despues de cambios en codigo)
cd /var/www/vhosts/goroky.es/tramilex.goroky.es/app/frontend
yarn build
cp -r build/* /var/www/vhosts/goroky.es/tramilex.goroky.es/

# Backup de la base de datos
mongodump --db tramilex_prod --out /root/backups/$(date +%Y%m%d)
```

---

## Que se instala y donde (nada toca otros sitios)

| Que | Donde | Afecta otros sitios? |
|-----|-------|---------------------|
| Codigo backend | /var/www/.../tramilex.goroky.es/app/backend/ | NO |
| Python venv | /var/www/.../tramilex.goroky.es/app/backend/venv/ | NO |
| Codigo frontend | /var/www/.../tramilex.goroky.es/app/frontend/ | NO |
| Build compilado | /var/www/.../tramilex.goroky.es/ (document root) | NO |
| Servicio systemd | /etc/systemd/system/tramilex-backend.service | NO (servicio independiente) |
| Base de datos | MongoDB: base "tramilex_prod" | NO (base separada) |
| Nginx config | Solo en directivas adicionales de tramilex.goroky.es | NO |
