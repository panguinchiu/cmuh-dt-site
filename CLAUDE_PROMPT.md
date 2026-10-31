# Build Prompt：中國附醫教學部「設計思考工作坊」課程網站（MVP）

你是這個專案的資深全端工程師。請在使用者的 Mac 本機，從零建立一個 Next.js 網站，**今天內要能用，明天 2026-11-01 上課**。請嚴格守住 MVP 範圍、分步驟做，每個 checkpoint 都要實際跑起來驗證後再往下。

參考檔案放在 repo 的 `reference/`（使用者會一起放進來）：
- `reference/nursing_game_original.html`：原本的護理版「照護量能賽局」單檔 HTML（計分邏輯、圖表、儀表板版面都以它為藍本）
- `reference/ICU床位賽局_帶領者版.docx/.pdf`、`reference/ICU床位賽局_學員版.docx/.pdf`：ICU 版遊戲文案（本 prompt 已摘錄重點，以本 prompt 為準）

---

## 1. 目標

一個給工作坊當天使用的課程網站，讓 4 組學員與 4 位講師：
1. 用簡單的方式登入（學員：選組 → 選名字 → 4 碼組別代碼；講師：選名字 → 密碼）。
2. 每組有一塊**即時共編白板**（Excalidraw），可貼便利貼、手繪、打字，自動存檔、存版本、匯出 PNG/PDF。
3. 講師上傳**資源庫**（檔案、外部連結/遊戲網站、HTML 小遊戲），並控制誰看得到（伺服器端強制）。
4. 玩**「加護病房床位的每月抉擇」**賽局：學員頁作答寫入 API，講師儀表板即時看到所有組，講師可切換「公開給學員」。
5. 講師**總覽頁**：4 組白板即時縮圖、可進入任一白板、依當日議程切換「目前時段」。

成功標準：明天現場 4 組＋4 位講師同時使用不卡、不掉資料、權限不漏。寧可功能少，不可不穩。

## 2. 使用者與角色

### 講師（role = `instructor`，四人權限完全相同）
廖家德、范硯平、邱瓊玉、吳宛儒

### 學員（role = `student`）— seed 資料，**名單待使用者最後確認**（README 與 seed 檔頂端都要註明「名單待確認」，並讓講師能在後台改名/搬組/新增）
| 組別 | 成員 |
|---|---|
| 第一組 | 周致丞、黃美珠、陳巧錚、王仰馨 |
| 第二組 | 林曉娟、劉淳儀、李及方、王怡文 |
| 第三組 | 吳柏樟、盧秀琴、沈美均、陳怡卉 |
| 第四組 | 林韋均、楊勝彰、陳志遠、邱德發（副院長，以學員帳號併入第四組；名字旁可顯示「副院長」標籤） |

### 登入方式
- **學員**：選組別（大按鈕）→ 選自己的名字 → 輸入該組 4 位數字組別代碼。代碼存 hash（bcrypt/argon2），seed 時隨機產生並**只印在 console 一次**＋寫入 `.seed-output.local.txt`（已 gitignore），講師後台可重設代碼。
- **講師**：選名字 → 密碼。初始密碼從環境變數 `INSTRUCTOR_INITIAL_PASSWORD` 讀取（或 seed 時隨機產生並同上輸出），存 hash；講師可自行改密碼。
- Session：伺服器端 session（DB 存 session、httpOnly + Secure + SameSite=Lax cookie，效期 12 小時）。登入失敗做簡單 rate limit（每 IP+帳號 5 次/5 分鐘）。
- 不做註冊、不做 email、不做忘記密碼（講師可互相重設）。

## 3. 功能規格

### 3.1 版面
- 左側 nav：首頁（目前時段＋今日議程）、我的白板（學員）／白板總覽（講師）、資源庫、賽局、（講師）管理。
- 頂部顯示：目前使用者、組別、目前時段、深/淺色切換、登出。
- 大字、少按鈕，手機與平板可用（白板頁以平板/筆電為主）。

