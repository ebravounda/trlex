# Despliegue Tramilex en tramilex.goroky.es (Plesk)
# Todo dentro de /var/www/vhosts/goroky.com/tramilex.goroky.es/

---

## PASO 1: Subir el codigo

Conecta por SSH:

```bash
cd /var/www/vhosts/goroky.com/tramilex.goroky.es
mkdir -p backend frontend
```

Sube por SFTP o SCP:
- Contenido de `backend/` → `/var/www/vhosts/goroky.com/tramilex.goroky.es/backend/`
- Contenido de `frontend/` → `/var/www/vhosts/goroky.com/tramilex.goroky.es/frontend/`

Estructura final:
```
/var/www/vhosts/goroky.com/tramilex.goroky.es/
├── backend/
│   ├── server.py
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   ├── package.json
│   └── .env
```

---

## PASO 2: Configurar el Backend

```bash
cd /var/www/vhosts/goroky.com/tramilex.goroky.es/backend

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Crear .env
```bash
cat > /var/www/vhosts/goroky.com/tramilex.goroky.es/backend/.env << 'EOF'
MONGO_URL="mongodb://localhost:27017"
DB_NAME="tramilex_prod"
CORS_ORIGINS="https://tramilex.goroky.es"
JWT_SECRET="CAMBIA_ESTO"
ADMIN_EMAIL="malcsfuz@tramilex.es"
ADMIN_PASSWORD="Admin123!"
SUPPORT_EMAIL="soporte@goroky.com"
SUPPORT_PASSWORD="Ed$2526759"
EMERGENT_LLM_KEY="sk-emergent-8D26a14423aF8B2046"
EOF
```

Genera tu JWT_SECRET y reemplazalo:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Verificar que arranca:
```bash
source venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 8001
# Debe mostrar "Application startup complete" → Ctrl+C
```

---

## PASO 3: Crear servicio systemd

```bash
cat > /etc/systemd/system/tramilex-backend.service << 'EOF'
[Unit]
Description=Tramilex Backend
After=network.target mongod.service

[Service]
Type=simple
WorkingDirectory=/var/www/vhosts/goroky.com/tramilex.goroky.es/backend
ExecStart=/var/www/vhosts/goroky.com/tramilex.goroky.es/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tramilex-backend
systemctl start tramilex-backend
systemctl status tramilex-backend
```

---

## PASO 4: Compilar el Frontend

```bash
cd /var/www/vhosts/goroky.com/tramilex.goroky.es/frontend

cat > .env << 'EOF'
REACT_APP_BACKEND_URL=https://tramilex.goroky.es
EOF

yarn install
yarn build

# Copiar build al document root (la raiz del subdominio)
cp -r build/* /var/www/vhosts/goroky.com/tramilex.goroky.es/
```

---

## PASO 5: Nginx en Plesk

Plesk → Websites & Domains → **tramilex.goroky.es** → **Apache & Nginx Settings**

En **Additional Nginx directives** pegar:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    client_max_body_size 15M;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

Click **OK**.

---

## PASO 6: Verificar

```bash
curl -X POST https://tramilex.goroky.es/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"malcsfuz@tramilex.es","password":"Admin123!"}'
```

Navegador: https://tramilex.goroky.es/login

---

## Mantenimiento

```bash
# Reiniciar backend
systemctl restart tramilex-backend

# Ver logs
journalctl -u tramilex-backend -f

# Actualizar frontend
cd /var/www/vhosts/goroky.com/tramilex.goroky.es/frontend
yarn build
cp -r build/* /var/www/vhosts/goroky.com/tramilex.goroky.es/

# Backup DB
mongodump --db tramilex_prod --out /root/backups/$(date +%Y%m%d)
```
