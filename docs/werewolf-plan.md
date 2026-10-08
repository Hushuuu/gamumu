# 狼人殺（werewolf）實作計畫

## 1. 目標與已確認的決策

在 GAMUMU 派對遊戲平台新增「狼人殺」，先做**基本版（經典劇本）**，架構上預留**多劇本**擴充。

| 項目 | 決策 |
| --- | --- |
| 法官 | 全自動：Durable Object 當法官，玩家各自用手機操作 |
| 討論 | 不做聊天；面對面／自備語音，App 只負責流程、夜間行動與投票 |
| 人數 | 6–12 人（`ROOM_CAPACITY` = 12） |
| 基本版角色 | 狼人、村民、預言家、女巫、獵人 |
| 勝負 | 房主可選屠城或屠邊；屠城時狼人殺光好人，屠邊時村民或神職其中一方全出局且好人出局總數至少達總好人數一半；好人殺光狼人時好人勝 |
| 計分 | 勝利陣營每位玩家 +100 分（沿用跨遊戲累積分數） |

### 預設規則（可於劇本規則旗標調整，若你不同意請告知）

- 狼人每晚各自選擇目標，取最高票；平票時在最高票中隨機；無人選擇＝空刀。不可自刀。
- 預言家每晚驗一人，只得知「好人／狼人」，不得知具體角色。
- 女巫解藥、毒藥各一瓶；同一晚不能兩瓶都用；解藥只有第一晚可自救。
- 獵人被狼人殺死或被投票放逐時可開槍帶走一人；被女巫毒死不能開槍。
- 白天投票：所有存活玩家投票或棄票；最高票放逐；**平票＝無人出局**。
- 玩家死亡**不公開角色**，遊戲結束才公開所有身分。
- 無警長、無遺言系統（遺言由玩家口頭進行）。

### 基本版人數配置（資料表驅動，可再平衡）

| 人數 | 狼人 | 村民 | 預言家 | 女巫 | 獵人 |
| --- | --- | --- | --- | --- | --- |
| 6 | 2 | 2 | 1 | 1 | 0 |
| 7 | 2 | 2 | 1 | 1 | 1 |
| 8 | 3 | 2 | 1 | 1 | 1 |
| 9 | 3 | 3 | 1 | 1 | 1 |
| 10 | 3 | 4 | 1 | 1 | 1 |
| 11 | 4 | 4 | 1 | 1 | 1 |
| 12 | 4 | 5 | 1 | 1 | 1 |

## 2. 現況分析（重點）

專案是 Vue 3 + Cloudflare Worker + `GameRoom` Durable Object。新增遊戲的既定流程（見 `DEVELOPMENT_GUIDE.md`）：
`shared/games/catalog.ts` 登錄 → `shared/games/<id>.ts` 契約 → `worker/src/games/<id>/` 規則模組 → `src/games/<id>/` Vue 畫面 → 前後端 registry。`GameRoom` 保持通用。

### 現有架構對狼人殺造成的缺口（需要小幅通用化修改）

| # | 缺口 | 原因 | 處理方式 |
| --- | --- | --- | --- |
| G1 | 私人資料不會隨狀態更新推送 | `GameModule.privateState()` 只在玩家 `authenticate`（連線／重連）時送出；`toView(room)` 沒有 `playerId`，所有人收到相同快照 | 在 `GameModule` 加**選用**欄位（例如 `pushPrivateState?: true`），`GameRoom.broadcastState()` 在狀態變更後對每位已連線玩家再送一次 `privateState`。未宣告的舊遊戲行為不變 |
| G2 | 結算畫面拿不到遊戲資料 | `App.vue` 的 `finished` 元件只收到 `players` | `App.vue` 額外傳入 `game`，並讓既有三個 Results 元件宣告選用 `game` prop（避免變成 DOM attribute） |
| G3 | 結束時 `room.game = null` | 既有遊戲結束就清掉狀態，狼人殺結算需要勝方與全員身分 | 狼人殺結束時**保留** `room.game`（`phase: 'finished'`）；`prepare_next_game` 本來就會清空，不需改共用流程 |
| G4 | `gameEvent` 只保留最新一筆 | `useGameRoom.ts` 以單一 ref 存放 | 私人事件每次都送**完整私人快照**（`private-state`），前端覆蓋即可，不需改 composable |

> `GameRoomContext.players` 只有 `id/score/online`，不含暱稱；狼人殺只用 `playerId`，暱稱由前端 `PlayerView` 對應，不需改。

## 3. 架構設計

### 3.1 資料夾與職責

