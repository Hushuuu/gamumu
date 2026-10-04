# GAMUMU 專案架構與開發指南

> 本文件說明目前程式碼已實作的功能、模組分工與日常開發方式。產品目標與完整需求請參考 [`gg_spec.md`](./gg_spec.md)；Cloudflare、GitHub Pages、網域與 DNS 設定請參考 [`CLOUDFLARE_SETUP.md`](./CLOUDFLARE_SETUP.md)。

## 目前功能

| 功能           | 目前行為                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 建立／加入房間 | 不需帳號；玩家輸入 1–20 個字元的暱稱，建立房間或輸入六碼房間代碼加入。                                                                          |
| 邀請玩家       | 房間頁預設複製含 `?room=房間代碼` 的連結且不含玩家憑證；首次訪客可加上 `&beta=封測碼`（亦接受 `betaCode`），系統會自動驗證並詢問暱稱後加入。封測碼會在讀取後立即從網址移除，但分享該連結等同分享封測碼，請只傳給受邀者。 |
| 頭像           | 提供 8 款內建 SVG 頭像；玩家進房後可選擇或更換，房間內即時同步。                                                                                |
| 房間等待       | 即時顯示玩家、在線狀態、Ready 狀態與房主；房間最多 12 人，依所選遊戲的人數範圍與全員在線 Ready 狀態判斷能否開始。只有房主可選擇遊戲與開始；規則說明按鈕依遊戲及劇本顯示玩法。 |
| 房主管理       | 等待房間時，房主可以將其他玩家移出房間；房主不能移除自己。                                                                                      |
| 猜詞派對       | 2–12 人；共 5 題，每題 20 秒；每位玩家每題只能回答一次，答對加 100 分。所有玩家都作答後會提早公布答案，否則時間到後公布；公布階段持續 3 秒。    |
| 你畫我猜       | 2–12 人；房主可設定繪畫 15–180 秒、每人 1–5 輪、猜答案 10–120 秒。繪圖者可跳過或提早完成；每位猜中者及該題繪圖者各得 50 分。           |
| 拉密           | 2–4 人；每人起手 14 張，首次登錄至少 30 分；之後可重排桌面牌組，最先出清手牌者獲勝。Joker 留在手牌算 30 分；限時模式會在手牌區顯示本回合倒數進度，時間到時合法的桌面草稿會自動出牌，否則抽牌或跳過。個人設定可調 Hit 音效音量及切換牌面主題，會套用於自己畫面上的手牌與桌面所有牌。 |
| 狼人殺         | 6–12 人（依劇本：經典劇本 6–12 人，狼王守衛版 10–12 人）；全自動伺服器法官，不含文字聊天（面對面／語音討論）。基本版「經典劇本」角色為狼人、村民、預言家、女巫、獵人；可選「狼王守衛版」（12 人：3 狼人＋狼王＋4 村民＋預言家／女巫／獵人／守衛；11 人少 1 村民；10 人再少 1 狼人）；屠城制，勝方每位玩家 +100 分。房主可設定自由討論 30–600 秒（或改為輪流發言：每天隨機安排存活玩家依序發言，每人 10–180 秒，發言者可提早結束）、投票 15–180 秒、夜間每步驟 10–60 秒、結果公告 5–60 秒。設定會於有效變更時自動套用，並重設所有人的準備狀態。僅本機開發模式可讓房主自選自己的角色，其餘玩家仍隨機分配。 |
| 空白測試遊戲   | 1–12 人；可由房主選擇並啟動，顯示擴充測試畫面；房主可結束遊戲以驗證結算流程，目前沒有實際玩法。                                               |
| 多局與結算     | 遊戲結束後房主可準備下一局；預選上一局的遊戲並保留該遊戲設定，Ready 與本局狀態清除，玩家分數跨局累積保留。                                                  |
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

### Worker、Durable Object 與遊戲模組的邊界

