# 設計思考工作坊 課程網站（中國附醫教學部）

工作坊當天使用的課程網站：4 組學員與 4 位講師登入後，使用每組一塊的即時共編白板、資源庫、「加護病房床位的每月抉擇」賽局，講師有白板總覽、議程「目前段落」切換與管理頁。

- 不含任何真實病人資料，不連接院內系統；賽局情境中的醫學中心為虛構。
- 網站不顯示上課時間，議程只有段落順序與標題；「目前段落」只由講師手動切換。

## 快速開始（本機，約 10 分鐘）

需求：Node 20 以上、Postgres 16（或更新）、Azurite（Azure Blob 模擬器，隨 devDependencies 安裝）。

```bash
git clone <repo> cmuh-dt-site && cd cmuh-dt-site
npm ci                      # 會自動 prisma generate、複製 Excalidraw 字型到 public/fonts
cp .env.example .env        # 填 DATABASE_URL、SESSION_SECRET（openssl rand -hex 32）、AZURE_STORAGE_CONNECTION_STRING
```

### 資料庫與 Blob

**有 Docker：**

```bash
docker compose up -d        # postgres:16（cmuh/cmuh_local_dev）＋ azurite（:10000）
# .env：DATABASE_URL=postgresql://cmuh:cmuh_local_dev@localhost:5432/cmuh_dt
```

**不用 Docker（macOS）：**

```bash
brew install postgresql@16 && brew services start postgresql@16
createdb cmuh_dt && createdb cmuh_dt_test
# .env：DATABASE_URL=postgresql://<你的使用者>@localhost:5432/cmuh_dt
npm run azurite             # 另開一個終端機，保持執行（資料存在 .azurite/）
```

Azurite 的連線字串使用 Microsoft 公開的開發用預設帳號 `devstoreaccount1` 與其預設金鑰（見 Azurite 官方文件），`BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;`。

### 建表、種子資料、啟動

```bash
npx prisma migrate deploy   # 建表
npm run seed                # 4 組、16 位學員、4 位講師、4 塊白板、11 個議程段落、賽局（未公開）、2 場對局
npm run dev                 # http://localhost:3000（custom server：Next.js + WebSocket /ws）
```

`npm run seed` 會把**新產生的**組別代碼（4 碼）與講師初始密碼印在 console **一次**，並附加寫入 `.seed-output.local.txt`（已 gitignore，請勿 commit、用完即刪）。seed 可重跑（idempotent）：已存在的組別、帳號不會重產代碼或覆寫；議程會同步回預設 11 段（多出的段落會被刪除），**上課期間請勿重跑 seed**。

若設定 `INSTRUCTOR_INITIAL_PASSWORD`，新建講師帳號使用該密碼；否則每位講師隨機產生。

### 測試與檢查

```bash
createdb cmuh_dt_test                                                    # 第一次
DATABASE_URL=postgresql://<你的使用者>@localhost:5432/cmuh_dt_test npx prisma migrate deploy
npm run typecheck && npm run lint && npm test
```

測試使用獨立的 `cmuh_dt_test` 資料庫（可用 `TEST_DATABASE_URL` 指定），會清空該庫；測試程式拒絕清空名稱不含 `_test` 的資料庫。

## 帳號與登入

| 角色 | 登入方式 |
|---|---|
| 學員 | 選組別 → 選名字 → 輸入該組 4 位數字組別代碼 |
| 講師（廖家德、范硯平、邱瓊玉、吳宛儒，權限相同） | 選名字 → 密碼 |

- 代碼與密碼只存 bcrypt hash；登入失敗每「IP＋帳號」5 分鐘內最多 5 次。
- session 存在資料庫（cookie 只放隨機 token，DB 存其 HMAC），httpOnly、SameSite=Lax、12 小時；`APP_ORIGIN` 為 https 時加 Secure。
- 管理頁：講師可改學員姓名／標籤（如「副院長」）／換組／新增／停用、重設組別代碼（新代碼只顯示一次）、改自己的密碼、重設其他講師密碼；換組或停用會讓該學員重新登入。

## 功能

- **白板**（每組一塊）：Excalidraw，精簡工具列（選取、手繪、文字、矩形、箭頭、橡皮擦、復原／重做）＋「便利貼」（黃／粉／綠／藍，插入後直接打字）。自動同步、伺服器每 30 秒寫入資料庫；「存成版本」可預覽、還原（還原前自動備份）；匯出 PNG（白底 2x）、PDF（A3 橫向，頁首「第X組 白板｜日期時間」）。可貼 2MB 以內的小圖。
- **講師白板總覽**：4 組即時 SVG 縮圖（≤10 秒）、線上人數、最後更新；一鍵切換目前段落，所有人首頁即時更新。
- **資源庫**：檔案（≤50MB）、外部連結、HTML 遊戲（單一 .html 或含 index.html 的 .zip）；可見範圍：全體學員／指定組別／指定個人／僅講師，可綁定議程段落。
- **賽局**：學員頁自動帶出所屬對局與席位（內科隊／外科隊），每隊只填自己那欄；同時亮牌——己方出牌前看不到對方選擇，雙方都出牌後學員不能再改（講師可更正）。講師儀表板：兩場對局並列、共創總價值、配對、代填／更正、重置（二次確認）、「公開給學員」、投影模式。揭盅總帳與 debrief 只在儀表板 API 中，學員在公開前連 API 都拿不到。

## 架構

