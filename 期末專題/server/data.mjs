import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {observationTime} from '../shared/air-quality.mjs';
mkdirSync(new URL('../data/',import.meta.url),{recursive:true});
const db=new DatabaseSync(process.env.AIRWISE_DB||fileURLToPath(new URL('../data/airwise.sqlite',import.meta.url)));
db.exec(`CREATE TABLE IF NOT EXISTS snapshots (station TEXT, time TEXT, mode TEXT, payload TEXT, PRIMARY KEY(station,time,mode)); CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, created_at TEXT, payload TEXT);`);
export const sources={air:'https://data.moenv.gov.tw/dataset/detail/aqx_p_432',weather:'https://opendata.cwa.gov.tw/dataset/forecast/F-C0032-001'};
export function number(value){if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
export function normalize(row,now=Date.now()) {
 const r=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.toLowerCase(),v]));
 const rawTime=r.publishtime||r.publish_time;
 const time=rawTime?String(rawTime).replaceAll('/','-'):null;
 const timestamp=observationTime(time);
 const aqi=number(r.aqi);
 return {id:String(r.siteid||r.sitename),name:r.sitename,county:r.county,aqi:aqi!==null&&aqi<=500&&Number.isInteger(aqi)?aqi:null,pm25:number(r['pm2.5']),pm10:number(r.pm10),o3:number(r.o3),no2:number(r.no2),so2:number(r.so2),co:number(r.co),pollutant:r.pollutant||null,time,lat:number(r.latitude),lon:number(r.longitude),stale:!Number.isFinite(timestamp)||now-timestamp>2*3600_000||timestamp>now+3600_000,mode:'live',source:sources.air};
}
// 明確的教學模擬資料，絕不作為真實即時監測或研究成果。
export function demoStations(){return [
 ['忠明','臺中市',24.1519,120.6411,68,18.2,37,32,16,2.1,.4,'PM2.5'],
 ['西屯','臺中市',24.179,120.6169,82,24.1,45,38,19,2.7,.5,'PM2.5'],
 ['大里','臺中市',24.0996,120.6784,112,36.4,61,42,24,3.1,.6,'PM2.5'],
 ['沙鹿','臺中市',24.2256,120.5688,48,10.3,25,28,12,1.8,.3,''],
 ['古亭','臺北市',25.0206,121.5296,42,9.6,21,25,14,1.7,.3,''],
 ['松山','臺北市',25.05,121.5786,57,14.3,29,30,17,2.1,.4,'PM2.5'],
 ['板橋','新北市',25.0129,121.4587,74,20.8,39,35,21,2.3,.4,'PM2.5'],
 ['前金','高雄市',22.6339,120.2868,153,52.1,80,60,28,4.2,.7,'PM2.5'],
 ['臺南','臺南市',22.984,120.2026,107,32.5,55,48,22,3.4,.5,'PM2.5'],
 ['花蓮','花蓮縣',23.971,121.5998,29,5.4,14,19,7,1.1,.2,'']
 ].map((x,i)=>({id:'demo-'+i,name:x[0],county:x[1],lat:x[2],lon:x[3],aqi:x[4],pm25:x[5],pm10:x[6],o3:x[7],no2:x[8],so2:x[9],co:x[10],pollutant:x[11]||null,time:'2026-11-01 12:00:00',stale:false,mode:'demo',source:'內建教學模擬快照（非官方觀測）'}));}
