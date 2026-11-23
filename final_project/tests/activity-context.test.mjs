import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runAgent,parseIntent,validate_response} from '../server/agent.mjs';

test('未提活動時只提供一般外出建議，不產生跑步計畫',async()=>{
 const result=await runAgent({message:'現在台北適合出門嗎？',profile:{},mode:'demo'});
 assert.equal(result.profile.activity,'其他戶外活動');assert.equal(result.profile.activitySource,'unspecified');
 assert(result.actions.some(s=>s.includes('一般外出')));assert(!result.actions.some(s=>/跑步|慢跑|原定/.test(s)));
 assert.equal(result.validation.passed,true);
});
test('模型自行補跑步與高負荷，不能覆蓋未指定或明確的活動',async t=>{
 const key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test';t.after(()=>{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;});
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({activity:'跑步',intensity:'高',duration:90})}]}}]})}));
 const general=await runAgent({message:'現在台北的空氣如何？',profile:{},mode:'demo',provider:'gemini'});
 assert.equal(general.provider,'gemini');assert.equal(general.profile.activitySource,'unspecified');assert.notEqual(general.profile.activity,'跑步');assert.notEqual(general.profile.duration,90);assert(!general.actions.some(s=>/跑步|慢跑/.test(s)));
 const walking=await runAgent({message:'現在台北適合散步嗎？',profile:{},mode:'demo',provider:'gemini'});
 assert.equal(walking.profile.activity,'散步');assert.equal(walking.profile.activitySource,'explicit');assert(!walking.actions.some(s=>/跑步|慢跑/.test(s)));
});
test('舊版沒有使用者來源的跑步欄位不再被帶入新建議',async()=>{
 const result=await runAgent({message:'那去台北呢？',profile:{county:'嘉義市',activity:'跑步',intensity:'高',duration:90,time:'現在'},mode:'demo'});
 assert.equal(result.profile.activitySource,'unspecified');assert.equal(result.profile.activity,'其他戶外活動');assert.notEqual(result.profile.duration,90);
 assert(!result.actions.some(s=>/跑步|慢跑/.test(s)));assert.equal(result.validation.passed,true);
});
test('明確跑步可在換縣市時沿用，完整新空品問題則清除舊活動',async()=>{
 const first=await runAgent({message:'現在台北適合跑步嗎？',profile:{},mode:'demo'});
 assert.equal(first.profile.activitySource,'explicit');assert(first.actions.some(s=>s.includes('跑步')));assert(!first.actions.some(s=>s.includes('原定')));
 const next=await runAgent({message:'那去台南呢？',profile:first.profile,mode:'demo'});
 assert.equal(next.profile.activity,'跑步');assert.equal(next.profile.activitySource,'inherited');assert(next.assumptions.some(s=>s.includes('沿用')));
 const generic=await runAgent({message:'現在台北空氣品質如何？',profile:next.profile,mode:'demo'});
 assert.equal(generic.profile.activitySource,'unspecified');assert(!generic.actions.some(s=>/跑步|慢跑/.test(s)));
});
test('否認跑步會清除舊活動；明確改散步則採散步',async()=>{
 const context={county:'臺北市',activity:'跑步',activitySource:'explicit',intensity:'高',duration:90,time:'現在'};
 for(const message of ['我沒說要跑步','我沒有說我要跑步','我沒說過我想去跑步','我沒有要跑步，只是想出門','我不是要跑步','那不要跑步呢']){
  const result=await runAgent({message,profile:context,mode:'demo'});
  assert.equal(result.profile.activitySource,'unspecified',message);assert(!result.actions.some(s=>/跑步|慢跑/.test(s)),message);
 }
 const walking=parseIntent('不跑步，改成散步',context);assert.equal(walking.activity,'散步');assert.equal(walking.activitySource,'explicit');
});
test('驗證器拒絕沒有使用者依據的跑步建議',()=>{
 const station={aqi:40,time:'test',source:'test'};
 const result=validate_response({facts:{...station},profile:{activity:'其他戶外活動',activitySource:'unspecified'},actions:['可以依原定計畫跑步。']},station);
 assert.equal(result.passed,false);assert(result.issues.some(s=>s.includes('活動依據')));
});