### 3.2 今日議程與「目前時段」
Seed 以下 10 個段落（講師在總覽頁一鍵切換「目前時段」，所有人首頁即時更新，可透過同一條 websocket 廣播）：
| # | 時間 | 段落 |
|---|---|---|
| 01 | 10:00 | 定義問題 |
| 02 | 10:30 | 發想與收斂 |
| 03 | 11:00 | 第一個未來解方 |
| 04 | 11:30 | 從一句需求到測試站（講師：廖家德醫師） |
| 05 | 12:30 | 午餐＋動手發布 |
| 06 | 13:30 | 當人人都能部署（沙盒轉向工具平台） |
| 07 | 14:00 | 牌桌遊戲 |
| 08 | 14:30 | 加護病房床位的每月抉擇（賽局） |
| 09 | 15:30 | 教學部盃桌球策略遊戲 |
| 10 | 16:30 | 黑馬來了 |

另外 seed 兩筆收尾段落（可選、排在後面）：`11 16:45 修正原型`、`12 17:15 成果發表與總結`。段落可在後台改名、改時間、排序。每個段落可綁定資源（選填），首頁顯示「目前時段＋相關資源」。

### 3.3 白板（每組一塊，共 4 塊）
- 使用 **Excalidraw**（`@excalidraw/excalidraw`，MIT）。**保留 MIT license 聲明**（`THIRD_PARTY_NOTICES.md` ＋頁尾「About」連結），**不使用 Excalidraw+、excalidraw.com collab 服務、付費素材或其 library 商店**。
- 精簡工具列：只露出 選取、手繪(freedraw)、文字、矩形、箭頭、橡皮擦、復原/重做，加上自訂 **「便利貼」按鈕**：在畫面中心插入一個彩色矩形（預設黃 `#ffe58a`，可在 4 色間切換：黃/粉/綠/藍）＋綁定文字（bound text，`containerId`），插入後直接進入文字編輯。用 `UIOptions` / `renderTopRightUI` 隱藏不需要的選單（不顯示 Excalidraw 的 collab/分享/library 按鈕）。
- 權限：學員只能編輯自己組的白板；講師可檢視與編輯任一組白板。
- **即時協作：採用「自架 websocket 的 scene-sync」，不用 Yjs**（理由見 §6.3）。
- 自動存檔：伺服器端每 30 秒把有變動的 scene 寫入 Postgres（`board.scene` JSONB）；client 斷線重連後先拿伺服器最新 scene 再合併。
- 「存成版本」按鈕：建立 `board_version` snapshot（可輸入名稱，預設為目前時段名稱＋時間），可列出、預覽、還原（還原前自動再存一版當前狀態）。
- 匯出：PNG（`exportToBlob`，白底，2x scale）；PDF（`pdf-lib`，**A3 橫向** 1190.55×841.89 pt，圖片等比置中、留邊，頁首印「第X組 白板｜日期時間」——注意 pdf-lib 標準字型不支援中文，頁首請用 `@pdf-lib/fontkit` 嵌入 Noto Sans TC 子集，或直接把頁首畫進 PNG 再嵌入，選後者較簡單）。
- 圖片貼入：MVP 允許貼小圖（單檔 ≤ 2MB，存成 Excalidraw files 隨 scene 存 DB；若過大則提示）。

### 3.4 講師總覽
- 4 組白板卡片：**即時縮圖**（伺服器收到更新後節流，每 10 秒 client 端以 `exportToSvg` 產生縮圖，或總覽頁直接訂閱 4 個 board 的 scene 並各自 render 一個唯讀小型 Excalidraw/SVG；選 SVG 較省資源）、最後更新時間、線上人數。
- 點卡片進入該組白板（可編輯）。
- 「目前時段」切換器（下拉或段落按鈕列）。

### 3.5 資源庫
- 講師可新增三種資源：
  1. **檔案**（上傳至 Azure Blob，private container；單檔上限 50MB）
  2. **外部連結**（含遊戲網站；開新分頁，`rel="noopener noreferrer"`）
  3. **HTML 遊戲**（上傳單一 .html 或 .zip 內含 index.html；存 Blob；在 sandboxed iframe 執行）
