#!/usr/bin/env bash
# Azure 部署（App Service Linux + PostgreSQL Flexible Server + Storage）
# 預設 --dry-run：只印出指令，不建立任何資源。確認後加 --apply 才會真的執行。
# 可重跑：每一步都先檢查資源是否存在。
#
# 用法：
#   export AZ_RG=cmuh-dt-rg AZ_LOCATION=japaneast AZ_APP=cmuh-dt-workshop \
#          AZ_PG_SERVER=cmuh-dt-pg AZ_PG_ADMIN=cmuhadmin AZ_PG_PASSWORD='...' \
#          AZ_STORAGE=cmuhdtstore SESSION_SECRET="$(openssl rand -hex 32)"
#   scripts/azure-deploy.sh            # dry-run
#   scripts/azure-deploy.sh --apply    # 真的執行
set -euo pipefail

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

RG="${AZ_RG:-cmuh-dt-rg}"
LOCATION="${AZ_LOCATION:-japaneast}"
PLAN="${AZ_PLAN:-${RG}-plan}"
SKU="${AZ_SKU:-B1}"
APP="${AZ_APP:?請設定 AZ_APP（全域唯一的 Web App 名稱）}"
PG_SERVER="${AZ_PG_SERVER:?請設定 AZ_PG_SERVER}"
PG_ADMIN="${AZ_PG_ADMIN:-cmuhadmin}"
PG_DB="${AZ_PG_DB:-cmuh_dt}"
STORAGE="${AZ_STORAGE:?請設定 AZ_STORAGE（3-24 小寫英數）}"
CONTAINER="${AZURE_STORAGE_CONTAINER:-resources}"
APP_ORIGIN="${APP_ORIGIN:-https://${APP}.azurewebsites.net}"
GAME_ORIGIN="${GAME_ORIGIN:-}"

run() {
  # 印出時遮蔽密碼與金鑰
  local shown="$*"
  for s in "${AZ_PG_PASSWORD:-}" "${SESSION_SECRET:-}" "${COURSE_PASSPHRASE:-}" "${SMTP_PASS:-}" "${STORAGE_CONN:-}"; do
    [[ -n "$s" ]] && shown="${shown//"$s"/***}"
  done
  echo "+ $shown"
  if [[ $APPLY == 1 ]]; then eval "$@"; fi
}
exists() { [[ $APPLY == 1 ]] && eval "$@" >/dev/null 2>&1; }

if [[ $APPLY == 1 ]]; then
  : "${AZ_PG_PASSWORD:?請設定 AZ_PG_PASSWORD}"
  : "${SESSION_SECRET:?請設定 SESSION_SECRET（openssl rand -hex 32）}"
  az account show >/dev/null || { echo "請先 az login"; exit 1; }
else
  echo "== DRY RUN：只列出指令，不會建立任何資源（加 --apply 執行）=="
fi

echo "== 1. Resource group =="
exists az group show -n "$RG" || run az group create -n "$RG" -l "$LOCATION"

echo "== 2. App Service Plan（Linux, $SKU, 單一 instance）=="
exists az appservice plan show -g "$RG" -n "$PLAN" || run az appservice plan create -g "$RG" -n "$PLAN" --is-linux --sku "$SKU" --number-of-workers 1

echo "== 3. Web App（Node 20 LTS）=="
exists az webapp show -g "$RG" -n "$APP" || run az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "'NODE:20-lts'"
run az webapp config set -g "$RG" -n "$APP" --web-sockets-enabled true --always-on true --startup-file "'npm start'" --min-tls-version 1.2 --ftps-state Disabled
run az webapp update -g "$RG" -n "$APP" --https-only true --client-affinity-enabled false

echo "== 4. PostgreSQL Flexible Server（16，SSL 強制）=="
exists az postgres flexible-server show -g "$RG" -n "$PG_SERVER" || run az postgres flexible-server create -g "$RG" -n "$PG_SERVER" -l "$LOCATION" \
  --version 16 --tier Burstable --sku-name Standard_B1ms --storage-size 32 \
  --admin-user "$PG_ADMIN" --admin-password "'${AZ_PG_PASSWORD:-<AZ_PG_PASSWORD>}'" --public-access None --yes
