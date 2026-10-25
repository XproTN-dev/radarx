// RadarX aggregate traffic statistics for this browser session.
// This module stores category counts, never individual identities or paths.
const snapshots=[];
const MAX=96;
export function observeCounts(time,total,military,government,other){
  if(!Number.isFinite(time))time=Date.now();
  snapshots.push({time,total,military,government,other});
  while(snapshots.length>MAX)snapshots.shift();
}
export function aggregateSummary(){
  if(!snapshots.length)return {samples:0,peak:0,average:0,elapsedMinutes:0,latest:null};
  const last=snapshots.at(-1);
  return {samples:snapshots.length,peak:Math.max(...snapshots.map(s=>s.total)),average:Math.round(snapshots.reduce((n,s)=>n+s.total,0)/snapshots.length),elapsedMinutes:Math.round((last.time-snapshots[0].time)/60000),latest:last};
}
export function sparklineSVG(){
  if(snapshots.length===0)return "";
  const width=284,height=64,pad=5;
  const max=Math.max(1,...snapshots.map(x=>x.total));
  const points=snapshots.map((x,i)=>{
    const px=pad+(snapshots.length===1?0:i/(snapshots.length-1)*(width-2*pad));
    const py=height-pad-(x.total/max)*(height-2*pad);
    return px.toFixed(1)+","+py.toFixed(1);
  }).join(" ");
  return '<svg viewBox="0 0 284 64" width="100%" height="64" role="img" aria-label="Observed aircraft counts over this browser session"><polyline points="'+points+'" fill="none" stroke="#0784d3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="5" y1="59" x2="279" y2="59" stroke="#dde9f2"/></svg>';
}
