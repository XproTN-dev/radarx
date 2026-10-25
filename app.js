import * as maplibregl from "https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs";
import {loadRegistry,registryLookup,aircraftKind,registryStatus} from "./aircraft-registry.js";
import {observeCounts,aggregateSummary,sparklineSVG} from "./traffic-insights.js";
const API = "https://radarx.saifeddinkhmiri.workers.dev";
const REFRESH_INTERVAL_MS = 10000; // check for updated cached observations about twice per minute
const HOME = [51.53,25.72];
const REGIONS = {
 qatar:{center:[51.53,25.72],zoom:7.25,radius:250,label:"QATAR / DOHA"},
 bahrain:{center:[50.64,26.17],zoom:7.45,radius:250,label:"BAHRAIN"},
 uae:{center:[54.66,24.81],zoom:7.0,radius:250,label:"UNITED ARAB EMIRATES"},
 kuwait:{center:[47.97,29.36],zoom:7.0,radius:250,label:"KUWAIT"},
 oman:{center:[58.53,23.61],zoom:7.05,radius:250,label:"OMAN"},
 saudi:{center:[49.82,26.45],zoom:7.0,radius:250,label:"EASTERN SAUDI ARABIA"}
};
const STYLES = ["https://tiles.openfreemap.org/styles/bright","https://tiles.openfreemap.org/styles/liberty","https://tiles.openfreemap.org/styles/positron","https://tiles.openfreemap.org/styles/dark"];
const $ = id => document.getElementById(id);
const favourites=new Set((()=>{try{return JSON.parse(localStorage.getItem("radarx-fav-v1")||"[]")}catch{return []}})());
const UI={inView:false,airborne:false,favouritesOnly:false,insights:false};
let aircraft=[], selected="", filter="all", search="", updated=0, sampleTime=0, lastAttemptAt=0, frozen=false, loading=false, styleIndex=0, requestedCenter=HOME.slice();
let radiusNm=REGIONS.qatar.radius, queuedLoad=false, suppressAreaPrompt=false;
const map=new maplibregl.Map({container:"map",style:STYLES[0],center:HOME,zoom:7.25,minZoom:3.6,maxZoom:16,bearing:0,pitch:0,maxPitch:0,dragRotate:false,attributionControl:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),"bottom-right");
map.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");
const id=a=>String(a.hex||"").toLowerCase();
const str=(a,k)=>String(a[k]??"").trim();
const label=a=>str(a,"flight")||str(a,"r")||str(a,"hex").toUpperCase()||"UNKNOWN";
const type=a=>aircraftKind(a);
const coord=a=>Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Math.abs(a.lat)<=90&&Math.abs(a.lon)<=180;
const fmt=(n,unit="")=>typeof n==="number"&&Number.isFinite(n)?Math.round(n).toLocaleString("en-US")+unit:"—";
const altitude=a=>a.alt_baro==="ground"?"ON GROUND":fmt(a.alt_baro," ft");
const put=(key,value)=>$(key).textContent=value;
function match(a){
 if(filter!=="all"&&type(a)!==filter)return false;
 if(UI.airborne&&a.alt_baro==="ground")return false;
 if(UI.favouritesOnly&&!favourites.has(id(a)))return false;
 if(UI.inView&&(!coord(a)||!map.getBounds().contains([a.lon,a.lat])))return false;
 const ref=registryLookup(a.hex);
 return !search||[a.hex,a.flight,a.r,a.t,a.desc,a.ownOp,ref?.operator,ref?.model].filter(Boolean).join(" ").toLowerCase().includes(search);
}
function toggleFavourite(){
 if(!selected)return;
 if(favourites.has(selected))favourites.delete(selected);else favourites.add(selected);
 try{localStorage.setItem("radarx-fav-v1",JSON.stringify([...favourites].slice(0,200)))}catch{}
 render();
}
function sampleAgeSeconds(){return sampleTime?Math.max(0,Math.round((Date.now()-sampleTime)/1000)):null;}
function refreshAgeAndStatus(){
 const age=sampleAgeSeconds();
 put("metricUpdated",age===null?"unknown":age<60?age+"s ago":Math.floor(age/60)+"m "+(age%60)+"s ago");
 put("coverageRadius",radiusNm+" NM query · FlyItalyADSB feed");
 if(frozen){connection(true,"SNAPSHOT FROZEN");return;}
 if(updated && age!==null && age>180)connection(false,"DATA DELAYED");
}
function setFrozen(next,autoLoad=true){
 frozen=Boolean(next);
 const button=$("freezeButton");
 button.classList.toggle("frozen",frozen);
 button.setAttribute("aria-pressed",String(frozen));
 button.textContent=frozen?"▶ Resume live":"❄ Freeze positions";
 button.title=frozen?"Positions locked until resumed; zoom will not update them":"Hold current GPS coordinates to diagnose zoom movement";
 if(frozen){queuedLoad=false;connection(true,"SNAPSHOT FROZEN");}
 else if(autoLoad){load();}
 refreshAgeAndStatus();
}
function renderCounts(){
 const m=aircraft.filter(a=>type(a)==="military").length,g=aircraft.filter(a=>type(a)==="government").length;
 put("totalCount",aircraft.length);put("countAll",aircraft.length);put("countMilitary",m);put("countGovernment",g);
 put("countOther",aircraft.length-m-g);put("metricTracked",aircraft.length);put("metricMil",m);
 refreshAgeAndStatus();
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
  const title=document.createElement("span");title.className="row-title";title.style.display="block";title.textContent=(favourites.has(id(a))?"★ ":"")+label(a);
  const sub=document.createElement("span");sub.className="row-sub";sub.style.display="block";sub.textContent=[str(a,"t")||registryLookup(a.hex)?.type||"Unknown type",str(a,"r")].filter(Boolean).join(" · ");
  main.append(title,sub);
  const side=document.createElement("span");side.className="row-side";
  const h=document.createElement("strong");h.textContent=altitude(a);
  const speed=document.createElement("span");speed.textContent=fmt(a.gs," kt");side.append(h,speed);
  row.append(icon,main,side);row.addEventListener("click",()=>select(id(a),true));fragment.append(row);
 }
 list.append(fragment);
}
/* Aircraft rendering is implemented as MapLibre native GeoJSON symbol layers.
   Screen position is projected from [longitude, latitude] in the map engine.
   Do not use HTML/DOM markers here: they were visibly drifting on zoom. */