# 只開放 Azure 內部服務（0.0.0.0 規則＝Allow Azure services）；本機 seed 需要時再暫時加自己的 IP
run az postgres flexible-server firewall-rule create -g "$RG" -n "$PG_SERVER" --rule-name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
run az postgres flexible-server parameter set -g "$RG" -s "$PG_SERVER" --name require_secure_transport --value on
exists az postgres flexible-server db show -g "$RG" -s "$PG_SERVER" -d "$PG_DB" || run az postgres flexible-server db create -g "$RG" -s "$PG_SERVER" -d "$PG_DB"

echo "== 5. Storage Account + private container =="
exists az storage account show -g "$RG" -n "$STORAGE" || run az storage account create -g "$RG" -n "$STORAGE" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false --https-only true
if [[ $APPLY == 1 ]]; then
  STORAGE_CONN="$(az storage account show-connection-string -g "$RG" -n "$STORAGE" -o tsv)"
else
  STORAGE_CONN="<az storage account show-connection-string 的輸出>"
fi
run az storage container create --name "$CONTAINER" --public-access off --connection-string "'$STORAGE_CONN'"

echo "== 6. App Settings（值從環境變數讀取，不寫死在腳本）=="
DATABASE_URL="postgresql://${PG_ADMIN}:${AZ_PG_PASSWORD:-<AZ_PG_PASSWORD>}@${PG_SERVER}.postgres.database.azure.com:5432/${PG_DB}?sslmode=require"
run az webapp config appsettings set -g "$RG" -n "$APP" --settings \
  "'NODE_ENV=production'" "'WEBSITES_PORT=8080'" "'PORT=8080'" "'SCM_DO_BUILD_DURING_DEPLOYMENT=false'" \
  "'DATABASE_URL=$DATABASE_URL'" "'SESSION_SECRET=${SESSION_SECRET:-<SESSION_SECRET>}'" \
  "'AZURE_STORAGE_CONNECTION_STRING=$STORAGE_CONN'" "'AZURE_STORAGE_CONTAINER=$CONTAINER'" \
  "'APP_ORIGIN=$APP_ORIGIN'" "'GAME_ORIGIN=$GAME_ORIGIN'" \
  ${COURSE_PASSPHRASE:+"'COURSE_PASSPHRASE=$COURSE_PASSPHRASE'"} \
  ${SMTP_PASS:+"'SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}'" "'SMTP_PORT=${SMTP_PORT:-465}'" "'SMTP_USER=${SMTP_USER:-chiu@theoneai.com.tw}'" "'SMTP_PASS=$SMTP_PASS'" "'MAIL_FROM=${MAIL_FROM:-設計思考工作坊 <chiu@theoneai.com.tw>}'"}

echo "== 7.（選填）GAME_ORIGIN 第二個 hostname =="
if [[ -n "${AZ_GAME_HOSTNAME:-}" ]]; then
  echo "先在 DNS 設 CNAME ${AZ_GAME_HOSTNAME} → ${APP}.azurewebsites.net（並加 asuid TXT 驗證）"
  run az webapp config hostname add -g "$RG" --webapp-name "$APP" --hostname "$AZ_GAME_HOSTNAME"
  run az webapp config ssl create -g "$RG" -n "$APP" --hostname "$AZ_GAME_HOSTNAME"
  echo "再把 GAME_ORIGIN 設為 https://${AZ_GAME_HOSTNAME}"
else
  echo "（略過；未設定 AZ_GAME_HOSTNAME。未設定時遊戲走同站 /play＋CSP sandbox）"
fi

echo
echo "完成後：用 GitHub Actions（.github/workflows/deploy.yml）部署程式碼，"
echo "再以 az webapp ssh 進入容器執行一次：npx prisma migrate deploy && npm run seed:prod（記下印出的課程通關密碼）"
