# RoomManager 與管理 Dashboard 規格

狀態：規劃稿  
適用專案：GAMUMU

## 1. 目的與現況

新增房間索引、參與紀錄與管理 Dashboard，保留現有房間遊戲、WebSocket 與房間狀態流程。

本規格依照目前程式碼調整名詞與資料語意：

- 目前的房間物件是 `GameRoom` Durable Object，每個六碼房間代碼對應一個物件；Worker 透過 `GAME_ROOMS.idFromName(code)` 路由。
- `GameRoom` 已部署為 SQLite-backed Durable Object，房間狀態目前以 `ctx.storage.get/put('room')` 儲存。這不是獨立的 Workers KV namespace；管理刪除需清除該 DO 的房間狀態與 alarm。
- 玩家 ID 由 Worker 產生並存於 `StoredPlayer.id`；重連沿用同一 ID。IP 不是可靠的玩家識別碼。
- WebSocket 斷線會將玩家標記為離線，但玩家仍留在房間名單；只有明確離房、被踢出、房間結束等事件才會結束該次房間參與。因此 `left_at IS NULL` 不能直接當作目前 WebSocket 在線。
- 前端由 Vite 建置並部署至 GitHub Pages，目前是單一 Vue 入口，沒有 Vue Router；尚無 Dashboard 或管理員驗證。

以下將提案中的「ChatRoom」對應為專案現有的 `GameRoom`。

## 2. 範圍與責任

```text
瀏覽器 /dashboard/
        │
        ├── GET /api/admin/summary
        ├── GET /api/admin/rooms
        └── DELETE /api/admin/rooms/:roomId
                    │
                    ▼
              Cloudflare Worker
              ├── 驗證管理員身分、驗證輸入、協調刪除
              ├── ROOM_MANAGER：單一共用 RoomManager DO
              │                    └── SQLite：rooms、room_users
              └── GAME_ROOMS：依 roomId 對應 GameRoom DO
                                   └── 房間狀態、WebSocket、真實連線狀態
```

- `GameRoom` 是遊戲狀態與即時連線的權威來源；遊戲模組不負責寫 RoomManager 資料。
- `RoomManager` 是供 Dashboard 查詢的房間目錄與參與歷史，不保存遊戲狀態、不處理 WebSocket，也不接收每個遊戲操作。
- Worker 維持現有 HTTP/CORS 路由方式，新增管理 API 與 `ROOM_MANAGER` binding。建立及加入房間仍先由 Worker 呼叫對應的 `GameRoom`。
- 建立、加入、離開、房間關閉等生命週期事件才同步到 RoomManager；不得在每次遊戲動作或房間狀態廣播時寫入全域 DO。

## 3. RoomManager SQLite 資料模型

時間欄位一律使用 Unix epoch 毫秒（UTC）；前端負責轉換為本地時間。`room_id` 是玩家看到的六碼房間代碼。

```sql
CREATE TABLE rooms (
    room_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('creating', 'active', 'closed', 'deleting')),
    reservation_id TEXT,
    reservation_expires_at INTEGER,
    closed_at INTEGER,
    close_reason TEXT
);

CREATE TABLE room_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    ip TEXT,
    nickname TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    left_at INTEGER,
    UNIQUE (room_id, player_id)
);

CREATE INDEX idx_rooms_status_created
    ON rooms(status, created_at DESC);

CREATE INDEX idx_room_users_room_id
    ON room_users(room_id);

CREATE INDEX idx_room_users_joined_at
    ON room_users(joined_at);

CREATE INDEX idx_room_users_room_left_at
    ON room_users(room_id, left_at);
```

- `player_id` 使用現有 Worker 產生並傳給 `GameRoom` 的玩家 ID；同一位參與者重連仍使用同一個 ID。`UNIQUE (room_id, player_id)` 使參與紀錄可安全重試。
- `ip` 是加入時的 IP 紀錄，不是唯一識別碼。由 Worker 從可信任的 `CF-Connecting-IP` 取得並傳入，不接受請求 body 提供的 IP；缺值時允許為 `NULL`。
- `left_at IS NULL` 表示該玩家尚未明確離開該房間名單，不代表 WebSocket 仍連線。
- `history_count` 是成功建立／加入的參與人次，不是跨房間去重後的自然人數。
- 一般離房或閒置過期時，房間及參與紀錄標記為 `closed` 並保留供統計；管理員刪除則永久刪除該房間與其全部參與紀錄。
- `creating` 用於建立房間時預留代碼，避免已保留或仍有歷史資料的代碼被重用；未完成的預留須能逾時釋放。`deleting` 用於可重試的刪除流程。
- 多表寫入與刪除使用 SQLite-backed DO 的同步交易（例如 `transactionSync()`）；透過 SQL 綁定參數，不串接未驗證的輸入。

