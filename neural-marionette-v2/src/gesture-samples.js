import {validHand,clamp} from './core.js';
import {indexMotion,INDEX_MOTION_START,INDEX_MOTION_STOP} from './finger-motion.js';
export const SAMPLE_VERSION=2;
export const CAPTURE_MS=6000;
export const SAMPLE_LIMIT=3;
const JOINTS=[4,6,8,10,12,14,16,18,20];

// Preserve the recorded palm orientation; normalize position and distance to the camera.
function feature(frame){
  const p=frame.points,a=frame.aspect||16/9;
  const scale=Math.max(.035,Math.hypot((p[9].x-p[0].x)*a,p[9].y-p[0].y),Math.hypot((p[17].x-p[5].x)*a,p[17].y-p[5].y));
  return {shape:JOINTS.flatMap(i=>[(p[i].x-p[0].x)*a/scale,(p[i].y-p[0].y)/scale,(p[i].z-p[0].z)*a/scale*.25]),
    x:p[0].x*a,y:p[0].y,scale};
}
function sequence(frames,n=12){
  const start=frames[0].t,end=frames.at(-1).t,features=[];let j=0;
  for(let i=0;i<n;i++){
    const at=start+(end-start)*i/(n-1);while(j<frames.length-2&&frames[j+1].t<at)j++;
    const a=feature(frames[j]),b=feature(frames[j+1]),mix=clamp((at-frames[j].t)/(frames[j+1].t-frames[j].t),0,1);
    features.push({shape:a.shape.map((v,k)=>v+(b.shape[k]-v)*mix),x:a.x+(b.x-a.x)*mix,y:a.y+(b.y-a.y)*mix,scale:a.scale+(b.scale-a.scale)*mix});
  }
  const first=features[0];
  return features.map(f=>[...f.shape,(f.x-first.x)/first.scale*.7,(f.y-first.y)/first.scale*.7,Math.log(f.scale/first.scale)*.9]);
}
function distance(a,b){let sum=0;for(let i=0;i<a.length;i++)sum+=(a[i]-b[i])**2;return Math.sqrt(sum/a.length);}
export function sequenceDistance(a,b){
  const n=a.length,m=b.length,rows=Array.from({length:n+1},()=>Array(m+1).fill(Infinity));rows[0][0]=0;
  for(let i=1;i<=n;i++)for(let j=Math.max(1,i-4);j<=Math.min(m,i+4);j++)rows[i][j]=distance(a[i-1],b[j-1])+Math.min(rows[i-1][j],rows[i][j-1],rows[i-1][j-1]);
  return rows[n][m]/Math.max(n,m);
}
function activity(seq){
  const mean=seq[0].map((_,i)=>seq.reduce((s,f)=>s+f[i],0)/seq.length);
  return Math.sqrt(seq.reduce((s,f)=>s+distance(f,mean)**2,0)/seq.length);
}
function clips(frames){
  const out=[frames],first=frames[0].t,last=frames.at(-1).t;
  for(let start=first;start+700<=last;start+=350){const part=frames.filter(f=>f.t>=start&&f.t<=start+800);if(part.length>=8)out.push(part);}
  const selected=out.length<=8?out:Array.from({length:8},(_,i)=>out[Math.round(i*(out.length-1)/7)]);
  return selected.map(f=>{const seq=sequence(f);return {seq,activity:activity(seq)};});
}
export function validateSample(sample){
  if(!sample||!['idle','run','turn','load','crouch','jump'].includes(sample.action)||!Array.isArray(sample.frames)||sample.frames.length<16||sample.frames.length>180)throw new Error('样本帧数或动作名称无效，请重录。');
  let previous=-Infinity;
  for(const f of sample.frames){if(!Number.isFinite(f.t)||f.t<0||f.t<=previous||!validHand(f.points)||f.points.some(p=>Math.abs(p.z)>5)||!Number.isFinite(f.aspect)||f.aspect<.3||f.aspect>4)throw new Error('样本数据不完整，请重录。');if(previous!==-Infinity&&f.t-previous>250)throw new Error('录制中手部丢失超过 0.25 秒，请保持整只手可见后重录。');previous=f.t;}
  if(previous-sample.frames[0].t<1000||previous>8500)throw new Error('有效动作需至少 1 秒，且不能超过 8.5 秒，请重新录制。');
  return sample;
}
export function validateLibrary(data){
  if(data?.runTrigger!==undefined&&!['finger','motion','pose'].includes(data.runTrigger))throw new Error('疾跑触发方式无效。');
  if(![1,SAMPLE_VERSION].includes(data?.version)||!Array.isArray(data.samples)||data.samples.length>18)throw new Error('不是兼容的手势样本文件。');
  const counts={};for(const s of data.samples){validateSample(s);counts[s.action]=(counts[s.action]||0)+1;if(counts[s.action]>SAMPLE_LIMIT)throw new Error('每个动作最多保存 3 个样本。');}
  return structuredClone(data.samples);
}
// Migrate the previous hold-to-run default once. Explicit choices made in the
// new controls are retained, including motion mode and the optional pose mode.
export function libraryRunTrigger(data={}){
  if(data.runControlVersion===2&&['finger','motion','pose'].includes(data.runTrigger))return data.runTrigger;
  return data.runTrigger==='motion'?'motion':'finger';
}

