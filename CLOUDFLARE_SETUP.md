# GAMUMU 部署與外部設定指引

此專案的網頁由 GitHub Pages 靜態託管，房間 API、WebSocket 與遊戲裁決由 Cloudflare Worker 和 Durable Objects 提供。需要手動設定的帳號、網域與 DNS 步驟集中在這份文件。

## 需要準備

- Node.js 22.12 以上版本與 npm
- GitHub repository，且能修改 repository settings
- Cloudflare 帳號
- （選用）自己的網域；沒有網域時可使用 GitHub Pages 與 `workers.dev` 提供的網址

本專案不需要 D1、第三方資料庫、API key 或遊戲帳號服務。玩家房間資料存放於 Durable Object SQLite。

## 本機啟動

在專案根目錄安裝依賴：

```powershell
npm ci
```

開兩個終端機：

```powershell
npm run worker:dev
```

```powershell
npm run dev
```

Worker 會在 `http://127.0.0.1:8787` 啟動；Vite 網頁在 `http://localhost:5173`，並將 `/api` 與 WebSocket 請求代理給 Worker。Wrangler 的本機 Durable Object 資料會寫入 `.wrangler/`，不會提交到 Git。

封測開發前，複製 `.dev.vars.example` 為 `.dev.vars`，並改成自己的本機測試碼與 session 簽章密鑰。`.dev.vars` 已加入 Git 忽略清單，不要提交真實封測碼。

## 部署 Cloudflare Worker

1. 登入 Cloudflare 並在專案根目錄授權 Wrangler：

   ```powershell
   npx wrangler login
   ```

2. 在 Cloudflare Dashboard 的 **Workers & Pages → gamumu-api → Settings → Variables and Secrets** 新增兩個 Secret：

   | Secret 名稱 | 內容 |
   | --- | --- |
   | `BETA_CODES` | 以逗號或換行分隔的有效封測碼清單；每組 12–64 位英數字 |
   | `BETA_SESSION_SECRET` | 至少 32 個字元的隨機簽章密鑰 |

   也可以用 Wrangler 逐一設定，指令會互動式要求輸入 Secret 值：

   ```powershell
   npx wrangler secret put BETA_CODES
   npx wrangler secret put BETA_SESSION_SECRET
   ```

   目前封測碼可重複兌換；每次兌換後的通行憑證有效 6 小時。新增或移除封測碼時，只更新整個 `BETA_CODES` Secret 清單並部署 Worker；移除的碼會立即停止新兌換，也會讓以該碼取得的通行憑證在下一次 API/WebSocket 操作時失效。更換 `BETA_SESSION_SECRET` 則會讓所有現有通行憑證失效。請保留自己的有效碼清單，Secret 值不應放在前端變數或提交到 Git。

3. 編輯 `wrangler.jsonc` 的 `vars.ALLOWED_ORIGINS`，列出正式前端的 **Origin**（協定與主機，不含路徑），例如：

   ```jsonc
   "ALLOWED_ORIGINS": "http://localhost:5173,https://game.example.com"
   ```

   如果使用 GitHub Pages 預設網址，加入 `https://<GitHub 使用者或組織>.github.io`。若同時使用自訂網域，也把該網域加入清單。Origin 必須完全一致；GitHub Pages 的 `/repository/` 路徑不屬於 Origin。

4. 部署：

   ```powershell
   npm run worker:deploy
   ```

   Wrangler 會建立 `GameRoom` SQLite Durable Object migration。第一次部署若要求確認 migration，請確認後繼續。

5. 記下 Wrangler 顯示的 Worker 網址，例如 `https://gamumu-api.<帳號>.workers.dev`。這是稍後前端 `VITE_API_URL` 要使用的值，不要在結尾加 `/api`。

### 使用自訂 API 網域（選用）

在 Cloudflare Dashboard 開啟 **Workers & Pages → gamumu-api → Settings → Domains & Routes → Add → Custom Domain**，輸入例如 `api.example.com`。Cloudflare 會建立 Worker 所需的 DNS 記錄；等網域狀態顯示啟用後，前端可使用 `https://api.example.com`。

若使用 `workers.dev` 網址，就不需要新增 API DNS 記錄。

## 部署 GitHub Pages 前端

1. 在 GitHub repository 開啟 **Settings → Pages**，將 **Build and deployment → Source** 設為 **GitHub Actions**。
2. 在 **Settings → Secrets and variables → Actions → Variables** 新增：

   | Variable | 值 |
   | --- | --- |
   | `VITE_API_URL` | Worker 網址，例如 `https://api.example.com` 或 `https://gamumu-api.<帳號>.workers.dev` |
   | `VITE_BASE_PATH` | GitHub Pages 專案網站填 `/repository名稱/`；自訂網域或使用者首頁填 `/` |

3. 將程式推送到 `main` 分支，`.github/workflows/deploy-pages.yml` 會建置並發布 `dist/`。若 repository 的預設分支不是 `main`，請同步修改 workflow 的觸發分支。
4. 等待 **Actions → Deploy to GitHub Pages** 工作完成，再從 **Settings → Pages** 開啟網站。

前端使用 `VITE_API_URL` 在建置時設定 API 網址；修改 GitHub Actions Variables 後，需要重新執行部署 workflow 才會套用。

## 自訂前端網域與 DNS（選用）

1. 在 GitHub repository 的 **Settings → Pages → Custom domain** 輸入前端網域，例如 `game.example.com`。
2. 在 Cloudflare DNS 為該子網域新增 GitHub Pages 指示的 CNAME 記錄，通常是 `game → <GitHub 使用者或組織>.github.io`。此記錄請設為 **DNS only**（灰色雲朵），不要開啟 Cloudflare Proxy。
3. 等待 GitHub Pages 驗證網域並簽發 HTTPS 憑證。
4. 將 `https://game.example.com` 加入 `wrangler.jsonc` 的 `ALLOWED_ORIGINS`，重新執行 `npm run worker:deploy`。
5. GitHub Actions Variable `VITE_BASE_PATH` 設為 `/`，`VITE_API_URL` 設為 Worker 自訂網域或 `workers.dev` 網址。

API 子網域則依前一節在 Worker 設定 Custom Domain，不要將 API CNAME 指到 GitHub Pages。

## 部署後檢查

- 開啟 `https://<Worker 網址>/api/health`，應回傳 `{"status":"ok"}`。
- 前端建立房間並加入另一位玩家；確認玩家列表即時更新、房主開始後可猜詞。
- 若前端無法連線，先確認 `VITE_API_URL` 已在 GitHub Actions Variables 設定並重新部署，再確認 Worker 的 `ALLOWED_ORIGINS` 含有瀏覽器網址的 Origin。
- 若使用自訂網域，確認 GitHub Pages 的 DNS 記錄為 DNS only，Worker API 網域已在 Cloudflare 顯示啟用。

房間使用六碼代碼；玩家連線憑證由瀏覽器保存以便重新連線。房間閒置 6 小時會過期；猜詞遊戲為 5 題、每題 20 秒，答對加 100 分。
