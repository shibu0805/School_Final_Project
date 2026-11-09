# API 與資料來源

查閱日期：2026-11-06。2026-11-07 已使用僅存本機 .env 的有效金鑰驗證環境部與氣象署端點；文件與前端不包含金鑰。

環境部實測回傳為頂層 JSON 陣列，程式同時相容 records 包裝格式；publishtime 實測使用 YYYY/MM/DD HH:mm:ss，已正規化並按臺灣時區解析。新增對應回歸測試。

## 官方資料

### 環境部 AQX_P_432

- [資料集與欄位說明](https://data.moenv.gov.tw/dataset/detail/aqx_p_432)
- [API 使用方式](https://data.moenv.gov.tw/paradigm)
- GET `https://data.moenv.gov.tw/api/v2/aqx_p_432?api_key=…&limit=1000&format=json`
- 需會員金鑰，每小時更新。授權依政府資料開放平臺使用規範。
- 使用 sitename、county、siteid、aqi、pollutant、publishtime、longitude、latitude、pm2.5、pm10、o3、no2、so2、co。
- PM2.5／PM10：μg/m³；O₃／NO₂／SO₂：ppb；CO：ppm。保留單位差異。
- 後端快取五分鐘以避免每次操作請求官方服務；實際額度／限制依帳戶與官方政策，未自行假設每日配額。

### 中央氣象署 F-C0032-001

- [API 開發指南](https://opendata.cwa.gov.tw/devManual/description)
- [Swagger](https://opendata.cwa.gov.tw/dist/opendata-swagger.html)
- GET `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=…&locationName=臺中市`
- 需會員授權碼；提供今明 36 小時縣市預報，不是逐時 AQI 預報。
- 解析 records.location[].weatherElement 中 Wx／MinT／MaxT／PoP，保留各段 startTime、endTime。
- 本版假設同個預報資料集的元素時段依序對齊；正式連線時需驗證各元素的時段一致性。
- 不在程式寫死更新排程或配額；以實際有效時間及官方公告為準。

### 健康準則

- [環境部空氣品質指標及活動建議](https://air.moenv.gov.tw/envtopics/AirQuality_1.aspx)
- server/guidelines.mjs 保存摘要、六級區間、來源與查閱版本。
- 孕婦在本系統採保守族群處理，並非聲稱官方表格另有孕婦專屬門檻。
- 一般過濾顆粒物口罩不應被解讀為可防護臭氧等氣體；避免暴露是本版提示的核心，不提供個別醫療處方。

## 本機 API

所有回應為 JSON。mode=demo 使用教學模擬快照；預設 live，不在失敗時混入模擬資料。

| 方法／路徑 | 參數與內容 | 回傳 |
| --- | --- | --- |
| GET /api/status | 無 | 金鑰是否設定的布林值；不回傳金鑰 |
| GET /api/stations | mode | stations 陣列與來源／發布時間／stale |
| GET /api/counties | mode | 22 縣市的同小時有效站最高 AQI、代表站、站表、排除原因、發布時間範圍；詳見 REFACTOR.md |
| GET /api/history | station、hours=1–72、mode | 本機快照 history；展示模式為明確模擬曲線 |
| GET /api/weather | county、mode | status、source、periods、選用 message |
| GET /api/nearby | lat、lon、mode | 最近三個 AQI 有效且未過期測站、公里距離 |
| GET /api/guidelines | 無 | 結構化六級準則 |
| POST /api/chat | message、profile、mode、provider、station | reply、facts、analysis、trace、validation、runId |
| GET /api/runs | 無 | 最近 50 筆執行紀錄 |

profile：county、group、activity、intensity、duration、time，可另有 timeDetail。新版允許傳空物件，由問題解析；缺縣市自然追問，其餘未指定條件以有揭露的預設補足。時長 1–480 分鐘。provider：rules／gemini／ollama。message 限 4000 字，request body 限 24000 字元。回傳新增 summary／assessment／actions／details；assessment 由後端規則決定，details 為收合明細資料。

錯誤為 `{ "error": "繁體中文訊息" }`。400 格式／參數錯誤；403 非允許來源；404 路徑不存在；413 內容過長；503 外部服務或設定異常。工具異常不回傳包含金鑰的上游 URL。

Gemini 依 [generateContent 官方文件](https://ai.google.dev/api/generate-content) 使用 x-goog-api-key、JSON MIME。Ollama 依 [官方 API 文件](https://docs.ollama.com/api/generate) 使用 format=json、stream=false。本版不聲稱預設模型一定對所有帳戶可用。
