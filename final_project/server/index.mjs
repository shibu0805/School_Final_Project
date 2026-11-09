import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getStations,get_historical_aqi,get_weather_forecast,find_nearest_stations,runs} from './data.mjs';
import {runAgent} from './agent.mjs';
import {guidelines} from './guidelines.mjs';
import {summarizeCounties,countyRule} from '../shared/air-quality.mjs';
import {CHAT_INTENT_VERSION} from '../shared/message-intent.mjs';
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 const url=new URL(req.url,'http://localhost');const mode=url.searchParams.get('mode')==='demo'?'demo':'live';
 const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
 try{
  if(url.pathname==='/api/status')return json({air:!!process.env.MOENV_API_KEY,weather:!!process.env.CWA_API_KEY,gemini:!!process.env.GEMINI_API_KEY,ollama:'需啟動本機服務',version:'1.0.0',chatIntentVersion:CHAT_INTENT_VERSION});
  if(url.pathname==='/api/stations')return json({stations:await getStations(mode)});
  if(url.pathname==='/api/counties')return json({counties:summarizeCounties(await getStations(mode),{mode}),rule:countyRule,generatedAt:new Date().toISOString(),mode});
  if(url.pathname==='/api/history')return json({history:get_historical_aqi(url.searchParams.get('station'),Math.min(72,Math.max(1,Number(url.searchParams.get('hours'))||24)),mode)});
  if(url.pathname==='/api/weather')return json(await get_weather_forecast(url.searchParams.get('county')||'臺中市',mode));
  if(url.pathname==='/api/guidelines')return json({guidelines});
  if(url.pathname==='/api/runs')return json({runs:runs()});
  if(url.pathname==='/api/nearby'){const lat=Number(url.searchParams.get('lat')),lon=Number(url.searchParams.get('lon'));if(!url.searchParams.has('lat')||!url.searchParams.has('lon')||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return json({error:'經緯度無效'},400);return json({stations:find_nearest_stations({lat,lon},await getStations(mode))});}
  if(url.pathname==='/api/chat'&&req.method==='POST'){
   // 限制本機 API 的跨來源寫入。
   // 同源請求（例如部署後的 https://xxx.onrender.com）一律允許。
   const origin=req.headers.origin;const sameOrigin=origin&&(()=>{try{return new URL(origin).host===req.headers.host;}catch{return false;}})();
   if(origin&&!sameOrigin&&!['http://127.0.0.1:5173','http://localhost:5173',`http://127.0.0.1:${process.env.PORT||8787}`,`http://localhost:${process.env.PORT||8787}`].includes(origin))return json({error:'來源不允許'},403);
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>24000)return json({error:'請縮短訊息內容'},413);}
   let input;try{input=JSON.parse(raw);}catch{return json({error:'JSON 格式錯誤'},400);}
   if(typeof input.message!=='string'||!input.message.trim()||input.message.length>4000)return json({error:'請輸入 1–4000 字問題'},400);
   return json(await runAgent(input));
  }
  if(url.pathname.startsWith('/api/'))return json({error:'找不到 API'},404);
  const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(path!==root&&!path.startsWith(root+sep))return json({error:'無效路徑'},403);
  const target=extname(path)?path:resolve(root,'index.html');
  try{const body=await readFile(target);res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.geojson':'application/geo+json; charset=utf-8','.json':'application/json; charset=utf-8'})[extname(target)]||'application/octet-stream'});res.end(body);}catch{json({error:'請先執行 npm run build，或使用 npm run dev 開發模式。'},404);}
 }catch(e){json({error:e.message?.includes('MOENV')||e.message?.startsWith('環境部')?e.message:'資料服務暫時無法使用，請檢查連線與設定後重試。'},503);}
});
// 本機只開放 127.0.0.1；雲端平台（Render 會設定 RENDER）需監聽 0.0.0.0 才能從外部連入，也可用 HOST 覆寫。
const host=process.env.HOST||(process.env.RENDER?'0.0.0.0':'127.0.0.1');
server.listen(Number(process.env.PORT)||8787,host,()=>console.log(`Airwise: http://${host}:${process.env.PORT||8787}`));