## 4. 房間生命週期

### 建立房間

1. Worker 產生房間代碼、`playerId`、房間建立操作 ID 及玩家 token；傳入的 IP 取自 Worker request header。
2. Worker 向 RoomManager 預留房間代碼。已存在（含歷史房間）的代碼視為衝突，Worker 依現有重試方式另產代碼。
3. Worker 呼叫對應 `GameRoom` 的建立流程；建立成功後，RoomManager 將房間設為 `active`，並新增房主的 `room_users` 紀錄。
4. `reservation_id` 讓預留、完成及取消操作可冪等；若 GameRoom 建立失敗，取消本次預留，不影響其他操作。

### 加入房間

1. Worker 維持現有暱稱驗證、`playerId`／token 產生及 GameRoom 加入流程。
2. 只有 GameRoom 回報加入成功後，才新增 RoomManager 參與紀錄；記錄 `player_id`、加入時 IP、正規化後暱稱與 `joined_at`。
3. 失敗或被拒絕的加入不得寫入歷史。重試使用相同參與者 ID 時不得重複新增資料。

### 離開、斷線及自然關閉

- 收到 `leave_room`、房主踢人或房間整體關閉時，更新對應參與紀錄的 `left_at`。
- WebSocket 短暫斷線只影響目前連線狀態，不設定 `left_at`；同一玩家重連不新增歷史紀錄。
- 最後一位玩家離房、房間閒置期限到達時，沿用現有 GameRoom 行為清除房間狀態／alarm，並通知 RoomManager 將房間標記為 `closed`，保存關閉時間與原因。
- GameRoom 是遊戲狀態權威來源，RoomManager 是統計投影；跨 DO 沒有共同交易。生命週期事件必須可重試且冪等；事件投遞失敗須有持久化待重試機制與錯誤紀錄，不可只用不可重試的 fire-and-forget 而靜默遺失。

## 5. 在線人數與統計定義

本專案的離線玩家仍留在 GameRoom 名單，因此不能使用以下查詢當作即時在線人數：

```sql
SELECT COUNT(*)
FROM room_users
WHERE left_at IS NULL;
```

該查詢只能代表「尚未離開房間名單的人數」。Dashboard 的定義如下：

| 統計 | 來源與定義 |
| --- | --- |
| 房間總數 | RoomManager 中 `active` 與 `closed` 的房間數；不包含建立預留及刪除中的資料 |
| 目前房間數 | `rooms.status = 'active'` |
| 在線人數 | Worker 取得活躍房間清單後，向各 GameRoom 查詢當下已驗證且仍開啟的 WebSocket，按 `playerId` 去重後加總 |
| 歷史人次 | `room_users` 紀錄總數；依房間列出時以 `room_id` 分組計數 |
| 房間名單人數（選用） | `left_at IS NULL` 的人數；UI 必須標示為名單人數，不得標示為在線人數 |

GameRoom 的內部統計介面應以目前 WebSocket attachment／連線為準，不直接信任持久化的 `player.online` 欄位作為即時連線數。若個別 GameRoom 查詢失敗，API 必須將該房間的在線數標示為無法取得並回報部分統計，不可回傳看似正常的 0。

## 6. 管理 API 與刪除

所有管理 API 必須先完成獨立的管理員授權，不能只依賴目前玩家使用的 beta session token。

| 方法與路徑 | 用途 |
| --- | --- |
| `GET /api/admin/summary` | 回傳房間數、活躍房間數、即時在線人數、歷史人次及統計時間 |
| `GET /api/admin/rooms?status=&limit=&cursor=` | 分頁列出房間；預設依 `created_at DESC`，回傳房間代碼、建立時間、狀態、即時在線人數及歷史人次 |
| `DELETE /api/admin/rooms/:roomId` | 完整關閉並刪除房間及其管理紀錄 |

刪除由 Worker 統一協調，不由前端直接呼叫兩個 Durable Object：

1. 驗證管理員、房間代碼格式與刪除確認。
2. RoomManager 將房間標記為 `deleting`，阻止新的生命週期事件覆寫刪除狀態。
3. Worker 呼叫該房間的 GameRoom 內部管理操作；GameRoom 關閉所有 WebSocket、清除 `room` 狀態及 alarm。該操作必須冪等；DO instance 本身不會被刪除，只會被清空。
4. GameRoom 成功後，RoomManager 在同一交易中刪除該房間的 `room_users` 與 `rooms` 紀錄。
5. 若任一步驟失敗，保留足以重試的 `deleting` 狀態並回傳明確錯誤；再次呼叫同一刪除操作應能完成，不可將部分刪除回報為成功。