```
server.ts              custom server：同一個 http.Server 掛 Next handler 與 ws（/ws）
src/ws/hub-impl.ts     白板 scene-sync、presence、廣播（agenda / game）
src/lib/authz.ts       權限唯一來源：canEditBoard / canViewResource / canSubmitGameRound / canViewGameDashboard / requireInstructor
src/lib/game.ts        賽局計分純函式（照原檔 computeMatch / verdict）
src/lib/session.ts     session；db.ts、blob.ts、play-token.ts、uploads.ts …
src/app/api/**         route handlers（全部 zod 驗證＋authz）
prisma/                schema、migrations、seed
tests/                 Vitest：authz、計分、白板合併、各 API integration
```

### 白板同步：自架 scene-sync，不用 Yjs

- Excalidraw 官方協作本身就是「廣播 elements＋以 `version`/`versionNonce` 合併」，`reconcileElements` 可直接用，資料模型原生、行為可預期。
- `y-excalidraw` 為社群小型 binding，與 Excalidraw 版本、undo/redo、bound text、files 的相容性不確定，風險過高。
- 規模很小（每塊板 ≤ 6 人），不需要 CRDT 的長時間離線合併。

做法：client `onChange` 節流 100ms，只送 version 有變的元素（含刪除墓碑）；伺服器在記憶體維護每塊板的 `Map<id, element>`，version 大者勝（相同則 versionNonce 小者勝），廣播給同板其他連線並標記 dirty，每 30 秒 flush 到 Postgres，最後一人離線與收到 SIGTERM 時立即 flush。斷線以指數退避重連，重連後重新 join 取得完整 scene 再合併，並補送本地未同步的變更。ws 連線時以 session cookie 驗證、檢查 Origin，每個 join／update 都重驗 `canEditBoard`，未授權直接關閉。

### 單一 instance 限制

白板即時狀態與 rate limit 都在單一 Node process 的記憶體中，**只能以單一 instance 執行**（App Service Plan workers = 1，不要開 autoscale）。多實例需改用 Redis pub/sub 等，不在 MVP 範圍。

### 檔案與 HTML 遊戲隔離

- Blob container 為 private；blob key 用 UUID，不用原始檔名。下載一律 `GET /api/resources/:id/download`：伺服器驗權後 302 到 **5 分鐘、唯讀、單一 blob、指定下載檔名** 的 SAS URL；不可見或不存在一律 404。
- HTML 遊戲在 `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">` 中執行（不給 allow-same-origin／top-navigation／popups／forms），內容由 `/play/:id/<token>/*` 從 Blob 串流，回應帶 `Content-Security-Policy: sandbox allow-scripts; default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'; frame-ancestors <APP_ORIGIN>`，且不回傳 Set-Cookie。遊戲是 opaque origin，讀不到主站 cookie、storage、DOM，也不能發網路請求。
- 因 sandbox 內的子資源請求不帶 cookie，`/play` 以路徑上的短效 HMAC token（3 小時）授權，伺服器每次請求仍重驗使用者是否啟用與可見範圍。
- 正式環境建議設定 `GAME_ORIGIN` 為獨立 hostname（例如 App Service 第二個自訂網域）；未設定時走同站 `/play`，opaque origin 已足以隔離。

### 安全 headers

主站 CSP（只允許自己的 ws 與 Google Fonts）、`X-Content-Type-Options: nosniff`、`Referrer-Policy: same-origin`、`X-Frame-Options: SAMEORIGIN`。所有輸入以 zod 驗證，DB 一律走 Prisma。log 不記錄密碼或代碼。

## Azure 部署（只準備，未執行）

> 未經同意不得執行 `az` 部署、建立雲端資源或 push。

1. **建立資源**：`scripts/azure-deploy.sh` 預設 dry-run，只印出指令；確認後加 `--apply`。參數全部從環境變數讀取（見腳本開頭），印出時會遮蔽密碼與金鑰。內容：Resource group → App Service Plan（Linux B1、1 instance）→ Web App（Node 20 LTS，WebSockets 開、Always On、HTTPS only、startup `npm start`）→ PostgreSQL Flexible Server 16（強制 SSL、只允許 Azure 服務）→ Storage Account＋private container → App Settings（含 `WEBSITES_PORT=8080`）→（選填）`GAME_ORIGIN` 第二個 hostname。
2. **GitHub Actions**（`.github/workflows/deploy.yml`）：push 到 main 或手動觸發 → `npm ci`、typecheck、lint、test（CI 內建 Postgres）、build → 打包（含 production node_modules）→ `azure/webapps-deploy`。
   - Secrets：`AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_SUBSCRIPTION_ID`（`azure/login` OIDC federated credential，在 Entra ID 的 App registration 加上 GitHub federated credential，並授予該 Web App 的 Contributor）；若要由 CI 跑 migration 另需 `DATABASE_URL`。
   - Variables：`AZURE_WEBAPP_NAME`；`RUN_MIGRATIONS_FROM_CI=true`（需 Postgres 防火牆允許 GitHub runner）。
3. **第一次部署後**：`az webapp ssh -g <rg> -n <app>`，在容器內執行 `npx prisma migrate deploy && npm run seed:prod`，記下印出的組別代碼與講師密碼。

正式環境的 secrets 只放在 App Settings／GitHub Secrets，不進 git。

## 第三方授權

白板使用 Excalidraw（MIT License），保留授權聲明：見 `THIRD_PARTY_NOTICES.md` 與網站頁尾「About／授權聲明」。未使用 Excalidraw+、excalidraw.com 協作服務、付費素材或 library 商店。

## 已知事項

- Excalidraw 會為字型登錄 CDN 備援網址；本站 CSP 會擋下這些請求（瀏覽器 console 會看到 CSP 訊息），實際使用的字型都由本站 `public/fonts` 提供，不影響顯示。
