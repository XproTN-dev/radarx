// RadarX V0.7: age-aware regional observations.
// Each sector is a separate point-in-time survey, NOT a live MENA-wide radar.
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
export const LIVE_AGE_SECONDS=90;
export const RETAIN_AGE_SECONDS=180;
const sectors=new Map(),airframes=new Map(),military=new Map();
let cursor=0,militaryCheckedAt=0;
const hex=x=>String(x?.hex||"").trim().toLowerCase();
const validHex=key=>/^[0-9a-f]{6}$/.test(key);
const validCoord=a=>typeof a.lat==="number"&&typeof a.lon==="number"&&Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Math.abs(a.lat)<=90&&Math.abs(a.lon)<=180;
const observedAt=(a,sourceTime)=>{
 const age=a.seen_pos;
 if(typeof age!=="number"||!Number.isFinite(age)||age<0)return null;
 return sourceTime-Math.max(0,age)*1000;
};
const sourceTime=(p,time)=>{
 const n=Number(p?.now);
 return Number.isFinite(n)&&n>1700000000&&n*1000<time+60000?n*1000:time;
};
function absorb(storage,record,now,area,src){
 if(!record||!validHex(hex(record))||!validCoord(record))return false;
 const positionAt=observedAt(record,src);
 if(positionAt===null||positionAt>now+60000||now-positionAt>RETAIN_AGE_SECONDS*1000)return false;
 const key=hex(record),prior=storage.get(key);
 if(!prior||positionAt>=prior.positionAt)storage.set(key,{record,positionAt,receivedAt:now,area});
 return true;
}
function prune(time){
 for(const collection of [airframes,military]){
  for(const [key,item] of collection)if(time-item.positionAt>RETAIN_AGE_SECONDS*1000||time-item.positionAt< -60000)collection.delete(key);
 }
}
export function nextSector(mode="mena"){
 const candidates=mode==="gulf"?SECTORS.filter(s=>GULF_IDS.has(s.id)):SECTORS;
 return candidates[(cursor++)%candidates.length];
}
export function scanMerge(sector,payload,time=Date.now()){
 if(!Array.isArray(payload?.ac))throw Error("Invalid aircraft response");
 const timestamp=sourceTime(payload,time);
 let valid=0;
 for(const record of payload.ac)if(absorb(airframes,record,time,sector.id,timestamp))valid++;
 sectors.set(sector.id,{label:sector.label,updatedAt:time,sourceAt:timestamp,count:valid,success:true,error:null});
 prune(time);
 return {sector:sector.label,seen:valid,total:scanAircraft(time).length};
}
export function scanMilitary(payload,time=Date.now(),mode="mena"){
 if(!Array.isArray(payload?.ac))throw Error("Invalid military response");
 const stamp=sourceTime(payload,time);
 let accepted=0;
 for(const record of payload.ac){
  if(!validCoord(record))continue;
  // Broad MENA bounding box, or the Gulf subregion. Global military endpoint
  // is global, but the map must not show out-of-region aircraft.
  const inside=mode==="gulf"
    ? record.lat>=15&&record.lat<=37&&record.lon>=40&&record.lon<=65
    : record.lat>=12&&record.lat<=44&&record.lon>=-18&&record.lon<=65;
  if(!inside)continue;
  if(absorb(military,record,time,"military-feed",stamp))accepted++;
 }
 militaryCheckedAt=time;
 prune(time);
 return {accepted,worldwide:payload.ac.length};
}
export function scanError(sector,error,time=Date.now()){
 const old=sectors.get(sector.id)||{};
 sectors.set(sector.id,{...old,label:sector.label,error:String(error||"Unknown"),failedAt:time,success:false});
}
export function scanAircraft(time=Date.now(),useMilitary=true){
 prune(time);
 const result=new Map();
 for(const [key,obj] of airframes)result.set(key,obj);
 if(useMilitary)for(const [key,obj] of military){
  const old=result.get(key);
  if(!old||obj.positionAt>old.positionAt)result.set(key,obj);
 }
 return [...result.entries()].map(([key,obj])=>({
  ...obj.record,
  seen_pos:Math.max(0,(time-obj.positionAt)/1000),
  __sector:obj.area,
  __providerMilitary:military.has(key),
  __positionAt:obj.positionAt,
  __stale:time-obj.positionAt>LIVE_AGE_SECONDS*1000
 }));
}
export function scanStatus(mode="mena",time=Date.now()){
 const relevant=mode==="gulf"?SECTORS.filter(s=>GULF_IDS.has(s.id)):SECTORS;
 const reports=relevant.map(s=>{
  const r=sectors.get(s.id),ageSeconds=r?Math.max(0,Math.round((time-r.sourceAt)/1000)):null;
  return {id:s.id,label:s.label,ageSeconds,checked:Boolean(r?.updatedAt),fresh:ageSeconds!==null&&ageSeconds<=LIVE_AGE_SECONDS,ok:Boolean(r?.success),count:r?.count??0,error:r?.error||null};
 });
 const arr=scanAircraft(time);
 return {totalSectors:relevant.length,scanned:reports.filter(x=>x.checked).length,
  freshSectors:reports.filter(x=>x.fresh).length,missing:reports.filter(x=>!x.checked).length,
  freshAircraft:arr.filter(a=>!a.__stale).length,staleAircraft:arr.filter(a=>a.__stale).length,
  militaryFeedAgeSeconds:militaryCheckedAt?Math.round((time-militaryCheckedAt)/1000):null,
  reports,aircraft:arr.length};
}
export function clearScan(){sectors.clear();airframes.clear();military.clear();cursor=0;militaryCheckedAt=0;}
