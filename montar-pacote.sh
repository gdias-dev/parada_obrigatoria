#!/usr/bin/env bash
# Gera a pasta pronta para subir na KingHost (FTP ou Gerenciador de Arquivos).
# Uso: ./montar-pacote.sh   ->  cria pacote/ e parada-obrigatoria-deploy.zip
set -euo pipefail
cd "$(dirname "$0")"

echo "1/3 Gerando o front..."
(cd web && npm install --silent && npx vite build)

echo "2/3 Montando a pasta pacote/..."
rm -rf pacote parada-obrigatoria-deploy.zip
mkdir -p pacote
cp -r web/dist/. pacote/
mkdir -p pacote/api
cp -r api/index.php api/.htaccess api/config.example.php api/src api/routes pacote/api/
# config.php com senhas NÃO vai no pacote: é criado direto no servidor (só na 1ª vez)

echo "3/3 Compactando..."
(cd pacote && zip -qr ../parada-obrigatoria-deploy.zip . -x '.DS_Store')

echo "Pronto: pacote/ e parada-obrigatoria-deploy.zip"
