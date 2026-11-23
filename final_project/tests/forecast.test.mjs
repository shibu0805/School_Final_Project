import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forecastArea,targetDate,selectAirForecast,getAirForecast,filterWeatherForDate} from '../server/forecast.mjs';
import {runAgent,validate_response} from '../server/agent.mjs';
import {countyNames} from '../shared/air-quality.mjs';
const now=Date.parse('2026-11-22T22:30:00+08:00');
const profile={county:'臺中市',time:'明天'};
const row={area:'中部',forecastdate:'2026-11-23',publishtime:'2026-11-22 22:00',aqi:'75',timeperiod:'全日',majorpollutant:'細懸浮微粒'};
test('預報使用臺灣日期，縣市映射到所屬空品區',()=>{
 assert.equal(targetDate(profile,Date.parse('2026-11-22T17:00:00Z')),'2026-11-24');
 assert(countyNames.every(c=>forecastArea(c)));
 assert.equal(forecastArea('台中市'),'中部');assert.equal(forecastArea('連江縣'),'馬祖');assert.equal(forecastArea('東沙'),undefined);
});
test('預報只取指定空品區、日期與最新發布批次，不混用過去時段',()=>{
 const result=selectAirForecast([row,{...row,area:'北部',aqi:'180'},{...row,forecastdate:'2026-11-22',aqi:'200'},{...row,publishtime:'2026-11-22 16:30',timeperiod:'上午',aqi:'90'}],profile,now);
 assert.equal(result.status,'live');assert.equal(result.selected.aqi,75);assert.equal(result.periods.length,1);assert.equal(result.date,'2026-11-23');
});
test('上午對應上午預報；晚上不可冒用全日為對應時段',()=>{
 const rows=[row,{...row,timeperiod:'上午',aqi:'55'}];
 const morning=selectAirForecast(rows,{...profile,timeDetail:'早上'},now);
 assert.equal(morning.selected.aqi,55);assert.equal(morning.matchesRequestedPeriod,true);
 const evening=selectAirForecast(rows,{...profile,timeDetail:'晚上'},now);
 assert.equal(evening.selected.aqi,75);assert.equal(evening.matchesRequestedPeriod,false);
});
test('空白、超界 AQI、過期、未來發布、錯誤日期不作為預報',()=>{
 for(const bad of [{aqi:''},{aqi:'501'},{aqi:'-1'},{aqi:'abc'},{publishtime:'2026-11-20 22:00'},{publishtime:'2026-11-23 22:00'},{forecastdate:'2026-11-24'}])assert.equal(selectAirForecast([{...row,...bad}],profile,now).status,'unavailable');
});
test('只保留涵蓋明天的天氣，不拿今天白天當明日預報',()=>{
 const weather={periods:[{start:'2026-11-22 06:00',end:'2026-11-22 18:00'},{start:'2026-11-22 18:00',end:'2026-11-23 06:00'},{start:'2026-11-23 06:00',end:'2026-11-23 18:00'},{start:'2026-11-24 00:00',end:'2026-11-24 06:00'}]};
 const result=filterWeatherForDate(weather,profile,now);assert.equal(result.periods.length,2);assert.equal(result.periods[0],weather.periods[1]);
 assert.equal(filterWeatherForDate({periods:[]},profile,now).periods.length,0);
});
test('預報 API 支援陣列與 records；失敗不造資料',async t=>{
 const previous=process.env.MOENV_API_KEY;process.env.MOENV_API_KEY='test';t.after(()=>{if(previous===undefined)delete process.env.MOENV_API_KEY;else process.env.MOENV_API_KEY=previous;});
 for(const body of [[row],{records:[row]}])assert.equal((await getAirForecast(profile,'live',async()=>({ok:true,json:async()=>body}),now)).selected.aqi,75);
 assert.equal((await getAirForecast(profile,'live',async()=>{throw Error();},now)).status,'error');
 assert.equal((await getAirForecast(profile,'demo',async()=>{throw Error('Unexpected fetch');},now)).status,'unavailable');
});
test('明日預報不依賴即時測站成功，並驗證預報數字',async t=>{
 const previous=process.env.MOENV_API_KEY;process.env.MOENV_API_KEY='test';t.after(()=>{if(previous===undefined)delete process.env.MOENV_API_KEY;else process.env.MOENV_API_KEY=previous;});
 const current=Date.now(),fresh={...row,forecastdate:targetDate(profile,current),publishtime:new Date(current).toISOString()};
 t.mock.method(globalThis,'fetch',async url=>{
  if(String(url).includes('aqf_p_01'))return {ok:true,json:async()=>({records:[fresh]})};
  throw Error('Current observations offline');
 });
 const result=await runAgent({message:'明天台中適合跑步嗎？',profile:{},mode:'live'});
 assert.equal(result.details.airForecast.status,'live');assert.equal(result.summary.aqi,null);
 assert.match(result.reply,/預報 AQI 75/);assert.match(result.assessment.label,/預報參考/);
 assert.equal(result.validation.passed,true);assert.equal(result.comparison.best,null);
 const forged={...result,reply:'預報 AQI 999'};assert.equal(validate_response(forged,result.station,result.details.airForecast).passed,false);
});