- 欄位：標題、說明、類型、可見範圍、綁定段落（選填）、排序。
- 可見範圍（四選一）：`all_students`（全體學員）、`groups`（指定組別，多選）、`users`（指定個人，多選）、`instructors_only`。講師永遠看得到全部。
- 下載：**一律經伺服器驗權**。`GET /api/resources/:id/download` 驗證可見權限後回傳 302 到 **短效 SAS URL（5 分鐘、read-only、單一 blob、`Content-Disposition` 指定檔名）**；本機 Azurite 一樣走 SAS。前端絕不出現永久 blob URL。
- HTML 遊戲隔離：
  - 遊戲經 `GET /play/:id/*`（**獨立路徑，或可設定獨立 origin `GAME_ORIGIN`，例如 Azure 上第二個 hostname**）由伺服器驗權後從 Blob proxy 串流回應。
  - 回應 header：`Content-Security-Policy: sandbox allow-scripts; default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'; frame-ancestors <APP_ORIGIN>`，不帶 session cookie 以外的任何憑證；遊戲路徑的 cookie 設 `Path=/` 但遊戲回應**不回傳**任何 Set-Cookie。
  - 嵌入：`<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">`——**不給 `allow-same-origin`**（使遊戲成為 opaque origin，無法讀主站 cookie/storage/DOM）。不給 `allow-top-navigation`、`allow-popups`、`allow-forms`。
  - 未設定 `GAME_ORIGIN` 時用同站 `/play` 路徑＋上述 CSP sandbox（opaque origin 已足以隔離）；README 說明正式環境建議獨立 origin。

### 3.6 賽局「加護病房床位的每月抉擇」— 見 §8

### 3.7 講師管理（簡單表單即可）
- 學員：改名、換組、新增、停用；重設組別代碼（顯示一次）。
- 講師：改自己的密碼、重設其他講師密碼。
- 議程段落 CRUD。
- 賽局：建立/設定對局配對、重置對局（需二次確認）、「公開給學員」開關。

## 4. 權限規則（全部在伺服器端強制；前端隱藏只是 UX）

集中寫在 `src/lib/authz.ts`，每個 API route / server action / websocket 訊息都必須呼叫，**不得在各處自行判斷**：

| 動作 | 學員 | 講師 |
|---|---|---|
| 讀/寫白板 X | 僅 X = 自己的組 | 全部 |
| 建立/還原版本、匯出 | 僅自己組 | 全部 |
| 看資源列表/下載/開遊戲 | 依 visibility 判斷 | 全部 |
| 新增/編輯/刪除資源 | ✗ | ✓ |
| 賽局作答（寫入回合選擇） | 僅自己組所屬的對局與己方席位 | ✓（可代填/更正） |
| 讀賽局儀表板（所有組） | 僅當 `game.published = true`，且唯讀 | ✓ |
| 讀自己對局的分數 | ✓（自己的對局） | ✓ |
| 切換目前時段、公開開關、管理 | ✗ | ✓ |

函式建議：`canViewResource(user, resource)`、`canEditBoard(user, boardId)`、`canSubmitGameRound(user, match, side)`、`canViewGameDashboard(user, game)`、`requireInstructor(user)`。

Websocket：連線時用 session cookie 驗證身分（upgrade 時讀 cookie 查 DB），每個 `join`/`update` 訊息都重驗 `canEditBoard`；未授權直接關閉連線。

**必須寫測試**（Vitest）：上述每個函式的允許/拒絕案例，包括：別組學員讀寫白板被拒、`groups`/`users`/`instructors_only` 各種可見範圍、未公開時學員讀儀表板被拒、學員寫對方席位被拒、未登入一律 401、download API 對不可見資源回 404（不洩漏存在）。另加幾個 API 層 integration test（supertest 或 Next route handler 直接呼叫）。

