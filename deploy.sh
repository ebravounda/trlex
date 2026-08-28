#!/bin/bash
# =============================================================
# TRAMILEX - Script de Despliegue Seguro desde Github
# Uso: ./deploy.sh (ejecutar en el servidor de produccion)
# =============================================================
set -e

DEPLOY_DIR="/var/www/vhosts/goroky.com/tramilex.goroky.es"
PLESK_USER="goro8m_kr30w0bmlb"
PLESK_GROUP="psaserv"
BACKUP_DIR="/tmp/tramilex_backup_$(date +%Y%m%d_%H%M%S)"

echo "========================================="
echo "  TRAMILEX - Despliegue desde Github"
echo "========================================="

# 1. Backup .env
echo "[1/5] Respaldando .env..."
mkdir -p "$BACKUP_DIR"
\cp -f "$DEPLOY_DIR/backend/.env" "$BACKUP_DIR/backend.env.bak"
\cp -f "$DEPLOY_DIR/frontend/.env" "$BACKUP_DIR/frontend.env.bak" 2>/dev/null || true
echo "  -> Backup en $BACKUP_DIR"

# 2. Git pull
echo "[2/5] Descargando cambios de Github..."
cd "$DEPLOY_DIR"
git pull origin main

# 3. Restaurar .env
echo "[3/5] Restaurando .env de produccion..."
\cp -f "$BACKUP_DIR/backend.env.bak" "$DEPLOY_DIR/backend/.env"
\cp -f "$BACKUP_DIR/frontend.env.bak" "$DEPLOY_DIR/frontend/.env" 2>/dev/null || true

# 4. Instalar dependencias y compilar
echo "[4/5] Instalando dependencias..."
cd "$DEPLOY_DIR/backend"
if [ -d "venv" ] && [ -f "venv/bin/pip" ]; then
    venv/bin/pip install -r requirements.txt --quiet 2>&1 | tail -3
else
    pip install -r requirements.txt --quiet 2>&1 | tail -3
fi

cd "$DEPLOY_DIR/frontend"
npm run build 2>&1 | tail -5

# Copiar build a raiz para Apache/Plesk
cp -r "$DEPLOY_DIR/frontend/build/"* "$DEPLOY_DIR/"

# 5. Permisos y reinicio
echo "[5/5] Ajustando permisos y reiniciando..."
chown -R $PLESK_USER:$PLESK_GROUP "$DEPLOY_DIR/"
chmod -R 755 "$DEPLOY_DIR/"

# Clear Python cache and restart backend
rm -rf "$DEPLOY_DIR/backend/__pycache__"
kill $(pgrep -f "tramilex.goroky.es.*uvicorn") 2>/dev/null || true
sleep 2
cd "$DEPLOY_DIR/backend"
if [ -f "venv/bin/uvicorn" ]; then
    nohup venv/bin/uvicorn server:app --host 127.0.0.1 --port 8002 --workers 2 > /dev/null 2>&1 &
else
    nohup uvicorn server:app --host 127.0.0.1 --port 8002 --workers 2 > /dev/null 2>&1 &
fi

echo ""
echo "========================================="
echo "  Despliegue completado!"
echo "  Backup en: $BACKUP_DIR"
echo "  Prueba: https://tramilex.goroky.es"
echo "========================================="
