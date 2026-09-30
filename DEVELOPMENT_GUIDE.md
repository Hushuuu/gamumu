# GAMUMU 專案架構與開發指南

> 本文件說明目前程式碼已實作的功能、模組分工與日常開發方式。產品目標與完整需求請參考 [`gg_spec.md`](./gg_spec.md)；Cloudflare、GitHub Pages、網域與 DNS 設定請參考 [`CLOUDFLARE_SETUP.md`](./CLOUDFLARE_SETUP.md)。

## 目前功能

| 功能           | 目前行為                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 建立／加入房間 | 不需帳號；玩家輸入 1–20 個字元的暱稱，建立房間或輸入六碼房間代碼加入。                                                                          |
| 邀請玩家       | 房間頁可複製含 `?room=房間代碼` 的連結；連結不包含玩家憑證。                                                                                    |
| 頭像           | 提供 8 款內建 SVG 頭像；玩家進房後可選擇或更換，房間內即時同步。                                                                                |
| 房間等待       | 即時顯示玩家、在線狀態、Ready 狀態與房主；房間最多 12 人，依所選遊戲的人數範圍與全員在線 Ready 狀態判斷能否開始。只有房主可選擇遊戲與開始。 |
| 房主管理       | 等待房間時，房主可以將其他玩家移出房間；房主不能移除自己。                                                                                      |
| 猜詞派對       | 2–12 人；共 5 題，每題 20 秒；每位玩家每題只能回答一次，答對加 100 分。所有玩家都作答後會提早公布答案，否則時間到後公布；公布階段持續 3 秒。    |
| 你畫我猜       | 2–12 人；房主可設定繪畫 15–180 秒、每人 1–5 輪、猜答案 10–120 秒。繪圖者可跳過或提早完成；每位猜中者及該題繪圖者各得 50 分。           |
| 空白測試遊戲   | 1–12 人；可由房主選擇並啟動，顯示擴充測試畫面；房主可結束遊戲以驗證結算流程，目前沒有實際玩法。                                               |
| 多局與結算     | 遊戲結束後房主可開啟下一局並選擇遊戲；下一局預選猜詞派對，Ready 與本局狀態清除，玩家分數跨局累積保留。                                            |
| 重新連線       | 玩家憑證存在瀏覽器的 `localStorage`；重新載入時可用原身分連線。等待期間斷線會清除 Ready，重連後須重新準備。玩家斷線會保留在名單中，明確離開才會移除；房主明確離開時由第一位留下的玩家接任。 |
| 房間期限       | 房間超過 6 小時沒有狀態更新會過期；房間內所有玩家離開時則立即刪除。                                                                             |

房間代碼使用六個字元，排除容易混淆的 `I`、`O`、`0`、`1`。房主更換遊戲時會清除所有人的 Ready，確保玩家是針對目前選擇的遊戲準備。

## 架構與資料流程

```text
Vue 前端
  ├─ HTTP：建立／加入房間 ──> Cloudflare Worker
  │                              └─> 對應的 GameRoom Durable Object
  └─ WebSocket：房間操作／狀態 <──> Cloudflare Worker <──> GameRoom Durable Object
                                         路由請求       驗證並裁決遊戲
```

1. 前端以 `POST /api/rooms` 建立房間，或以 `POST /api/rooms/:code/join` 加入房間。
2. Worker 驗證暱稱與房間代碼，產生玩家 ID 和連線憑證；建立房間時也會產生六碼房間代碼。
3. Worker 以房間代碼呼叫 `GAME_ROOMS.idFromName(code)`，將房間資料交給該房間的 `GameRoom` Durable Object 保存。
4. 前端保存連線憑證後，連到該房間的 WebSocket，並以 `authenticate` 訊息驗證身分。
5. WebSocket 操作由 Durable Object 驗證、更新並保存房間狀態，再將公開的狀態快照廣播給已驗證玩家。

**責任分界**

- **Vue 前端**負責畫面、輸入、邀請連結、連線狀態及倒數呈現。倒數依伺服器傳來的 `roundEndsAt` 或 `phaseEndsAt` 顯示；瀏覽器計時器不是遊戲裁決依據。
- **Worker**負責 HTTP 路由、CORS、請求資料驗證，以及將房間請求轉送至 Durable Object。
- **GameRoom Durable Object**負責單一房間的玩家、房主、連線、共用權限、狀態保存與房間期限；遊戲規則、分數及遊戲快照由註冊的遊戲模組處理。
- **`shared/protocol.ts`** 定義前後端共用的訊息與房間快照；`shared/games/` 定義遊戲 ID、玩家人數範圍與公開遊戲狀態；`shared/avatars.ts` 定義允許使用的頭像 ID。

