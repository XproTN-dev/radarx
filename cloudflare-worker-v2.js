// RadarX Cloudflare Worker v2 — replace the currently deployed Worker script with this
// only after reviewing it. Secret: FLYITALY_API_KEY (Cloudflare, not GitHub).
// Endpoints: /v1/status, /v1/near, /v1/mil.
// FlyItalyADSB API: https://api.flyitalyadsb.com/v2, X-Api-Key header.
// Cache is per Cloudflare edge; not globally synchronized. Shared rate limiting
// requires extra infrastructure (e.g., a Durable Object), NOT included here.
const BASE="https://api.flyitalyadsb.com/v2";
const SITE_ORIGIN="https://xprotn-dev.github.io";
const NEAR_TTL_SECONDS=10;
const MIL_TTL_SECONDS=30;
const allowedRoutes=new Set(["/v1/near","/v1/mil","/v1/status","/"]);
function cors(origin){
 return {
   "Access-Control-Allow-Origin":origin===SITE_ORIGIN?SITE_ORIGIN:SITE_ORIGIN,
   "Access-Control-Allow-Methods":"GET, OPTIONS",
   "Access-Control-Allow-Headers":"Content-Type",
   "Vary":"Origin",
   "X-Content-Type-Options":"nosniff"
 };
}
function responseJSON(value,status=200,headers={}){
 return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8",...cors(),...headers}});
}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),pathname=url.pathname;
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request.headers.get("Origin"))});
  if(request.method!=="GET")return responseJSON({error:"Method not allowed"},405);
  if(!allowedRoutes.has(pathname))return responseJSON({error:"Unknown endpoint"},404);
  if(pathname==="/"||pathname==="/v1/status")return responseJSON({
    service:"RadarX",version:"worker-v2",status:"ok",
    api_key_configured:Boolean(env.FLYITALY_API_KEY)
  });
  if(!env.FLYITALY_API_KEY)return responseJSON({error:"Worker secret FLYITALY_API_KEY not configured"},503);
  let upstream="",ttl=0,key="";
  if(pathname==="/v1/mil"){
    upstream=BASE+"/mil";
    key="radarx-v2/mil";ttl=MIL_TTL_SECONDS;
  }else {
    const latitude=url.searchParams.get("lat"),longitude=url.searchParams.get("lon");
    if(latitude===null||longitude===null)return responseJSON({error:"lat and lon are required"},400);
    const lat=Number(latitude),lon=Number(longitude),nm=Number(url.searchParams.get("dist")??250);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(nm)||
       lat< -90||lat>90||lon< -180||lon>180||nm<1||nm>250)
       return responseJSON({error:"Invalid lat, lon or dist; max 250 NM"},400);
    // Normalize cache keys so visitors to the same sector share cache.
    const lat4=lat.toFixed(4),lon4=lon.toFixed(4),km=Math.ceil(nm*1.852);
    upstream=BASE+"/lat/"+lat4+"/lon/"+lon4+"/dist/"+km;
    key="radarx-v2/near/"+lat4+"/"+lon4+"/"+km;ttl=NEAR_TTL_SECONDS;
  }
  const cache=caches.default;
  const keyUrl="https://radarx-cache.invalid/"+key;
  const cacheKey=new Request(keyUrl);
  try{
    const cached=await cache.match(cacheKey);
    if(cached)return cached;
    const timeout=AbortSignal.timeout(14000);
    const result=await fetch(upstream,{
      method:"GET",
      headers:{"X-Api-Key":env.FLYITALY_API_KEY,"Accept":"application/json"},
      signal:timeout
    });
    if(!result.ok){
      const out=responseJSON({
        error:"FlyItalyADSB returned an error",upstream_status:result.status,endpoint:pathname
      },result.status===429?429:502,{
        "Cache-Control":"no-store",
        ...(result.status===429?{"Retry-After":result.headers.get("Retry-After")||"60"}:{})
      });
      return out;
    }
    const payload=await result.json();
    if(!payload||!Array.isArray(payload.ac))return responseJSON({error:"Upstream aircraft format unavailable"},502,{"Cache-Control":"no-store"});
    const out=responseJSON({
       ...payload,
       source:"FlyItalyADSB",
       received_at:new Date().toISOString(),
       requested_endpoint:pathname
    },200,{"Cache-Control":"public, max-age="+ttl,"X-RadarX-Source":"FlyItalyADSB"});
    ctx.waitUntil(cache.put(cacheKey,out.clone()));
    return out;
  }catch(err){
    return responseJSON({error:"Aircraft upstream temporarily unavailable",detail:String(err?.message||err)},502,{"Cache-Control":"no-store"});
  }
 }
};