```text
shared/games/
  catalog.ts              + { id:'werewolf', name:'狼人殺', icon:'🐺', min 6, max 12 }
  werewolf.ts             角色／劇本 metadata（UI 與伺服器共用）、設定、公開 GameView、私人快照型別、validators
  types.ts / index.ts     + WerewolfView、註冊 validator 與匯出

worker/src/games/werewolf/
  types.ts                StoredWerewolf（純 JSON，可序列化）
  index.ts                GameModule：通用階段機、alarm、投票、死亡結算、勝負判斷、privateState
  scripts/
    index.ts              劇本 registry（scriptId → ScriptDefinition）
    classic.ts            基本版劇本：人數配置表、夜間步驟順序、規則旗標
  roles/
    index.ts              角色 registry（roleId → RoleDefinition）
    werewolf.ts villager.ts seer.ts witch.ts hunter.ts

src/games/werewolf/
  WerewolfSetup.vue       房主設定（劇本、討論／投票秒數）
  WerewolfGame.vue        進行中畫面（依 phase 切換子面板）
  WerewolfResults.vue     勝負與全員身分揭曉
  components/             RoleCard（按住才顯示身分）、PlayerPicker、NightPanel、VotePanel 等
```

`GameRoom.ts`、`worker/src/index.ts` 不加入狼人殺專屬分支。

### 3.2 為「多劇本」預留的擴充點

- **`RoleDefinition`**（伺服器）：`id`、`camp`（`good`／`wolf`）、夜間行動的 `validate`／`apply`、`privateInfo`（該角色能看到什麼）、`onDeath` 掛鉤（獵人開槍）。
- **`ScriptDefinition`**：`id`、名稱說明、人數範圍、`roleSetup(playerCount) → RoleId[]`、`nightSteps: RoleId[][]`（同一步驟的角色同時行動）、規則旗標（平票處理、女巫自救、死亡是否公開身分…）及自訂 `checkWin`；`WerewolfSettings.winCondition` 選擇屠城或屠邊。
- 新增劇本＝新增 `scripts/<id>.ts` ＋（如有新角色）`roles/<role>.ts`，並在 shared metadata 與兩個 registry 各補一行；狀態機不需重寫。
- `RoleId` 與劇本清單放在 shared，UI 的設定頁與身分卡文字由 metadata 產生。
- 基本版只實作 5 個角色需要的掛鉤，不預先做守衛、丘比特、警長、白痴等，但介面形狀要能容納（例如第一晚專屬步驟、放逐前後掛鉤）。

### 3.3 階段機（伺服器權威）

```text
role-reveal  → night(step 1..n) → dawn → [hunter-shot] → day-discussion → vote → vote-result → [hunter-shot] → (勝負判斷) → night … / finished
```

| phase | 行為 | 期限／提早結束 |
| --- | --- | --- |
| `role-reveal` | 玩家查看自己的身分（按住顯示）；第一位進入前由伺服器隨機分配角色與座位 | 固定 10–15 秒 |
| `night` | 依劇本 `nightSteps` 逐步進行。基本版：步驟 1＝狼人選目標＋預言家驗人；步驟 2＝女巫決定救／毒 | **只等固定時間**，不提早結束，避免「誰死了／誰沒行動」的時間洩漏；死亡或不存在角色的步驟同樣等滿時間 |
| `dawn` | 公布昨夜死者（不含死因）；死者若為獵人則進入 `hunter-shot` | 數秒 |
| `hunter-shot` | 獵人選目標或放棄 | 固定秒數，逾時視為放棄 |
| `day-discussion` | 面對面討論，顯示倒數 | 設定秒數；房主可提早結束 |
| `vote` | 存活玩家投票／棄票，可改票直到結束 | 全員（存活且在線）投完可提早結束，否則時間到 |
| `vote-result` | 公開每個人的票與被放逐者（或平票） | 數秒 |
| `finished` | 公布勝方、全員身分、發放分數（`room.status = 'finished'`，`room.game` 保留） | — |

- 每次推進後都要判斷勝負：狼人全出局 → 好人勝；屠城時好人全出局 → 狼人勝；屠邊時村民或神職其中一方全出局且好人出局總數至少達總好人數一半 → 狼人勝。狼人數量大於好人時，仍會在進入投票前判定狼人獲勝。
- 所有 deadline 存在 `room.game`；`handleAlarm(room, now)` 用 `now` 判斷、可安全重試，一次處理所有到期事件。`handleAction` 遇到 action 抵達時 deadline 已過，先推進階段並回傳 `changed: true`，再拒絕過期操作。
- 斷線：玩家仍在名單，夜間行動逾時視為未行動、投票視為棄票。明確離房（`onPlayerLeave`）：該玩家視為死亡（不公開身分）、若持有待處理夜間目標則清除、再判斷勝負。開始後不可加入（既有行為）。

### 3.4 資訊可見性

