import {aqiLevels} from '../shared/air-quality.mjs';
export const guidelineSource = 'https://air.moenv.gov.tw/envtopics/AirQuality_1.aspx';
// 官方 AQI 活動建議的摘要；不重新以污染物濃度計算 AQI。
export const guidelines = [
 {max:50,label:'良好',color:'#249568',general:'可正常進行戶外活動。',sensitive:'可正常進行戶外活動，仍請留意自身反應。'},
 {max:100,label:'普通',color:'#c59a22',general:'可正常進行戶外活動；若有不適，應減少活動。',sensitive:'極敏感者請留意症狀，必要時減少戶外活動。'},
 {max:150,label:'對敏感族群不健康',color:'#e47a35',general:'若出現眼痛、咳嗽或喉嚨痛，考慮減少戶外活動。',sensitive:'減少體力消耗及戶外活動；有症狀時應留在室內。'},
 {max:200,label:'對所有族群不健康',color:'#d75158',general:'減少體力消耗及戶外活動，尤其避免長時間劇烈運動。',sensitive:'避免體力消耗及戶外活動，必要外出請加強防護。'},
 {max:300,label:'非常不健康',color:'#9260ad',general:'避免長時間或劇烈戶外活動，宜改為室內活動。',sensitive:'避免戶外活動，儘量留在室內。'},
 {max:500,label:'危害',color:'#8b334d',general:'避免戶外活動；必要外出請採取防護措施。',sensitive:'避免戶外活動，留在室內並減少體力消耗。'}
].map((g,i)=>({...g,min:i===0?0:[51,101,151,201,301][i-1],color:aqiLevels[i].color,version:'2026-11-06 查閱摘要 v2',source:guidelineSource}));
export function level(aqi) {return Number.isFinite(aqi)&&aqi>=0&&aqi<=500?guidelines.find(g=>aqi<=g.max):null;}
export function get_health_guidelines(aqi,group) {const g=level(aqi);return g?{...g,advice:group==='一般民眾'?g.general:g.sensitive}:null;}
export function analyze_air_quality(station,profile) {
 const g=get_health_guidelines(station?.aqi,profile.group);
 if(!g) return {status:'missing',title:'資料不足，暫不判定',advice:'測站沒有有效 AQI，請切換測站或稍後重新整理。',score:null};
 const stale=station.stale;
 const sensitive=profile.group!=='一般民眾';
 // 研究用排序指標；加權是專題設計，非醫學風險機率或官方門檻。
 const score=Math.round(Math.min(100,(station.aqi/5)+(sensitive?10:0)+(profile.intensity==='高'?10:profile.intensity==='中'?5:0)+Math.min(10,profile.duration/12)));
 const cautious=station.aqi>150||(sensitive&&station.aqi>100);
 return {status:stale?'stale':'ok',title:stale?'資料已過期，請重新查詢':cautious?'建議調整戶外計畫':station.aqi>100?'留意空品，降低活動負荷':'可以安排活動，留意身體感受',advice:g.advice,score,level:g.label,color:g.color,adjustment:cautious?'建議改為室內伸展、瑜珈或低強度活動。':profile.intensity==='高'||profile.duration>=60?'可分段活動、降低強度，若不適立即停止。':'依身體狀況調整活動，出發前再次確認空品。'};
}
// 最終活動狀態只由後端規則決定；LLM 不可覆寫。
export function assessActivity(station,profile,{future=false}={}){
 if(!station||!level(station.aqi)||station.stale||future)return {status:'insufficient',label:'資料不足，無法可靠評估',reason:future?'尚無可信的未來逐時空品預報，目前觀測不能代表指定的未來時段。':'沒有同批次、未過期的有效測站資料。'};
 const sensitive=profile.group!=='一般民眾',demanding=profile.intensity==='高'||profile.duration>=60;
 if(station.aqi>200||(station.aqi>150&&(sensitive||demanding))||(station.aqi>100&&sensitive&&demanding))return {status:'avoid',label:'不建議目前進行',reason:`依${sensitive?'敏感族群':'一般民眾'}準則與活動負荷，建議避免目前的戶外活動。`};
 if(station.aqi>100||(station.aqi>50&&sensitive))return {status:'adjust',label:'建議調整',reason:'請留意身體反應，減少戶外暴露，並依活動強度調整計畫。'};
 return {status:'suitable',label:'適合',reason:'依目前測站資料與活動條件，可安排戶外活動，仍需留意局部差異與自身反應。'};
}
