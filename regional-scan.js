// RadarX regional collection: rotating authorized radius queries.
// Each returned sample is associated with the region where it was received.
// No invented aircraft. Sector TTL governs removal of outdated sightings.
export const SECTORS=[
 {id:"gulf-n",label:"Upper Gulf",lat:28.7,lon:49.25},
 {id:"gulf-s",label:"Qatar / Bahrain",lat:25.55,lon:51.25},
 {id:"gulf-e",label:"UAE / Oman",lat:24.7,lon:55.45},
 {id:"oman",label:"Eastern Oman",lat:21.8,lon:58.1},
 {id:"iraq",label:"Iraq",lat:33.1,lon:44.3},
 {id:"iran-w",label:"Western Iran",lat:32.4,lon:50.1},
 {id:"iran-e",label:"Eastern Iran",lat:30.5,lon:56.7},
 {id:"saudi",label:"Central Saudi",lat:24.5,lon:45.2},
 {id:"arabia-s",label:"Yemen / Southwest Saudi",lat:17.8,lon:44.5},
 {id:"levant",label:"Levant",lat:33.5,lon:36.8},
 {id:"egypt",label:"Egypt",lat:28.9,lon:30.9},
 {id:"turkey",label:"Turkey",lat:38.9,lon:35.0},
 {id:"libya",label:"Libya",lat:30.6,lon:17.1},
 {id:"tunisia",label:"Tunisia",lat:34.5,lon:10.2},
 {id:"algeria",label:"Northern Algeria",lat:35.0,lon:3.2},
 {id:"morocco",label:"Morocco",lat:33.4,lon:-6.0}
];
export const GULF_IDS=new Set(["gulf-n","gulf-s","gulf-e","oman","iraq","iran-w","iran-e","saudi","arabia-s"]);
const STALE_AFTER_MS=12*60*1000;
const sectors=new Map(),airframes=new Map();
const hex=x=>String(x?.hex||"").toLowerCase();
let cursor=0,cycle=0,updatedAt=0;
export function nextSector(mode="mena"){
 const list=mode==="gulf"?SECTORS.filter(s=>GULF_IDS.has(s.id)):SECTORS;
 const out=list[cursor%list.length];
 cursor++;
 return out;
}
export function scanMerge(sector,payload,time=Date.now()){
 if(!Array.isArray(payload?.ac))throw Error("Invalid aircraft observations");
 const names=new Set();
 const timestamp=Number(payload.now);
 const fromSource=Number.isFinite(timestamp)&&timestamp>1700000000?timestamp*1000:time;
 for(const ac of payload.ac){
   const key=hex(ac);
   if(!/^[a-f0-9]{6}$/.test(key))continue;
   names.add(key);
   const observedAge=typeof ac.seen_pos==="number"?Math.max(0,ac.seen_pos*1000):0;
   const positionAt=fromSource-observedAge;
   const old=airframes.get(key);
   // Do not let a delayed regional response overwrite a fresher position.
   if(!old||positionAt>old.positionAt)airframes.set(key,{record:ac,positionAt,region:sector.id,receivedAt:time});
 }
 sectors.set(sector.id,{label:sector.label,updatedAt:time,sourceAt:fromSource,count:payload.ac.length,success:true});
 updatedAt=time;
 for(const [key,record] of airframes){
   if(time-record.receivedAt>STALE_AFTER_MS||time-record.positionAt>STALE_AFTER_MS)airframes.delete(key);
 }
 return {total:airframes.size,sector:sector.label,sourceAt:fromSource,sectorCount:sectors.size};
}
export function scanError(sector,error,time=Date.now()){
 const old=sectors.get(sector.id)||{};
 sectors.set(sector.id,{...old,label:sector.label,failedAt:time,error:String(error||"Unknown error"),success:false});
}
export function scanAircraft(time=Date.now()){
 const arr=[];
 for(const x of airframes.values()){
   if(time-x.receivedAt>STALE_AFTER_MS||time-x.positionAt>STALE_AFTER_MS)continue;
   const record={...x.record};
   // Maintain true observation age for list/marker stale checks.
   record.seen_pos=Math.max(0,(time-x.positionAt)/1000);
   record.__sector=x.region;record.__positionAt=x.positionAt;
   arr.push(record);
 }
 return arr;
}
export function scanStatus(mode="mena",time=Date.now()){
 const included=mode==="gulf"?SECTORS.filter(x=>GULF_IDS.has(x.id)):SECTORS;
 const reports=included.map(s=>{
   const r=sectors.get(s.id);
   return {id:s.id,label:s.label,ageSeconds:r?.updatedAt===undefined?null:Math.round((time-r.updatedAt)/1000),count:r?.count??0,error:r?.error||null,checked:Boolean(r?.updatedAt),ok:Boolean(r?.success)};
 });
 return {totalSectors:included.length,scanned:reports.filter(r=>r.checked).length,missing:reports.filter(r=>!r.checked).length,reports,aircraft:airframes.size};
}
export function clearScan(){sectors.clear();airframes.clear();cursor=0;updatedAt=0;}