## 5. 資料模型（Postgres，用 Prisma 或 Drizzle，擇一；建議 Prisma 較快）

```
Group        id, name("第一組"..), sortOrder, codeHash
User         id, name, role(student|instructor), groupId?(student 必填), title?(如「副院長」), passwordHash?(instructor), active, createdAt
Session      id, userId, expiresAt, createdAt
AgendaItem   id, seq, time("10:00"), title, note?, sortOrder
AppState     id=1, currentAgendaItemId?          // 目前時段（singleton）
Board        id, groupId(unique), scene JSONB, files JSONB, updatedAt, updatedById
BoardVersion id, boardId, name, scene JSONB, files JSONB, createdById, createdAt
Resource     id, title, description?, type(file|link|html_game), url?(link), blobKey?(file/game), fileName?, mimeType?, size?,
             visibility(all_students|groups|users|instructors_only), agendaItemId?, sortOrder, createdById, createdAt
ResourceGroup  resourceId, groupId           // visibility=groups
ResourceUser   resourceId, userId            // visibility=users
Game         id, slug("icu-bed"), title, published(bool), createdAt
GameMatch    id, gameId, label("A 對局"/"B 對局"), medGroupId(內科隊), surgGroupId(外科隊)
GameRound    id, matchId, round(1..8), medChoice?, surgChoice?, updatedById, updatedAt   // unique(matchId, round)
AuditLog     id, userId, action, target, meta JSONB, createdAt   // 登入、資源變更、公開切換、重置
```
Choice enum：`FULL`（全力共援）、`HOLD`（保留一手）、`SELF`（優先自保）。

Seed（`npm run seed`，idempotent）：4 組、16 位學員、4 位講師、4 塊空白板、12 個議程段落（10＋2）、1 個 Game（未公開）、2 個 GameMatch（預設 A 對局：第一組(內科) vs 第二組(外科)；B 對局：第三組(內科) vs 第四組(外科)，講師可改）、每個 match 8 個空回合。

## 6. 技術與架構

### 6.1 Stack
- Next.js（App Router，TypeScript，最新穩定版）＋ **custom Node server**（`server.ts`：同一個 `http.Server` 掛 Next handler 與 `ws` WebSocketServer，路徑 `/ws`）。
- Postgres 16（本機用 `docker compose` 起 postgres 與 azurite；若使用者沒有 Docker，README 提供 `brew install postgresql@16` 替代）。
- Azure Blob：`@azure/storage-blob`；本機 Azurite（`docker compose` 內，或 `npx azurite`）。
- Excalidraw、pdf-lib、`ws`、zod（所有輸入驗證）、bcrypt（或 argon2）、Vitest。
- 樣式：Tailwind 或 CSS Modules 擇一（建議 CSS variables＋CSS Modules，配色見 §7）。
- 部署目標：Azure App Service Linux（Node 20 LTS），**WebSockets 必須開啟**，單一 instance（MVP 不做多實例 ws 擴充，README 註明）。

### 6.2 目錄建議
```
server.ts                 # custom server: Next + ws
src/app/(auth)/login      # 登入流程
src/app/(app)/...         # 首頁、白板、資源、賽局、總覽、管理
src/app/api/...           # route handlers
src/lib/authz.ts          # 權限（唯一來源）
src/lib/session.ts, db.ts, blob.ts, game.ts(計分純函式)
src/ws/                   # board sync、agenda/game 廣播
prisma/ schema.prisma, seed.ts
tests/                    # authz、game 計分、API
reference/                # 原始檔
```

### 6.3 白板即時同步：選擇 scene-sync over websocket（不用 Yjs/y-excalidraw）
理由（請照此實作，並在 README 簡述）：
- Excalidraw 官方協作（excalidraw.com）本身就是「廣播 elements＋以 `version`/`versionNonce` 合併」的模式，Excalidraw 匯出 `reconcileElements`（或自行實作同邏輯）可直接用；資料模型原生、行為可預期。
- `y-excalidraw` 為社群小型 binding，與 Excalidraw 版本相容性、undo/redo、bound text、files 處理有不確定性；明天就要上線，風險過高。
- 規模極小（每塊板 ≤ 6 人），不需要 CRDT 的離線長時間合併能力。

