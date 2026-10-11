// Index articulation in palm coordinates: whole-hand translation, in-plane
// rotation and distance changes should not act like a moving index finger.
export const INDEX_MOTION_WINDOW_MS=280;
export const INDEX_MOTION_START=.030;
export const INDEX_MOTION_STOP=.020;

function indexSignal({points:p,aspect:a=16/9}){
  const x=(p[9].x-p[0].x)*a,y=p[9].y-p[0].y,length=Math.hypot(x,y)||1;
  const scale=Math.max(.035,length,Math.hypot((p[17].x-p[5].x)*a,p[17].y-p[5].y));
  return [6,7,8].flatMap(i=>{
    const dx=(p[i].x-p[5].x)*a,dy=p[i].y-p[5].y;
    return [(dx*x+dy*y)/length/scale,(-dx*y+dy*x)/length/scale,(p[i].z-p[5].z)*a/scale*.25];
  });
}

export function indexMotion(frames,now){
  const recent=frames.filter(f=>now-f.t<=INDEX_MOTION_WINDOW_MS);
  if(recent.length<3||recent.at(-1).t-recent[0].t<100)return {ready:false,activity:0};
  const signals=recent.map(indexSignal);
  const mean=signals[0].map((_,i)=>signals.reduce((sum,s)=>sum+s[i],0)/signals.length);
  const activity=Math.sqrt(signals.reduce((sum,s)=>sum+s.reduce((v,x,i)=>v+(x-mean[i])**2,0)/mean.length,0)/signals.length);
  return {ready:true,activity};
}
