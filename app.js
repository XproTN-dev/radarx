import * as maplibregl from "https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs";
const API = "https://radarx.saifeddinkhmiri.workers.dev";
const HOME = [51.53,25.72];
const REGIONS = {
 qatar:{center:[51.53,25.72],zoom:7.25,radius:180,label:"QATAR / DOHA"},
 bahrain:{center:[50.64,26.17],zoom:7.45,radius:180,label:"BAHRAIN"},
 uae:{center:[54.66,24.81],zoom:7.0,radius:180,label:"UNITED ARAB EMIRATES"},
 kuwait:{center:[47.97,29.36],zoom:7.0,radius:180,label:"KUWAIT"},
 oman:{center:[58.53,23.61],zoom:7.05,radius:180,label:"OMAN"},
 saudi:{center:[49.82,26.45],zoom:7.0,radius:180,label:"EASTERN SAUDI ARABIA"}
};
const STYLES = ["https://tiles.openfreemap.org/styles/bright","https://tiles.openfreemap.org/styles/liberty"];
const $ = id => document.getElementById(id);
const knownGovernmentHex = new Set([]); // V0.1: empty until a verifiable government dataset is integrated.
let aircraft=[], selected="", filter="all", search="", updated=0, loading=false, styleIndex=0, requestedCenter=HOME.slice();
let markers=new Map(), radiusNm=REGIONS.qatar.radius, queuedLoad=false, suppressAreaPrompt=false;
const map=new maplibregl.Map({container:"map",style:STYLES[0],center:HOME,zoom:7.25,minZoom:3.6,maxZoom:16,attributionControl:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),"bottom-right");
map.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");
const id=a=>String(a.hex||"").toLowerCase();
const str=(a,k)=>String(a[k]??"").trim();
const label=a=>str(a,"flight")||str(a,"r")||str(a,"hex").toUpperCase()||"UNKNOWN";
const type=a=> (Number(a.dbFlags)&1)?"military":knownGovernmentHex.has(id(a))?"government":"other";
const coord=a=>Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Math.abs(a.lat)<=90&&Math.abs(a.lon)<=180;
const fmt=(n,unit="")=>typeof n==="number"&&Number.isFinite(n)?Math.round(n).toLocaleString("en-US")+unit:"—";
const altitude=a=>a.alt_baro==="ground"?"ON GROUND":fmt(a.alt_baro," ft");
const put=(key,value)=>$(key).textContent=value;
const match=a=> (filter==="all"||type(a)===filter) && (!search||[a.hex,a.flight,a.r,a.t,a.desc,a.ownOp].filter(Boolean).join(" ").toLowerCase().includes(search));
const svg='<svg viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" stroke="#fff" stroke-width=".8" stroke-linejoin="round" d="M16 1.2c1.5 0 2.2 2.2 2.2 5.4v7.4l11 8v3.7l-11-4v7.3l3.3 2.1v2l-5.5-1.6-5.5 1.6v-2l3.3-2.1v-7.3l-11 4v-3.7l11-8V6.6C13.8 3.4 14.5 1.2 16 1.2Z"/></svg>';
function renderCounts(){
 const m=aircraft.filter(a=>type(a)==="military").length,g=aircraft.filter(a=>type(a)==="government").length;
 put("totalCount",aircraft.length);put("countAll",aircraft.length);put("countMilitary",m);put("countGovernment",g);
 put("countOther",aircraft.length-m-g);put("metricTracked",aircraft.length);put("metricMil",m);
 put("metricUpdated",updated?Math.max(0,Math.round((Date.now()-updated)/1000))+"s ago":"—");
}
function renderList(shown){
 const list=$("aircraftList");list.replaceChildren();put("visibleCount",shown.length);
 if(!shown.length){
  put("listStatus",filter==="government"?"Government filter awaits a verified aircraft registry; we do not infer official status from airline or nationality.":filter==="military"?"No military-tagged aircraft in this search area. This does not imply no military activity.":search?"No aircraft matched.":"No aircraft reported for this area.");return;
 }
 put("listStatus","");
 const ordered=[...shown].sort((a,b)=> (type(a)==="military"?0:type(a)==="government"?1:2)-(type(b)==="military"?0:type(b)==="government"?1:2)||label(a).localeCompare(label(b)));
 const fragment=document.createDocumentFragment();
 for(const a of ordered){
  const row=document.createElement("button");row.type="button";row.className="plane-row"+(id(a)===selected?" selected":"");row.setAttribute("aria-label","Select "+label(a));
  const icon=document.createElement("span");icon.className="row-icon "+type(a);icon.textContent="✈";
  const main=document.createElement("span");main.className="row-main";
  const title=document.createElement("span");title.className="row-title";title.style.display="block";title.textContent=label(a);
  const sub=document.createElement("span");sub.className="row-sub";sub.style.display="block";sub.textContent=[str(a,"t")||"Unknown type",str(a,"r")].filter(Boolean).join(" · ");
  main.append(title,sub);
  const side=document.createElement("span");side.className="row-side";
  const h=document.createElement("strong");h.textContent=altitude(a);
  const speed=document.createElement("span");speed.textContent=fmt(a.gs," kt");side.append(h,speed);
  row.append(icon,main,side);row.addEventListener("click",()=>select(id(a),true));fragment.append(row);
 }
 list.append(fragment);
}
function makeMarker(a){
 const el=document.createElement("div");el.className="aircraft-marker";
 const symbol=document.createElement("span");symbol.className="plane-symbol";symbol.innerHTML=svg;
 const tag=document.createElement("span");tag.className="plane-tag";el.append(symbol,tag);
 const code=id(a);el.addEventListener("click",e=>{e.stopPropagation();select(code,false);});
 const marker=new maplibregl.Marker({element:el,anchor:"center",rotationAlignment:"map"}).setLngLat([a.lon,a.lat]).addTo(map);
 return {marker,el,symbol,tag};
}
function renderMarkers(shown){
 const ids=new Set();
 for(const a of shown){
  if(!coord(a)||Number(a.seen_pos)>90)continue;
  const code=id(a);ids.add(code);
  let x=markers.get(code);if(!x){x=makeMarker(a);markers.set(code,x);}else x.marker.setLngLat([a.lon,a.lat]);
  x.el.className="aircraft-marker "+type(a)+(selected===code?" selected":"");
  x.symbol.style.transform="rotate("+(Number(a.track)||0)+"deg)";
  x.tag.textContent=label(a);x.el.title=label(a)+" · "+altitude(a);
 }
 for(const [code,x] of markers)if(!ids.has(code)){x.marker.remove();markers.delete(code);}
}
/* Display labels selectively, preventing overlapping callsigns at high zoom. */
function layoutLabels(){
 const zoom=map.getZoom();
 const entries=[...markers.entries()];
 for(const [,entry] of entries)entry.el.classList.remove("show-label");
 if(zoom<8.3)return;
 const prioritized=entries.map(([code,entry])=>{
  const a=aircraft.find(item=>id(item)===code);
  return {code,entry,a,priority:code===selected?0:a&&type(a)==="military"?1:2};
 }).filter(x=>x.a&&coord(x.a)).sort((a,b)=>a.priority-b.priority);
 const width=map.getContainer().clientWidth, height=map.getContainer().clientHeight;
 const placed=[];
 for(const item of prioritized){
  const p=map.project([item.a.lon,item.a.lat]);
  const title=label(item.a);
  const w=Math.min(132,Math.max(35,title.length*7+12));
  const box={left:p.x-w/2-4,right:p.x+w/2+4,top:p.y+18,bottom:p.y+43};
  // The top-left status card and right controls have priority over callsigns.
  if(box.left<8||box.right>width-8||box.top<8||box.bottom>height-20)continue;
  if(box.top<87&&box.left<375)continue;
  if(box.top<105&&box.right>width-165)continue;
  const overlaps=placed.some(other=>box.left<other.right&&box.right>other.left&&box.top<other.bottom&&box.bottom>other.top);
  if(overlaps&&item.priority!==0)continue;
  item.entry.el.classList.add("show-label");
  placed.push(box);
 }
}
function renderDetails(){
 const a=aircraft.find(x=>id(x)===selected);
 $("detailPanel").classList.toggle("hidden",!a);if(!a)return;
 put("detailClass",type(a)==="military"?"MILITARY · SOURCE TAGGED":type(a)==="government"?"GOVERNMENT · VERIFIED":"OTHER / UNVERIFIED");
 put("detailCallsign",label(a));put("detailRegistration",str(a,"r")||"Registration unavailable");
 put("detailType",str(a,"t")||"Unknown aircraft type");put("detailDesc",str(a,"desc")||str(a,"ownOp")||"No description supplied");
 put("detailAltitude",altitude(a));put("detailSpeed",fmt(a.gs," kt"));put("detailHeading",fmt(a.track,"°"));
 put("detailRate",fmt(a.baro_rate," ft/min"));put("detailIcao",str(a,"hex").toUpperCase()||"—");
 put("detailSquawk",str(a,"squawk")||"—");
 put("detailAge",typeof a.seen_pos==="number"?Math.round(a.seen_pos)+" seconds at retrieval":"Unknown");
 put("detailMethod",str(a,"type")||"Unspecified");
 put("detailConfidence",type(a)==="military"?"Provider military database flag":type(a)==="government"?"Verified curated identity":"No special identity verified");
}
function render(){const shown=aircraft.filter(match);renderCounts();renderList(shown);renderMarkers(shown);renderDetails();layoutLabels();}
function select(code,pan){
 selected=code;render();const a=aircraft.find(x=>id(x)===code);
 if(pan&&a&&coord(a)){suppressAreaPrompt=true;$("searchAreaButton").classList.add("hidden");map.flyTo({center:[a.lon,a.lat],zoom:Math.max(map.getZoom(),7.5),speed:1.3});}
 $("sidebar").classList.remove("is-open");
}
function showError(message){put("errorBanner",message);$("errorBanner").classList.toggle("hidden",!message);}
function connection(ok,message){$("liveIndicator").classList.toggle("bad",!ok);put("liveLabel",message);}
async function load(){
 if(loading){queuedLoad=true;return;}loading=true;$("refreshButton").disabled=true;connection(true,"UPDATING");
 const [lon,lat]=requestedCenter;
 const query=new URLSearchParams({lat:lat.toFixed(4),lon:lon.toFixed(4),dist:String(radiusNm)});
 try{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);let response;
  try{response=await fetch(API+"/v1/near?"+query.toString(),{signal:controller.signal,cache:"no-store"});}finally{clearTimeout(timeout);}
  const data=await response.json();
  if(!response.ok)throw Error(String(data.error||"HTTP "+response.status)+(data.upstream_status?" (upstream "+data.upstream_status+")":""));
  if(!Array.isArray(data.ac))throw Error("Invalid aircraft data: missing ac array");
  const seen=new Set();aircraft=data.ac.filter(a=>{if(!a||!a.hex||seen.has(id(a)))return false;seen.add(id(a));return true;});
  updated=Date.now();
  if(selected&&!aircraft.some(a=>id(a)===selected))selected="";
  $("searchAreaButton").classList.add("hidden");
  showError("");connection(true,"FEED ONLINE");render();
 }catch(e){
  connection(false,"FEED UNAVAILABLE");
  showError("Aircraft feed unavailable: "+(e.name==="AbortError"?"request timed out":e.message)+". Existing results may be stale.");
  if(!aircraft.length)put("listStatus","Unable to load live aircraft. Check the Cloudflare Worker and try Refresh.");
 }finally{loading=false;$("refreshButton").disabled=false;if(queuedLoad){queuedLoad=false;load();}}
}
function distanceKm(a,b,c,d){const r=Math.PI/180,z=Math.sin((d-b)*r/2)**2+Math.cos(b*r)*Math.cos(d*r)*Math.sin((c-a)*r/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(z)));}
function searchArea(){const c=map.getCenter();requestedCenter=[c.lng,c.lat];put("mapAreaName","CUSTOM SEARCH AREA");$("searchAreaButton").classList.add("hidden");load();}
function activateRegion(regionKey){
 const region=REGIONS[regionKey]||REGIONS.qatar;
 requestedCenter=region.center.slice();
 radiusNm=region.radius;
 selected="";
 put("mapAreaName",region.label);
 $("regionSelect").value=regionKey;
 $("searchAreaButton").classList.add("hidden");
 suppressAreaPrompt=true;map.flyTo({center:region.center,zoom:region.zoom,speed:1.4,essential:true});
 load();
}
map.on("moveend",()=>{
 layoutLabels();
 if(suppressAreaPrompt){suppressAreaPrompt=false;return;}
 const c=map.getCenter();
 $("searchAreaButton").classList.toggle("hidden",distanceKm(c.lng,c.lat,requestedCenter[0],requestedCenter[1])<35);
});
map.on("error",e=>{if(!aircraft.length&&e.error)showError("Map tiles may be temporarily unavailable. Check your network or switch map style.");});
$("filters").addEventListener("click",e=>{const button=e.target.closest("[data-filter]");if(!button)return;filter=button.dataset.filter;document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===button));render();});
$("aircraftSearch").addEventListener("input",e=>{search=e.target.value.trim().toLowerCase();render();});
$("refreshButton").addEventListener("click",load);$("searchAreaButton").addEventListener("click",searchArea);
$("recenterButton").addEventListener("click",()=>activateRegion("qatar"));
$("regionSelect").addEventListener("change",e=>activateRegion(e.target.value));
$("styleButton").addEventListener("click",()=>{styleIndex=(styleIndex+1)%STYLES.length;map.setStyle(STYLES[styleIndex]);$("styleButton").title=styleIndex?"Liberty style":"Bright style";});
$("detailClose").addEventListener("click",()=>{selected="";render();});
$("sidebarToggle").addEventListener("click",()=>$("sidebar").classList.toggle("is-open"));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){$("sidebar").classList.remove("is-open");selected="";render();}if(e.key==="/"&&!(e.target instanceof HTMLInputElement)){e.preventDefault();$("aircraftSearch").focus();$("sidebar").classList.add("is-open");}});
setInterval(()=>{if(document.visibilityState==="visible"){if(!updated||Date.now()-updated>=120000)load();else put("metricUpdated",Math.round((Date.now()-updated)/1000)+"s ago");}},10000);
map.on("zoomend",layoutLabels);
map.on("resize",layoutLabels);
map.on("load",()=>{map.resize();load();});