實作：
- Client `onChange` → 節流 100ms，只送「version 有變的 elements」（含 `isDeleted` 墓碑）：`{type:"update", boardId, elements:[...]}`；新圖片 files 另送 `{type:"files"}`。
- Server 在記憶體維護每塊板的 `Map<id, element>`，以 element `version`（大者勝；相同則 `versionNonce` 小者勝）合併，廣播給同板其他連線；標記 dirty，**每 30 秒 flush dirty 到 Postgres**，並在最後一人離線與 process `SIGTERM` 時立即 flush。
- Client 收到遠端 elements → 與本地 `reconcileElements` 後 `updateScene`（注意避免把遠端更新再回送：比對 version）。
- 顯示同板線上人數；游標同步為 nice-to-have（時間不夠就跳過）。
- 斷線自動重連（指數退避），重連時 `{type:"join"}` 取得完整 scene 再合併。
- 同一條 ws 也承載 `agenda:current` 與 `game:update` 廣播（講師儀表板即時更新）。

### 6.4 安全
- 所有輸入 zod 驗證；所有 DB 查詢走 ORM（無字串拼 SQL）。
- 安全 headers：主站 CSP（允許 Google Fonts、自己的 ws）、`X-Content-Type-Options: nosniff`、`Referrer-Policy: same-origin`。
- 上傳檔：檢查大小、副檔名白名單（pdf, pptx, docx, xlsx, png, jpg, mp4, zip, html）；blob key 用 UUID，不用原始檔名。
- 不記錄密碼/代碼到 log。

## 7. 視覺風格

對齊 https://cmuh-meded-sandbox-prod-staging.azurewebsites.net/ （請先打開參考，抓版面節奏）：
- **預設深色**：背景 `#0e1518`；accent `#3fb094`；accent 上的文字 `#07231b`；文字近白（如 `#e6efec`），次要文字約 `#8fa39d`；卡片比背景略亮（如 `#141e21`），**細邊框**（1px，如 `#22312f`）。
- **淺色模式**：背景 `#f3f1ea`；accent `#0f7a63`（accent 上文字白色）；文字 `#1c2523`；邊框 `#d9d5c8`。切換存 localStorage＋`prefers-color-scheme` 為初值。
- 字體（Google Fonts）：標題 **Noto Serif TC**，內文 **Noto Sans TC**，數字/代碼/時間/分數 **IBM Plex Mono**。
- **小圓角**（4–6px）、細線、左側 nav、留白充足。
- **大字、簡單**：內文 ≥ 17px、主要按鈕 ≥ 44px 高、登入頁組別/名字用大塊按鈕。
- 白板頁：盡量全幅，只留精簡頂列（返回、組名、線上人數、便利貼、存成版本、匯出 PNG/PDF、存檔狀態「已儲存 · 16:32」）。Excalidraw 內建主題跟隨深/淺模式。

## 8. 遊戲改版規格：「加護病房床位的每月抉擇」

以 `reference/nursing_game_original.html` 的邏輯與版面為藍本，改寫成 Next.js 頁面（不要 iframe 原檔），**所有資料改為 API＋DB，不用 localStorage／BroadcastChannel；刪除原檔的 admin/1234 與前端 sha256 登入**，改用網站的講師身分。

### 8.1 情境（學員頁開頭顯示）
一家虛構醫學中心（不寫真實醫院名）的**內科隊**與**外科隊**領導團隊，共用有限的加護病房床位。接下來八個月，每月月初兩隊各自、同時決定本系這個月的協作投入等級。目標：讓自己這一隊八個月累計的「**重症收治量能點數**」愈高愈好，不需要為對方負責。兩系過去因床位分配、轉床爭議與績效歸屬有過摩擦，關係略為緊張；醫療部並未授權私下協調。為了避免臨時喬床、影響公平，醫療部規定兩隊必須每月月初同時決定、同時亮牌。

