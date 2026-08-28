#!/bin/bash
# =============================================================
# TRAMILEX - Script de Despliegue Seguro
# Fecha: Agosto 2026
# Cambios: Login por PIN 6 digitos + Mantener sesion abierta
# =============================================================

set -e

DEPLOY_DIR="/var/www/vhosts/goroky.com/tramilex.goroky.es"
BACKUP_DIR="/tmp/tramilex_backup_$(date +%Y%m%d_%H%M%S)"
ARCHIVE="tramilex_deploy.tar.gz"

echo "========================================="
echo "  TRAMILEX - Despliegue Seguro"
echo "========================================="

# 1. Verificar que el archivo existe
if [ ! -f "$ARCHIVE" ]; then
    echo "ERROR: No se encontro $ARCHIVE en el directorio actual"
    echo "Sube el archivo primero con: scp tramilex_deploy.tar.gz usuario@servidor:~/"
    exit 1
fi

# 2. Crear backup del .env de produccion
echo "[1/6] Respaldando .env de produccion..."
mkdir -p "$BACKUP_DIR"
if [ -f "$DEPLOY_DIR/backend/.env" ]; then
    \cp -f "$DEPLOY_DIR/backend/.env" "$BACKUP_DIR/backend.env.bak"
    echo "  -> Backup: $BACKUP_DIR/backend.env.bak"
else
    echo "  -> ADVERTENCIA: No se encontro .env en backend"
fi

# 3. Backup de archivos actuales
echo "[2/6] Respaldando archivos actuales..."
if [ -d "$DEPLOY_DIR/backend" ]; then
    \cp -f "$DEPLOY_DIR/backend/server.py" "$BACKUP_DIR/server.py.bak" 2>/dev/null || true
    \cp -f "$DEPLOY_DIR/backend/tramites_data.py" "$BACKUP_DIR/tramites_data.py.bak" 2>/dev/null || true
fi

# 4. Extraer archivos nuevos
echo "[3/6] Extrayendo archivos nuevos..."
cd /tmp
tar xzf ~/$ARCHIVE 2>/dev/null || tar xzf ./$ARCHIVE 2>/dev/null || tar xzf "$OLDPWD/$ARCHIVE"

# 5. Copiar archivos al servidor (SIN tocar .env)
echo "[4/6] Copiando archivos..."

# Backend - solo server.py, tramites_data.py y requirements.txt
\cp -f /tmp/backend/server.py "$DEPLOY_DIR/backend/server.py"
\cp -f /tmp/backend/tramites_data.py "$DEPLOY_DIR/backend/tramites_data.py"
\cp -f /tmp/backend/requirements.txt "$DEPLOY_DIR/backend/requirements.txt"
echo "  -> Backend actualizado"

# Frontend - reemplazar build completo
rm -rf "$DEPLOY_DIR/frontend/build"
\cp -rf /tmp/frontend/build "$DEPLOY_DIR/frontend/build"
echo "  -> Frontend build actualizado"

# 6. RESTAURAR .env de produccion (por seguridad extra)
echo "[5/6] Verificando .env de produccion..."
if [ -f "$BACKUP_DIR/backend.env.bak" ]; then
    \cp -f "$BACKUP_DIR/backend.env.bak" "$DEPLOY_DIR/backend/.env"
    echo "  -> .env restaurado correctamente"
fi

# 7. Instalar dependencias Python si hay nuevas
echo "[6/6] Instalando dependencias Python..."
cd "$DEPLOY_DIR/backend"
pip install -r requirements.txt --quiet 2>&1 | tail -5

# 8. Reiniciar servicio
echo ""
echo "========================================="
echo "  Despliegue completado!"
echo "========================================="
echo ""
echo "IMPORTANTE: Reinicia el servicio backend manualmente:"
echo "  sudo systemctl restart tramilex-backend"
echo "  (o el comando que uses en tu Plesk)"
echo ""
echo "Backup guardado en: $BACKUP_DIR"
echo "Si algo falla, restaura con:"
echo "  \\cp -f $BACKUP_DIR/server.py.bak $DEPLOY_DIR/backend/server.py"
echo "  \\cp -f $BACKUP_DIR/backend.env.bak $DEPLOY_DIR/backend/.env"

# Limpiar temporales
rm -rf /tmp/backend /tmp/frontend
echo ""
echo "Listo! Prueba en: https://tramilex.goroky.es"