// A repeating gesture has no fixed starting phase. Compare its pose envelope
// and motion spread; keep the ordered DTW path for other action types.
function profile(frames){
  const seq=sequence(frames,Math.min(frames.length,128));
  const mean=seq[0].map((_,i)=>seq.reduce((v,f)=>v+f[i],0)/seq.length);
  const spread=mean.map((m,i)=>Math.sqrt(seq.reduce((v,f)=>v+(f[i]-m)**2,0)/seq.length));
  return {mean,spread,activity:Math.sqrt(spread.reduce((v,x)=>v+x*x,0)/spread.length)};
}
function segmentProfiles(frames,whole){
  const first=frames[0].t,last=frames.at(-1).t,duration=last-first;
  const profiles=[whole];
  // Live input is at most 1.75 s. Comparing it only to a 6–8 s average
  // confuses gradual wrist drift/rotation with the repeating finger movement.
  // Retain the local variations the user actually demonstrated, including ends.
  if(duration>1250){
    const count=Math.min(9,Math.ceil(duration/600));
    for(let i=0;i<count;i++){
      const start=first+(duration-1250)*i/(count-1);
      const part=frames.filter(f=>f.t>=start&&f.t<=start+1250);
      if(part.length>=9&&part.at(-1).t-part[0].t>=800)profiles.push(profile(part));
    }
  }
  return profiles;
}
function loopDistance(live,recorded){
  return distance(live.mean.slice(0,27),recorded.mean.slice(0,27))+
    distance(live.spread,recorded.spread)*.65;
}
function poseEnvelope(live,recorded,ignoreIndex=false){
  const residual=live.mean.slice(0,27).map((x,i)=>ignoreIndex&&i>=3&&i<9?0:Math.max(0,Math.abs(x-recorded.mean[i])-recorded.spread[i]*2));
  const rms=Math.sqrt(residual.reduce((v,x)=>v+x*x,0)/(ignoreIndex?21:27));
  // An overall average can hide a folded thumb/pinky among unchanged joints.
  // Bound individual joint deviations too, so a new hand shape releases run.
  const largestJoint=Math.max(...Array.from({length:9},(_,i)=>Math.hypot(...residual.slice(i*3,i*3+3))));
  return Math.max(rms,largestJoint/2);
}
export class SampleMatcher{
  constructor(samples=[],{runTrigger='motion'}={}){this.runTrigger=['finger','pose'].includes(runTrigger)?runTrigger:'motion';this.setSamples(samples);}
  setRunTrigger(value){this.runTrigger=['finger','pose'].includes(value)?value:'motion';this.reset();}
  setSamples(samples){
    this.templates=samples.map(s=>{validateSample(s);const whole=profile(s.frames),segments=s.action==='run'?segmentProfiles(s.frames,whole):[];return {action:s.action,clips:clips(s.frames),profile:whole,runProfiles:segments.filter(p=>p.activity>.025),poseProfiles:segments,signature:sequence(s.frames)};});
    // Indistinguishable bindings must not gain priority just because one uses
    // phase-independent matching. The studio also rejects them when saving.
    this.conflicts=new Set();
    for(const a of this.templates)for(const b of this.templates)if(a.action!==b.action&&sequenceDistance(a.signature,b.signature)<.035){this.conflicts.add(a.action);this.conflicts.add(b.action);}
    this.reset();
  }
  reset(){this.frames=[];this.lastSeen=-Infinity;this.lastMatch=-Infinity;this.candidate='idle';this.since=0;this.action='idle';this.recognitionMs=0;this.result={action:'idle',recognitionMs:0,nearest:null,distance:null,ambiguous:false,reason:'observing'};}
  update(points,now,aspect=16/9,tolerance=.28){
    if(!validHand(points))return this.tick(now);
    if(now-this.lastSeen>250)this.reset();this.lastSeen=now;
    if(!this.frames.length||now-this.frames.at(-1).t>=40)this.frames.push({t:now,points:structuredClone(points),aspect});
    this.frames=this.frames.filter(f=>now-f.t<1900);
    const fingerMode=this.runTrigger==='finger';
    if(now-this.lastMatch<(fingerMode?60:120)||this.frames.length<(fingerMode?3:9))return this.tick(now);this.lastMatch=now;
    const windows=[500,850,1250,1750].map(ms=>this.frames.filter(f=>now-f.t<=ms)).filter(f=>f.length>=9&&f.at(-1).t-f[0].t>=400).map(f=>{const seq=sequence(f);return {seq,activity:activity(seq),profile:profile(f)};});
    const recentFrames=this.frames.filter(f=>now-f.t<=400),recent=recentFrames.length>=3?profile(recentFrames):null;
    const finger=indexMotion(this.frames,now),fingerThreshold=this.action==='run'?INDEX_MOTION_STOP:INDEX_MOTION_START;
    const ranked=new Map();let runMoving=false,runCanHold=false,runStatus=null;
    for(const template of this.templates){let best=Infinity;
      if(template.action==='run'&&fingerMode){
        const moving=finger.ready&&finger.activity>=fingerThreshold;
        runMoving ||= moving;
        if(recent)for(const recorded of template.poseProfiles){
          // The sample chooses the supporting hand shape. Index joints are
          // free to bend; their recent motion is checked independently.
          const poseDistance=poseEnvelope(recent,recorded,true);
          const indices=Array.from({length:27},(_,i)=>i).filter(i=>i<3||i>=9);
          const score=Math.max(distance(indices.map(i=>recent.mean[i]),indices.map(i=>recorded.mean[i])),poseDistance);
          if(!runStatus||score<runStatus.poseDistance)runStatus={poseDistance:score,poseValid:score<tolerance,moving};
          if(moving)best=Math.min(best,score);
        }
      }else if(template.action==='run'&&this.runTrigger==='pose'){
        // An explicit pose binding follows the current shape, not old moving
        // frames in the long window. Releasing/changing the pose stops it.
        if(recent)for(const recorded of template.poseProfiles){
          const poseDistance=poseEnvelope(recent,recorded);
          if(!runStatus||poseDistance<runStatus.poseDistance)runStatus={poseDistance,poseValid:poseDistance<tolerance,moving:true};
          best=Math.min(best,Math.max(distance(recent.mean.slice(0,27),recorded.mean.slice(0,27)),poseDistance));
        }
      }else if(template.action==='run'&&template.runProfiles.length){
       for(const recorded of template.runProfiles){
        const moving=recent&&recent.activity>Math.max(.010,recorded.activity*.08);
        const poseValid=recent&&poseEnvelope(recent,recorded)<tolerance;
        const poseDistance=recent?poseEnvelope(recent,recorded):Infinity;
        if(!runStatus||poseDistance<runStatus.poseDistance)runStatus={poseDistance,moving:!!moving,poseValid:!!poseValid};
        runMoving ||= !!moving;runCanHold ||= !!(moving&&poseValid);
        if(moving&&poseValid)for(const live of windows){
          if(live.profile.activity<recorded.activity*.25)continue;
          best=Math.min(best,loopDistance(live.profile,recorded));
        }
       }
      }else for(const live of windows)for(const clip of template.clips){
        if(clip.activity>.055&&live.activity<clip.activity*.4)continue;
        best=Math.min(best,sequenceDistance(live.seq,clip.seq)+Math.abs(live.activity-clip.activity)*1.5);
      }
      ranked.set(template.action,Math.min(ranked.get(template.action)??Infinity,best));
    }
    const candidates=[...ranked].sort((a,b)=>a[1]-b[1]);const best=candidates[0],second=candidates[1];
    const threshold=best?.[0]==='run'&&this.action==='run'&&this.runTrigger==='motion'?tolerance*1.25:tolerance;
    const ambiguous=!!(best&&best[1]<threshold&&(this.conflicts.has(best[0])||(second&&second[1]<tolerance&&second[1]-best[1]<.045)));
    const next=best&&best[1]<threshold&&!ambiguous?best[0]:'idle';
    if(next!==this.candidate){this.candidate=next;this.since=now;}
    // Only bridge a short cyclic mismatch while the hand still has the right
    // shape and is moving. Stillness, a new pose, or tracking loss stop promptly.
    const hold=next==='idle'?(fingerMode&&this.action==='run'?0:this.action==='run'&&runCanHold&&!ambiguous?450:180):110;
    if(now-this.since>=hold&&this.action!==next){this.action=next;this.recognitionMs=now-this.since;}
    const reason=ambiguous?'ambiguous':next!=='idle'?(this.action===next?'matched':'confirming'):(fingerMode?!finger.ready:!windows.length)?'observing':runStatus&&!runStatus.poseValid?'pose':runStatus&&!runStatus.moving?(fingerMode?'finger-motion':'motion'):'distance';
    this.result={action:this.action,candidate:this.candidate,nearest:best?.[0]||null,distance:Number.isFinite(best?.[1])?best[1]:null,ambiguous,recognitionMs:this.recognitionMs,strength:1,direction:1,moving:runMoving,holding:this.action==='run'&&next!=='run',reason,...(fingerMode?{fingerActivity:finger.activity,fingerThreshold}: {})};
    return this.result;
  }
  tick(now){if(now-this.lastSeen>250)this.reset();return this.result;}
}

