import {useEffect,useRef,useState} from 'react';
// Web Speech API 並非每個瀏覽器都可用；型別限制在此 adapter。
type Recognition={lang:string;continuous:boolean;interimResults:boolean;maxAlternatives:number;onstart:(()=>void)|null;onresult:((event:any)=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type SpeechWindow=Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
const errors:Record<string,string>={'not-allowed':'麥克風或語音服務未獲授權。請在瀏覽器設定允許，或直接打字提問。','service-not-allowed':'瀏覽器的語音服務不可用，請直接打字提問。','audio-capture':'找不到可用的麥克風，請檢查裝置或使用文字輸入。','no-speech':'沒有辨識到語音，請再試一次，或直接打字。','network':'語音辨識服務連線失敗，請使用文字輸入。','language-not-supported':'目前語音服務不支援繁體中文，請使用文字輸入。'};
export function useSpeech(onFinal:(text:string)=>void){
 const [listening,setListening]=useState(false),[speaking,setSpeaking]=useState(false),[interim,setInterim]=useState(''),[recognized,setRecognized]=useState(''),[speechError,setSpeechError]=useState('');
 const recognition=useRef<Recognition|null>(null),callback=useRef(onFinal),active=useRef(true),spoken=useRef(false),lastTranscript=useRef('');callback.current=onFinal;
 const win=typeof window==='undefined'?null:window as SpeechWindow;const ctor=win?.SpeechRecognition||win?.webkitSpeechRecognition;
 const canRecognize=!!ctor,canSpeak=!!win&&'speechSynthesis' in win;
 function stopSpeaking(){if(canSpeak)window.speechSynthesis.cancel();spoken.current=false;setSpeaking(false);}
 function stopListening(){recognition.current?.stop();}
 function reset(){const r=recognition.current;recognition.current=null;if(r){r.onstart=null;r.onresult=null;r.onerror=null;r.onend=null;r.abort();}stopSpeaking();lastTranscript.current='';setListening(false);setInterim('');setRecognized('');setSpeechError('');}
 function startListening(){
  if(listening)return stopListening();
  setSpeechError('');setRecognized('');setInterim('');lastTranscript.current='';stopSpeaking();
  if(!ctor){setSpeechError('此瀏覽器未提供 Speech Recognition。請改用支援的瀏覽器，或直接打字提問。');return;}
  if(!window.isSecureContext){setSpeechError('語音辨識需要 HTTPS 或 localhost 安全環境，請先改用文字。');return;}
  const r=new ctor();recognition.current=r;r.lang='zh-TW';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
  r.onstart=()=>{if(active.current)setListening(true);};
  r.onresult=event=>{if(!active.current)return;let pending='';for(let i=event.resultIndex;i<event.results.length;i++){const result=event.results[i];const text=result[0]?.transcript?.trim()||'';if(result.isFinal){if(text&&text!==lastTranscript.current){lastTranscript.current=text;setRecognized(text);setInterim('');setListening(false);callback.current(text);}}else pending+=text;}if(pending)setInterim(pending);};
  r.onerror=event=>{if(!active.current)return;setListening(false);if(event.error!=='aborted')setSpeechError(errors[event.error]||'語音辨識失敗，請重試或改用文字輸入。');};
  r.onend=()=>{if(active.current){setListening(false);setInterim('');if(!lastTranscript.current)setSpeechError(previous=>previous||'這次沒有取得可用的語音內容，請再試一次或直接打字。');}};
  try{r.start();}catch{setSpeechError('無法啟動麥克風，請稍後重試或使用文字。');setListening(false);}
 }
 function speak(text:string){
  setSpeechError('');if(!canSpeak){setSpeechError('此瀏覽器不支援語音朗讀，請閱讀文字回答。');return;}
  stopListening();stopSpeaking();const voices=window.speechSynthesis.getVoices();const chinese=voices.find(v=>v.lang==='zh-TW')||voices.find(v=>v.lang.toLowerCase().startsWith('zh'));
  if(!chinese){setSpeechError(voices.length?'裝置尚未安裝中文語音，請安裝中文語音或閱讀文字回答。':'中文語音尚未載入，請稍後再點朗讀，或閱讀文字回答。');return;}
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-TW';utterance.rate=.97;if(chinese)utterance.voice=chinese;
  utterance.onstart=()=>{if(active.current){spoken.current=true;setSpeaking(true);}};utterance.onend=()=>{if(active.current){spoken.current=false;setSpeaking(false);}};utterance.onerror=event=>{if(active.current){setSpeaking(false);if(event.error!=='canceled'&&event.error!=='interrupted')setSpeechError('中文語音無法播放，請閱讀文字回答。');}};
  window.speechSynthesis.speak(utterance);
 }
 useEffect(()=>{active.current=true;return()=>{active.current=false;recognition.current?.abort();if(spoken.current&&canSpeak)window.speechSynthesis.cancel();};},[]);
 return {canRecognize,canSpeak,listening,speaking,interim,recognized,speechError,startListening,stopListening,speak,stopSpeaking,reset};
}