猜詞答案及你畫我猜答案在猜題階段都不會放進公開快照；你畫我猜的答案只會以私人 `answer-prompt` 事件傳給繪圖者，進入 `reveal` 後才公開。分數、玩家是否已作答及回合切換也都由伺服器決定。

### HTTP 與 WebSocket 介面

| 介面                         | 用途                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `GET /api/health`            | Worker 健康檢查。                                         |
| `POST /api/rooms`            | 建立房間，JSON body 為 `{ "name": "玩家暱稱" }`。         |
| `POST /api/rooms/:code/join` | 加入等待中的房間，JSON body 為 `{ "name": "玩家暱稱" }`。 |
| `GET /api/rooms/:code/ws`    | 升級成房間 WebSocket；連線後先驗證玩家憑證。              |

建立或加入成功會回傳 `{ code, playerId, token }`。目前支援的前端 WebSocket 操作如下：

| 訊息                | 用途 |
| ------------------- | --- |
| `authenticate`      | 使用房間憑證驗證玩家身分。 |
| `set_ready`         | 玩家設定自己的 Ready 狀態。 |
| `select_avatar`     | 玩家選擇或更換自己的頭像。 |
| `select_game`       | 房主選擇本局遊戲；更換時會重設所有 Ready。 |
| `configure_game`    | 房主在等待階段設定所選遊戲的本局選項。 |
| `kick_player`       | 房主在等待階段移除其他玩家。 |
| `start_game`        | 所選遊戲的人數範圍符合，且所有玩家在線並 Ready 後，由房主開始。 |
| `game_action`       | 將遊戲操作送至目前遊戲模組；操作名稱與 payload 由該遊戲定義。 |
| `submit_answer`     | 舊版客戶端相容訊息；新客戶端使用 `game_action`。 |
| `finish_game`       | 舊版客戶端相容訊息；新客戶端使用 `game_action`。 |
| `prepare_next_game` | 房主將結束的房間重新開啟為等待狀態，預選猜詞派對；保留分數並清除本局狀態。 |
| `leave_room`        | 明確離開並從房間名單移除。 |

伺服器訊息主要包括 `authenticated`、`state`、`game_event`、`action_error`、`auth_error`、`kicked` 與 `room_expired`。訊息型別與執行期格式檢查集中在 `shared/protocol.ts`；`guess_result` 僅供舊版客戶端相容。

### 房間與遊戲規則

- 房間建立後處於 `waiting`；開始遊戲後為 `playing`；遊戲結束後為 `finished`。房主可準備下一局，將房間重新切回 `waiting`。
- 等待期間每位玩家可自行 Ready／取消 Ready；開始遊戲須符合所選遊戲的最少／最多人數，且所有玩家都在線並 Ready，再由房主發起。伺服器會再次驗證人數範圍，不依賴前端按鈕狀態。
- 房主只能在等待階段移除其他玩家；房主更換遊戲時會清除所有人的 Ready，玩家在等待階段斷線時則清除該玩家的 Ready。
- 頭像只能從 `shared/avatars.ts` 列出的 ID 選擇，圖檔位於 `public/avatars/`；玩家可在任何房間階段更換。
- 玩家單純斷線時會保留在名單中；房主身分也會保留到房主明確離開，屆時才轉交給第一位留下的玩家。
- 每題從 `worker/src/games/word-guess/index.ts` 的固定詞庫抽出答案與提示。玩家每題只能送出一次答案，錯誤答案也會算作已作答。
- 答案會先做 NFKC 正規化、去除頭尾空白、合併連續空白並轉成大寫，再由伺服器比對。
- 全員作答或回合期限到時，伺服器公布答案；公布 3 秒後開始下一題。第五題後房間進入 `finished`。
- 你畫我猜設定預設為繪畫 60 秒、每人 1 輪、猜答案 30 秒；設定答案階段固定 30 秒，揭曉階段固定 3 秒。設定答案逾時會跳過該題；繪圖者可手動跳過或提早結束繪圖。
- 你畫我猜依開局玩家順序輪流繪圖，總題數為開局玩家數乘以每人輪數。每位猜中的玩家各得 50 分；同一題第一次有人猜中時繪圖者得 50 分。所有在線猜題玩家都猜中會提早揭曉，否則猜題時間到才揭曉。
- 繪圖筆畫以正規化座標分批透過 WebSocket 廣播給房內其他玩家，不回送給繪圖者，也不寫入房間狀態；重新連線不會重播或還原畫布。繪圖者在繪畫中斷線時仍保留本題，時間到後進入猜答案階段。
- Durable Object 的 alarm 負責推進回合與處理閒置期限；前端只呈現伺服器狀態。
- `worker/src/games/registry.ts` 將遊戲 ID 對應到獨立伺服器模組；共用房間流程透過模組介面啟動遊戲、分派操作、處理 alarm／離房及建立公開快照。
- `worker/src/games/draw-guess/` 與 `src/games/draw-guess/` 分別實作你畫我猜的伺服器規則與獨立 Vue 畫面；`worker/src/games/blank/` 則是沒有實際玩法的擴充測試模組。
- 結束時會清除本局的 `game` 狀態；準備下一局時會預選 `word-guess` 並清除 Ready，但保留每位玩家的 `score`。分數會跨不同遊戲累積，不會在開始新局時歸零。
- 房間資料目前以 `GameRoom` 的 Storage API 讀寫在單一 `room` key。`wrangler.jsonc` 將 Durable Object 設為 SQLite 類別，但目前程式沒有自行建立或查詢 SQL 資料表，也沒有 D1 或外部資料庫。
- 新房間資料使用 schema version 2；既有猜詞房間載入時會補上預設頭像、未 Ready 狀態與預設遊戲，保留仍有效的房間。

