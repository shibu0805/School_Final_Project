import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntent,runAgent} from '../server/agent.mjs';
const previous={county:'臺中市',activity:'跑步',group:'一般民眾',intensity:'高',duration:30,time:'明天',timeDetail:'早上'};
test('有效問題之後輸入亂碼或離題文字，不重播舊評估，之後仍能正常追問',async()=>{
 const first=await runAgent({message:'今天台中適合跑步嗎？',mode:'demo',profile:{}});
 assert.equal(first.status,'ok');
 for(const message of ['\\qqq','asdfghjkl','123456','！？！？','哈哈哈哈','那 qwerty 呢？','如果 zxcasd 呢？','今天晚餐吃什麼？','台中有哪些餐廳？','幫我寫一個迴圈']){
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
