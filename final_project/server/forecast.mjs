import {aqiGrade,observationTime,validAqi} from '../shared/air-quality.mjs';

export const forecastSource='https://data.moenv.gov.tw/dataset/detail/aqf_p_01';
const regions={北部:['臺北市','新北市','基隆市','桃園市'],竹苗:['新竹市','新竹縣','苗栗縣'],中部:['臺中市','彰化縣','南投縣'],雲嘉南:['雲林縣','嘉義市','嘉義縣','臺南市'],高屏:['高雄市','屏東縣'],宜蘭:['宜蘭縣'],花東:['花蓮縣','臺東縣'],澎湖:['澎湖縣'],金門:['金門縣'],馬祖:['連江縣']};
export function forecastArea(county){return Object.keys(regions).find(area=>regions[area].includes(county?.replaceAll('台','臺')));}
export function targetDate(profile,now=Date.now()){
 return new Date(now+8*3600000+(profile.time==='明天'?86400000:0)).toISOString().slice(0,10);
}
export function selectAirForecast(rows,profile,now=Date.now()){
 const area=forecastArea(profile.county),date=targetDate(profile,now);
 const missing={status:'unavailable',source:forecastSource,area,date,periods:[],message:'尚未取得指定日期可用的官方空品預報。'};
 if(!area)return missing;
 const candidates=rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.toLowerCase(),v]))).map(r=>({
  area:String(r.area||'').replace(/空品區$/,''),date:String(r.forecastdate||'').replaceAll('/','-').slice(0,10),
  aqi:r.aqi==null||String(r.aqi).trim()===''?null:Number(r.aqi),period:String(r.timeperiod||'全日'),
  publishedAt:r.publishtime,pollutant:r.majorpollutant||null
 })).filter(r=>r.area===area&&r.date===date&&validAqi(r.aqi)&&Number.isFinite(observationTime(r.publishedAt))&&now-observationTime(r.publishedAt)<=36*3600000&&observationTime(r.publishedAt)<=now+5*60000);
 if(!candidates.length)return missing;
 // Do not mix periods from different forecast bulletins.
 const latest=Math.max(...candidates.map(r=>observationTime(r.publishedAt)));
 const periods=[...new Map(candidates.filter(r=>observationTime(r.publishedAt)===latest).map(r=>[r.period,{...r,grade:aqiGrade(r.aqi)}])).values()];
 const wanted=/早上|上午/.test(profile.timeDetail||'')?'上午':/下午/.test(profile.timeDetail||'')?'下午':null;
 const selected=(wanted&&periods.find(p=>p.period===wanted))||periods.find(p=>/全日|整日/.test(p.period));
 if(!selected)return {...missing,message:'目前預報沒有指定日期的全日或對應時段資料。'};
 return {status:'live',source:forecastSource,area,date,publishedAt:selected.publishedAt,periods,selected,matchesRequestedPeriod:!profile.timeDetail||selected.period===wanted,message:'區域預報供行程規劃參考，不代表個別地點或逐時實際空品。'};
}
let cache={at:0,rows:[]};
export async function getAirForecast(profile,mode='live',fetcher=fetch,now=Date.now()){
 if(mode==='demo')return {status:'unavailable',source:forecastSource,periods:[],message:'教學展示模式未提供明日空品模擬預報。'};
 if(!process.env.MOENV_API_KEY)return {status:'unconfigured',source:forecastSource,periods:[],message:'環境部金鑰尚未設定，無法查詢空品預報。'};
 try{
  if(fetcher!==fetch||!cache.rows.length||now-cache.at>5*60000){
   const url=new URL('https://data.moenv.gov.tw/api/v2/aqf_p_01');
   url.search=new URLSearchParams({api_key:process.env.MOENV_API_KEY,limit:'1000',format:'json',sort:'publishtime desc'});
   const response=await fetcher(url,{signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error();
   const body=await response.json(),rows=Array.isArray(body)?body:body.records;
   if(!Array.isArray(rows))throw Error();
   if(fetcher===fetch)cache={at:now,rows};
   return selectAirForecast(rows,profile,now);
  }
  return selectAirForecast(cache.rows,profile,now);
 }catch{return {status:'error',source:forecastSource,periods:[],message:'官方空品預報暫時無法取得，請稍後重試；不以目前 AQI 代替明日預報。'};}
}

export function filterWeatherForDate(weather,profile,now=Date.now()){
 if(!weather||profile.time!=='明天')return weather;
 const date=targetDate(profile,now),start=Date.parse(date+'T00:00:00+08:00'),end=start+86400000;
 const periods=weather.periods.filter(p=>observationTime(p.start)<end&&observationTime(p.end)>start);
 return {...weather,date,periods,...(!periods.length?{message:'目前取得的天氣預報未涵蓋明天，請稍後再查詢。'}:{})};
}