// A personal binding replaces only that action's rule. Neutral samples must not
// block original rules for actions the user has chosen not to record.
export function resolveGestureIntent(mode,samples,learned,fallback){
  if(mode==='rules')return {...fallback,source:'rules'};
  if(mode==='personal')return {...learned,source:'sample'};
  const bound=action=>samples.some(sample=>sample.action===action);
  if(learned.action!=='idle'&&bound(learned.action))return {...learned,source:'sample'};
  if(fallback.action!=='idle'&&bound(fallback.action))return {action:'idle',source:'none'};
  return {...fallback,source:'rules'};
}

// Replay persisted landmarks with a fresh clock and matcher, without opening
// the camera or changing the user's bindings. This checks recovery, not accuracy.
export function checkSampleBindings(samples,tolerance=.28,options={}){
  return samples.map(sample=>{
    const matcher=new SampleMatcher(samples,options);let matches=0,total=0,best=Infinity;
    const first=sample.frames[0].t;
    for(const frame of sample.frames){
      const result=matcher.update(frame.points,100000+frame.t-first,frame.aspect,tolerance);
      if(frame.t-first>=800){total++;if(result.action===sample.action)matches++;}
      if(result.distance!==null)best=Math.min(best,result.distance);
    }
    return {action:sample.action,frames:sample.frames.length,durationMs:sample.frames.at(-1).t-first,matched:matches>0,ratio:total?matches/total:0,bestDistance:Number.isFinite(best)?best:null};
  });
}