三種選擇（文案照用）：
- **全力共援**：依病情嚴重度共同調度床位，主動讓出可轉出的床位，也接受對方的病人轉入。
- **保留一手**：表面配合共同調度，私下替自家病人預留床位。若對方全力共援、你卻保留一手，短期你的收治量能會衝很高——但對方會被擠到無床可用。
- **優先自保**：床位只給自家病人，不參與共同調度。當雙方都自保，轉床卡關、急診滯留、手術排程延宕，兩隊收治量能都低。

### 8.2 規則與計分（數字完全不改）
- 對局：4 組兩兩配對，共 **2 場對局**；每場一組為內科隊、一組為外科隊（內科取代原 F，外科取代原 U）。
- 8 回合；權重 `[1,1,1,2,1,1,1,3]`（第 4 回合 ×2、第 8 回合 ×3）。
- 溝通規則（顯示在學員頁）：第 1–3 回合不得交談；第 4、第 7 回合開始前各有 2 分鐘雙邊會談（可承諾，不具約束力）；每回合同時亮牌。
- 收益矩陣 `[內科, 外科]`：
  | 內科↓ ／ 外科→ | 全力共援 | 保留一手 | 優先自保 |
  |---|---|---|---|
  | 全力共援 | 11, 11 | 2, 18 | 2, 15 |
  | 保留一手 | 18, 2 | 8, 8 | 3, 15 |
  | 優先自保 | 15, 2 | 15, 3 | 5, 5 |
- 常數：單隊全程共好上限 `COOP_MAX = 121`，雙方合計上限 `JOINT_MAX = 242`；互相自保單隊 55（合計 110）。
- 計分寫成純函式 `src/lib/game.ts`（`computeMatch(rounds)` 回傳每回合點數、加權累計、雙方總分、合計、比例、首次脫離共好回合 `defect`），**照原檔 `computeMatch` 與 `verdict` 邏輯**（≥0.85「接近全程共好 👏」、≥0.60「多數回合合作」、≥0.46「偏向僵局」、其餘「信任崩壞，雙輸」），並寫單元測試（全共好=121/121、全自保=55/55、第 4 回合背叛範例等）。

### 8.3 學員頁 `/game`
- 自動依登入者組別帶出所屬對局與己方席位（內科隊/外科隊），不用手選組別。
- 顯示：情境、三種選擇、矩陣、規則；己方加權累計大數字、對手分數、完成回合 x/8、共好達成度 %、首次脫離共好回合；累計折線圖（SVG，沿用原檔 `lineChart`，背叛回合紅色虛線標「背叛」）。
- 逐回合表格：本組可填「我方選擇」；**對方選擇由對方組填寫**（每隊各填自己那欄，兩欄都有值才計分）。同一組任一成員填寫即可，即時同步給同組與對手組（ws `game:update`）。已填欄可改（MVP 不鎖回合；講師可在儀表板鎖定/更正，nice-to-have）。
- **帶領者專用內容（策略分析、121/55/99 揭盅總帳、debrief）不出現在學員頁**，直到講師打開「公開給學員」。