| 資料 | 位置 |
| --- | --- |
| 真實角色、夜間行動、女巫藥水、預言家紀錄 | 只存在 `room.game`（伺服器），**不進入** `toView()` |
| 公開 `WerewolfView` | phase、天數、`phaseEndsAt`、座位順序、存活名單、昨夜死者、投票結果、`stateVersion`；`finished` 才附上全員身分與勝方 |
| 私人快照 `private-state`（`privateState()`，經 G1 推送） | 自己的角色與陣營；狼人看到隊友與隊友目前的選擇；預言家驗人結果歷史；女巫看到昨夜刀口與剩餘藥水；獵人是否可開槍；本步驟自己是否輪到行動與自己已選的目標；自己的投票 |
| `playerFlags` | 只在 `vote` 階段回傳 `answered`（已投票，公開資訊）；夜間一律 `false`，避免洩漏 |
| 前端夜間畫面 | 所有人都看到同樣的黑夜畫面；沒有夜間能力者顯示假等待，不洩漏角色 |

角色分配使用 `crypto.getRandomValues` 的 Fisher–Yates 洗牌。

### 3.5 Action 清單（皆走既有 `game_action`）

`night_wolf_target`、`night_seer_check`、`night_witch`（save／poison／skip）、`hunter_shoot`、`end_discussion`（房主）、`cast_vote`（目標或棄票）。每個 action 都在伺服器驗證：phase、存活、角色、步驟、目標合法（存活、非自己＝規則允許者）、重複送出（同步驟可改選直到步驟結束）。

## 4. 實作步驟（對應 todo）

1. **契約與登錄**：`catalog.ts`、`shared/games/werewolf.ts`（metadata、設定、View、私人快照、validators）、`types.ts`/`index.ts` 註冊。
2. **共用小幅修改**：`GameModule` 選用 `pushPrivateState`＋`GameRoom.broadcastState()` 推送私人狀態（G1）；`App.vue` 與 Results 元件傳遞 `game`（G2）。
3. **伺服器規則**：`worker/src/games/werewolf/` 的 types、roles、classic 劇本、`index.ts`；加入 `StoredGame` 聯集與 `registry.ts`。
4. **前端畫面**：Setup／Game／Results 與子元件，註冊到 `src/games/registry.ts`；夜間深色主題、按住顯示身分、座位圓桌／清單、倒數。
5. **文件**：更新 `DEVELOPMENT_GUIDE.md`（功能表、原始碼導覽、資訊可見性與私人推送說明、劇本擴充方式）。
6. **驗證**：`npm run build`、`npm run worker:check`；本機以 6 位玩家（可用一個 Node 腳本產生 5 個 WebSocket 機器人，僅本機用、不進 repo）跑完整流程。

## 5. 測試清單（專案目前沒有 test/lint script）

- 人數：5 人無法開局、6–12 人可開、超過 12 人不可加入；有人離線或未 Ready 無法開局。
- 各人數的角色配置正確、角色不外洩（檢查公開 `state` 訊息與其他玩家的私人事件中沒有他人角色）。
- 夜間：狼人平票／空刀、預言家驗人結果只給預言家、女巫解藥／毒藥限制、獵人被毒不能開槍、被殺能開槍。
- 白天：投票改票、棄票、平票無人出局、放逐獵人開槍、全員投完提早結束。
- 勝負：狼人全滅、好人全滅、同時在某步驟結束時的判斷順序；分數只給勝方且跨局保留。
- 恢復：各 phase 重新整理重連後仍能還原自己的私人資訊；DO 重建後 alarm 仍推進。
- 異常：錯誤 phase／角色／死亡玩家的 action、過期 action、重複 action、離房、房主離房、逾時未行動。
- 時間洩漏：死亡或無能力角色的夜間步驟時間與存活者一致。

## 6. 風險與注意事項

- **G1 是唯一會碰到共用房間流程的行為變更**，需確認不影響猜詞派對與你畫我猜（選用旗標、預設關閉）。
- 私人快照與公開快照是兩則訊息，可能有短暫版本差；兩者都帶 `stateVersion`，前端只採用不舊於公開快照的私人資料。
- 單一 alarm：夜間多步驟與白天各階段共用 `phaseEndsAt`，每次只回報下一個 deadline。
- 訊息上限 2,048 字元：所有 action payload 都很小（一個目標 ID），不受影響；私人快照由伺服器發送，不受入站限制。
- 6 人以下配置與各角色平衡為初版，之後可只改資料表。
- 未納入：文字聊天、警長、遺言計時、旁觀者、觀戰死亡玩家看全局身分、多局戰績（後續劇本或版本再評估）。

## 7. 待辦（狀態由 SQL 追蹤）

見 session `todos` 表：contract → shared-room-changes → server-module → frontend → docs → verify。