## 原始碼導覽

```text
src/
  App.vue                    首頁、共用房間大廳、遊戲選擇及房間操作
  main.ts                    Vue 應用程式入口
  style.css                  全域樣式與響應式版面
  composables/
    useGameRoom.ts           WebSocket、房間快照、重連與傳送操作
  games/
    registry.ts              遊戲 ID 到遊戲畫面元件的註冊表
    word-guess/              猜詞遊戲與結算 Vue 元件
    draw-guess/              你畫我猜設定、進行、Canvas 與結算 Vue 元件
    blank/                   空白測試遊戲與結算 Vue 元件
  services/
    api.ts                   建立／加入房間的 HTTP 請求與 WebSocket URL
    session.ts               房間連線憑證的 localStorage 讀寫

public/
  avatars/                   固定提供的 8 款 SVG 頭像

shared/
  avatars.ts                 頭像清單與 ID 驗證
  protocol.ts                前後端共用訊息、快照型別與格式檢查
  games/
    catalog.ts               房間上限、遊戲選項與各遊戲人數範圍
    index.ts                 遊戲狀態驗證與公開匯出
    types.ts                 公開遊戲狀態型別聯集
    word-guess.ts            猜詞遊戲公開狀態型別與驗證
    draw-guess.ts            你畫我猜設定與公開狀態型別、驗證
    blank.ts                 空白遊戲公開狀態型別與驗證

worker/src/
  index.ts                   Worker 入口、HTTP 路由、CORS 與建立／加入流程
  env.ts                     Worker bindings 型別
  security.ts                房間代碼、連線憑證產生與憑證雜湊
  rooms/
    GameRoom.ts              Durable Object、WebSocket、狀態保存與 alarm
    types.ts                 Durable Object 內部保存的房間與玩家型別
  games/
    registry.ts              遊戲 ID 到伺服器遊戲模組的註冊表
    types.ts                 遊戲模組介面與共用遊戲狀態聯集
    word-guess/              猜詞遊戲邏輯及獨立保存狀態型別
    draw-guess/              你畫我猜規則及獨立保存狀態型別
    blank/                   空白測試遊戲邏輯及獨立保存狀態型別

wrangler.jsonc                Worker、Durable Object binding 與 migration 設定
vite.config.ts                Vite 設定、前端 base path 與本機 API/WebSocket proxy
```

`App.vue` 管理首頁、房間大廳與共用操作；遊戲進行及結算畫面位於各自的 `src/games/<game-id>/` Vue 元件。操作房間連線的狀態與生命週期集中在 `useGameRoom.ts`。

## 本機開發

需求為 Node.js 22.12 以上。在專案根目錄安裝依賴，並以兩個終端機分別啟動 Worker 和前端：

```powershell
npm ci
```

```powershell
# 終端機一：本機 Cloudflare Worker
npm run worker:dev
```

```powershell
# 終端機二：Vite 前端
npm run dev
```

本機 Worker 位於 `http://127.0.0.1:8787`，前端位於 `http://localhost:5173`。`vite.config.ts` 會把 `/api` HTTP 與 WebSocket 請求代理到 Worker；本機 `VITE_API_URL` 可留白。Wrangler 本機 Durable Object 資料位於 `.wrangler/`。

建議用兩個不同的瀏覽器設定檔或一個一般視窗加一個無痕視窗測試兩位玩家，避免共用同一份 `localStorage` 連線憑證。

常用檢查命令：

```powershell
npm run build         # Vue TypeScript 檢查並建置前端
npm run worker:check  # 產生 Wrangler 型別並檢查 Worker TypeScript
```

