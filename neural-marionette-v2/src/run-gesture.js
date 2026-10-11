// Built-in sprint uses the three middle fingers. Personal recordings keep their
// explicit trigger setting; this module does not change the stored samples.
export const RUN_WINDOW_MS=360;
export const RUN_START=.024;
export const RUN_STOP=.014;
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const length=v=>Math.hypot(...v);
const unit=v=>v.map(x=>x/length(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

function palm(points,aspect){
  // MediaPipe image x/z share a width unit; y uses image height. Estimated
  // depth preserves articulation when the palm is foreshortened in the image.
  const p=points.map(v=>[v.x*aspect,v.y,v.z*aspect]);
  const forward=sub(p[9],p[0]),across=sub(p[17],p[5]);
  const scale=Math.max(length(forward),length(across),.035);
  if(length(forward)<.05*scale)return null;
  const y=unit(forward),lateral=sub(across,y.map(v=>v*dot(across,y)));
  if(length(lateral)<.10*scale)return null;
  const x=unit(lateral),z=cross(x,y);
  return {p,scale,x,y,z};
}

export function runSupport(points,aspect=16/9,active=false){
  const basis=palm(points,aspect);
  if(!basis)return {ready:false,thumbSpread:false,pinkySpread:false,runPose:false};
  const {p,scale}=basis,d=(a,b)=>length(sub(p[a],p[b]));
  const thumbSpread=d(4,5)/scale>(active?.38:.45)&&d(4,9)/scale>(active?.56:.65);
  const pinkyPath=d(17,18)+d(18,19)+d(19,20);
  const pinkySpread=d(17,20)/Math.max(.001,pinkyPath)>(active?.50:.62)&&d(17,20)/scale>(active?.38:.48);
  // Middle fingers are deliberately unconstrained: extension and flexion are
  // both phases of the intended gesture, not reasons to reset recognition.
  return {ready:true,thumbSpread,pinkySpread,runPose:thumbSpread&&pinkySpread,pinched:d(4,8)/scale<.24};
}

function signals(frame){
  const basis=palm(frame.points,frame.aspect||16/9);if(!basis)return null;
  const {p,scale,x,y,z}=basis;
  const local=[],relative=[];
  for(const m of [5,9,13]){
    // Each finger supplies independent evidence in camera coordinates. A
    // noisy palm anchor may rotate all palm-space signals, but cannot also
    // move the other fingers relative to their own MCP joints.
    const path=[0,1,2].reduce((n,j)=>n+length(sub(p[m+j+1],p[m+j])),0);
    if(path<.01)return null;
    local.push([m+1,m+2,m+3].flatMap(j=>{
      const v=sub(p[j],p[m]);return [dot(v,x)/scale,dot(v,y)/scale,dot(v,z)/scale];
    }));
    relative.push([m+1,m+2,m+3].flatMap(j=>sub(p[j],p[m]).map(v=>v/path)));
  }
  return {local,relative};
}

function activity(samples,key,finger){
  const mean=samples[0][key][finger].map((_,j)=>samples.reduce((sum,s)=>sum+s[key][finger][j],0)/samples.length);
  return Math.sqrt(samples.reduce((sum,s)=>sum+s[key][finger].reduce((n,v,j)=>n+(v-mean[j])**2,0)/mean.length,0)/samples.length);
}

export function middleFingerMotion(frames,now,threshold=RUN_START){
  const recent=frames.filter(f=>now-f.t<=RUN_WINDOW_MS);
  const blank={ready:false,activity:0,activities:[0,0,0],movingCount:0,palmActivities:[0,0,0],relativeActivities:[0,0,0],anchorNoise:false};
  if(recent.length<3||recent.at(-1).t-recent[0].t<100)return blank;
  const samples=recent.map(signals);if(samples.some(s=>!s))return blank;
  const palmActivities=[0,1,2].map(f=>activity(samples,'local',f));
  const relativeActivities=[0,1,2].map(f=>activity(samples,'relative',f));
  const activities=palmActivities.map((v,i)=>Math.min(v,relativeActivities[i]));
  const movingCount=activities.filter(v=>v>=threshold).length;
  return {ready:true,activity:[...activities].sort((a,b)=>a-b)[1],activities,movingCount,palmActivities,relativeActivities,
    anchorNoise:palmActivities.filter(v=>v>=threshold).length>=2&&movingCount<2};
}
