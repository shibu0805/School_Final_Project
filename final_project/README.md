# Airwise｜AI 空氣品質出門顧問

大學人工智慧期末專題的可操作本機版本。程式位於 `test2/期末專題`，包含 React／TypeScript／Vite／Tailwind／Recharts 前端、Node.js 工具型 Agent 與 SQLite 紀錄。

2026-11-07 已重構主要操作流程為「全台縣市地圖 → AI 語音顧問」。原本五頁介面保留於頁尾「開發者／研究模式」，原有測試題庫及 SQLite 資料未刪除。詳細統計規則、語音限制及本次驗證見 REFACTOR.md。

## 立即開啟

安裝 Node.js 24 或以上後，雙擊 **啟動專題.bat**，瀏覽器開啟 `http://127.0.0.1:8787`。

```powershell
npm install
npm run build
npm start
```

開發時執行 `npm run dev`，瀏覽 `http://127.0.0.1:5173`。兩個服務使用 5173／8787 埠，請避免重複啟動。若啟動批次檔先開出空白頁，待主控台出現 Airwise 網址後重新整理即可。

目前電腦的依賴套件透過目錄 Junction 重用旁邊 HW2 的 node_modules；沒有修改 HW2 原始碼。搬到其他電腦時不需複製 Junction，直接 `npm install`。

## 功能

- 空品總覽：AQI 六級、六種污染物、測站與資料發布時間。
- AI 顧問：自然語言解析、共用活動設定、多輪條件保留、按需求選擇工具、準則查詢、來源與數字檢核。
- 模型選擇：規則工具流程、Gemini、Ollama；模型失敗會顯示降級資訊。
- 趨勢與時段：AQI／PM2.5／臭氧切換、12／24／72 小時範圍；沒有空品預報時不推薦未來最佳時間。
- 測站地圖：OpenStreetMap 位置、測站切換、瀏覽器定位與最近三個有效測站。
- 專題實驗：30 題情境入口、實際執行紀錄與 JSON 匯出；未完成的人工評估標示未測試。

## 接上真實資料

複製 `.env.example` 為 `.env`，填妥後重新啟動後端：

| 變數 | 用途 |
| --- | --- |
| MOENV_API_KEY | [環境部申請](https://data.moenv.gov.tw/api_term)，查詢 AQX_P_432 |
| CWA_API_KEY | [中央氣象署開放資料](https://opendata.cwa.gov.tw/devManual/description)，查詢 F-C0032-001 |
| GEMINI_API_KEY | 選用；Gemini 意圖解析與工具需求規劃 |
| GEMINI_MODEL | 依帳戶實際可用模型設定，預設 gemini-2.5-flash |
| OLLAMA_MODEL | 本機模型名稱，預設 qwen2.5:7b |

Ollama 請另行安裝，執行 `ollama pull qwen2.5:7b` 並確保 `http://127.0.0.1:11434` 可用。切換雲端模型會將問題與活動條件傳給 Google；可選本機或規則流程。

新版首頁預設使用官方即時模式。沒有金鑰或無有效資料時，縣市顯示灰色「暫無資料」。可由右上方切換明確標示的教學展示模式。API 不可用時不會偷偷使用模擬資料，API Key 不會傳回前端。

## Demo 建議流程

1. 首頁使用真實 GeoJSON，點選縣市後查看最高 AQI、發布批次、納入與排除的測站。
2. 點「問問 AI 顧問」，直接打字或點麥克風提問；沒有地點時顧問自然追問。
3. 問「今天台中適合跑步嗎？」，再追問「那如果我是氣喘患者呢？」以展示上下文保留。
4. 問「明天早上哪個時段比較好？」；沒有可信預報時顯示資料不足。
5. 展開詳細分析，查看趨勢、測站、準則與來源；點朗讀可選擇中文語音。
6. 頁尾研究模式保留原有測站查詢、個人設定、工具 trace、模型比較入口與實驗紀錄匯出。

## 驗證與限制

`npm test` 執行後端與圖資測試，`npm run test:ui` 執行 jsdom 介面及語音 adapter 測試，`npm run build` 執行 TypeScript 檢查與正式編譯。詳見 TEST_PLAN.md。

- 已從下載資料夾讀取 22 頁提案 PPT，對照結果見 PPT_MAPPING.md。
- 此電腦既有 Python 環境無法啟動，因此先採可執行的 Node.js 後端，未實作 FastAPI／Pydantic／Pytest 版本。
- 需要使用者自己的金鑰，才能驗證真實官方資料及 Gemini。Ollama 也須先安裝模型。
- 已確認官方文件與 API 格式，尚未以有效金鑰進行端到端連線測試。
- 歷史資料是本機查詢時累積的快照，沒有背景排程，也不冒充完整歷史資料庫。
- 未接入未來逐時空品預報、未進行四種系統的人工評分與統計分析。
- 新首頁使用完整 22 縣市行政區 GeoJSON，以 SVG 互動呈現，含離島分圖。研究模式仍保留原 OpenStreetMap 單站位置頁面，尚未做 Leaflet 多站點圖層。
- Speech Recognition 支援依瀏覽器、權限、裝置與服務可用性而異；部分瀏覽器會把音訊送至供應商服務。中文朗讀需裝置具有中文語音。本專題不保存錄音。
- LLM 負責解析與工具需求，最終建議由規則模板生成，降低捏造數字的可能。這不是完整的自主多步 LLM function-calling 框架。
- 本服務供健康資訊參考，不能取代醫師個別醫療建議。
