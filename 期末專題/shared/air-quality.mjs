export const countyNames=['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
// 環境部 AQI 官方色碼，保持原色，不以品牌色取代。
export const aqiLevels=[
 {min:0,max:50,label:'良好',color:'#00e400'},
 {min:51,max:100,label:'普通',color:'#ffff00'},
 {min:101,max:150,label:'對敏感族群不健康',color:'#ff7e00'},
 {min:151,max:200,label:'對所有族群不健康',color:'#ff0000'},
 {min:201,max:300,label:'非常不健康',color:'#8f3f97'},
 {min:301,max:500,label:'危害',color:'#7e0023'}
];
export const noData={label:'暫無資料',color:'#c3ccd1'};
export const countyRule='最新發布小時內，有效測站的最高 AQI；不代表縣市每個地點的實際空品。';
export function aqiGrade(aqi){return validAqi(aqi)?aqiLevels.find(g=>aqi<=g.max):noData;}
export function validAqi(aqi){return typeof aqi==='number'&&Number.isInteger(aqi)&&aqi>=0&&aqi<=500;}
export function observationTime(time){if(typeof time!=='string'||!time.trim())return NaN;const t=time.trim().replaceAll('/','-').replace(' ','T');return Date.parse(t+(/(?:Z|[+-]\d{2}:?\d{2})$/.test(t)?'':'+08:00'));}
export function stationQuality(station,mode='live',now=Date.now()){
 if(station.mode&&station.mode!==mode)return 'wrong_mode';
 if(!validAqi(station.aqi))return 'invalid';
 const t=observationTime(station.time);
 if(!Number.isFinite(t))return 'invalid_time';
 // 展示快照只用於假設情境，不視為當前觀測。正式模式重新計算時間，不信任舊快取 stale。
 if(mode!=='demo'&&(now-t>2*3600000||t-now>5*60000))return 'stale';
 return 'valid';
}
export function summarizeCounties(stations,{mode='live',now=Date.now()}={}){
 return countyNames.map(name=>{
  const unique=new Map();
  for(const s of stations.filter(s=>s.county?.replaceAll('台','臺')===name)){
   const id=String(s.id||s.name);const previous=unique.get(id);
   if(!previous||(observationTime(s.time)||0)>(observationTime(previous.time)||0))unique.set(id,s);
  }
  let rows=[...unique.values()].map(s=>({...s,quality:stationQuality(s,mode,now),included:false}));
  const valid=rows.filter(s=>s.quality==='valid');
  const latest=valid.length?Math.max(...valid.map(s=>observationTime(s.time))):null;
  const latestHour=latest===null?null:Math.floor(latest/3600000);
  rows=rows.map(s=>s.quality==='valid'?{...s,included:Math.floor(observationTime(s.time)/3600000)===latestHour,quality:Math.floor(observationTime(s.time)/3600000)===latestHour?'valid':'out_of_sync'}:s);
  const included=rows.filter(s=>s.included).sort((a,b)=>b.aqi-a.aqi||observationTime(b.time)-observationTime(a.time)||String(a.id).localeCompare(String(b.id)));
  const representative=included[0]||null;const times=included.map(s=>observationTime(s.time));
  return {name,aqi:representative?.aqi??null,grade:aqiGrade(representative?.aqi),pollutant:representative?.pollutant||null,representative,stations:rows,total:rows.length,validCount:included.length,excludedCount:rows.length-included.length,time:representative?.time||null,earliestTime:times.length?new Date(Math.min(...times)).toISOString():null,latestTime:times.length?new Date(Math.max(...times)).toISOString():null,mode,basis:'縣市測站最高 AQI',rule:countyRule};
 });
}
