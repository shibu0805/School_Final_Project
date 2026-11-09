import {guidelineSource} from './guidelines.mjs';
export const recommendationSources={
 guideline:guidelineSource,
 health:'https://www.mohw.gov.tw/cp-2704-85959-1.html',
 asthma:'https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=5020&pid=20049',
 mask:'https://www.cdc.gov/niosh/ppe/php/community-respirators-masks/types-of-respirators-and-masks.html',
 exposure:'https://www.who.int/news-room/questions-and-answers/item/air-pollution-personal-interventions-and-risk-communication',
 air:'https://data.moenv.gov.tw/dataset/detail/aqx_p_432',
 weather:'https://opendata.cwa.gov.tw/dataset/forecast/F-C0032-001'
};

// 根據問題與可驗證條件排序，最多顯示三點；不以隨機文字取代規則判定。
// application 是依活動情境整理的做法，不宣稱為官方新增的醫療門檻。
export function generateRecommendations({message,profile,station,assessment,guideline,weather,future=false}){
 const candidates=[];
 const add=(id,text,priority,reason,source= recommendationSources.guideline,kind='application')=>candidates.push({id,text,priority,reason,source,kind});
 const mask=/口罩|防護|N95|KN95/i.test(message),alternative=/改成|改做|代替|替代|室內|不能出門|不出門/.test(message);
 const rainQuestion=/下雨|雨天|降雨|雨具|天氣/.test(message),timeQuestion=/什麼時候|幾點|時段|早上|下午|晚上|明早|明晚|明天/.test(message);
 const exercise=/跑步|慢跑|騎腳踏車/.test(profile.activity),sensitive=profile.group!=='一般民眾';
 const avoid=assessment.status==='avoid',adjust=assessment.status==='adjust',limited=avoid||adjust;
 const ozone=/臭氧|O[3₃]/i.test(station?.pollutant||''),particles=/PM\s*(?:2[.．]5|10)|懸浮微粒/i.test(station?.pollutant||'');

 if(assessment.status==='insufficient'){
  if(future){
   add('forecast-missing','目前沒有可信的未來逐時空品預報，先不要把現在的 AQI 當成你指定時段的空品。',160,'要求未來時段，但沒有可用的空品預報',recommendationSources.air,'data_limit');
   add('recheck-time','接近預定出門時間時重新問我，或直接改問「現在」的活動建議。',150,'避免以歷史或即時資料冒充未來預測',recommendationSources.air,'data_limit');
   if(rainQuestion)add('weather-not-aqi',weather?.periods?.length?'可以另看已取得的天氣預報準備雨具，但降雨預報不能保證未來空品改善。':'天氣預報這次也未取得，請先確認氣象資訊，再安排戶外行程。',145,'天氣預報與空品預報是不同資料',recommendationSources.weather,'data_limit');
   else if(exercise)add('future-exercise-backup','先準備室內伸展或低強度運動的備案，等有當時的空品資訊再決定是否改到戶外。',100,'未來活動沒有可靠空品依據',recommendationSources.health);
  }else{
   add('observation-missing','這次沒有可靠的有效測站觀測，先重新查詢或切換有資料的縣市。',160,'測站缺值、過期或連線失敗',recommendationSources.air,'data_limit');
   add('no-safety-conclusion','尚不能判定目前的戶外活動是否合適，請先查環境部最新監測，不以缺值當成空氣良好。',150,'缺少判定所需的即時證據',recommendationSources.air,'data_limit');
   if(mask)add('mask-no-guarantee','戴上口罩也不能補足缺少的空品資訊，更不能保證對所有污染物都有防護效果。',140,'問題詢問口罩，但缺少有效觀測',recommendationSources.mask);
  }
 }else{
  if(mask){
   add('mask-limits',ozone?'這次指標污染物是臭氧。一般顆粒物過濾口罩不能防護這類氣體污染物，不能因為戴口罩就延長戶外活動。':'顆粒物過濾型口罩主要針對粒狀污染物，不能視為能防護臭氧等氣體污染物。',145,ozone?'代表測站的指標污染物為臭氧':'問題詢問口罩的防護範圍',recommendationSources.mask);
   add('mask-fit',limited?'必要外出時選擇適合自己的防護用品並正確配戴，同時縮短暴露；口罩不能取代減少戶外活動。':'是否需要配戴仍要考量污染物、所在位置與自身狀況；若選顆粒物過濾口罩，須正確配戴並注意密合。',120,'依目前活動評估說明配戴與暴露的關係',recommendationSources.mask);
   if(exercise)add('mask-exercise',limited?'不要把戴口罩當成繼續高負荷戶外運動的理由；這次可改為較輕鬆或室內的活動。':'運動時若因配戴或活動感到不適，先停止活動、調整計畫，不要勉強維持原本強度。',130,'問題詢問口罩且活動屬於運動',recommendationSources.health);
  }

  if(alternative){
   const backup=profile.activity==='騎腳踏車'?'把戶外騎乘改成室內固定式腳踏車，先以較輕鬆的強度進行。':profile.activity==='戶外遊戲'||profile.group==='兒童'?'把戶外追跑遊戲改成室內伸展、簡單律動或桌上活動，減少長時間戶外暴露。':exercise?'把戶外跑步改成室內伸展、瑜珈或低強度步行，依身體反應調整。':'可改為室內伸展或輕鬆步行，讓活動量與身體狀況相配合。';
   add('alternative-activity',backup,140,'使用者詢問替代活動，並依活動類型選擇做法',recommendationSources.health);
   add('indoor-quality','室內也要留意空品與通風，並避開菸煙、焚香或其他明顯污染來源。',115,'改到室內不代表室內空氣一定良好',recommendationSources.exposure);
  }

  const activityReason=`依${profile.activity}、${profile.intensity}強度與後端活動評估調整`;
  if(profile.activity==='跑步'||profile.activity==='慢跑')add('running-plan',avoid?'先取消這次戶外跑步，改做室內低強度伸展或步行，避免勉強完成原定訓練。':adjust?'把這次跑步改成輕鬆慢跑或步行，降低強度並分段完成，途中不適就停止。':'可依原定的跑步計畫活動，仍要依身體反應調整，出發前再確認所在地空品。',105,activityReason,recommendationSources.health);
  else if(profile.activity==='散步')add('walking-plan',avoid?'這次先暫緩戶外散步，改在空品較好的室內輕鬆走動。':adjust?'散步採輕鬆步調，縮短戶外停留，選擇能隨時返回室內的動線。':'可以安排輕鬆散步；避開明顯污染來源，若身體不適就結束行程。',105,activityReason,recommendationSources.health);
  else if(profile.activity==='騎腳踏車')add('cycling-plan',avoid?'先暫緩戶外騎乘，改成室內固定式腳踏車或伸展，避免高負荷訓練。':adjust?'把長距離或爬坡騎乘改為較短、較輕鬆的行程，降低強度與戶外暴露。':'可依身體狀況安排騎乘，避開明顯車流污染並留意沿途空品差異。',105,activityReason,recommendationSources.exposure);
  else if(profile.activity==='戶外遊戲')add('play-plan',avoid?'先把這次戶外遊戲移到室內，選擇較安靜的律動或伸展活動。':adjust?'把持續追跑改成輕鬆遊戲，安排休息，避免在戶外長時間劇烈活動。':'可安排戶外遊戲，但仍要留意孩子的活動強度與身體反應。',105,activityReason,recommendationSources.guideline);

  if(sensitive){
   const text=profile.group==='心肺疾病敏感族群'?(limited?'你提到心肺或氣喘相關狀況，這次以降低暴露為優先；若症狀出現，停止活動並依原有醫療照護建議處理。':'即使目前空品尚可，氣喘或心肺敏感狀況仍需個別考量；運動前確認自身控制狀況，依原有醫療建議安排。'):profile.group==='兒童'?(limited?'兒童這次避免長時間追跑與劇烈戶外遊戲，由照顧者留意咳嗽、喘或眼部不適。':'照顧者可依孩子的身體反應安排活動；空品良好也不代表每個孩子都完全沒有風險。'):profile.group==='長者'?'長者請以較輕鬆的活動為主，留意自身症狀；空品不佳時減少戶外活動與體力消耗。':'你屬於需個別留意的族群，請依身體狀況及原有醫療建議調整活動，不把 AQI 當作個人安全保證。';
   add('group-care',text,mask?110:125,`依使用者族群：${profile.group}`,profile.group==='心肺疾病敏感族群'?recommendationSources.asthma:recommendationSources.guideline);
  }

  if(ozone&&!mask)add('ozone-exposure','這次指標污染物是臭氧，請優先減少不必要的戶外暴露；顆粒物過濾口罩不能防護這類氣體污染物。',100,'代表測站的指標污染物為臭氧',recommendationSources.mask);
  else if(particles&&!mask)add('particle-exposure',limited?'這次指標污染物為懸浮微粒；減少戶外停留與運動負荷，必要外出時再考量適合的顆粒物防護。':'這次指標污染物為懸浮微粒，仍請留意車流、揚塵等局部來源，測站數值不代表路線每一處。',85,'代表測站的指標污染物為懸浮微粒',recommendationSources.exposure);

  if(profile.duration>=60)add('long-duration','你安排的活動時間較長，建議拆分並在途中重新查看空品；目前觀測不能保證整段期間都相同。',95,'活動時長較長，需要注意暴露與資料變化',recommendationSources.exposure);

  if(rainQuestion){
   const periods=weather?.periods||[];
   if(periods.length){const rainy=periods.some(p=>/雨/.test(p.description||'')||(typeof p.pop==='number'&&p.pop>0));add('weather-plan',rainy?'已取得的天氣預報包含降雨可能，戶外行程可準備雨具與有遮蔽的備案；下雨不等於空品一定改善。':'可參考已取得的天氣預報安排衣著與行程，但是否適合戶外活動仍要另看空品。',135,'使用者詢問天氣，且本次取得了預報',recommendationSources.weather);}
   else add('weather-unavailable','這次沒有取得天氣預報，無法可靠判斷是否下雨；目前的活動評估僅依空品與你的條件。',135,'問題詢問天氣，但預報不可用',recommendationSources.weather,'data_limit');
  }

  if(timeQuestion)add('time-scope','目前只能依現有觀測調整活動，無法可靠挑出未來最佳時段；接近出門時再確認空品。',110,'沒有可供最佳時段排序的未來空品預報',recommendationSources.air,'data_limit');
  if(guideline?.advice)add('official-guideline',guideline.advice,75,'對照目前 AQI 等級與使用者族群的官方活動建議',guideline.source||recommendationSources.guideline,'official_guideline');
  add('recheck-local','出發前再次確認所在地空品；這次採用的代表測站無法保證你整條活動路線都相同。',35,'測站空間代表性有限',recommendationSources.air,'data_limit');
 }
 const recommendations=[...new Map(candidates.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).map(c=>[c.text,c])).values()].slice(0,3);
 return {actions:recommendations.map(c=>c.text),recommendations};
}
