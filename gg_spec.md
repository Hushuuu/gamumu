Party Game Web 規格書
==================

> 本規格定義一個以手機瀏覽器為主要使用情境的多人 Party Game Web 應用程式。前端採 Static Web Hosting，遊戲房間與即時同步由 Cloudflare Workers + Durable Objects 提供。第一階段以「簡易猜詞遊戲」作為實作範例。

Cloudflare 官方文件目前也將 Durable Objects 定位為可協調多人 WebSocket 連線、保存狀態的元件，並明確以 multiplayer games 作為使用情境。([Cloudflare Docs](https://developers.cloudflare.com/durable-objects/best-practices/websockets/?utm_source=chatgpt.com "Use WebSockets · Cloudflare Durable Objects docs"))

* * *

1. 系統目標

-------

建立一個不需要遊戲大廳的多人 Party Game Web：

1. 使用者開啟網站即可建立或加入房間。

2. 房主建立房間後取得隨機房間代碼。

3. 其他玩家輸入房間代碼加入。

4. 每個房間最多容納 **10 人**。

5. 房間內透過 WebSocket 即時同步遊戲狀態。

6. 前端以手機尺寸為主要設計考量。

7. 未來可以逐步增加不同 Party Game。

8. 遊戲 UI、互動及呈現邏輯主要由 Client 負責。

9. 會影響遊戲結果的規則，由 Durable Object 在 Server 端進行最終判定。

* * *

2. 系統架構
   =======
   
                             Internet
                                │
                                ▼
                     ┌────────────────────┐
                     │   Cloudflare DNS   │
                     └─────────┬──────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
          GitHub Pages                Cloudflare Worker
          Static Web                       │
                 │                         │
                 │ HTTPS / WebSocket       │
                 └────────────┬────────────┘
                              ▼
                     Durable Object
                         Room ABCD
                              │
                 ┌────────────┼────────────┐
                 │            │            │
              Player A     Player B     Player C

### 2.1 GitHub Pages

負責：

* Vue 3 Web Application

* UI

* 使用者操作

* 遊戲畫面

* 遊戲動畫

* Client-side Game Logic

* 遊戲內容

* WebSocket Client

GitHub Pages 不保存房間狀態，也不負責判斷遊戲結果。

* * *

### 2.2 Cloudflare DNS

負責：

* Domain DNS

* GitHub Pages 網域解析

* Cloudflare Worker API 網域解析

* HTTPS / TLS 相關入口

建議將前端與 Backend 使用不同 Subdomain：
    game.example.com
    api.example.com

例如：
    game.example.com
        ↓
    GitHub Pages

    api.example.com
        ↓
    Cloudflare Worker

* * *

### 2.3 Cloudflare Worker

Worker 為 Backend 的入口與 Router。

主要責任：

* 接收 HTTP Request

* 建立房間

* 驗證房間代碼

* 將房間 Request 導向對應 Durable Object

* 建立 WebSocket 連線

* 處理非遊戲核心的 API

Worker 本身不負責保存單一房間的遊戲狀態。

概念：
    POST /rooms
        ↓
    Worker
        ↓
    建立 / 尋找 Room Durable Object

    WebSocket /rooms/ABCD
        ↓
    Worker
        ↓
    Durable Object(ABCD)

* * *

3. Durable Object
   =================

Durable Object 為本系統的**房間控制核心**。

每一個遊戲房間對應一個 Durable Object instance。
    Room ABCD
        ↓
    Durable Object ABCD

    Room XYZ1
        ↓
    Durable Object XYZ1

因此可以將 Durable Object 視為：

> 一個專門負責單一遊戲房間的 Server-side Game Room。

* * *

3.1 Durable Object 負責事項
-----------------------

### 房間

* 房間代碼

* 房主

* 玩家清單

* 玩家加入

* 玩家離開

* 房間人數限制

### 即時通訊

* WebSocket Connection

* 接收 Client Game Command

* Broadcast Game Event

* 同步房間狀態

### 遊戲

* Game State

* 回合

* 玩家權限

* 遊戲流程

* 分數

* 答案判斷

* 勝負判定

### 安全性

Client 不可直接指定：
    score
    winner
    currentPlayer
    gameStatus

而是只能提出 Action：
    {
      "type": "submit_answer",
      "answer": "APPLE"
    }

Durable Object 再判斷是否有效。

* * *

4. 房間模型
   =======

4.1 建立房間
--------

首頁提供：
    ┌──────────────────────┐
    │      PARTY GAME      │
    │                      │
    │   [ 建立房間 ]       │
    │                      │
    │   [ 輸入房間代碼 ]   │
    │   [    加入    ]     │
    └──────────────────────┘

使用者點擊「建立房間」：
    Client
      ↓
    Worker
      ↓
    產生 Room ID
      ↓
    建立 / 取得 Durable Object
      ↓
    建立 WebSocket
      ↓
    返回房間資訊

* * *

4.2 房間代碼
--------

房間識別使用隨機 ID。

需求：

* 不需要玩家帳號。

* 不需要大廳。

* 不需要公開房間列表。

* 房間代碼可直接分享給其他玩家。

* 建議顯示為容易輸入的短代碼，例如：

    ABCD
    7K2M
    X9PQ

內部可以使用 GUID / UUID 作為 Durable Object identity。

建議區分：
    Internal Room ID
        UUID / GUID

    Display Room Code
        ABCD

這樣未來若需要修改房間代碼格式，不必改變內部識別方式。

* * *

5. 房間生命週期
   =========
   
    建立
      │
      ▼
    Waiting
      │
      │ 玩家加入
      ▼
    Ready
      │
      │ Host 開始
      ▼
    Playing
      │
      │ 遊戲結束
      ▼
    Finished
      │
      │ 房間解散 / 過期
      ▼
    Expired

第一階段可以簡化為：
    Waiting
       ↓
    Playing
       ↓
    Finished

不需要實作複雜的大廳或房間管理系統。

* * *

6. 玩家限制
   =======

單一房間最多：

**10 人**
    Room ABCD

    01 Host
    02 Player
    03 Player
    04 Player
    05 Player
    06 Player
    07 Player
    08 Player
    09 Player
    10 Player

第 11 人嘗試加入：
    {
      "type": "room_full"
    }

Client 顯示：
    房間已滿

* * *

7. WebSocket 通訊
   ===============

WebSocket 作為遊戲的即時通訊方式。

Cloudflare Durable Objects 官方支援將單一 Durable Object 作為 WebSocket Server，並提供 WebSocket Hibernation API；對於多人遊戲這種長時間連線情境，規格預計採用 Hibernation API。([Cloudflare Docs](https://developers.cloudflare.com/durable-objects/best-practices/websockets/?utm_source=chatgpt.com "Use WebSockets · Cloudflare Durable Objects docs"))

基本架構：
    Player A ─┐
    Player B ─┤
    Player C ─┼── WebSocket ── Durable Object ABCD
    Player D ─┤
    Player E ─┘

Durable Object 收到遊戲事件後：
    Client
      │
      │ Command
      ▼
    Durable Object
      │
      ├── Validate
      ├── Apply Game Rule
      ├── Update State
      │
      ▼
    Broadcast
      │
      ├── Client A
      ├── Client B
      ├── Client C
      └── ...

* * *

8. Client / Server 職責
   =====================

這是本專案的重要設計原則。
Client 負責
---------

    UI
    畫面
    動畫
    輸入
    按鈕
    倒數顯示
    遊戲呈現
    玩家操作流程

例如：
    剩餘 8 秒

由 Client 顯示。

* * *

Durable Object 負責
-----------------

    玩家是否合法
    現在是否可以操作
    目前輪到誰
    答案是否正確
    分數
    遊戲狀態
    勝負

例如：
    Alice → submit_answer("APPLE")
                 │
                 ▼
           Durable Object
                 │
           答案是否正確？
                 │
            ┌────┴────┐
            │         │
           Yes        No
            │         │
           +100       0

因此核心原則：

> **Client 負責呈現，Durable Object 負責最終裁決。**

* * *

9. 遊戲擴充設計
   =========

第一階段不需要建立非常複雜的 Plugin Framework。

只保留簡單抽象：
    Game
     ├── gameId
     ├── gameName
     ├── createState()
     ├── handleAction()
     └── getResult()

例如：
    games/
    ├── word-guess/
    ├── trivia/
    └── reaction/

未來增加遊戲時，可以新增：
    games/new-game/

而不用重新設計 Room System。

* * *

10. 第一個遊戲：簡易猜詞
    ==============

10.1 遊戲概念
---------

例如 4～10 人：
    Alice
    Bob
    Carol
    David

遊戲開始後：
    Round 1
    Alice 出題
    其他玩家猜

第一階段可簡化為：

> Server 選擇一個答案，所有玩家輸入猜測。

例如答案：
    APPLE

玩家：
    Bob    → BANANA
    Carol  → APPLE
    David  → ORANGE

Server 判定：
    Carol → Correct
    Bob   → Wrong
    David → Wrong

* * *

11. 猜詞遊戲 State
    ==============

Durable Object 中：
    interface WordGuessState {
        status: "waiting" | "playing" | "finished";

        round: number;

        currentWord: string;

        players: {
            id: string;
            name: string;
            score: number;
        }[];

        answeredPlayers: string[];
    }

例如：
    {
      "status": "playing",
      "round": 2,
      "currentWord": "APPLE",
      "players": [
        {
          "id": "p1",
          "name": "Alice",
          "score": 100
        },
        {
          "id": "p2",
          "name": "Bob",
          "score": 50
        }
      ],
      "answeredPlayers": []
    }

實際傳給 Client 的 State 應該避免直接暴露不應知道的資訊，例如答案本身。

* * *

12. 猜詞遊戲 Client
    ===============

Client 負責：
    ┌──────────────────────┐
    │      猜詞遊戲        │
    │                      │
    │       Round 2        │
    │                      │
    │    剩餘 10 秒        │
    │                      │
    │  [ 輸入答案       ]  │
    │                      │
    │      [送出]          │
    │                      │
    │ Alice    100         │
    │ Bob       50         │
    │ Carol     80         │
    └──────────────────────┘

Client 收到：
    {
      "type": "round_started",
      "round": 2
    }

就開始：
    10
    9
    8
    ...

這種倒數顯示屬於 UI 行為，可以由 Client 處理。

* * *

13. 猜詞遊戲 Command
    ================

Client 不直接修改 Game State。

例如：
    {
      "type": "submit_answer",
      "answer": "APPLE"
    }

Durable Object 收到後：
    submit_answer
          │
          ▼
    玩家是否存在？
          │
          ▼
    遊戲是否進行中？
          │
          ▼
    玩家是否已回答？
          │
          ▼
    答案是否正確？
          │
          ▼
    更新 Score
          │
          ▼
    Broadcast

* * *

14. 猜詞遊戲 Server Rule
    ====================

例如：
    function submitAnswer(
        playerId: string,
        answer: string
    ) {
        if (!isPlaying()) {
            return reject("GAME_NOT_STARTED");
        }

        if (alreadyAnswered(playerId)) {
            return reject("ALREADY_ANSWERED");
        }

        if (normalize(answer) === normalize(currentWord)) {
            addScore(playerId, 100);
            markCorrect(playerId);
        } else {
            markWrong(playerId);
        }

        broadcastState();
    }

這部分就是：

> **Game Business Logic / Domain Logic**

而且應該位於 Durable Object 執行的 Server-side Game Module。

* * *

15. Game Module 建議
    ==================

第一階段可以採用：
    cloudflare/
    └── src/
        ├── worker.ts
        │
        ├── rooms/
        │   └── GameRoom.ts
        │
        └── games/
            ├── Game.ts
            │
            └── word-guess/
                ├── WordGuessGame.ts
                ├── WordGuessState.ts
                └── words.ts

概念：
    Worker
       │
       ▼
    GameRoom
       │
       ├── Player Management
       ├── WebSocket
       ├── Room State
       │
       └── Game
            │
            └── WordGuessGame

未來：
    games/
    ├── word-guess/
    ├── trivia/
    ├── reaction/
    └── drawing/

即可逐步增加遊戲。

* * *

16. 前端專案
    ========

前端：

**Vite + Vue 3 + TypeScript**

建議：
    web/
    ├── src/
    │   ├── components/
    │   ├── views/
    │   ├── games/
    │   │   └── word-guess/
    │   ├── composables/
    │   │   └── useGameRoom.ts
    │   ├── services/
    │   │   └── websocket.ts
    │   └── App.vue
    │
    ├── public/
    └── vite.config.ts

Cloudflare 官方目前也提供 Vue + Workers 的整合方式；本專案則依需求將前端部署目標定為 GitHub Pages。([Cloudflare Docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/vue/?utm_source=chatgpt.com "Vue · Cloudflare Workers docs"))

* * *

17. Mobile First
    ================

主要使用裝置：

**手機瀏覽器**

優先支援：
    360 × 800
    390 × 844
    412 × 915

設計原則：

* Mobile First

* 大按鈕

* 大字體

* 避免 Hover-only 操作

* 避免需要精確滑鼠操作

* 遊戲主要操作集中於畫面下半部

* 避免橫向 Scroll

* 避免過度複雜的 Navigation

* 遊戲狀態一眼可讀

桌面瀏覽器作為次要支援。

* * *

18. 資料儲存策略
    ==========

第一階段：

**不使用傳統 Database。**

房間主要資料：
    Room
    Player
    Game State
    Score
    Current Round

由 Durable Object 管理。

* * *

19. WebSocket Hibernation
    =========================

由於遊戲房間可能存在數十分鐘，而玩家不是每秒都送資料，因此 Durable Object 採：

**WebSocket Hibernation API**

目的：
    玩家仍保持 WebSocket
              │
              ▼
    Durable Object 暫時沒有事件
              │
              ▼
    可以 Hibernation
              │
              ▼
    收到新的 Game Event
              │
              ▼
    重新喚醒

Cloudflare 官方說明 Hibernation 可以讓 WebSocket Client 保持連線，同時在 Durable Object 閒置時避免產生 Duration 計費；這也是目前官方建議的 WebSocket Server 使用方式。([Cloudflare Docs](https://developers.cloudflare.com/durable-objects/best-practices/websockets/?utm_source=chatgpt.com "Use WebSockets · Cloudflare Durable Objects docs"))

* * *

20. 非功能需求
    =========

### 效能

單房間：
    最多 10 人

遊戲事件主要為：
    join
    leave
    ready
    start
    submit
    answer
    score_update
    round_start
    game_finish



* * *

### 即時性

遊戲事件目標：
    Client
      ↓
    WebSocket
      ↓
    Durable Object
      ↓
    Broadcast

以即時遊戲事件為主要通訊模型。

* * *

### 安全性

Client 不可直接決定：
    score
    winner
    game state
    current turn

所有影響遊戲結果的 Command 必須經 Durable Object 驗證。

* * *

21. 技術選型總表
    ==========

| 元件                 | 技術                    | 職責                 |
| ------------------ | --------------------- | ------------------ |
| Frontend           | Vite                  | Build              |
| Frontend Framework | Vue 3                 | UI                 |
| Language           | TypeScript            | Frontend / Backend |
| Static Hosting     | GitHub Pages          | Web Hosting        |
| DNS                | Cloudflare DNS        | Domain / DNS       |
| Backend            | Cloudflare Workers    | API / Routing      |
| Room Server        | Durable Objects       | Room / Game State  |
| Realtime           | WebSocket             | 即時通訊               |
| Storage            | Durable Object SQLite | 必要的房間持久資料          |
| Database           | 第一階段不需要獨立 DB          | 降低系統複雜度            |

* * *

22. MVP 實作範圍
    ============

第一版只需要完成：

### Phase 1 — 基礎房間

    [建立房間]
         ↓
    產生 Room Code
         ↓
    顯示 Room Code
    
    [輸入 Room Code]
         ↓
    [加入]
         ↓
    進入房間

### Phase 2 — 即時房間

    玩家加入
    玩家離開
    玩家列表
    Host
    最多 10 人
    WebSocket

### Phase 3 — 猜詞遊戲

    Host 開始
        ↓
    選擇猜詞遊戲
        ↓
    開始 Round
        ↓
    Server 決定答案
        ↓
    玩家輸入答案
        ↓
    Durable Object 判定
        ↓
    更新分數
        ↓
    下一 Round
        ↓
    遊戲結束

### Phase 4 — 第二個遊戲

驗證目前的：
    Game
    GameRoom
    WebSocket
    Command
    State

抽象是否足夠支援另一種遊戲。

**不要在第一版就建立過度完整的遊戲 Plugin Framework。**

* * *

23. 最終架構

--------

                             ┌─────────────────────┐
                             │     Cloudflare DNS  │
                             └──────────┬──────────┘
                                        │
                     ┌──────────────────┴──────────────────┐
                     │                                     │
                     ▼                                     ▼
           ┌──────────────────┐                 ┌──────────────────┐
           │   GitHub Pages   │                 │ Cloudflare Worker│
           │                  │                 │                  │
           │ Vite             │                 │ API              │
           │ Vue 3            │                 │ Routing          │
           │ TypeScript       │                 │ Room lookup      │
           └────────┬─────────┘                 └────────┬─────────┘
                    │                                    │
                    │ WebSocket                         │
                    └────────────────┬───────────────────┘
                                     ▼
                        ┌─────────────────────────┐
                        │     Durable Object      │
                        │       GameRoom          │
                        │                         │
                        │ Room State              │
                        │ Players                 │
                        │ WebSocket               │
                        │ Game State               │
                        │                         │
                        │ ┌─────────────────────┐ │
                        │ │ Game Logic          │ │
                        │ │                     │ │
                        │ │ Word Guess          │ │
                        │ │ Trivia              │ │
                        │ │ ...                 │ │
                        │ └─────────────────────┘ │
                        └────────────┬────────────┘
                                     │
                             Room State / Game State

### 核心原則

**GitHub Pages：**

> 「遊戲怎麼呈現、玩家怎麼操作」

**Worker：**

> 「Request 要去哪裡」

**Durable Object：**

> 「這個房間現在到底發生什麼事，以及遊戲結果到底算不算」

這個切法可以保留你希望的「**增加遊戲很容易**」，同時又不把分數、勝負等重要規則交給可以被玩家修改的 Static Web。
