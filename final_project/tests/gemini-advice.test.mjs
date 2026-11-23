import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateAdvice,generateGeminiAdvice} from '../server/gemini-advice.mjs';
import {runAgent} from '../server/agent.mjs';
const profile={county:'臺北市',activity:'其他戶外活動',activitySource:'unspecified',group:'一般民眾',time:'現在'};
const candidates=[{id:'general-outing',text:'一般外出可依身體狀況安排。',reason:'依據空品與未指定活動',source:'https://air.moenv.gov.tw/',kind:'application'}];
const context={profile,assessment:{status:'suitable'},allowedNumbers:new Set([40,20,25,60]),candidates};
const text='若只是一般外出，可依身體狀況安排行程，避開明顯揚塵與車流污染。';
const payload={actions:[{text,basisId:'general-outing'}]};
test('Gemini 建議保留可驗證依據並使用生成的實際內容',()=>{
 const result=validateAdvice(payload,context);assert.equal(result.actions[0],text);assert.equal(result.recommendations[0].source,candidates[0].source);assert.match(result.recommendations[0].reason,/Gemini/);
});
test('拒絕虛構數字、活動、來源、時長、保證與重複建議',()=>{
 for(const actions of [
  [{text:'目前 AQI 999，可正常外出。',basisId:'general-outing'}],
  [{text:'可以照原定計畫去跑步。',basisId:'general-outing'}],
  [{text,basisId:'unknown'}],
  [{text:'可以運動 60 分鐘。',basisId:'general-outing'}],
  [{text:'建議 07:00 出門。',basisId:'general-outing'}],
  [{text:'可確保路線品質良好。',basisId:'general-outing'}],
  [...payload.actions,...payload.actions]
 ])assert.throws(()=>validateAdvice({actions},context));
 assert.throws(()=>validateAdvice({actions:[{text:'可以放心出門。',basisId:'general-outing'}]},{...context,assessment:{status:'insufficient'}}));
});
test('Gemini API 使用結構化輸出，錯誤不洩漏金鑰',async()=>{
 let request;
 const result=await generateGeminiAdvice({message:'台北可以出門嗎？',profile,assessment:context.assessment,station:{aqi:40},candidates},{env:{GEMINI_API_KEY:'secret'},fetcher:async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]})};}});
 assert.equal(result.actions[0],text);assert.equal(request.generationConfig.responseMimeType,'application/json');assert(request.generationConfig.responseJsonSchema);
 await assert.rejects(()=>generateGeminiAdvice({message:'test',profile,assessment:context.assessment,station:{aqi:40},candidates},{env:{GEMINI_API_KEY:'secret'},fetcher:async()=>({ok:false,status:429})}),error=>/額度/.test(error.message)&&!error.message.includes('secret'));
});
test('選用 Gemini 時不只解析問題，也實際呼叫建議生成；失敗清楚降級',async t=>{
 const oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test';t.after(()=>{if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;});
 let writingCalls=0,fail=false;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const prompt=JSON.parse(options.body).contents[0].parts[0].text;
  if(prompt.includes('Intent Parser'))return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{}'}]}}]})};
  writingCalls++;
  if(fail)return {ok:false,status:429};
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]})};
 });
 const good=await runAgent({message:'現在台北適合出門嗎？',profile:{},provider:'gemini',mode:'demo'});
 assert.equal(good.recommendationProvider,'gemini');assert.equal(good.actions[0],text);assert.equal(good.validation.passed,true);assert(good.trace.some(t=>t.name==='generate_gemini_advice'&&t.status==='ok'));
 fail=true;
 const fallback=await runAgent({message:'現在台北適合出門嗎？',profile:{},provider:'gemini',mode:'demo'});
 assert.equal(fallback.recommendationProvider,'rules');assert.match(fallback.recommendationWarning,/額度/);assert.equal(fallback.validation.passed,true);assert.notEqual(fallback.status,'validation_failed');assert.equal(writingCalls,2);
});
test('規則模式不會自動把問題送給 Gemini',async t=>{
 const network=t.mock.method(globalThis,'fetch',async()=>{throw Error('Unexpected network');});
 const result=await runAgent({message:'現在台北適合出門嗎？',profile:{},provider:'rules',mode:'demo'});
 assert.equal(result.recommendationProvider,'rules');assert.equal(network.mock.callCount(),0);
});
