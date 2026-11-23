import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkConnection} from '../server/connections.mjs';

test('missing keys do not make upstream requests',async()=>{
 const result=await checkConnection('gemini',{env:{},fetcher:()=>{throw Error('Unexpected fetch');}});
 assert.equal(result.status,'unconfigured');
});
test('connection checks require actual data and bypass the AQI cache',async()=>{
 let forced=false;
 const ok=await checkConnection('air',{env:{MOENV_API_KEY:'test'},stations:async(_mode,_fetch,options)=>{forced=options.force;return [{}];}});
 assert.equal(ok.status,'connected');assert.equal(forced,true);
 const empty=await checkConnection('air',{env:{MOENV_API_KEY:'test'},stations:async()=>[]});assert.equal(empty.status,'error');
 const weather=await checkConnection('weather',{env:{CWA_API_KEY:'test'},weather:async()=>({status:'error',periods:[]})});assert.equal(weather.status,'error');
});
test('Gemini reports quota and auth failures without leaking upstream messages',async()=>{
 for(const code of [429,403]){
  const result=await checkConnection('gemini',{env:{GEMINI_API_KEY:'secret'},fetcher:async()=>({ok:false,status:code})});
  assert.equal(result.status,'error');assert.ok(!JSON.stringify(result).includes('secret'));
  assert.match(result.message,code===429?/額度/:/金鑰/);
 }
 const ok=await checkConnection('gemini',{env:{GEMINI_API_KEY:'test'},fetcher:async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'OK'}]}}]})})});assert.equal(ok.status,'connected');
 const empty=await checkConnection('gemini',{env:{GEMINI_API_KEY:'test'},fetcher:async()=>({ok:true,json:async()=>({})})});assert.equal(empty.status,'error');
});
