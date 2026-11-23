import {countyNames} from './air-quality.mjs';

export const CHAT_INTENT_VERSION='2026-11-22.6';
// 縣內城市使用所屬縣的資料；獨立的縣轄市名稱不能只移除縣名後留下「市」。
const cityAliases={'彰化市':'彰化縣','屏東市':'屏東縣','苗栗市':'苗栗縣','南投市':'南投縣','宜蘭市':'宜蘭縣','花蓮市':'花蓮縣','臺東市':'臺東縣'};
const placeNames=[...countyNames.map(county=>({name:county,county})),...Object.entries(cityAliases).map(([name,county])=>({name,county})),...countyNames.map(county=>({name:county.slice(0,-1),county}))].sort((a,b)=>b.name.length-a.name.length);
export function findCounty(message){
 if(typeof message!=='string')return undefined;
 const text=message.normalize('NFKC').replaceAll('台','臺');
 return placeNames.find(place=>text.includes(place.name))?.county;
}
export function unrecognizedMessage(profile={}){
 return {
  reply:'我沒有理解這次的問題。請告訴我想查詢的縣市、空氣品質或戶外活動，例如「今天台中適合散步嗎？」；也可以追問「那如果我是氣喘患者呢？」。',
  profile:{...profile},status:'clarification',clarificationReason:'unrecognized_message',
  assessment:{status:'insufficient',label:'請補充空品或出門相關問題'},actions:[]
 };
}

// 地點、出行、評估與語助詞可自由換序；未知內容不會因為包含地名而被放行。
const locationWords=['那麼','那','如果','假如','要是','若','所以','接下來','接著','再來','改成','換成','改為','換到','改到','換去','改去','改問','換問','我們','我','想要','想','請問','請','幫我','再','也','先','打算','計畫','準備','可能','還是','知道','了解','查詢','查一下','查看','查','看一下','看看','看','問一下','問問','問','去到','前往','去','到','住在','在','地點','位置','的話','的','空氣品質','空氣','空品','狀況','情況','怎麼樣','如何','適不適合','適合','合適','適宜','可以','安全','可不可以','能不能','行不行','好不好','會不會','有沒有','比較好','好一點','較好','可行','是否','可否','同樣','一樣','仍然','還','是','不','會','能','行','一下','呢','嗎','啊','呀','吧'].sort((a,b)=>b.length-a.length);
function locationCondition(text){
 let remaining=text.replace(/[\s\p{P}\p{S}]/gu,''),hasCounty=false;
 for(const {name} of placeNames){
  if(remaining.includes(name)){hasCounty=true;remaining=remaining.replaceAll(name,'@');}
 }
 remaining=remaining.replace(/現在|目前|此刻|當下|即時|今天|今日|明天|明日|明早|明晚|今晚|早上|上午|中午|下午|傍晚|晚上/g,'');
 if(!hasCounty||remaining.split('@').length!==2)return false;
 remaining=remaining.replace('@','');
 while(remaining){const word=locationWords.find(word=>remaining.startsWith(word));if(!word)return false;remaining=remaining.slice(word.length);}
 return true;
}

export function isLocationFollowup(message,context={}){
 return typeof message==='string'&&countyNames.includes(context.county)&&locationCondition(message.normalize('NFKC').replaceAll('台','臺').trim());
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
 if(locationCondition(text))return true;

 // 簡短但有效的補充：例如「臺北呢」「那明天下午呢」「改成 15 分鐘」。
 // 只有時間或地名卻另接無關內容（例如「今天晚餐吃什麼」）不能通過。
 let remaining=text,hasCondition=false;
 for(const {name} of placeNames){
  if(remaining.includes(name)){hasCondition=true;remaining=remaining.replaceAll(name,'');}
 }
 remaining=remaining.replace(/現在|目前|此刻|當下|即時|今天|今日|明天|明日|明早|明晚|今晚|早上|上午|中午|下午|傍晚|晚上|\d+\s*分鐘|[高中低]強度/g,()=>{hasCondition=true;return '';});
 remaining=remaining.replace(/我住在|我想|我在|地點|位置|請問|請|可不可以|能不能|好不好|怎麼樣|如何|適合|可以|改成|換成|改為|如果|假如|同樣|一樣|剛剛|剛才|重新提問|重新開始|重新問|新問題|換個問題|換一個問題|哪個時段|什麼時候|比較好|最好|較好|幾點|那|若|是|在|呢|嗎|一下/g,'').replace(/[\s\p{P}\p{S}]/gu,'');
 if(hasCondition&&!remaining)return true;

 // 明確評估追問可沿用已知縣市；不可把任意文字當作追問。
 const compact=text.replace(/[\s\p{P}\p{S}]/gu,'');
 return countyNames.includes(context.county)&&/^(?:那|所以|這樣)?(?:還|也)?(?:適合|可以|安全)(?:嗎|呢)$/.test(compact);
}