const AIRCRAFT_SOURCE = "radarx-observations";
const AIRCRAFT_LAYER = "radarx-planes";
const ANCHOR_LAYER = "radarx-coordinate-anchor";
const AIRCRAFT_LABELS = "radarx-aircraft-labels";
let aircraftEventsAttached = false;

function drawPlaneIcon(fill) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  ctx.shadowColor = "rgba(15, 43, 68, 0.38)";
  ctx.shadowBlur = 1.5;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = fill;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.85;
  ctx.lineJoin = "round";
  // The image points north. A feature's ground track rotates it clockwise.
  const p = new Path2D("M16 1.2c1.5 0 2.2 2.2 2.2 5.4v7.4l11 8v3.7l-11-4v7.3l3.3 2.1v2l-5.5-1.6-5.5 1.6v-2l3.3-2.1v-7.3l-11 4v-3.7l11-8V6.6C13.8 3.4 14.5 1.2 16 1.2Z");
  ctx.fill(p);
  ctx.stroke(p);
  return ctx.getImageData(0, 0, 64, 64);
}
function makeAircraftGeoJSON() {
  const features = [];
  for(const a of aircraft.filter(match)) {
    if(!coord(a) || (Number.isFinite(Number(a.seen_pos)) && Number(a.seen_pos) > 90))continue;
    features.push({
      type:"Feature",
      geometry:{type:"Point",coordinates:[a.lon,a.lat]},
      properties:{
        hex:id(a),
        callsign:label(a),
        category:type(a),
        heading:Number.isFinite(Number(a.track))?Number(a.track):0,
        priority:id(a)===selected?3:type(a)==="military"?2:1,
        selected:id(a)===selected?1:0
      }
    });
  }
  return {type:"FeatureCollection",features};
}
function renderMarkers() {
  const source=map.getSource(AIRCRAFT_SOURCE);
  if(source)source.setData(makeAircraftGeoJSON());
}
function installAircraftLayers(){
  try {
    const colorways={
      "radarx-plane-other":"#efb724",
      "radarx-plane-military":"#e9445b",
      "radarx-plane-government":"#815bd5",
      "radarx-plane-selected":"#087fd3"
    };
    for(const [name,color] of Object.entries(colorways)){
      if(!map.hasImage(name))map.addImage(name,drawPlaneIcon(color),{pixelRatio:2});
    }
    if(!map.getSource(AIRCRAFT_SOURCE)){
      map.addSource(AIRCRAFT_SOURCE,{type:"geojson",data:makeAircraftGeoJSON()});
    }
    // A separate geographic ring verifies the true point coordinate.
    // It is visible only for the selected aircraft and never depends on plane icon sizing.
    if(!map.getLayer(ANCHOR_LAYER)){
      map.addLayer({
        id:ANCHOR_LAYER,
        type:"circle",
        source:AIRCRAFT_SOURCE,
        filter:["==",["get","selected"],1],
        paint:{
          "circle-radius":18,
          "circle-color":"#087fd3",
          "circle-opacity":0.08,
          "circle-stroke-color":"#008fdc",
          "circle-stroke-opacity":0.95,
          "circle-stroke-width":2
        }
      });
    }
    if(!map.getLayer(AIRCRAFT_LAYER)){
      map.addLayer({
        id:AIRCRAFT_LAYER,
        type:"symbol",
        source:AIRCRAFT_SOURCE,
        layout:{
          "icon-image":["case",["==",["get","selected"],1],"radarx-plane-selected",
            ["match",["get","category"],
              "military","radarx-plane-military",
              "government","radarx-plane-government",
              "radarx-plane-other"]],
          "icon-rotate":["get","heading"],
          "icon-rotation-alignment":"map",
          "icon-pitch-alignment":"viewport",
          "icon-anchor":"center",
          "icon-offset":[0,0],
          "icon-size":0.96,
          "icon-allow-overlap":true,
          "icon-ignore-placement":true,
          "symbol-sort-key":["get","priority"]
        }
      });
    }
    if(!map.getLayer(AIRCRAFT_LABELS)){
      map.addLayer({
        id:AIRCRAFT_LABELS,
        type:"symbol",
        source:AIRCRAFT_SOURCE,
        minzoom:8.7,
        layout:{
          "text-field":["get","callsign"],
          "text-font":["Noto Sans Regular"],
          "text-size":11,
          "text-offset":[0,1.8],
          "text-anchor":"top",
          "text-padding":5,
          "text-max-width":9,
          "text-allow-overlap":false,
          "text-ignore-placement":false,
          "symbol-sort-key":["get","priority"]
        },
        paint:{
          "text-color":"#1f4058",
          "text-halo-color":"#ffffff",
          "text-halo-width":1.6
        }
      });
    }
    if(!aircraftEventsAttached){
      map.on("click",AIRCRAFT_LAYER,e=>{
        const feature=e.features?.[0];
        if(feature?.properties?.hex)select(feature.properties.hex,false);
      });
      map.on("mouseenter",AIRCRAFT_LAYER,()=>{map.getCanvas().style.cursor="pointer";});
      map.on("mouseleave",AIRCRAFT_LAYER,()=>{map.getCanvas().style.cursor="";});
      aircraftEventsAttached=true;
    }
    renderMarkers();
  } catch(e){
    showError("Aircraft layer failed to initialize: "+e.message);
  }
}
function layoutLabels(){
  // MapLibre's collision detection places callsigns within its own map projection.
}
function renderDetails(){
 const a=aircraft.find(x=>id(x)===selected);
 $("detailPanel").classList.toggle("hidden",!a);if(!a)return;
 put("detailClass",type(a)==="military"?"MILITARY · SOURCE TAGGED":type(a)==="government"?"GOVERNMENT · COMMUNITY CLASSIFICATION":"OTHER / UNVERIFIED");
 put("detailCallsign",label(a));put("detailRegistration",str(a,"r")||"Registration unavailable");
 put("detailType",str(a,"t")||"Unknown aircraft type");put("detailDesc",str(a,"desc")||str(a,"ownOp")||"No description supplied");
 put("detailAltitude",altitude(a));put("detailSpeed",fmt(a.gs," kt"));put("detailHeading",fmt(a.track,"°"));
 put("detailRate",fmt(a.baro_rate," ft/min"));put("detailIcao",str(a,"hex").toUpperCase()||"—");
 put("detailSquawk",str(a,"squawk")||"—");
 put("detailCoords",coord(a)?a.lat.toFixed(5)+", "+a.lon.toFixed(5):"Unavailable");
 put("detailAge",typeof a.seen_pos==="number"?Math.round(a.seen_pos)+" seconds at retrieval":"Unknown");
 put("detailMethod",str(a,"type")||"Unspecified");
 const ref=registryLookup(a.hex);
 put("detailConfidence",ref?"Community-maintained classification":type(a)==="military"?"Provider military flag":"Not verified");
 put("detailOperator",ref?.operator||str(a,"ownOp")||"Unknown");
 put("detailDataSource",ref?"Plane Alert DB (ODbL)":"FlyItalyADSB observation");
 put("detailReferenceCategory",ref?.category||"—");
 $("detailReferenceLink").classList.toggle("hidden",!ref);
 $("favouriteButton").textContent=favourites.has(selected)?"★ Remove favourite":"☆ Save aircraft";
 $("favouriteButton").setAttribute("aria-pressed",String(favourites.has(selected)));
}
function render(){const shown=aircraft.filter(match);renderCounts();renderList(shown);renderMarkers(shown);renderDetails();layoutLabels();if(UI.insights)renderInsights();}
function select(code,pan){
 selected=code;render();const a=aircraft.find(x=>id(x)===code);
 if(pan&&a&&coord(a)){suppressAreaPrompt=true;$("searchAreaButton").classList.add("hidden");map.flyTo({center:[a.lon,a.lat],zoom:Math.max(map.getZoom(),7.5),speed:1.3});}
 $("sidebar").classList.remove("is-open");
}
function showError(message){put("errorBanner",message);$("errorBanner").classList.toggle("hidden",!message);}
function connection(ok,message){$("liveIndicator").classList.toggle("bad",!ok);put("liveLabel",message);}
async function load(){
 if(frozen)return;
 if(loading){queuedLoad=true;return;}loading=true;lastAttemptAt=Date.now();$("refreshButton").disabled=true;connection(true,"UPDATING");
 const [lon,lat]=requestedCenter;
 const query=new URLSearchParams({lat:lat.toFixed(4),lon:lon.toFixed(4),dist:String(radiusNm)});
 try{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);let response;
  try{response=await fetch(API+"/v1/near?"+query.toString(),{signal:controller.signal,cache:"no-store"});}finally{clearTimeout(timeout);}
  const data=await response.json();
  if(!response.ok)throw Error(String(data.error||"HTTP "+response.status)+(data.upstream_status?" (upstream "+data.upstream_status+")":""));
  if(!Array.isArray(data.ac))throw Error("Invalid aircraft data: missing ac array");
  // A freeze click may happen during a pending HTTP request. Never mutate a frozen snapshot.
  if(frozen)return;
  const seen=new Set();aircraft=data.ac.filter(a=>{if(!a||!a.hex||seen.has(id(a)))return false;seen.add(id(a));return true;});
  updated=Date.now();
  observeCounts(Date.now(),aircraft.length,aircraft.filter(a=>type(a)==="military").length,aircraft.filter(a=>type(a)==="government").length,aircraft.filter(a=>type(a)==="other").length);
  const sourceNow=Number(data.now);
  const receivedAt=Date.parse(data.received_at??"");
  sampleTime=Number.isFinite(sourceNow)&&sourceNow>1700000000 ? sourceNow*1000
    : Number.isFinite(receivedAt) ? receivedAt : 0;
  if(selected&&!aircraft.some(a=>id(a)===selected))selected="";
  $("searchAreaButton").classList.add("hidden");
  showError("");connection(true,"FEED ONLINE");render();refreshAgeAndStatus();
 }catch(e){
  connection(false,"FEED UNAVAILABLE");
  showError("Aircraft feed unavailable: "+(e.name==="AbortError"?"request timed out":e.message)+". Existing results may be stale.");
  if(!aircraft.length)put("listStatus","Unable to load live aircraft. Check the Cloudflare Worker and try Refresh.");
 }finally{loading=false;$("refreshButton").disabled=false;if(queuedLoad&&!frozen){queuedLoad=false;load();}}
}
function distanceKm(a,b,c,d){const r=Math.PI/180,z=Math.sin((d-b)*r/2)**2+Math.cos(b*r)*Math.cos(d*r)*Math.sin((c-a)*r/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(z)));}
function searchArea(){if(frozen)setFrozen(false,false);const c=map.getCenter();requestedCenter=[c.lng,c.lat];put("mapAreaName","CUSTOM SEARCH AREA");$("searchAreaButton").classList.add("hidden");load();}
function activateRegion(regionKey){
 if(frozen)setFrozen(false,false);
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
for(const [element,key] of [["inViewOnly","inView"],["airborneOnly","airborne"],["favouritesOnly","favouritesOnly"]]){
 $(element).addEventListener("change",e=>{UI[key]=e.target.checked;render();});
}
$("favouriteButton").addEventListener("click",toggleFavourite);
$("focusButton").addEventListener("click",()=>{
 const a=aircraft.find(x=>id(x)===selected);
 if(a&&coord(a)){suppressAreaPrompt=true;map.flyTo({center:[a.lon,a.lat],zoom:Math.max(map.getZoom(),8.5)});}
});
function renderInsights(){
 const sum=aggregateSummary();
 put("insightsLatest",sum.latest?.total??"—");
 put("insightsPeak",sum.samples?sum.peak:"—");
 put("insightsAverage",sum.samples?sum.average:"—");
 $("insightsChart").innerHTML=sparklineSVG()||"No observations yet";
 put("insightsSamples",sum.samples+" samples · "+sum.elapsedMinutes+" minutes in this tab");
 put("insightsQuality",registryStatus().status+". Query radius: "+radiusNm+" NM; source age "+(sampleAgeSeconds()??"unknown")+" seconds.");
}
function showInsights(open){
 UI.insights=open;
 $("insightsPanel").classList.toggle("hidden",!open);
 $("insightsButton").setAttribute("aria-expanded",String(open));
 if(open)renderInsights();
}
$("insightsButton").addEventListener("click",()=>showInsights(!UI.insights));
$("closeInsights").addEventListener("click",()=>showInsights(false));
$("refreshButton").addEventListener("click",()=>{if(frozen)setFrozen(false);else load();});
$("freezeButton").addEventListener("click",()=>setFrozen(!frozen));
$("searchAreaButton").addEventListener("click",searchArea);
$("recenterButton").addEventListener("click",()=>activateRegion("qatar"));
$("regionSelect").addEventListener("change",e=>activateRegion(e.target.value));
$("styleButton").addEventListener("click",()=>{styleIndex=(styleIndex+1)%STYLES.length;map.setStyle(STYLES[styleIndex]);$("styleButton").title="Map style: "+["Bright","Liberty","Positron","Dark"][styleIndex];});
$("detailClose").addEventListener("click",()=>{selected="";render();});
$("sidebarToggle").addEventListener("click",()=>$("sidebar").classList.toggle("is-open"));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){$("sidebar").classList.remove("is-open");selected="";render();}if(e.key==="/"&&!(e.target instanceof HTMLInputElement)){e.preventDefault();$("aircraftSearch").focus();$("sidebar").classList.add("is-open");}});
setInterval(()=>{
 if(document.visibilityState!=="visible")return;
 if(!frozen&&Date.now()-Math.max(updated,lastAttemptAt)>=REFRESH_INTERVAL_MS)load();
 else refreshAgeAndStatus();
},1000);
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="visible"&&!frozen&&Date.now()-Math.max(updated,lastAttemptAt)>=REFRESH_INTERVAL_MS)load();
});
map.on("zoomend",layoutLabels);
map.on("resize",()=>{layoutLabels();if(UI.inView)render();});
map.on("moveend",()=>{if(UI.inView)render();});
map.on("style.load",installAircraftLayers);
map.on("load",()=>{map.resize();installAircraftLayers();load();});

loadRegistry().then(result=>{$("registryState").textContent=result.entries?result.entries.toLocaleString()+" aircraft IDs":"Registry unavailable";render();}).catch(()=>{$("registryState").textContent="Registry unavailable";});
