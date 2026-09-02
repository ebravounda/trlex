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
VENV="$DEPLOY_DIR/backend/venv/bin"

echo "========================================="
echo "  TRAMILEX - Despliegue desde Github"
echo "========================================="

# 1. Backup .env
echo "[1/6] Respaldando .env..."
mkdir -p "$BACKUP_DIR"
\cp -f "$DEPLOY_DIR/backend/.env" "$BACKUP_DIR/backend.env.bak"
\cp -f "$DEPLOY_DIR/frontend/.env" "$BACKUP_DIR/frontend.env.bak" 2>/dev/null || true
echo "  -> Backup en $BACKUP_DIR"

# 2. Git pull
echo "[2/6] Descargando cambios de Github..."
cd "$DEPLOY_DIR"
git pull origin main

# 3. Restaurar .env
echo "[3/6] Restaurando .env de produccion..."
\cp -f "$BACKUP_DIR/backend.env.bak" "$DEPLOY_DIR/backend/.env"
\cp -f "$BACKUP_DIR/frontend.env.bak" "$DEPLOY_DIR/frontend/.env" 2>/dev/null || true

# 4. Instalar dependencias y compilar
echo "[4/6] Instalando dependencias..."
cd "$DEPLOY_DIR/backend"
if [ -f "$VENV/pip" ]; then
    $VENV/pip install -r requirements.txt --quiet 2>&1 | tail -3
else
    pip install -r requirements.txt --quiet 2>&1 | tail -3
fi

cd "$DEPLOY_DIR/frontend"
npm run build 2>&1 | tail -5

# Copiar build a raiz para Apache/Plesk
cp -r "$DEPLOY_DIR/frontend/build/"* "$DEPLOY_DIR/"

# 5. Permisos
echo "[5/6] Ajustando permisos..."
chown -R $PLESK_USER:$PLESK_GROUP "$DEPLOY_DIR/"
chmod -R 755 "$DEPLOY_DIR/"

# 6. Reiniciar backend (SEGURO)
echo "[6/6] Reiniciando backend..."
cd "$DEPLOY_DIR/backend"
rm -rf __pycache__

# Matar proceso viejo
kill $(pgrep -f "tramilex.goroky.es.*uvicorn") 2>/dev/null || true
sleep 3

# Iniciar nuevo proceso
nohup $VENV/uvicorn server:app --host 127.0.0.1 --port 8002 --workers 2 > /tmp/tramilex.log 2>&1 &
BACKEND_PID=$!

# Esperar a que arranque
echo "  Esperando backend (PID: $BACKEND_PID)..."
for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 2
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8002/api/health 2>/dev/null | grep -q "200\|404\|422"; then
        echo "  -> Backend activo!"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "  -> ADVERTENCIA: Backend no respondio en 20s. Revisa: tail -20 /tmp/tramilex.log"
    fi
done

echo ""
echo "========================================="
echo "  Despliegue completado!"
echo "  Backup en: $BACKUP_DIR"
echo "  Prueba: https://tramilex.goroky.es"
echo "========================================="
echo "  Recuerda: Ctrl+Shift+R en el navegador"
echo "========================================="
