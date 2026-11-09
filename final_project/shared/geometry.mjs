// 以 GeoJSON 原始 Polygon/MultiPolygon 投影 SVG；只對顯示做亞像素點去重。
export const mapTiles=[
 {id:'main',label:'臺灣本島與周邊離島',x:255,y:22,w:600,h:615},
 {id:'penghu',label:'澎湖縣',x:22,y:40,w:166,h:128},
 {id:'kinmen',label:'金門縣・烏坵',x:22,y:198,w:166,h:128},
 {id:'matsu',label:'連江縣（馬祖）',x:22,y:356,w:166,h:128},
 {id:'northeast',label:'東北離島',x:22,y:530,w:100,h:92},
 {id:'dongsha',label:'東沙',x:136,y:530,w:100,h:92},
 {id:'nansha',label:'南沙',x:250,y:530,w:100,h:92}
];
export function polygonTile(name,polygon){
 const ring=polygon[0];const center=ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0]);
 if(name==='澎湖縣')return 'penghu';if(name==='金門縣')return 'kinmen';if(name==='連江縣')return 'matsu';
 if(center[1]<21)return center[1]>15?'dongsha':'nansha';
 if(center[0]>122.3)return 'northeast';return 'main';
}
export function buildMapGeometry(geo){
 if(geo?.type!=='FeatureCollection')throw Error('行政區圖資格式不正確');
 const parts=[];
 for(const f of geo.features){const name=f.properties.COUNTYNAME;const polygons=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];for(const polygon of polygons)parts.push({name,polygon,tile:polygonTile(name,polygon)});}
 const transforms={};
 for(const tile of mapTiles){
  const all=parts.filter(p=>p.tile===tile.id).flatMap(p=>p.polygon.flat());if(!all.length)continue;
  const bounds=all.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
  const cos=Math.cos((bounds[1]+bounds[3])/2*Math.PI/180),pad=tile.id==='main'?8:20;
  const scale=Math.min((tile.w-pad*2)/((bounds[2]-bounds[0])*cos),(tile.h-pad*2)/(bounds[3]-bounds[1]));
  transforms[tile.id]={bounds,cos,scale,cx:tile.x+tile.w/2,cy:tile.y+tile.h/2};
 }
 const project=(tile,point)=>{const t=transforms[tile];return [t.cx+(point[0]-(t.bounds[0]+t.bounds[2])/2)*t.cos*t.scale,t.cy-(point[1]-(t.bounds[1]+t.bounds[3])/2)*t.scale];};
 const shapes=[];
 for(const feature of geo.features){for(const tile of mapTiles){const polygons=parts.filter(p=>p.name===feature.properties.COUNTYNAME&&p.tile===tile.id);if(!polygons.length)continue;
  let d='';for(const {polygon} of polygons)for(const ring of polygon){let previous=null;for(let i=0;i<ring.length;i++){const p=project(tile.id,ring[i]);if(previous&&i<ring.length-1&&Math.hypot(p[0]-previous[0],p[1]-previous[1])<.25)continue;d+=(previous?'L':'M')+p.map(n=>n.toFixed(2)).join(',');previous=p;}d+='Z';}
  shapes.push({name:feature.properties.COUNTYNAME,tile:tile.id,d});
 }}
 return {shapes,project};
}
