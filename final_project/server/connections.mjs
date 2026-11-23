import {getStations,get_weather_forecast} from './data.mjs';
import {defaultGeminiModel} from './gemini-advice.mjs';

export async function checkConnection(service,{env=process.env,fetcher=fetch,stations=getStations,weather=get_weather_forecast}={}){
 const key={air:'MOENV_API_KEY',weather:'CWA_API_KEY',gemini:'GEMINI_API_KEY'}[service];
 if(!key)return {status:'error',message:'未知的服務'};
 if(!env[key])return {status:'unconfigured',message:'尚未設定金鑰'};
 try{
  if(service==='air'){
   const rows=await stations('live',fetcher,{force:true});
   if(!rows.length)throw Error();
  }else if(service==='weather'){
   const result=await weather('臺中市','live',fetcher);
   if(result.status!=='live'||!result.periods.length)throw Error();
  }else{
   // Only an explicit test generates a short response; opening settings does not call the model.
   const model=env.GEMINI_MODEL||defaultGeminiModel;
   const response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
    body:JSON.stringify({contents:[{parts:[{text:'Reply OK.'}]}],generationConfig:{maxOutputTokens:256}}),signal:AbortSignal.timeout(15000)
   });
   if(!response.ok)return {status:'error',message:response.status===429?'額度不足或請求過於頻繁':response.status===401||response.status===403?'金鑰無效或沒有使用權限':response.status===404?'模型不存在或無法使用':'模型服務暫時無法使用'};
   const body=await response.json();
   if(!body.candidates?.some(c=>c.content?.parts?.some(p=>p.text)))throw Error();
  }
  return {status:'connected',message:'連線成功',checkedAt:new Date().toISOString()};
 }catch{return {status:'error',message:'連線失敗，請檢查金鑰、網路或服務狀態'};}
}
