import {countyNames} from './air-quality.mjs';

export const CHAT_INTENT_VERSION='2026-11-09.2';
export function unrecognizedMessage(profile={}){
 return {
  reply:'我沒有理解這次的問題。請告訴我想查詢的縣市、空氣品質或戶外活動，例如「今天台中適合散步嗎？」；也可以追問「那如果我是氣喘患者呢？」。',
  profile:{...profile},status:'clarification',clarificationReason:'unrecognized_message',
  assessment:{status:'insufficient',label:'請補充空品或出門相關問題'},actions:[]
 };
}

// 有舊 Profile 不代表本輪一定是空品提問；「那／如果／呢」本身也不是有效意圖。
// 此處只決定是否能進入既有工具流程，不產生新的健康判定。
export function isAirQualityMessage(message,context={}){
 if(typeof message!=='string')return false;
 const text=message.normalize('NFKC').replaceAll('台','臺').trim();
 if(!text)return false;
 const topics=/空氣|空品|空污|空汙|污染|霧霾|懸浮微粒|細懸浮|臭氧|二氧化氮|二氧化硫|一氧化碳|測站|口罩|出門|外出|戶外|室內活動|運動|散步|慢跑|跑步|健走|步行|騎(?:腳踏車|自行車|車)|爬山|登山|戶外遊戲|公園玩|天氣|下雨|降雨|溫度|氣喘|心肺|呼吸道|兒童|小孩|孩子|長者|老人|阿公|阿嬤|孕婦|孕期|懷孕|族群|健康成人|一般民眾/;
 const englishTopics=/\b(?:AQI|PM\s*2[.]?5|PM\s*10|O3|NO2|SO2|CO|air\s+quality|pollution|mask|outdoors?|exercise|running|jogging|walking|cycling|asthma|weather|rain)\b/i;
 if(topics.test(text)||englishTopics.test(text))return true;

 // 簡短但有效的補充：例如「臺北呢」「那明天下午呢」「改成 15 分鐘」。
 // 只有時間或地名卻另接無關內容（例如「今天晚餐吃什麼」）不能通過。
 let remaining=text,hasCondition=false;
 for(const county of [...new Set(countyNames.flatMap(c=>[c,c.slice(0,-1)]))].sort((a,b)=>b.length-a.length)){
  if(remaining.includes(county)){hasCondition=true;remaining=remaining.replaceAll(county,'');}
 }
 remaining=remaining.replace(/現在|目前|此刻|當下|即時|今天|今日|明天|明日|明早|明晚|今晚|早上|上午|中午|下午|傍晚|晚上|\d+\s*分鐘|[高中低]強度/g,()=>{hasCondition=true;return '';});
 remaining=remaining.replace(/我住在|我想|我在|地點|位置|請問|請|可不可以|能不能|好不好|怎麼樣|如何|適合|可以|改成|換成|改為|如果|假如|同樣|一樣|剛剛|剛才|重新提問|重新開始|重新問|新問題|換個問題|換一個問題|哪個時段|什麼時候|比較好|最好|較好|幾點|那|若|是|在|呢|嗎|一下/g,'').replace(/[\s\p{P}\p{S}]/gu,'');
 if(hasCondition&&!remaining)return true;

 // 明確評估追問可沿用已知縣市；不可把任意文字當作追問。
 const compact=text.replace(/[\s\p{P}\p{S}]/gu,'');
 return countyNames.includes(context.county)&&/^(?:那|所以|這樣)?(?:還|也)?(?:適合|可以|安全)(?:嗎|呢)$/.test(compact);
}