let cache={at:0,stations:[]};
export function extractStationRecords(body){
 const records=Array.isArray(body)?body:body?.records;
 if(!Array.isArray(records)||!records.length)throw new Error('環境部未回傳測站資料。');
 return records;
}
export async function getStations(mode='live',fetcher=fetch){
 if(mode==='demo')return demoStations();
 if(!process.env.MOENV_API_KEY)throw new Error('尚未設定 MOENV_API_KEY。請設定 .env，或切換「展示模式」。');
 if(cache.stations.length&&Date.now()-cache.at<300_000)return cache.stations;
 const url=new URL('https://data.moenv.gov.tw/api/v2/aqx_p_432');url.search=new URLSearchParams({api_key:process.env.MOENV_API_KEY,limit:'1000',format:'json'});
 const res=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error('環境部資料服務暫時無法使用，請檢查金鑰或稍後重試。');
 const records=extractStationRecords(await res.json());
 const stations=records.map(r=>normalize(r)).filter(s=>s.name&&s.county);
 for(const s of stations)db.prepare('INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?)').run(s.id,s.time||new Date().toISOString(),'live',JSON.stringify(s));
 cache={at:Date.now(),stations};return stations;
}
export function get_historical_aqi(station,hours=24,mode='live'){
 if(mode==='demo'){const s=demoStations().find(s=>s.id===station);if(!s)return [];return Array.from({length:Math.min(hours,72)},(_,i)=>{const aqi=Math.round(Math.max(12,s.aqi+Math.sin(i*.61)*18+Math.cos(i*.27)*9));return {...s,time:new Date(Date.parse('2026-11-01T12:00:00+08:00')-(hours-1-i)*3600000).toISOString(),aqi,pm25:Math.round(aqi*.27*10)/10,o3:Math.round(25+Math.sin(i*.4)*10),mode:'demo'};});}
 const threshold=Date.now()-hours*3600000;
 const records=db.prepare('SELECT payload FROM snapshots WHERE station=? AND mode=? ORDER BY time').all(station,'live').map(r=>{const s=JSON.parse(r.payload);return {...s,time:s.time?.replaceAll('/','-')};}).filter(s=>observationTime(s.time)>=threshold&&observationTime(s.time)<=Date.now()+5*60000);
 return [...new Map(records.map(s=>[observationTime(s.time),s])).values()].sort((a,b)=>observationTime(a.time)-observationTime(b.time));
}
export function haversine(a,b){const rad=n=>n*Math.PI/180;const dl=rad(b.lat-a.lat),dn=rad(b.lon-a.lon);const q=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;return 6371*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));}
export function find_nearest_stations(location,stations){return stations.filter(s=>s.aqi!==null&&!s.stale&&s.lat!==null&&s.lon!==null).map(s=>({...s,distance:Math.round(haversine(location,s)*10)/10})).sort((a,b)=>a.distance-b.distance).slice(0,3);}
export async function get_weather_forecast(county,mode='live',fetcher=fetch){
 if(mode==='demo')return {status:'demo',source:'教學模擬情境',periods:[{start:'2026-11-01 12:00',end:'2026-11-01 18:00',description:'多雲',min:23,max:28,pop:20}]};
 if(!process.env.CWA_API_KEY)return {status:'unconfigured',source:sources.weather,periods:[],message:'氣象署金鑰尚未設定，無法加入天氣因素。'};
 try{const url=new URL('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001');url.search=new URLSearchParams({Authorization:process.env.CWA_API_KEY,locationName:county});const res=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error();const b=await res.json();const e=b.records?.location?.[0]?.weatherElement;if(!Array.isArray(e))throw Error();const wx=e.find(x=>x.elementName==='Wx')?.time||[];const val=(key,i)=>number(e.find(x=>x.elementName===key)?.time?.[i]?.parameter?.parameterName);return {status:'live',source:sources.weather,periods:wx.map((x,i)=>({start:x.startTime,end:x.endTime,description:x.parameter.parameterName,min:val('MinT',i),max:val('MaxT',i),pop:val('PoP',i)}))};}catch{return {status:'error',source:sources.weather,periods:[],message:'氣象資料取得失敗，本次分析未採用天氣因素。'};}
}
export function saveRun(run){const result=db.prepare('INSERT INTO runs(created_at,payload) VALUES (?,?)').run(new Date().toISOString(),JSON.stringify(run));return Number(result.lastInsertRowid);}
export function runs(){return db.prepare('SELECT id,created_at,payload FROM runs ORDER BY id DESC LIMIT 50').all().map(r=>({id:r.id,created_at:r.created_at,...JSON.parse(r.payload)}));}