- **Worker (`worker/src/index.ts`) 是入口與路由器**：處理 CORS、HTTP method、房間代碼與暱稱等共用輸入；建立／加入房間時產生玩家憑證；WebSocket 請求則轉送給房間 Durable Object。Worker 不持有房間遊戲狀態，也不應依遊戲 ID 寫分支或計分。
- **`GameRoom` Durable Object 是單一房間的權威狀態管理者**：Worker 以 `GAME_ROOMS.idFromName(code)` 取得對應物件；同一房間的驗證後 WebSocket 操作、玩家清單、權限、狀態快照、保存與 alarm 都由這個物件協調。房主權限、Ready、人數範圍、共用房間期限等規則留在這裡。
- **遊戲模組是被 `GameRoom` 呼叫的規則單元**：`worker/src/games/<game-id>/` 不建立另一個 Durable Object，不管理 WebSocket，也不直接呼叫 Storage API；它只依傳入的 `GameRoomContext` 驗證遊戲操作、變更遊戲／分數狀態，並回傳結果。

`GameRoom` 以 `ctx.acceptWebSocket()` 接受可休眠的 WebSocket；Durable Object 閒置後可能被回收並重新建立，因此不能把遊戲真實狀態只放在模組全域變數、計時器 closure 或記憶體快取。持久狀態由 `GameRoom` 從 Storage API 還原，WebSocket 身分則由共用程式保存於 socket attachment。Cloudflare 的 Durable Object 是按房間分區的協調單位，不代表可以信任用戶端：每個 action 仍須在伺服器驗證身分、階段、操作者與 payload。

一次遊戲操作的共用流程如下：

```text
Client game_action
  → Worker 將 WebSocket 訊息交給該房間的 GameRoom
  → GameRoom 驗證連線身分、所選遊戲 ID 與 playing 狀態
  → 對應的 GameModule.handleAction() 驗證 phase、操作者與玩法並回傳結果
  → changed=true 時由 GameRoom 保存 room、重排 alarm 並廣播公開 state
  → 有 event 時由 GameRoom 私訊操作者，或廣播給其他房間玩家
```

`GameActionResult.changed` 是遊戲模組與共用房間之間的保存契約：凡是改變已保存狀態（例如階段、分數、已作答名單），必須回傳 `changed: true`，讓 `GameRoom` 保存並廣播；純即時筆畫或只回覆該玩家的提示則可保持 `changed: false`，避免把暫時事件當作房間狀態保存。`event.audience: 'room'` 會送給房內其他玩家但排除發送者；未指定 audience 時則回覆操作者。遊戲模組不要自行 broadcast，否則容易繞過共用權限或把私人資料送給全房。

### Durable Object 的保存與 alarm 設計

- 本專案將完整房間物件放在 DO Storage API 的 `room` key；`GameRoom.persist()` 寫入後也會統一重排 alarm。遊戲自己的可恢復資料放在 `room.game`，本局設定放在 `room.gameSettings`。狀態應是可還原的資料，不要放 WebSocket、Canvas、DOM 元素或 timer handle；若使用 `Map`／`Set` 等集合型別，先確認 Storage API 的序列化行為與讀回後的型別。
- 每個 Durable Object 一次只有一個 alarm。本專案由 `GameRoom.scheduleAlarm()` 取「房間閒置期限」與目前遊戲 `nextAlarmAt()` 的較早時間；遊戲模組只回報自己的下一個 deadline，不能自行呼叫 `setAlarm()`，也不要用 `setTimeout`／`setInterval` 推進伺服器回合。
- 遊戲將期限（例如 `phaseEndsAt`）存入 `room.game`；`nextAlarmAt()` 回傳下一個期限，`handleAlarm(room, now)` 在期限到達時推進階段並回傳是否有狀態變更。改變後由 `GameRoom` 保存、廣播並安排下一個 alarm。
- Alarm 不應被當成精確到毫秒的前端倒數：它可能晚於 deadline 執行，也可能因執行失敗而重試。用傳入的 `now` 與已保存的 deadline 判斷是否逾時，讓 `handleAlarm()` 可安全重試；若遊戲有多個計時事件，將 deadlines 存在遊戲狀態，回報最早的一個，並在一次 `handleAlarm()` 處理所有已到期事件。
- 斷線不等於離房：WebSocket close 會把玩家標記為 `online: false` 並保留在名單中；遊戲進行中，明確送出 `leave_room` 才會移除玩家並呼叫遊戲模組的 `onPlayerLeave()`（房主的踢人操作只允許在等待階段）。規劃規則時要分別決定玩家離線、明確離房和重新連線時的行為。

