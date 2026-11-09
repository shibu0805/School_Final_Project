import assert from 'node:assert/strict';
const base='http://127.0.0.1:8787';
const page=await fetch(base);assert.equal(page.status,200);
const html=await page.text();assert(html.includes('Airwise'));
for(const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)){const asset=await fetch(base+match[1]);assert.equal(asset.status,200);}
const stations=await (await fetch(base+'/api/stations?mode=demo')).json();assert.equal(stations.stations.length,10);
const profile={county:'臺中市',group:'兒童',activity:'慢跑',intensity:'中',duration:30,time:'現在'};
const response=await fetch(base+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'demo',provider:'rules',message:'明天什麼時候適合散步？',profile})});
assert.equal(response.status,200);const chat=await response.json();assert.equal(chat.validation.passed,true);assert.equal(chat.comparison.best,null);assert(chat.question);assert(chat.trace.some(t=>t.name==='aggregate_county_aqi'));assert.equal(chat.assessment.status,'insufficient');
const invalid=await fetch(base+'/api/nearby?lat=no&lon=120');assert.equal(invalid.status,400);
const geoResponse=await fetch(base+'/geo/taiwan-counties.geojson');assert.equal(geoResponse.status,200);assert(geoResponse.headers.get('content-type').includes('geo+json'));const geo=await geoResponse.json();assert.equal(geo.features.length,22);
const counties=await (await fetch(base+'/api/counties?mode=demo')).json();assert.equal(counties.counties.length,22);assert.equal(counties.counties.find(c=>c.name==='臺中市').aqi,112);assert.equal(counties.counties.find(c=>c.name==='金門縣').aqi,null);
const send=async(message,profile={})=>(await fetch(base+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,profile,mode:'demo',provider:'rules'})})).json();
const missing=await send('適合出門嗎？');assert.equal(missing.status,'clarification');
const first=await send('今天台中適合跑步嗎？');assert.equal(first.summary.aqi,112);assert.equal(first.assessment.status,'adjust');
const follow=await send('那如果我是氣喘患者呢？',first.profile);assert.equal(follow.profile.county,'臺中市');assert.equal(follow.profile.activity,'跑步');assert.equal(follow.assessment.status,'avoid');assert(follow.actions.length<=3);
console.log('HTTP smoke 通過：首頁、JS/CSS、22 縣市 GeoJSON、縣市最高 AQI、灰色缺值、Agent 回答、多輪氣喘追問、工具紀錄、未來時段限制、座標驗證。');