export class GestureCapture{
  start(action,now,duration=CAPTURE_MS,{runTrigger='motion'}={}){
    this.runTrigger=runTrigger;
    this.action=action;this.duration=[4000,6000,8000].includes(duration)?duration:CAPTURE_MS;
    this.readyAt=now+3000;this.begin=this.end=null;this.stableSince=null;this.lastReady=-Infinity;
    this.frames=[];this.state='countdown';this.error=null;
  }
  cancel(){this.state='idle';this.frames=[];}
  update(points,now,aspect){
    this.tick(now);
    if(!['countdown','waiting','recording'].includes(this.state))return;
    const valid=validHand(points);
    if(this.state!=='recording'){
      if(!valid){this.stableSince=null;this.lastReady=-Infinity;}
      else{if(now-this.lastReady>250||this.stableSince===null)this.stableSince=now;this.lastReady=now;}
      if(now>=this.readyAt&&valid&&now-this.stableSince>=300){this.begin=now;this.end=now+this.duration;this.state='recording';}
    }
    if(this.state==='recording'&&now<this.end&&valid&&(!this.frames.length||now-this.begin-this.frames.at(-1).t>=60)){
      // Four decimal places are subpixel at camera resolution and keep long
      // recordings small enough for localStorage and JSON export.
      this.frames.push({t:now-this.begin,points:points.map(p=>Object.fromEntries(['x','y','z'].map(k=>[k,Math.round(p[k]*10000)/10000]))),aspect});
    }
    this.tick(now);
  }
  finish(now){if(this.state!=='recording'||now-this.begin<1200)return false;this.complete(Math.min(now,this.end));return true;}
  complete(at){
    this.end=at;
    try{
      if(!this.frames.length||this.frames[0].t>220||at-this.begin-this.frames.at(-1).t>250)throw new Error('开始或结束时没有看到完整手掌，请重新录制。');
      const sample=validateSample({action:this.action,frames:this.frames});
      if(this.action==='run'&&this.runTrigger==='motion'&&profile(sample.frames).activity<.025)throw new Error('这段手势几乎没有运动。请选择「食指动才跑」，或持续摆动后重录。');
      this.state='review';
    }catch(e){this.error=e.message;this.state='error';}
  }
  tick(now){
    if(this.state==='countdown'&&now>=this.readyAt)this.state='waiting';
    if(this.state==='waiting'&&now>this.readyAt+10000){this.error='等待手部超时，尚未开始采样。请让整只手进入画面后重试。';this.state='error';}
    if(this.state==='recording'&&now>=this.end)this.complete(this.end);
  }
  sample(){if(this.state!=='review')throw new Error('请先录制并回放样本。');return validateSample({id:crypto.randomUUID(),action:this.action,createdAt:new Date().toISOString(),frames:structuredClone(this.frames)});}
}