Dashboard 刪除按鈕需顯示房間代碼及「刪除會一併永久刪除參與歷史」的確認。刪除 API 不回傳玩家 IP。

## 7. Dashboard 與前端路徑

- Dashboard 位於 `/dashboard/`，初版顯示摘要卡片與依建立時間排序的房間表格；表格欄位為房間代碼、建立時間、狀態、在線人數、歷史人次及刪除操作。
- 支援狀態篩選、分頁與手動重新整理；若在線統計有部分查詢失敗，需明確顯示資料不完整。
- 不在列表或一般摘要 API 顯示 IP、玩家 token、token hash 或其他憑證。
- 目前前端由 GitHub Pages 靜態託管且沒有 Vue Router。建議新增 Vite 多頁入口，輸出 `dist/dashboard/index.html`，讓 `/dashboard/` 可直接載入；需同時支援現有 `VITE_BASE_PATH`，專案型 GitHub Pages 的實際網址會包含 repository base path。
- 管理 API 仍呼叫現有 Worker API base URL。Worker 的 CORS allow methods 需加入 `DELETE`，並只允許設定中的前端 Origin。

## 8. 驗證與資料保護

- 管理 API 採 Cloudflare Access allowlist 或等效的伺服器端管理員驗證；不得將永久管理 token 編進 Vite bundle、提交至 Git 或只存在瀏覽器端判斷。
- 未授權的 summary、list、delete 請求均回傳 `401` 或 `403`；beta 玩家憑證不能取得管理權限。
- IP 是敏感的連線資料：只在確有需要時保存原始 IP，不在 Dashboard 輸出；上線前必須設定原始 IP 的保留期限，到期後清除 IP 欄位，但可依政策保留匿名化統計。
- 對管理 API 使用嚴格輸入驗證、參數化 SQL、`Cache-Control: no-store` 及適當的請求頻率限制。刪除成功／失敗與管理員識別資訊可另規劃稽核紀錄。

## 9. 部署與相容性

- 在 `worker/src/env.ts` 新增 `ROOM_MANAGER` binding 型別；在 `wrangler.jsonc` 加入 `RoomManager` binding。
- `wrangler.jsonc` 目前已有 `v1` SQLite class migration。新增 `RoomManager` 時追加新的 migration tag（例如 `v2`，`new_sqlite_classes: ["RoomManager"]`），不可改寫已部署的 `v1`。
- RoomManager 使用 `ctx.storage.sql` 管理上述 SQLite schema；表結構更新使用應用程式 schema version／migration，不要把新資料存入前端或外部 Workers KV。
- RoomManager 是單一共用 DO，所有管理寫入由同一個 instance 序列處理。此設計適合目前 beta 規模；只寫生命週期事件並分頁查詢，持續觀察延遲、請求量與儲存量。若成為熱點，再評估分片與統計彙總。
- Durable Object namespace 無法列舉所有既有 GameRoom instance，因此上線前已存在但未登錄的房間無法自動回填。初版需明確採用「從功能上線後的新房間開始完整統計」的切換範圍；舊房間仍可依現有流程運作，但不保證出現在 Dashboard。

## 10. 驗收條件

1. 建立房間後，Dashboard 有一筆 `active` 房間資料及房主參與紀錄；建立衝突或失敗不留下有效房間紀錄。
2. 成功加入才增加一筆歷史人次；加入失敗不增加紀錄；同一生命週期事件重試不產生重複列。
3. 玩家 WebSocket 斷線時，`left_at` 保持 `NULL`，但即時在線人數減少；重連使用原 `playerId`，歷史人次不增加。
4. 明確離房、被踢出、最後玩家離開及閒置過期都正確更新離開／關閉資料。
5. 房間列表依建立時間新到舊排序，歷史人次正確；即時在線數由 GameRoom 取得，個別查詢失敗可見且不偽裝成 0。
6. 未授權或只有 beta session 的用戶不能讀取管理統計或刪除房間。
7. 刪除房間會關閉連線、清除 GameRoom 狀態與 alarm、移除 RoomManager 房間及參與資料；重試刪除可安全完成。
8. `/dashboard/` 可在本機 Vite 與 GitHub Pages base path 下直接載入；現有建立房間、加入、WebSocket 與遊戲流程不受影響。

## 11. 參考

- `worker/src/index.ts`：Worker 路由、房間建立／加入與 CORS。
- `worker/src/rooms/GameRoom.ts`：房間狀態、WebSocket、離房及閒置期限。
- `worker/src/rooms/types.ts`：持久化房間與玩家型別。
- `wrangler.jsonc`：Durable Object bindings 與既有 SQLite migration。
- `DEVELOPMENT_GUIDE.md`、`CLOUDFLARE_SETUP.md`：目前架構及部署方式。
- [Cloudflare SQLite-backed Durable Object Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
