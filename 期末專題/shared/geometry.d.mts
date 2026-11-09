export const mapTiles:{id:string;label:string;x:number;y:number;w:number;h:number}[];
export function polygonTile(name:string,polygon:number[][][]):string;
export function buildMapGeometry(geo:any):{shapes:{name:string;tile:string;d:string}[];project:(tile:string,point:number[])=>number[]};