目前 `package.json` 沒有 test 或 lint script；完成房間／遊戲變更後，除了執行上述檢查，也應以多個瀏覽器手動驗證建立、加入、選頭像、Ready、遊戲選擇、開始、作答或結束、重新載入重連及離開流程。你畫我猜另需驗證繪圖同步、多人猜中計分、跳過、每人多輪及繪圖者斷線。

## 設定與部署入口

- `.env.example` 列出前端建置變數。`VITE_API_URL` 是 Worker 的 origin，不要加 `/api`；`VITE_BASE_PATH` 是網站根路徑或 GitHub Pages 專案子路徑。
- Worker 的 `ALLOWED_ORIGINS` 在 `wrangler.jsonc` 設定，值為逗號分隔的完整 Origin（協定與主機，不含路徑）；必須包含正式前端的 Origin。
- GitHub Pages workflow 會在建置時使用 Actions Variables `VITE_API_URL` 與 `VITE_BASE_PATH`。目前 `.github/workflows/deploy-pages.yml` 在 push 到 `master` 時執行，也支援手動 `workflow_dispatch`；若部署分支不同，請同步調整 workflow 與部署文件。
- 帳號授權、Worker 部署、GitHub Pages 設定和自訂網域步驟請依 [`CLOUDFLARE_SETUP.md`](./CLOUDFLARE_SETUP.md) 操作。

## 修改功能時的建議順序

### 修改共用畫面或遊戲畫面

首頁、等待大廳及共用玩家名單在 `src/App.vue`；遊戲進行與結算畫面則修改對應的 `src/games/<game-id>/` 元件。共用樣式位於 `src/style.css`。若要新增房間操作或連線行為，避免只在元件內建立一套 WebSocket 狀態；沿用 `useGameRoom.ts` 和 `src/services/` 的分工。

### 新增房間操作或伺服器訊息

1. 在 `shared/protocol.ts` 更新 `ClientMessage`、`ServerMessage` 或公開快照型別，並同步調整相應的執行期格式檢查。
2. 房間共用操作在 `worker/src/rooms/GameRoom.ts` 驗證玩家身分與權限；遊戲操作則用 `game_action` 交給對應的遊戲模組處理。
3. 若是新增 HTTP endpoint，在 `worker/src/index.ts` 加入路由與輸入驗證，前端請求則放在 `src/services/api.ts`。
4. 在 `src/composables/useGameRoom.ts` 處理 WebSocket 訊息與連線生命週期，再由共用頁面或遊戲元件呈現結果。

### 調整或新增遊戲

每個遊戲的玩法與 Vue 畫面各自放在獨立資料夾。`GameRoom.ts` 僅處理共用房間規則、玩家權限、保存與廣播，不應加入針對遊戲 ID 的條件分支。

1. 在 `shared/games/catalog.ts` 加入唯一遊戲 ID、名稱、說明、最少及最多玩家數；最多玩家不可超過 `ROOM_CAPACITY`。在 `shared/games/<game-id>.ts` 定義公開狀態型別與執行期驗證，並將型別加入 `shared/games/types.ts`。
2. 建立 `worker/src/games/<game-id>/`，在 `types.ts` 定義遊戲保存狀態，在 `index.ts` 實作遊戲模組介面：啟動、`game_action` 操作、alarm、玩家離開、玩家狀態旗標與公開快照。
3. 將伺服器模組加入 `worker/src/games/registry.ts`。遊戲專屬計時、分數、操作授權及結束狀態都留在該模組。
4. 建立 `src/games/<game-id>/`，以獨立 `.vue` 元件實作進行中與結算畫面，透過 `game-action` 事件送出操作，再加入 `src/games/registry.ts`。
5. 執行 `npm run build` 和 `npm run worker:check`，並測試低於最少人數、符合範圍、超過最多人數及完整遊戲流程。

新增遊戲只需擴充共用遊戲目錄、公開／保存型別與兩個註冊表；共用房間 Durable Object 與 `App.vue` 不需要加入遊戲專屬分支。前端依遊戲註冊表載入各自的 Vue 元件，Worker 則依伺服器註冊表呼叫對應模組。

## 實作與規格的界線

- `gg_spec.md` 是產品與架構目標，不代表其中所有功能已完成。現況有猜詞派對與你畫我猜兩種可玩遊戲，以及一種只驗證啟動／結束流程的空白測試遊戲。
- 目前 Durable Object 以六碼公開房間代碼作為 `idFromName` 名稱；規格提到的獨立內部 UUID 尚未採用。
- 目前沒有玩家帳號或公開房間大廳；你畫我猜畫布只即時同步筆畫，不保存歷史，也不支援重連後重播。
- 連線憑證原文由 Worker 回傳並由瀏覽器保存；房間保存的是憑證雜湊。邀請連結只含房間代碼，不要將憑證放進 URL、日誌或公開快照。
