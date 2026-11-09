# Agent 與工具

## 情境建議選擇（2026-11-07）

server/recommendations.mjs 取代原本固定的「準則／活動調整／症狀提醒」三句。依問題是否詢問口罩、替代活動、天氣、時段，以及活動類型、族群、強度、時長、指標污染物、資料完整性選出候選做法，再排序與去重，每次最多三點。沒有未來空品證據時只提供限制與重新查詢建議，不產生虛構最佳時段。

新增 generate_recommendations 工具軌跡；details.recommendations 保存 id、文字、觸發原因、來源與 kind。官方準則摘要、活動情境整理及資料限制分開標示。後端活動適合度仍由原健康規則引擎決定，建議選擇不會覆寫判定；不採用隨機換句話。來源包含環境部、衛福部、國健署、WHO 與 CDC／NIOSH 防護資訊，詳細分析可逐項查閱。

## 對話條件更新（2026-11-07 修正）

完整新問題沒有指定時間時，預設查現在，不沿用前一題的明天／早晚。明確改成今天／現在／目前時，清除舊 timeDetail；同一句多次修正以最後指定為準。「那如果我是氣喘患者呢？」等延續追問則保留前題的時地與活動，只更新族群。明早／明晚正規化為明天的早上／晚上。模型解析不能把舊時間覆寫回新問題，切換活動時重新推定強度。

顧問新增「重新對話」，保留所選縣市，清除其他個人條件、畫面紀錄與語音狀態；同時取消舊請求，晚到的回覆不會重新寫入新對話。此按鈕不刪除 SQLite 研究紀錄。

## 模組契約

| 模組 | 輸入 | 輸出／異常 |
| --- | --- | --- |
| Intent Parser | 訊息、已知 Profile | 已驗證條件；缺少條件要求補充。模型失敗保留規則解析 |
| Task Planner | 訊息、Profile、模型 needsWeather／needsHistory | 受控工具序列；未來問題強制檢查資料限制 |
| Tool Executor | 名稱、參數、mode | 真實資料或明確 demo；逐步記錄成功／失敗與毫秒 |
| Air Quality Analyzer | Station、Profile | AQI 等級、新鮮度、研究用排序指標或缺值 |
| Guideline Engine | AQI、族群 | 官方摘要、版本、來源；沒有 AQI 不判定 |
| Recommendation Generator | 證據、分析、準則 | 繁體中文受控模板，不讓模型自由產生污染物數字 |
| Answer Validator | 回答、Station 證據 | AQI、來源、時間與文字數字檢核；禁止虛構 bestTime |
| Response Formatter | 完整結果 | reply、facts、trace、validation、elapsed 等 JSON |

## 工具清單

| 工具 | 輸入 | 輸出 | 來源／錯誤 |
| --- | --- | --- | --- |
| find_nearest_stations | 經緯度、有效站表 | 三站與距離 | 官方座標；缺值／過期排除 |
| get_realtime_aqi | mode（Agent 內取得全站後挑站） | Station | 環境部；無金鑰／連線失敗中止 |
| get_historical_aqi | 站號、hours、mode | 時序快照 | 本機 SQLite；不足不補點 |
| get_weather_forecast | county、mode | periods | 氣象署；無法取得時回傳明確狀態 |
| get_health_guidelines | AQI、group | 準則摘要 | 結構化官方摘要；缺值回傳 null |
| analyze_air_quality | Station、Profile | analysis | 純規則；過期警告 |
| compare_activity_time_slots | Profile、history | unavailable、best=null | 無未來逐時空品預報；禁止偽造時段 |
| validate_response | response、evidence | passed、issues | 純函式、可直接測試 |

## 決策例

「現在適合慢跑嗎？」呼叫測站、分析、準則與驗證；不查天氣或歷史。

「明天什麼時候散步？」再加入天氣、歷史與時段資料充分性檢查。即使已有歷史曲線，也回覆無法可靠挑出未來最佳時間。

Gemini／Ollama 負責意圖與是否需要天氣／歷史的需求判讀，輸出欄位需白名單驗證。工具由後端執行。最終文字為規則生成，不宣稱 LLM 自主執行任意工具。失敗時 provider 回報 rules，trace 保存 intent_parser error。

對話上下文由前端 Profile 維持。可記住地區、族群、活動、強度、時長、時段；沒有實作完整聊天歷史送入模型，代名詞與複雜跨輪問題仍有解析限制。

## 安全與驗證邊界

只允許既定端點與工具，不允許模型執行程式碼或任意 URL。數字驗證只檢核本系統受控回答及結構化事實，不等同完整語義、醫療或文獻正確性審核。研究人工評分仍有必要。
