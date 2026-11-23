import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup,within,act} from '@testing-library/react';
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {App} from '../src/Experience';
import {countyNames,summarizeCounties} from '../shared/air-quality.mjs';
import {readFileSync} from 'node:fs';
import {unrecognizedMessage,CHAT_INTENT_VERSION} from '../shared/message-intent.mjs';
const geo={type:'FeatureCollection',features:countyNames.map((name,i)=>({type:'Feature',properties:{COUNTYNAME:name},geometry:{type:'Polygon',coordinates:[[[120+i*.01,23],[120.1+i*.01,23],[120.1+i*.01,23.1],[120+i*.01,23.1],[120+i*.01,23]]]}}))};
const station={id:'demo-0',name:'忠明',county:'臺中市',aqi:68,pm25:18.2,pm10:37,o3:32,no2:16,so2:2.1,co:.4,pollutant:'PM2.5',time:new Date().toISOString(),lat:24.15,lon:120.64,stale:false,mode:'live',source:'https://data.moenv.gov.tw/dataset/detail/aqx_p_432'};
let requests:any[]=[];let offline=false;let recognition:any=null;let utterance:any=null;
function mockResult(request:any){if(["....","...","asdfghjkl"].includes(request.message))return {...unrecognizedMessage(request.profile),mode:request.mode,provider:"rules",trace:[]};const profile={county:request.profile.county||(/台中|臺中/.test(request.message)?'臺中市':undefined),activity:'跑步',group:/氣喘/.test(request.message)?'心肺疾病敏感族群':'一般民眾',time:'今天',intensity:'中',duration:30};return !profile.county?{reply:'你打算在哪個縣市活動呢？',profile,status:'clarification',trace:[],mode:request.mode,provider:'rules'}:{reply:'目前適合，可安排活動。',profile,status:'ok',summary:{county:profile.county,aqi:68,pollutant:'PM2.5',time:station.time,level:'普通',basis:'縣市測站最高 AQI',station:'忠明'},assessment:{status:'suitable',label:'適合',reason:'依目前測站資料可安排活動。'},actions:['留意身體狀況。','出門前再確認空品。'],details:{limitations:['不代表整個縣市。'],sources:['https://data.moenv.gov.tw/dataset/detail/aqx_p_432']},trace:[],validation:{passed:true},mode:request.mode,provider:'rules'};}
beforeEach(()=>{requests=[];offline=false;recognition=null;utterance=null;localStorage.clear();vi.stubGlobal('isSecureContext',true);vi.stubGlobal('fetch',vi.fn(async(input:any,options:any)=>{const url=String(input);let data:any={};let ok=true;
 if(url.endsWith('.geojson'))data=geo;
 else if(url.includes('/counties')){if(offline){ok=false;data={error:'金鑰未設定'};}else data={counties:summarizeCounties([{...station,mode:url.includes('demo')?'demo':'live'}],{mode:url.includes('demo')?'demo':'live'}),generatedAt:new Date().toISOString()};}
 else if(url.includes('/status'))data={air:false};
 else if(url.includes('/history'))data={history:[]};
 else if(url.includes('/chat')){const request=JSON.parse(options.body);requests.push(request);data=mockResult(request);}
 return {ok,json:async()=>data};
 }));Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:undefined});Object.defineProperty(window,'webkitSpeechRecognition',{configurable:true,value:undefined});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel:vi.fn(),getVoices:()=>[{lang:'zh-TW',name:'中文'}],speak:vi.fn(u=>{utterance=u;u.onstart?.();})}});vi.stubGlobal('SpeechSynthesisUtterance',class{lang='';rate=1;voice=null;onstart:any;onend:any;onerror:any;constructor(public text:string){}});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('建議區可切換真正的 Gemini 生成，並保存後續模型選擇',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>{
  if(String(input).includes('/chat')){
   const request=JSON.parse(options.body);requests.push(request);const result=mockResult(request);
   const gemini=request.provider==='gemini';
   return {ok:true,json:async()=>({...result,recommendationProvider:gemini?'gemini':'rules',recommendationModel:gemini?'gemini-3.1-flash-lite':null,actions:gemini?['依本次問題與觀測整理的 Gemini 建議。']:result.actions})} as Response;
  }
  return original(input,options);
 });
 await advisor();fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'現在台中適合出門嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await screen.findByText('規則建議');fireEvent.click(screen.getByRole('button',{name:'使用 Gemini 產生建議'}));
 await screen.findByText('Gemini 生成');expect(requests).toHaveLength(2);expect(requests[1].provider).toBe('gemini');expect(localStorage.getItem('airwise-provider')).toBe('gemini');
 const articles=screen.getAllByRole('article',{name:'AI 評估結果'});expect(within(articles[1]).getByText('依本次問題與觀測整理的 Gemini 建議。')).toBeTruthy();
});
test('Gemini 呼叫失敗時建議區明確標示規則來源與原因',async()=>{
 localStorage.setItem('airwise-provider','gemini');
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>String(input).includes('/chat')?{ok:true,json:async()=>({...mockResult(JSON.parse(options.body)),provider:'gemini',recommendationProvider:'rules',recommendationWarning:'Gemini 額度不足或請求過於頻繁，改用規則建議。'})} as Response:original(input,options));
 await advisor();fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'現在台中適合出門嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await screen.findByText('Gemini 額度不足或請求過於頻繁，改用規則建議。');expect(screen.getByText('規則建議')).toBeTruthy();expect(screen.queryByText('Gemini 生成')).toBeNull();
});
test('未指定活動顯示一般外出，明確沿用活動時才標示上題活動',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>{
  if(String(input).includes('/chat')){
   const request=JSON.parse(options.body),result=mockResult({...request,profile:{county:'臺中市'}});
   const inherited=request.message.includes('那去');
   return {ok:true,json:async()=>({...result,profile:{...result.profile,activity:inherited?'跑步':'其他戶外活動',activitySource:inherited?'inherited':'unspecified'},actions:inherited?['若要跑步，出門前確認空品。']:['若只是一般外出，可依身體狀況安排行程。']})} as Response;
  }
  return original(input,options);
 });
 await advisor();fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'現在台中空氣如何？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await screen.findByText('若只是一般外出，可依身體狀況安排行程。');
 expect(screen.getByText(/本次條件.*活動未指定，依一般外出評估/)).toBeTruthy();
 fireEvent.click(screen.getByText('詳細分析'));await waitFor(()=>expect(screen.getByText(/本次條件：/).textContent).not.toContain('30 分鐘'));
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'那去台北呢？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await screen.findByText(/本次條件.*沿用上題活動：跑步/);
});
test('出行評估可自由換語序，前端送交後端判斷並顯示新結果',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>{
  if(String(input).includes('/chat')){
   const request=JSON.parse(options.body);requests.push(request);
   const county=request.message.includes('彰化')?'彰化縣':'臺中市';
   return {ok:true,json:async()=>mockResult({...request,profile:{...request.profile,county}})} as Response;
  }
  return original(input,options);
 });
 await advisor();fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'今天台中適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));await screen.findByText('適合');
 const phrases=['那去彰化呢','那適合去彰化嗎','彰化適合去嗎','那彰化還能去嗎'];
 for(let i=0;i<phrases.length;i++){
  fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:phrases[i]}});fireEvent.click(screen.getByLabelText('送出問題'));
  await waitFor(()=>expect(screen.getAllByRole('article',{name:'AI 評估結果'})).toHaveLength(i+2));
  expect(requests).toHaveLength(i+2);expect((screen.getByLabelText('顧問目前縣市') as HTMLSelectElement).value).toBe('彰化縣');
  expect(requests.at(-1).clientIntentVersion).toBe(CHAT_INTENT_VERSION);
 }
 expect(screen.queryByText(/我沒有理解這次的問題/)).toBeNull();
});
test('截圖中的「.... → 那彰化市適合嗎」不會連續誤擋有效追問',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>{
  if(String(input).includes('/chat')){
   const request=JSON.parse(options.body);requests.push(request);
   const county=request.message.includes('彰化市')?'彰化縣':'嘉義市';
   return {ok:true,json:async()=>mockResult({...request,profile:{...request.profile,county}})} as Response;
  }
  return original(input,options);
 });
 await advisor();
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'今天嘉義市適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));await screen.findByText('適合');
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'....'}});fireEvent.click(screen.getByLabelText('送出問題'));await screen.findByText(/我沒有理解這次的問題/);
 expect(requests).toHaveLength(2);
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'那彰化市適合嗎'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await waitFor(()=>expect(requests).toHaveLength(3));
 await waitFor(()=>expect((screen.getByLabelText('顧問目前縣市') as HTMLSelectElement).value).toBe('彰化縣'));
 const turns=document.querySelectorAll('.aw-chat-turn');expect(turns).toHaveLength(3);
 expect(within(turns[2] as HTMLElement).getByRole('article',{name:'AI 評估結果'})).toBeTruthy();
 expect(within(turns[2] as HTMLElement).queryByText(/我沒有理解這次的問題/)).toBeNull();
});
test('縣市卡片顯示目前預報時段的溫度範圍、降雨機率與來源',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 const start=new Date(Date.now()-3600000).toISOString(),end=new Date(Date.now()+3600000).toISOString();
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>String(input).includes('/weather')?{ok:true,json:async()=>({status:'live',periods:[{start:new Date(Date.now()-86400000).toISOString(),end:start,description:'過期',min:10,max:15,pop:90},{start,end,description:'多雲',min:21,max:26,pop:0}]})} as Response:original(input,options));
 render(<App/>);fireEvent.click(await screen.findByRole('button',{name:/臺中市，縣市測站最高/}));
 const card=screen.getByRole('region',{name:'臺中市空品資訊'}),weather=within(card).getByRole('region',{name:'臺中市天氣預報'});
 await within(weather).findByText('21–26');expect(weather.textContent).toContain('0 %');
 expect(weather.textContent).toContain('中央氣象署');expect(weather.textContent).toContain('預報時段');expect(weather.textContent).not.toContain('過期');
});
test('切換縣市時不顯示前一縣市晚到的天氣回覆',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;let finish:any;
 const period={start:new Date(Date.now()-3600000).toISOString(),end:new Date(Date.now()+3600000).toISOString(),description:'晴天',min:28,max:32,pop:10};
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>{
  const url=String(input);
  if(url.includes('/weather')){
   if(decodeURIComponent(url).includes('臺中市'))return new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>({status:'live',periods:[{...period,min:15,max:20,pop:80}]})} as Response);});
   return {ok:true,json:async()=>({status:'live',periods:[period]})} as Response;
  }
  return original(input,options);
 });
 render(<App/>);fireEvent.click(await screen.findByRole('button',{name:/臺中市，縣市測站最高/}));
 await waitFor(()=>expect(typeof finish).toBe('function'));
 fireEvent.click(screen.getByRole('button',{name:'新北市，暫無資料'}));
 const weather=screen.getByRole('region',{name:'新北市天氣預報'});await within(weather).findByText('28–32');
 await act(async()=>finish());expect(weather.textContent).toContain('28–32');expect(weather.textContent).not.toContain('15–20');
});
test('天氣資料失敗時保留 AQI，不把缺值當成零度或零降雨',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>String(input).includes('/weather')?{ok:true,json:async()=>({status:'error',periods:[],message:'氣象資料取得失敗'})} as Response:original(input,options));
 render(<App/>);fireEvent.click(await screen.findByRole('button',{name:/臺中市，縣市測站最高/}));
 const weather=screen.getByRole('region',{name:'臺中市天氣預報'});await within(weather).findByText('氣象資料取得失敗');
 expect(weather.textContent).not.toContain('0 %');expect(weather.textContent).not.toContain('0 °C');
 expect(within(screen.getByRole('region',{name:'臺中市空品資訊'})).getByText('68',{selector:'strong'})).toBeTruthy();
});
test('先問嘉義，再問台中的狀況會查新縣市，不被前端誤擋',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>{
  if(String(input).includes('/chat')){
   const request=JSON.parse(options.body);requests.push(request);
   const county=request.message.includes('台中')?'臺中市':'嘉義市';
   return {ok:true,json:async()=>mockResult({...request,profile:{...request.profile,county}})} as Response;
  }
  return original(input,options);
 });
 await advisor();
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'今天嘉義市適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await screen.findByText('適合');expect((screen.getByLabelText('顧問目前縣市') as HTMLSelectElement).value).toBe('嘉義市');
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'台中的狀況'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await waitFor(()=>expect(screen.getAllByRole('article',{name:'AI 評估結果'})).toHaveLength(2));
 expect(requests).toHaveLength(2);expect(requests[1].profile.county).toBe('嘉義市');
 expect((screen.getByLabelText('顧問目前縣市') as HTMLSelectElement).value).toBe('臺中市');
 expect(screen.queryByText(/我沒有理解這次的問題/)).toBeNull();
});
test('明日空品與天氣預報直接顯示，不藏在詳細分析內',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>{
  if(String(input).includes('/chat')){
   const request=JSON.parse(options.body),result=mockResult(request);
   return {ok:true,json:async()=>({...result,profile:{...result.profile,time:'明天'},assessment:{status:'adjust',label:'預報參考：建議調整',reason:'依區域預報規劃，出門前確認。'},details:{...result.details,airForecast:{status:'live',area:'中部',date:'2026-11-23',publishedAt:station.time,source:'https://data.moenv.gov.tw/dataset/detail/aqf_p_01',matchesRequestedPeriod:true,periods:[{period:'全日',aqi:85,pollutant:'細懸浮微粒',grade:{label:'普通',color:'#ffff00'}}]},weather:{periods:[{start:'2026-11-23 06:00',end:'2026-11-23 18:00',description:'多雲短暫雨',min:20,max:25,pop:40}]}}})} as Response;
  }
  return original(input,options);
 });
 await advisor();fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'明天台中適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 const panel=await screen.findByRole('region',{name:'指定日期預報'});
 expect(panel.textContent).toContain('中部空品區');expect(panel.textContent).toContain('85');
 expect(panel.textContent).toContain('多雲短暫雨');expect(panel.textContent).toContain('降雨機率 40%');
 expect(screen.getByText('目前觀測（非明日預報）')).toBeTruthy();
 expect(screen.getByText('詳細分析').closest('details')?.open).toBe(false);
});
test('東沙南沙不沿用高雄 AQI，並放大實際點擊的離島',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 const realGeo=JSON.parse(readFileSync('public/geo/taiwan-counties.geojson','utf8'));
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>String(input).endsWith('.geojson')?{ok:true,json:async()=>realGeo} as Response:original(input,options));
 render(<App/>);
 const main=await screen.findByRole('button',{name:'高雄市，暫無資料'});
 for(const name of ['東沙群島','南沙太平島']){
  const island=screen.getByRole('button',{name:name+'，暫無資料'});
  expect(island.getAttribute('fill')).toBe('#c3ccd1');
  fireEvent.click(island);
  const card=screen.getByRole('region',{name:'離島空品資訊'});
  expect(within(card).getByText(name)).toBeTruthy();
  expect(within(card).getByText('當地暫無空品資料')).toBeTruthy();
  expect(island.getAttribute('transform')).toContain('scale(1.6)');
  expect(main.getAttribute('transform')).toBeNull();
  expect((screen.getByLabelText('快速選擇縣市') as HTMLSelectElement).value).toBe('');
 }
 fireEvent.click(main);
 expect(screen.queryByRole('region',{name:'離島空品資訊'})).toBeNull();
 expect(main.getAttribute('transform')).toContain('scale(1.6)');
});
test('顧問模型選擇可跨重新載入保存',async()=>{
 const first=render(<App/>);
 fireEvent.click(screen.getByLabelText('資料與模型設定'));
 fireEvent.change(screen.getByLabelText('顧問模型'),{target:{value:'gemini'}});
 fireEvent.click(screen.getByText('儲存並返回'));
 expect(localStorage.getItem('airwise-provider')).toBe('gemini');first.unmount();
 render(<App/>);fireEvent.click(screen.getByLabelText('資料與模型設定'));
 expect((screen.getByLabelText('顧問模型') as HTMLSelectElement).value).toBe('gemini');
});
test('金鑰已設定不代表連線成功，測試後才顯示結果',async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(input:any,options:any)=>{
  const url=String(input);
  if(url.includes('/status'))return {ok:true,json:async()=>({air:true,weather:true,gemini:true})} as Response;
  if(url.includes('/connections'))return {ok:true,json:async()=>({status:'error',message:'額度不足或請求過於頻繁'})} as Response;
  return original(input,options);
 });
 render(<App/>);fireEvent.click(screen.getByLabelText('資料與模型設定'));
 await screen.findAllByText('尚未測試連線');
 expect(screen.queryByText('連線成功')).toBeNull();
 fireEvent.click(screen.getByLabelText('測試 Gemini 連線'));
 await screen.findByText('額度不足或請求過於頻繁');
});
test('從顧問切回地圖再返回會保留對話，仍可延續追問',async()=>{
 await advisor();
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'今天台中適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await screen.findByText('適合');
 fireEvent.click(screen.getByRole('button',{name:'全台空品地圖'}));
 expect(screen.queryByRole('article',{name:'AI 評估結果'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'AI 語音顧問'}));
 expect(screen.getAllByRole('article',{name:'AI 評估結果'})).toHaveLength(1);
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'那如果我是氣喘患者呢？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await waitFor(()=>expect(screen.getAllByRole('article',{name:'AI 評估結果'})).toHaveLength(2));
 expect(requests[1].profile.county).toBe('臺中市');
});
async function advisor(){render(<App/>);await screen.findByRole('group',{name:'臺灣 22 縣市空品互動地圖'});fireEvent.click(screen.getByRole('button',{name:'AI 語音顧問'}));}
test('首頁顯示22縣市地圖與官方色階，主導覽只有兩頁',async()=>{render(<App/>);const map=await screen.findByRole('group',{name:'臺灣 22 縣市空品互動地圖'});expect(map.querySelectorAll('.county-shape').length).toBe(22);expect(screen.getByLabelText('環境部 AQI 分級圖例')).toBeTruthy();expect(within(screen.getByRole('navigation',{name:'主要導覽'})).getAllByRole('button').length).toBe(2);});
test('Hover 顯示縣市，點擊後開啟卡片與唯一主要操作',async()=>{render(<App/>);const region=await screen.findByRole('button',{name:/臺中市，縣市測站最高/});fireEvent.mouseEnter(region);expect(screen.getByRole('status').textContent).toContain('臺中市');fireEvent.click(region);const card=screen.getByRole('region',{name:'臺中市空品資訊'});expect(within(card).getByText('68',{selector:'strong'})).toBeTruthy();expect(within(card).getAllByRole('button').length).toBe(1);fireEvent.click(within(card).getByRole('button',{name:'問問 AI 顧問'}));expect((screen.getByLabelText('顧問目前縣市') as HTMLSelectElement).value).toBe('臺中市');});
test('無資料縣市灰色且清楚顯示暫無資料',async()=>{render(<App/>);const region=await screen.findByRole('button',{name:'金門縣，暫無資料'});expect(region.getAttribute('fill')).toBe('#c3ccd1');fireEvent.keyDown(region,{key:'Enter'});expect(within(screen.getByRole('region',{name:'金門縣空品資訊'})).getByText('暫無資料')).toBeTruthy();});
test('官方 API 失敗不保留先前展示顏色',async()=>{render(<App/>);await screen.findByRole('button',{name:/臺中市，縣市測站最高/});offline=true;fireEvent.change(screen.getByLabelText('資料模式'),{target:{value:'demo'}});await screen.findByText('金鑰未設定');expect(screen.getByRole('button',{name:'臺中市，暫無資料'}).getAttribute('fill')).toBe('#c3ccd1');});
test('可直接進入顧問，沒有地點時自然詢問，不顯示個人資料表',async()=>{await advisor();expect((screen.getByLabelText('顧問目前縣市') as HTMLSelectElement).value).toBe('');fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'適合出去跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));await screen.findByText('你打算在哪個縣市活動呢？');expect(screen.queryByLabelText('使用者族群')).toBeNull();});
test('簡潔分區回答與詳細分析預設收合；追問保留上下文',async()=>{await advisor();fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'今天台中適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));await screen.findByText('適合');expect(screen.getByText('目前狀況')).toBeTruthy();expect(screen.getByText('建議做法')).toBeTruthy();expect(screen.getByText('詳細分析').closest('details')?.open).toBe(false);fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'那如果我是氣喘患者呢？'}});fireEvent.click(screen.getByLabelText('送出問題'));await waitFor(()=>expect(requests.length).toBe(2));expect(requests[1].profile.county).toBe('臺中市');expect(requests[1].profile.activity).toBe('跑步');expect(requests[1].profile.time).toBe('今天');});
test('第二輪無法辨識時顯示補充提示，不再顯示另一張舊評估卡，之後仍可追問',async()=>{
 await advisor();
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'今天台中適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await screen.findByText('適合');
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'asdfghjkl'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await screen.findByText(/我沒有理解這次的問題/);
 expect(requests).toHaveLength(2);
 expect(screen.getAllByRole('article',{name:'AI 評估結果'})).toHaveLength(1);
 const turns=document.querySelectorAll('.aw-chat-turn');expect(turns).toHaveLength(2);
 expect(within(turns[1] as HTMLElement).queryByRole('article')).toBeNull();
 expect((screen.getByLabelText('顧問目前縣市') as HTMLSelectElement).value).toBe('臺中市');
 fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'那如果我是氣喘患者呢？'}});fireEvent.click(screen.getByLabelText('送出問題'));
 await waitFor(()=>expect(screen.getAllByRole('article',{name:'AI 評估結果'})).toHaveLength(2));
 expect(requests[2].profile.county).toBe('臺中市');expect(requests[2].profile.activity).toBe('跑步');
});
test('不支援 SpeechRecognition 時顯示提示與可用文字輸入',async()=>{await advisor();expect(screen.getByText('此瀏覽器不支援語音辨識，可直接輸入文字')).toBeTruthy();fireEvent.click(screen.getByLabelText('開始語音提問'));expect(screen.getByRole('alert').textContent).toContain('未提供 Speech Recognition');expect(screen.getByLabelText('輸入出門問題')).toBeTruthy();});
function installRecognition(){Object.defineProperty(window,'webkitSpeechRecognition',{configurable:true,value:class{lang='';continuous=false;interimResults=false;maxAlternatives=1;onstart:any;onresult:any;onerror:any;onend:any;constructor(){recognition=this;}start(){this.onstart?.();}stop(){this.onend?.();}abort(){}}});}
test('麥克風辨識繁體中文、顯示結果並送到原 Agent',async()=>{installRecognition();await advisor();fireEvent.click(screen.getByLabelText('開始語音提問'));expect(recognition.lang).toBe('zh-TW');expect(screen.getByLabelText('停止聆聽')).toBeTruthy();await act(async()=>{recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'今天台中適合跑步嗎？'}],{isFinal:true})]});});await screen.findByText('辨識結果：今天台中適合跑步嗎？');expect(requests[0].message).toBe('今天台中適合跑步嗎？');expect(screen.getByText('適合')).toBeTruthy();});
test('麥克風拒絕、無語音與網路錯誤皆提供明確替代提示',async()=>{installRecognition();await advisor();for(const error of ['not-allowed','no-speech','network']){fireEvent.click(screen.getByLabelText('開始語音提問'));await act(async()=>recognition.onerror({error}));expect(screen.getByRole('alert').textContent).toMatch(/文字|打字/);expect(screen.getByLabelText('輸入出門問題')).toBeTruthy();}});
test('點選朗讀後使用中文聲音並可停止，不自動播放',async()=>{await advisor();fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'今天台中適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));await screen.findByText('適合');expect(window.speechSynthesis.speak).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'朗讀回答'}));expect(utterance.lang).toBe('zh-TW');expect(screen.getByRole('button',{name:'停止朗讀'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'停止朗讀'}));expect(window.speechSynthesis.cancel).toHaveBeenCalled();});
test('重新對話不需重整，清除舊條件並保留選定縣市',async()=>{await advisor();fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'今天台中適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));await screen.findByText('適合');fireEvent.click(screen.getByRole('button',{name:'重新對話'}));expect(screen.queryByRole('article',{name:'AI 評估結果'})).toBeNull();expect((screen.getByLabelText('顧問目前縣市') as HTMLSelectElement).value).toBe('臺中市');expect((screen.getByLabelText('輸入出門問題') as HTMLInputElement).value).toBe('');fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'現在可以散步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));await waitFor(()=>expect(requests.length).toBe(2));expect(requests[1].profile).toEqual({county:'臺中市'});await screen.findByText('適合');});
test('重新對話取消舊請求，延遲回覆不會覆蓋新狀態',async()=>{await advisor();fireEvent.change(screen.getByLabelText('顧問目前縣市'),{target:{value:'臺中市'}});let finish:any;vi.mocked(fetch).mockImplementationOnce(async(_input:any,options:any)=>new Promise<any>(resolve=>{finish=()=>resolve({ok:true,json:async()=>mockResult(JSON.parse(options.body))});}));fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'明天早上適合跑步嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));await waitFor(()=>expect(typeof finish).toBe('function'));fireEvent.click(screen.getByRole('button',{name:'重新對話'}));await act(async()=>finish());expect(screen.queryByRole('article',{name:'AI 評估結果'})).toBeNull();expect(screen.queryByText('明天早上適合跑步嗎？')).toBeNull();expect((screen.getByLabelText('顧問目前縣市') as HTMLSelectElement).value).toBe('臺中市');expect((screen.getByLabelText('送出問題') as HTMLButtonElement).disabled).toBe(true);});