### 8.4 講師儀表板 `/game/dashboard`（僅講師；公開後學員唯讀）
- 2 場對局並列：標題「A 對局：第一組（內科）vs 第二組（外科）」、每回合雙方選擇（依顏色：全力共援 `#2E7D4F` 系、保留一手 `#B4903A` 系、優先自保 `#9C4B3B` 系，於深色主題調整亮度確保對比）、點數、累計、趨勢圖、判語。
- 「共創總價值」長條圖（各對局合計 vs 242）。
- 講師工具：設定配對、代填/更正任一格、重置對局（二次確認）、**「公開給學員」開關**（開啟後學員 nav 出現「賽局結果」，唯讀顯示整個儀表板＋揭盅總帳；適合投影）、「投影模式」（全螢幕、字更大）。
- 揭盅總帳（講師永遠可見，學員於公開後可見）：全程共好約 121 點；雙方互相自保 55 點；若某方第 4 回合背叛一次（該回合搶 36 點）、招致報復後段崩到自保，背叛者總帳約 99 點，仍低於 121。
- Debrief 四問（講師可見；公開後學員可見）：
  1. 你們花了幾回合才穩定共好？中間是什麼建立或摧毀了信任？
  2. 有沒有人保留一手？私下預留床位換來的短期量能，抵得過後面崩壞的損失嗎？（出示總帳）
  3. 沒開放溝通的回合，你們靠什麼判斷對方的意圖？——對照現實：平常各科系是憑什麼判斷對方「會不會讓床」？
  4. 放大到全院的稀缺資源協作（加護病房床位、手術室時段、隔離病房等）：為什麼「共好」需要被制度化，而不能只靠善意？床位調度制度、透明的即時床位資訊、跨系績效共享，各自能補上哪一塊信任缺口？

API：`GET /api/game/:slug/me`（學員自己的對局）、`PUT /api/game/:slug/matches/:id/rounds/:n`（body `{side, choice}`，authz 檢查）、`GET /api/game/:slug/dashboard`（講師或已公開）、`POST /api/game/:slug/publish`（講師）、`POST /api/game/:slug/matches/:id/reset`（講師）。

## 9. 開發步驟與驗收清單

每一步完成後：跑 `npm run typecheck && npm run lint && npm test`、實際在瀏覽器操作驗證，**停下來向使用者回報 checkpoint 結果與如何驗證**，再繼續（使用者說「繼續」或已預先同意連續做才往下）。使用 git 在本機小步 commit（訊息清楚），**不 push**。

**Step 0 — 確認環境**：Node 20+、Docker（或 brew postgres）、建立 repo、`.gitignore`（含 `.env*`（保留 `.env.example`）、`.seed-output.local.txt`、`node_modules`、`.next`、azurite 資料夾）。
✅ `docker compose up -d` 起 Postgres＋Azurite。

**Step 1 — 骨架＋樣式**：Next.js＋custom server（`/ws` echo 測試）、左側 nav、深/淺色、字體。
✅ `npm run dev` 開 http://localhost:3000 看到深色左 nav 版面；ws 連線成功。

**Step 2 — DB＋seed＋登入＋authz**：schema、migration、seed、學員/講師登入、session、`authz.ts`＋完整測試。
✅ 以第一組學員、講師各登入成功；錯代碼失敗並 rate limit；authz 測試全綠。

**Step 3 — 白板（最高優先）**：Excalidraw 嵌入（`dynamic(..., {ssr:false})`）、精簡工具列、便利貼按鈕、ws scene-sync、30 秒存檔、版本、PNG/PDF 匯出、MIT notice。
✅ 兩個瀏覽器（一般＋無痕）同組同時編輯即時同步；別組學員進不去（403）；重啟 server 後內容還在；PNG、A3 橫向 PDF 可開；版本可還原。

**Step 4 — 賽局**：`game.ts`＋測試、學員頁、儀表板、公開開關、ws 即時更新。
✅ 4 個瀏覽器模擬 4 組填完 8 回合，儀表板即時更新、分數與原 HTML 一致；未公開時學員打 dashboard API 得 403；公開後唯讀可見。

**Step 5 — 講師總覽＋議程**：4 組縮圖、進入白板、目前時段切換廣播。
✅ 學員改白板，總覽縮圖 ≤ 10 秒內更新；切換時段後學員首頁即時變。

**Step 6 — 資源庫**：上傳（Azurite）、連結、HTML 遊戲 sandbox、四種可見範圍、SAS 下載。
✅ 各可見範圍以不同帳號驗證；複製下載連結 5 分鐘後失效；HTML 遊戲內 `document.cookie`、`parent.document` 存取失敗；不可見資源 API 回 404。

**Step 7 — 管理頁＋收尾**：學員/講師/議程管理、重設代碼、README、`.env.example`、部署檔。
✅ 從乾淨 clone 照 README 能在 15 分鐘內跑起來；`git grep` 檢查無任何密鑰。

