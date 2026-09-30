# GAMUMU

手機優先的多人派對遊戲。玩家建立或加入房間後，以 WebSocket 即時同步猜詞遊戲；房間、玩家與遊戲結果由 Cloudflare Durable Objects 管理。

## 本機開發

需要 Node.js 22.12 以上版本。

1. 安裝套件：`npm ci`
2. 終端機一執行 `npm run worker:dev`，啟動本機 Cloudflare Worker（`http://127.0.0.1:8787`）。
3. 終端機二執行 `npm run dev`，開啟 Vite 網站（`http://localhost:5173`）。

`npm run build` 建置 GitHub Pages 前端；`npm run worker:check` 產生 Cloudflare 型別並檢查 Worker TypeScript。

Cloudflare、GitHub Pages、網域與 DNS 的設定步驟請見 [`CLOUDFLARE_SETUP.md`](./CLOUDFLARE_SETUP.md)。

專案功能、架構分工與開發流程請見 [`DEVELOPMENT_GUIDE.md`](./DEVELOPMENT_GUIDE.md)；產品需求與後續規劃請見 [`gg_spec.md`](./gg_spec.md)。

## 架構

- `src/`：Vue 3 + TypeScript 前端。
- `worker/src/`：Cloudflare Worker API 與 Durable Object 房間邏輯。
- `shared/protocol.ts`：前後端共用的即時通訊型別。
- `wrangler.jsonc`：Durable Object SQLite migration 與 Worker 設定。

房間上限為 10 人；猜詞遊戲共 5 題，每題 20 秒，答對加 100 分。房間閒置 6 小時後過期。
