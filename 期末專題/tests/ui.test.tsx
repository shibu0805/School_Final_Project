import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {App} from '../src/ResearchApp';
const station={id:'demo-0',name:'忠明',county:'臺中市',aqi:68,pm25:18.2,pm10:37,o3:32,no2:16,so2:2.1,co:.4,pollutant:'PM2.5',time:'2026-11-01 12:00:00',lat:24.1519,lon:120.6411,stale:false,mode:'demo',source:'模擬資料'};
beforeEach(()=>{localStorage.clear();vi.stubGlobal('fetch',vi.fn(async(input:string,options:any)=>{
 const url=String(input);let data:any={};let ok=true;
 if(url.includes('stations?mode=live')){ok=false;data={error:'尚未設定 MOENV_API_KEY'};}
 else if(url.includes('/status'))data={air:false,weather:false,gemini:false};
 else if(url.includes('/stations'))data={stations:[station]};
 else if(url.includes('/history'))data={history:[]};
 else if(url.includes('/weather'))data={periods:[],message:'尚未設定氣象署金鑰'};
 else if(url.includes('/runs'))data={runs:[]};
 else if(url.includes('/chat')){const request=JSON.parse(options.body);data={reply:'這是可追溯的教學模擬回答。',profile:request.profile,trace:[{name:'get_realtime_aqi',status:'ok',ms:2,summary:'10 筆資料'}],facts:{source:'模擬資料',time:station.time},validation:{passed:true},provider:'rules',elapsed:5};}
 return {ok,json:async()=>data};
}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('總覽載入測站數值並明確標示模擬資料',async()=>{render(<App/>);await screen.findByText('68');expect(screen.getByText(/目前顯示教學模擬資料/)).toBeTruthy();expect(screen.getByText('18.2')).toBeTruthy();});
test('切換官方模式後移除展示數值並顯示金鑰錯誤',async()=>{render(<App/>);await screen.findByText('68');fireEvent.change(screen.getByLabelText('資料模式'),{target:{value:'live'}});await screen.findByText('尚未設定 MOENV_API_KEY');expect(screen.queryByText('68')).toBeNull();});
test('送出聊天問題後顯示回答與工具紀錄',async()=>{render(<App/>);await screen.findByText('68');fireEvent.click(screen.getByRole('button',{name:'AI 出門顧問AI'}));fireEvent.change(screen.getByLabelText('輸入出門問題'),{target:{value:'現在適合慢跑嗎？'}});fireEvent.click(screen.getByLabelText('送出問題'));await screen.findByText('這是可追溯的教學模擬回答。');expect(screen.getByText('get_realtime_aqi')).toBeTruthy();});
test('實驗頁保持未測試，設定可以開啟關閉',async()=>{render(<App/>);fireEvent.click(screen.getByRole('button',{name:'專題實驗'}));await waitFor(()=>expect(screen.getAllByText('未測試').length).toBe(30));fireEvent.click(screen.getByLabelText('開啟設定'));expect(screen.getByRole('dialog')).toBeTruthy();fireEvent.click(screen.getByLabelText('關閉設定'));expect(screen.queryByRole('dialog')).toBeNull();});
