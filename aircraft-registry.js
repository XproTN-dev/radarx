// RadarX aircraft classifications using SDR Enthusiasts' Plane Alert DB.
// ODbL 1.0, https://github.com/sdr-enthusiasts/plane-alert-db
// This is a community registry: entries may be stale, changed, or misidentified.
const SOURCE="https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/";
const tables=new Map();
let status="Loading registry…";
let lastUpdated=null;

function parseCSV(input){
  const rows=[], row=[];let cell="",quoted=false;
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(ch==='"'){
      if(quoted&&input[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(ch===","&&!quoted){row.push(cell);cell="";}
    else if((ch==="\n"||ch==="\r")&&!quoted){
      if(ch==="\r"&&input[i+1]==="\n")i++;
      row.push(cell);if(row.some(Boolean))rows.push(row.slice());row.length=0;cell="";
    }else cell+=ch;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function normalize(hex){return String(hex||"").trim().toLowerCase().replace(/[^0-9a-f]/g,"");}
function readCSV(text,kind){
  const rows=parseCSV(text);
  let n=0;
  for(const row of rows.slice(1)){
    const hex=normalize(row[0]);
    if(!/^[a-f0-9]{6}$/.test(hex))continue;
    const record={kind,hex,registration:(row[1]||"").trim(),operator:(row[2]||"").trim(),model:(row[3]||"").trim(),type:(row[4]||"").trim(),category:(row[9]||"").trim(),source:"Plane Alert DB — community maintained"};
    // For entries present in multiple lists prioritize government classification.
    if(!tables.has(hex)||kind==="government")tables.set(hex,record);
    n++;
  }
  return n;
}
export async function loadRegistry(){
  status="Loading community aircraft registry…";
  const definitions=[["military","plane-alert-mil.csv"],["government","plane-alert-gov.csv"]];
  const result=await Promise.allSettled(definitions.map(async([kind,file])=>{
    const response=await fetch(SOURCE+file,{cache:"force-cache"});
    if(!response.ok)throw new Error("HTTP "+response.status+" for "+file);
    return {kind,count:readCSV(await response.text(),kind)};
  }));
  const successes=result.filter(x=>x.status==="fulfilled");
  status=successes.length===2?"Community registry loaded":successes.length===1?"Community registry partially available":"Community registry unavailable; using feed flags only";
  if(successes.length)lastUpdated=new Date().toISOString().slice(0,10);
  return {status,entries:tables.size,sources:successes.map(x=>x.value.kind),warnings:result.filter(x=>x.status==="rejected").map(x=>String(x.reason))};
}
export function registryLookup(hex){return tables.get(normalize(hex))||null;}
export function aircraftKind(a){
  const entry=registryLookup(a.hex);
  if(entry)return entry.kind;
  return (Number(a.dbFlags)&1)!==0?"military":"other";
}
export function registryStatus(){return {status,lastUpdated,entries:tables.size};}
export const registryCredits="Plane Alert DB (SDR Enthusiasts), ODbL 1.0; community-maintained, not authoritative.";
