import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntent,runAgent} from '../server/agent.mjs';
import {isAirQualityMessage as frontendIntent,findCounty} from '../shared/message-intent.mjs';
import {isAirQualityMessage as backendIntent} from '../server/message-intent.mjs';
const previous={activitySource:'explicit',county:'臺中市',activity:'跑步',group:'一般民眾',intensity:'高',duration:30,time:'明天',timeDetail:'早上'};
test('換地點的出行句型可泛用於所有縣市，保留對話條件',()=>{
 const templates=[name=>`那去${name}呢`,name=>`那適合去${name}嗎`,name=>`那去${name}適合嗎`,name=>`${name}適合去嗎`,name=>`那${name}還能去嗎`,name=>`如果改到${name}會不會比較好`,name=>`是否可以改去${name}`,name=>`那如果去${name}呢？`,name=>`改去${name}的話呢`,name=>`我想換到${name}可以嗎`,name=>`接下來前往${name}好不好`,name=>`那我們明天去${name}呢`,name=>`請幫我看看${name}的狀況`];
 const places=['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣','彰化'];
 for(const place of places)for(const template of templates){
  const message=template(place),county=place==='彰化'?'彰化縣':place;
  assert.equal(frontendIntent(message,previous),true,message);assert.equal(backendIntent(message,previous),true,message);
  const parsed=parseIntent(message,previous);assert.equal(parsed.county,county,message);assert.equal(parsed.time,'明天',message);assert.equal(parsed.activity,'跑步',message);
  if(!message.includes('明天'))assert.equal(parsed.timeDetail,'早上',message);
 }
 for(const message of ['那去彰化吃飯呢','那去彰化有哪些餐廳','我想去彰化買股票','那去qwerty呢','去呢','彰化qwerty呢'])assert.equal(frontendIntent(message,previous),false,message);
});
test('重現截圖：同一句「那去彰化呢」連問兩次都能重新評估',async()=>{
 let profile={...previous,county:'嘉義市'};
 for(let i=0;i<2;i++){
  const result=await runAgent({message:'那去彰化呢',profile,mode:'demo'});
  assert.notEqual(result.status,'clarification');assert.equal(result.profile.county,'彰化縣');
  assert.equal(result.profile.activity,'跑步');assert.equal(result.profile.time,'明天');assert.equal(result.profile.timeDetail,'早上');
  assert(result.trace.some(t=>t.name==='get_realtime_aqi'));profile=result.profile;
 }
});
test('截圖語序「那適合去彰化嗎」在無效訊息後可評估，且保留未來條件',async()=>{
 const bad=await runAgent({message:'...',profile:previous,mode:'demo'});
 assert.equal(bad.clarificationReason,'unrecognized_message');
 const result=await runAgent({message:'那適合去彰化嗎',profile:bad.profile,mode:'demo'});
 assert.notEqual(result.status,'clarification');assert.equal(result.profile.county,'彰化縣');
 assert.equal(result.profile.time,'明天');assert.equal(result.profile.timeDetail,'早上');assert.equal(result.profile.activity,'跑步');
 assert(result.trace.length>0);assert.equal(result.validation.passed,true);
});
test('重現截圖：無效訊息之後仍能問「那彰化市適合嗎」',async()=>{
 const first=await runAgent({message:'明天早上嘉義市適合跑步嗎？',mode:'demo',profile:{}});
 const invalid=await runAgent({message:'....',mode:'demo',profile:first.profile});
 assert.equal(invalid.clarificationReason,'unrecognized_message');assert.deepEqual(invalid.profile,first.profile);
 const message='那彰化市適合嗎';
 assert.equal(frontendIntent(message,invalid.profile),true);assert.equal(backendIntent(message,invalid.profile),true);
 const result=await runAgent({message,mode:'demo',profile:invalid.profile});
 assert.notEqual(result.status,'clarification');assert.equal(result.profile.county,'彰化縣');assert.equal(result.summary.county,'彰化縣');
 for(const field of ['activity','time','timeDetail','group','duration','intensity'])assert.equal(result.profile[field],first.profile[field],field);
 assert(result.trace.some(t=>t.name==='get_realtime_aqi'));assert.equal(result.validation.passed,true);
});
test('縣內城市與正式縣市名稱共用解析，保留新竹市／縣與嘉義市／縣差異',()=>{
 for(const [place,county] of [['彰化市','彰化縣'],['屏東市','屏東縣'],['苗栗市','苗栗縣'],['南投市','南投縣'],['宜蘭市','宜蘭縣'],['花蓮市','花蓮縣'],['台東市','臺東縣'],['新竹市','新竹市'],['新竹縣','新竹縣'],['嘉義市','嘉義市'],['嘉義縣','嘉義縣']]){
  for(const message of [`那${place}適合嗎`,`${place}的狀況`]){
   assert.equal(frontendIntent(message,previous),true,message);assert.equal(backendIntent(message,previous),true,message);
   assert.equal(findCounty(message),county,message);assert.equal(parseIntent(message,previous).county,county,message);
   assert.equal(parseIntent(message,previous).time,'明天',message);
  }
 }
 for(const message of ['彰化市有哪些餐廳','彰化市 qwerty','澎湖市的狀況','....'])assert.equal(frontendIntent(message,previous),false,message);
});
test('嘉義切換台中：狀況類追問能通過前後端檢核並沿用時間與活動',async()=>{
 const first=await runAgent({message:'明天早上嘉義市適合跑步嗎？',mode:'demo',profile:{}});
 assert.equal(first.profile.county,'嘉義市');
 for(const message of ['台中的狀況','台中狀況','那台中呢？','我想知道台中的情況','接著看台中','換成台中','台中']){
  assert.equal(frontendIntent(message,first.profile),true,message);
  assert.equal(backendIntent(message,first.profile),true,message);
  const result=await runAgent({message,mode:'demo',profile:first.profile});
  assert.notEqual(result.status,'clarification',message);
  assert.equal(result.profile.county,'臺中市',message);assert.equal(result.summary.county,'臺中市');
  for(const field of ['activity','time','timeDetail','group','duration','intensity'])assert.equal(result.profile[field],first.profile[field],message+' '+field);
 }
 const reset=parseIntent('重新問，台北適合散步嗎？',first.profile);
 assert.equal(reset.time,'現在');assert.equal(reset.timeDetail,undefined);assert.equal(reset.activity,'散步');
});
test('地名加無關問題或亂碼仍不可當作換縣市',()=>{
 for(const message of ['台中的餐廳狀況','我想知道台中的股票狀況','台中 qwerty','那個狀況呢？']){
  assert.equal(frontendIntent(message,previous),false,message);assert.equal(backendIntent(message,previous),false,message);
 }
 assert.equal(frontendIntent('嘉義市的狀況'),true);
});
test('有效問題之後輸入亂碼或離題文字，不重播舊評估，之後仍能正常追問',async()=>{
 const first=await runAgent({message:'今天台中適合跑步嗎？',mode:'demo',profile:{}});
 assert.equal(first.status,'ok');
 for(const message of ['asdfghjkl','123456','！？！？','哈哈哈哈','那 qwerty 呢？','如果 zxcasd 呢？','今天晚餐吃什麼？','台中有哪些餐廳？','幫我寫一個迴圈']){
  const profile=structuredClone(first.profile);
  const result=await runAgent({message,mode:'demo',profile});
  assert.equal(result.status,'clarification',message);assert.equal(result.clarificationReason,'unrecognized_message',message);
  assert.notEqual(result.reply,first.reply);assert(result.reply.includes('沒有理解'));
  assert.deepEqual(result.profile,first.profile);assert.deepEqual(profile,first.profile);
  assert.equal(result.trace.length,0);assert.deepEqual(result.actions,[]);
  assert.equal(result.summary,undefined);assert.equal(result.facts,undefined);assert.equal(result.runId,undefined);
  const followup=await runAgent({message:'那如果我是氣喘患者呢？',mode:'demo',profile:result.profile});
  assert.equal(followup.status,'ok');assert.equal(followup.profile.county,first.profile.county);
  assert.equal(followup.profile.activity,first.profile.activity);assert.equal(followup.profile.time,first.profile.time);
  assert.equal(followup.profile.group,'心肺疾病敏感族群');
 }
});
test('無法辨識的本輪不呼叫 Gemini、Ollama 或即時資料，也不清除舊的未來時段',async t=>{
 const network=t.mock.method(globalThis,'fetch',async()=>{throw Error('不應發出請求');});
 for(const provider of ['rules','gemini','ollama']){
  const result=await runAgent({message:'qazwsxedc',profile:previous,mode:'live',provider});
  assert.equal(result.status,'clarification');assert.deepEqual(result.profile,previous);assert.equal(result.trace.length,0);
 }
 assert.equal(network.mock.callCount(),0);
});
test('簡短地點、時段、時長與評估追問仍能沿用對話',async()=>{
 for(const message of ['那台北呢？','那明天下午呢？','那改成 15 分鐘呢？','那可以嗎？']){
  const result=await runAgent({message,mode:'demo',profile:{...previous,time:'現在',timeDetail:undefined}});
  assert.notEqual(result.status,'clarification',message);assert(result.trace.some(t=>t.name==='get_realtime_aqi'));
 }
 const first=await runAgent({message:'台中',mode:'demo',profile:{}});
 assert.notEqual(first.status,'clarification');assert.equal(first.profile.county,'臺中市');
 const unknown=await runAgent({message:'asdfghjkl',mode:'demo',profile:{}});
 assert.equal(unknown.status,'clarification');assert.deepEqual(unknown.profile,{});
});
test('明天早上之後重新問今天，清除舊的早上條件',()=>{const p=parseIntent('今天台中適合跑步嗎？',previous);assert.equal(p.time,'今天');assert.equal(p.timeDetail,undefined);});
test('現在與目前都能取消前一輪的未來時段',()=>{for(const text of ['改成現在，台中適合散步嗎？','目前台中適合出去跑步嗎？']){const p=parseIntent(text,previous);assert.equal(p.time,'現在');assert.equal(p.timeDetail,undefined);}});
test('完整的新問題未寫時間時預設現在，不沿用明天',()=>{const p=parseIntent('台北適合散步嗎？',previous);assert.equal(p.county,'臺北市');assert.equal(p.activity,'散步');assert.equal(p.time,'現在');assert.equal(p.timeDetail,undefined);});
test('自然追問族群仍保留前一輪時地與活動',()=>{const p=parseIntent('那如果我是氣喘患者呢？',previous);assert.equal(p.county,previous.county);assert.equal(p.activity,previous.activity);assert.equal(p.time,'明天');assert.equal(p.timeDetail,'早上');assert.equal(p.group,'心肺疾病敏感族群');});
test('改成今天不繼承舊時段；新指定的時段則正常更新',()=>{assert.equal(parseIntent('那改成今天呢？',previous).timeDetail,undefined);const p=parseIntent('那明天下午呢？',previous);assert.equal(p.time,'明天');assert.equal(p.timeDetail,'下午');});
test('時間修正以最後指定為準，不保留被取代的早上',()=>{const p=parseIntent('原本問明天早上，改成今天適合跑步嗎？',previous);assert.equal(p.time,'今天');assert.equal(p.timeDetail,undefined);});
test('明早明晚正確視為明天，不沿用前一輪日期',()=>{for(const text of ['明早台中適合跑步嗎？','明晚台中適合散步嗎？'])assert.equal(parseIntent(text,{...previous,time:'今天'}).time,'明天');});
test('同一對話可從未來不足恢復目前評估，不需要重整',async()=>{const future=await runAgent({message:'明天早上台中適合跑步嗎？',mode:'demo',profile:{}});assert.equal(future.assessment.status,'insufficient');const current=await runAgent({message:'今天台中適合跑步嗎？',mode:'demo',profile:future.profile});assert.notEqual(current.assessment.status,'insufficient');assert.equal(current.profile.timeDetail,undefined);assert(current.validation.passed);const followup=await runAgent({message:'那如果我是氣喘患者呢？',mode:'demo',profile:current.profile});assert.equal(followup.profile.county,'臺中市');assert.equal(followup.profile.time,'今天');assert.equal(followup.profile.group,'心肺疾病敏感族群');assert.equal(followup.assessment.status,'avoid');});
test('切換活動重新推定強度，不沿用跑步的高強度',async()=>{const result=await runAgent({message:'那改成散步呢？',mode:'demo',profile:{...previous,time:'現在',timeDetail:undefined}});assert.equal(result.profile.activity,'散步');assert.equal(result.profile.intensity,'低');});
test('模型不能把明天的舊條件覆蓋回新的今天問題',async()=>{const oldFetch=globalThis.fetch,key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';globalThis.fetch=async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({time:'明天',needsWeather:false,needsHistory:false})}]}}]})});try{const result=await runAgent({message:'今天台中適合跑步嗎？',mode:'demo',profile:previous,provider:'gemini'});assert.equal(result.profile.time,'今天');assert.equal(result.profile.timeDetail,undefined);assert.notEqual(result.assessment.status,'insufficient');}finally{globalThis.fetch=oldFetch;if(key)process.env.GEMINI_API_KEY=key;else delete process.env.GEMINI_API_KEY;}});