**最終驗收（交付前全部打勾）**
- [ ] 16 位學員＋4 位講師可登入；名單可在後台修改
- [ ] 4 塊白板即時協作、便利貼/手繪/文字可用、30 秒自動存檔、版本、PNG/PDF
- [ ] 賽局學員作答寫 API、儀表板即時、公開開關有效
- [ ] 資源庫四種可見範圍伺服器端強制、下載為短效 SAS、HTML 遊戲 sandbox
- [ ] 總覽縮圖＋目前時段切換
- [ ] authz 與 game 測試全綠
- [ ] 無 secrets 進 git；README、.env.example、seed、部署腳本齊全

時間不夠時的砍功能順序（由先砍到後砍）：游標同步 → 投影模式 → 版本預覽（保留存/還原）→ zip 型 HTML 遊戲（只收單檔 html）→ 縮圖改為手動重新整理。**白板、登入、權限、賽局 API 不可砍。**

## 10. 部署說明（只準備，不執行）

**未經使用者明確同意，不得執行任何 `az` 部署指令、不得 push 到 GitHub（之後使用者會推到 `panguinchiu` 帳號下的 repo）、不得建立雲端資源。**

請產出：
1. `.env.example`（只有 key 與說明，無實值）：`DATABASE_URL`、`SESSION_SECRET`、`INSTRUCTOR_INITIAL_PASSWORD`、`AZURE_STORAGE_CONNECTION_STRING`（本機為 Azurite 預設值的說明）、`AZURE_STORAGE_CONTAINER=resources`、`APP_ORIGIN`、`GAME_ORIGIN`（選填）、`PORT`。
2. `docker-compose.yml`：postgres:16、mcr.microsoft.com/azure-storage/azurite。
3. `scripts/azure-deploy.sh`（az CLI，參數化、可重跑、預設 `--dry-run` 只印指令）：resource group、App Service Plan（Linux, B1 以上）、Web App（Node 20 LTS）、`az webapp config set --web-sockets-enabled true --always-on true`、startup command `node dist/server.js`（或 `npm start`）、Azure Database for PostgreSQL Flexible Server（含防火牆/SSL）、Storage Account＋private container、App Settings（從本機環境變數讀，不寫死）、`WEBSITES_PORT`、HTTPS only；選填第二個 hostname 給 `GAME_ORIGIN`。
4. `.github/workflows/deploy.yml`：push 到 main 或手動 `workflow_dispatch` → install、test、build、`prisma migrate deploy`、用 `azure/webapps-deploy` 部署；憑證用 OIDC（`azure/login` federated credential）或 publish profile 放 GitHub Secrets，README 說明要設哪些 secrets。
5. README：本機開發、seed、測試、名單待確認提醒、架構說明（含 §6.3 選型理由）、Azure 部署步驟、單一 instance 限制、MIT/第三方授權。

## 11. 不做的事

- 不做多實例 websocket 擴充（Redis pub/sub 等）、不做 Yjs/CRDT。
- 不使用 Excalidraw+、excalidraw.com 協作後端、付費素材、Excalidraw library 商店；不移除 MIT 授權聲明。
- 不做註冊、email、忘記密碼、SSO、第三方登入。
- 不存任何真實病人資料；不提及或連接醫院內部系統。
- 不把遊戲帶領者內容（策略分析、揭盅總帳、debrief）在未公開前送到學員端（連 API response 都不能包含）。
- 不用 localStorage 存遊戲或白板資料（僅主題偏好可存）。
- 不把 secrets、連線字串、seed 產生的代碼/密碼 commit 進 git。
- **不自行 deploy、不自行 push、不自行建立 Azure 資源**；需要時先問使用者。
- 不擴充範圍（聊天室、評分、通知、多語系、行動 App 等），除非使用者要求。

開始前請先簡短複述你的實作計畫與預估各步驟時間，然後從 Step 0 開始。