更多 Durable Object 細節請參考 Cloudflare 官方文件：[設計 Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)、[Hibernatable WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) 與 [Alarms API](https://developers.cloudflare.com/durable-objects/api/alarms/)。

猜詞答案及你畫我猜答案在猜題階段都不會放進公開快照；你畫我猜的答案只會以私人 `answer-prompt` 事件傳給繪圖者，進入 `reveal` 後才公開。拉密手牌只透過私人狀態傳給本人，不放進公開快照。分數、玩家是否已作答及回合切換也都由伺服器決定。

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
- 拉密使用 106 張數字牌與 2 張 Joker，每人起手 14 張。Worker 驗證 Group／Run、30 分初次登錄、桌面牌完整重排與 Joker 代表牌合法性；限時回合會重新驗證最後同步的草稿，合法且有出牌時自動確認，否則抽牌或跳過。勝負與剩餘牌值計分皆由伺服器決定。
- 狼人殺流程為 `role-reveal → night（依劇本步驟）→ dawn → [hunter-shot] → day-discussion → vote → vote-result → … → finished`。夜間各步驟固定等滿設定秒數、不提早結束，避免以時間洩漏誰有能力或誰已死亡；輪流發言時每天重新隨機排序存活玩家，發言者或房主可用 `end_speech` 結束目前發言，房主仍可提早進入投票；平票無人出局；玩家明確離房視為死亡（不公開身分）；分配角色使用 `crypto.getRandomValues` 洗牌。真實角色、夜間選擇與女巫藥水只存在 `room.game`；公開快照只提供已發生的公開階段紀錄，夜間只顯示死亡或平安夜，投票依目標彙整，未確認的投票選擇只透過私人 `private-state` 傳送；結算階段才附上全員身分與勝方。狼人殺結束時保留 `room.game`（`phase: 'finished'`）供結算畫面使用，`prepare_next_game` 才會清除。
- 繪圖筆畫以正規化座標分批透過 WebSocket 廣播給房內其他玩家，不回送給繪圖者，也不寫入房間狀態；重新連線不會重播或還原畫布。繪圖者在繪畫中斷線時仍保留本題，時間到後進入猜答案階段。
- Durable Object 的單一 alarm 負責推進遊戲階段與處理閒置期限；前端只呈現伺服器期限，不自行裁決遊戲結果。
- `worker/src/games/registry.ts` 將遊戲 ID 對應到獨立伺服器模組；共用房間流程透過模組介面啟動遊戲、分派操作、處理 alarm／離房及建立公開快照。
- `worker/src/games/draw-guess/` 與 `src/games/draw-guess/` 分別實作你畫我猜的伺服器規則與獨立 Vue 畫面；`worker/src/games/blank/` 則是沒有實際玩法的擴充測試模組。
- 結束時（狼人殺與拉密除外，見上）會清除本局的 `game` 狀態；準備下一局時會預選 `word-guess` 並清除 Ready，但保留每位玩家的 `score`。分數會跨不同遊戲累積，不會在開始新局時歸零。
- 房間資料目前以 `GameRoom` 的 Storage API 讀寫在單一 `room` key。`wrangler.jsonc` 將 Durable Object 設為 SQLite 類別，但目前程式沒有自行建立或查詢 SQL 資料表，也沒有 D1 或外部資料庫。
- 新房間資料使用 schema version 2；既有猜詞房間載入時會補上預設頭像、未 Ready 狀態與預設遊戲，保留仍有效的房間。

## 原始碼導覽

```text
src/
  App.vue                    首頁、共用房間大廳、遊戲選擇及房間操作
  main.ts                    Vue 應用程式入口
  style.css                  全域基礎與跨元件共用樣式
  composables/
    useGameRoom.ts           WebSocket、房間快照、重連與傳送操作
  games/
    registry.ts              遊戲 ID 到遊戲畫面元件的註冊表
    word-guess/              猜詞遊戲與結算 Vue 元件
    draw-guess/              你畫我猜設定、進行、Canvas 與結算 Vue 元件
    rummikub/                拉密牌桌、私人手牌與結算 Vue 元件
    werewolf/                狼人殺設定、進行、結算 Vue 元件與 components/（身分卡、目標選擇）
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
    rummikub.ts              拉密牌面、公開／私人狀態與合法組合驗證
    werewolf.ts              狼人殺角色／劇本 metadata、設定、公開與私人狀態型別、驗證
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
    rummikub/                拉密規則及獨立保存狀態型別
    werewolf/                狼人殺階段機（index.ts）、roles/ 角色定義、scripts/ 劇本定義
    blank/                   空白測試遊戲邏輯及獨立保存狀態型別

scripts/
  dev-bots.mjs               本機測試用機器人（加入房間、自動 Ready、自動玩狼人殺）

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

`npm run worker:dev` 僅在本機 Worker 注入 `ENABLE_DEV_ROLE_SELECTION=true`；搭配 `npm run dev` 時，房主可在狼人殺開始前自選自己要測試的身分。正式部署不會傳入此變數，Worker 會拒絕自選角色操作。

建議用兩個不同的瀏覽器設定檔或一個一般視窗加一個無痕視窗測試兩位玩家，避免共用同一份 `localStorage` 連線憑證。

常用檢查命令：

```powershell
npm run build         # Vue TypeScript 檢查並建置前端
npm run worker:check  # 產生 Wrangler 型別並檢查 Worker TypeScript
```

目前 `package.json` 沒有 test 或 lint script。多人測試技巧：開發模式（`npm run dev`）的房間憑證存在 `sessionStorage`，同一個瀏覽器的每個分頁都是獨立玩家；設定環境變數 `BETA_CODE` 後，再用 `npm run dev:bots -- <房間代碼> [數量]`（`scripts/dev-bots.mjs`）讓機器人加入房間、自動 Ready 並自動遊玩狼人殺，就能只開一個分頁測試完整流程（Ctrl+C 讓機器人離房）。完成房間／遊戲變更後，除了執行上述檢查，也應以多個瀏覽器手動驗證建立、加入、選頭像、Ready、遊戲選擇、開始、作答或結束、重新載入重連及離開流程。你畫我猜另需驗證繪圖同步、多人猜中計分、跳過、每人多輪及繪圖者斷線。狼人殺另需驗證 6–12 人（狼王守衛版 10–12 人）的角色配置、夜間行動限制（含守衛限制、同守同救）、獵人開槍、平票、投票逾時採用已選目標／未選視為棄票、公告時間設定、勝負與分數，以及私人身分不外洩。

## 設定與部署入口

- `.env.example` 列出前端建置變數。`VITE_API_URL` 是 Worker 的 origin，不要加 `/api`；`VITE_BASE_PATH` 是網站根路徑或 GitHub Pages 專案子路徑。
- Worker 的 `ALLOWED_ORIGINS` 在 `wrangler.jsonc` 設定，值為逗號分隔的完整 Origin（協定與主機，不含路徑）；必須包含正式前端的 Origin。
- 封測碼與 session 簽章密鑰分別放在 Worker Secrets `BETA_CODES`、`BETA_SESSION_SECRET`；本機使用被 Git 忽略的 `.dev.vars`。前端只暫存 6 小時通行憑證，Worker 會驗證建立房間、加入房間與 WebSocket 連線。
- GitHub Pages workflow 會在建置時使用 Actions Variables `VITE_API_URL` 與 `VITE_BASE_PATH`。目前 `.github/workflows/deploy-pages.yml` 在 push 到 `master` 時執行，也支援手動 `workflow_dispatch`；若部署分支不同，請同步調整 workflow 與部署文件。
- 帳號授權、Worker 部署、GitHub Pages 設定和自訂網域步驟請依 [`CLOUDFLARE_SETUP.md`](./CLOUDFLARE_SETUP.md) 操作。

## 修改功能時的建議順序

### 修改共用畫面或遊戲畫面

首頁、等待大廳及共用玩家名單在 `src/App.vue`；遊戲進行與結算畫面則修改對應的 `src/games/<game-id>/` 元件。元件專屬樣式放在該 Vue SFC 的 `<style scoped>`；全域基礎與跨元件共用樣式放在 `src/style.css`。若要新增房間操作或連線行為，避免只在元件內建立一套 WebSocket 狀態；沿用 `useGameRoom.ts` 和 `src/services/` 的分工。

### 新增房間操作或伺服器訊息

1. 在 `shared/protocol.ts` 更新 `ClientMessage`、`ServerMessage` 或公開快照型別，並同步調整相應的執行期格式檢查。
2. 房間共用操作在 `worker/src/rooms/GameRoom.ts` 驗證玩家身分與權限；遊戲操作則用 `game_action` 交給對應的遊戲模組處理。共用房間操作可處理室長取消進行中的本局，並在取消時回復開局分數、清除遊戲狀態、取消遊戲選擇確認及通知其他玩家。
3. 若是新增 HTTP endpoint，在 `worker/src/index.ts` 加入路由與輸入驗證，前端請求則放在 `src/services/api.ts`。
4. 在 `src/composables/useGameRoom.ts` 處理 WebSocket 訊息與連線生命週期，再由共用頁面或遊戲元件呈現結果。

### 調整或新增遊戲

每個遊戲的玩法與 Vue 畫面各自放在獨立資料夾。`GameRoom.ts` 僅處理共用房間規則、玩家權限、保存與廣播，不應加入針對遊戲 ID 的條件分支；Worker 也不應新增只服務某一遊戲的路由。只有當行為真的適用所有遊戲（例如新的共用房間權限或共用訊息）時，才修改共用流程。

#### 開始寫程式前先定義規則

先列清楚遊戲規則，再決定 state 和 action。至少回答：

- **人數與參與者**：最少／最多人數；開始後加入是否禁止；玩家離線、明確離房及重新連線各會如何影響目前回合。
- **階段與操作**：有哪些 phase、誰能在各階段操作、合法轉移是什麼；玩家連點、重送、送錯階段或逾時時伺服器要如何回應。
- **時間與結果**：哪些階段有期限、逾時如何推進、誰得分、多人同時達成條件如何計分、何時提早結束、何時整局結束。
- **資訊可見性**：哪些資料是所有人可見、只有個別玩家可見、只用來即時動畫且不用保存。秘密答案、隱藏角色或未公開選項不能放進公開 `GameView`。
- **恢復方式**：DO 被休眠／重新建立或玩家重連後，哪些資訊需要還原；只要規則要求恢復，就必須放進持久狀態，而不能只留在瀏覽器或 Worker 記憶體。

用下表決定資料應放在哪個介面：

| 資料類型 | 本專案放置位置 | 用途與限制 |
| --- | --- | --- |
| 伺服器權威狀態 | `room.game`，型別加入 `StoredGame` | 回合、phase、答案、分數判定依據；只由伺服器規則變更，不直接整份回傳給前端。 |
| 公開即時狀態 | `GameView` 與 `toView()` | 顯示給整個房間；只輸出 UI 必需資料，移除答案、私有選擇等秘密。 |
| 本局設定 | `room.gameSettings`、`publicSettings()` | 等待階段供玩家查看；由模組驗證設定值，開始後不可再改。 |
| 玩家私人資料 | `privateState(room, playerId)` | 玩家驗證／重連後，只送給該玩家，例如繪圖者自己的題目或拉密手牌。若模組宣告 `pushPrivateState: true`，每次 `broadcastState()` 後也會重送給每位已連線玩家（狼人殺與拉密使用；狼人殺以 `stateVersion` 對齊私人與公開快照）。 |
| 暫時即時事件 | `GameActionResult.event` | 動畫、筆畫或私人操作回饋；明確指定接收者，不會因 `changed: false` 被保存或重播。 |

#### Worker 與遊戲模組的實作流程

1. **登錄遊戲選項**：在 `shared/games/catalog.ts` 加入唯一 `GameId`、名稱、說明與最少／最多人數（不得超過 `ROOM_CAPACITY`）。
2. **定義前後端契約**：在 `shared/games/<game-id>.ts` 定義設定、公開 `GameView`、phase 型別與 runtime validator；將新型別加入 `shared/games/types.ts`，並在 `shared/games/index.ts` 匯出及註冊 validator。只有通用 WebSocket 封包或房間快照形狀改變時才修改 `shared/protocol.ts`；個別 action 通常使用既有的 `game_action { gameId, action, payload }`，不必為每種遊戲操作增加新的頂層訊息。
3. **建立伺服器模組**：在 `worker/src/games/<game-id>/types.ts` 定義可序列化的 `Stored<...>` 狀態，在 `index.ts` 實作 `GameModule`。將伺服器狀態型別加入 `worker/src/games/types.ts` 的 `StoredGame` 聯集，再把模組加入 `worker/src/games/registry.ts`。
4. **把規則放在正確的 callback**：`defaultSettings()` 提供預設；`configure()` 驗證並保存等待階段設定；`publicSettings()` 只公開安全設定；`start()` 初始化本局；`handleAction()` 驗證 phase、玩家身分、輸入與分數；`nextAlarmAt()`／`handleAlarm()` 處理期限；`onPlayerLeave()` 處理明確離房；`privateState()`、`playerFlags()`、`toView()` 分別提供個人狀態、共用玩家旗標與公開快照。
5. **讓共用 DO 處理共用工作**：設定操作使用既有 `configure_game`，由 `GameRoom` 檢查房主與 `waiting` 狀態後呼叫模組；若設定有變更，房間會清除 Ready、保存並廣播。開始遊戲時，`GameRoom` 先檢查遊戲人數及全員在線 Ready，再呼叫模組的 `start()`。遊戲中的所有 payload 都要由 `handleAction()` 再驗證，不能只靠 Vue 的 `disabled` 屬性。
6. **建立獨立前端資料夾**：在 `src/games/<game-id>/` 放置設定（若需要）、進行中與結算 `.vue` 元件；在 `src/games/registry.ts` 註冊元件。沿用 `useGameRoom.ts` 管理 WebSocket，畫面以 `game-action` 送出 action，接收 `GameView`／`gameEvent` 呈現結果，不直接連接 Durable Object。遊戲設定元件透過 `configure-game` 事件送出設定。

#### GameModule 回傳結果時的注意事項

- `handleAction()` 收到已解析的 payload 與伺服器傳入的 `now`；必須再次驗證 action 名稱、資料型別與長度、當前 phase、操作玩家及重複操作。若 action 抵達時 deadline 已過但 alarm 尚未執行，先依遊戲規則處理逾時；遊戲可重新驗證並提交已保存的合法候選操作，否則推進逾時結果並拒絕過期 action。不要接受 client 指定的分數、勝負、目前玩家或 deadline。
- 修改 `room.game`、玩家分數或其他持久資料時回傳 `changed: true`；只送暫時事件時回傳 `changed: false`。錯誤使用 `ok: false` 與明確 `code`／`message`，不要把錯誤偽裝成成功。
- `toView()` 只建立公開投影，不要回傳整個 `StoredGame`；在 `shared/games/index.ts` 的 validator 也要拒絕格式錯誤的伺服器快照，避免前端收到不完整狀態。
- WebSocket 入站訊息目前限制為 JavaScript 字串長度 2,048。大量資料應分批傳送並在伺服器驗證每批上限；不要透過一個遊戲 action 傳整張圖片、整份聊天紀錄或任意大物件。
- 只要改動 `StoredRoom` 共用持久格式，就要檢查 `worker/src/rooms/GameRoom.ts` 的初始化／legacy migration 與 `schemaVersion`；單純新增一種遊戲狀態時，先確認不需要破壞既有房間資料，不要無故改 schema。

#### 測試新遊戲的清單

執行 `npm run build` 和 `npm run worker:check`，再逐項驗證：

- 低於最少人數、符合人數範圍、超過最多人數，以及有玩家離線或尚未 Ready 時無法開局。
- 非房主設定、非法設定、錯誤 `gameId`、非法 payload、非當前操作者操作、重複操作及錯誤 phase 操作都會被伺服器拒絕。
- 正常完整流程、提早結束、各階段逾時、連續／重送 action、alarm 重試，以及遊戲結束後開下一局並確認分數保留。
- 玩家在每個重要 phase 斷線後重連、明確離房、房主離開、私人資料不外洩；若有即時事件，確認收件人正確且沒有意外保存／重播。
- 拉密另需驗證 2–4 人發牌、30 分初次登錄、牌組重排後的完整合法性、Joker 改變代表牌後仍可合法重排、合法草稿在逾時時自動出牌、不合法草稿逾時時抽牌或跳過，以及牌堆耗盡計分。

結算元件除了 `players` 外也會收到 `game`（房間結束時保留的公開 `GameView`，多數遊戲為 `null`）；需要使用時請在元件宣告對應 prop。

#### 新增狼人殺劇本或角色

- 新劇本：在 `worker/src/games/werewolf/scripts/` 新增 `<script-id>.ts`（人數配置表、`nightSteps`、勝負判斷），加入 `scripts/index.ts`，並在 `shared/games/werewolf.ts` 的 `WEREWOLF_SCRIPTS` 補上 metadata。
- 新角色：在 `roles/` 新增 `<role>.ts`（陣營、夜間行動、私人資訊掛鉤），加入 `roles/index.ts`，並在 `shared/games/werewolf.ts` 的 `WEREWOLF_ROLES` 補上 metadata；前端 `WerewolfGame.vue` 需為新的夜間行動增加對應面板。
- 劇本的人數範圍以 `WEREWOLF_SCRIPTS` 的 `minPlayers/maxPlayers` 為準，前後端透過 `shared/games` 的 `getPlayerRange(gameId, settings)` 取得（`GameRoom.handleStartGame` 與 `App.vue` 都使用），不要直接讀 catalog 的人數。
- 「狼王守衛版」（`scripts/wolfGuard.ts`，共用邏輯在 `scripts/common.ts`）：狼王（`roles/wolfKing.ts`）屬狼陣營、與狼人共用 `wolf_target` 襲擊，被狼人殺死或被放逐時可開槍（被毒或被獵人擊殺不能）；守衛（`roles/guard.ts`）每晚可守一人（可自守、可空守），不能連續兩晚守同一人，被守者與女巫解藥同晚作用於同一人時仍會死亡（同守同救）。夜間步驟為 `[[werewolf, wolfKing, seer, guard], [witch]]`。
- 階段機（`index.ts`）不需為個別劇本重寫；每個劇本或角色仍須遵守「真實身分不進 `toView()`」及「夜間步驟時間固定」的原則。

可先參考 `worker/src/games/word-guess/` 的簡單限時猜答、`worker/src/games/draw-guess/` 的設定／多階段流程／私人狀態／暫時房間事件與離線政策，以及 `worker/src/games/blank/` 的最小遊戲模組。新增遊戲只需擴充共用目錄、公開／保存型別與前後端兩個 registry；共用 Worker、`GameRoom` Durable Object 與 `App.vue` 不應加入遊戲專屬分支。

## 實作與規格的界線

- `gg_spec.md` 是產品與架構目標，不代表其中所有功能已完成。現況有猜詞派對、你畫我猜、拉密與狼人殺（經典版與狼王守衛版）四種可玩遊戲，以及一種只驗證啟動／結束流程的空白測試遊戲。
- 目前 Durable Object 以六碼公開房間代碼作為 `idFromName` 名稱；規格提到的獨立內部 UUID 尚未採用。
- 目前沒有玩家帳號或公開房間大廳；你畫我猜畫布只即時同步筆畫，不保存歷史，也不支援重連後重播。
- 連線憑證原文由 Worker 回傳並由瀏覽器保存；房間保存的是憑證雜湊。邀請連結只含房間代碼，不要將憑證放進 URL、日誌或公開快照。
