import {validHand,clamp} from './core.js';
export const SAMPLE_VERSION=1;
export const CAPTURE_MS=1600;
export const SAMPLE_LIMIT=3;
const JOINTS=[4,6,8,10,12,14,16,18,20];

// Preserve the recorded palm orientation; normalize position and distance to the camera.
function feature(frame){
  const p=frame.points,a=frame.aspect||16/9;
  const scale=Math.max(.035,Math.hypot((p[9].x-p[0].x)*a,p[9].y-p[0].y));
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
  return out.map(f=>{const seq=sequence(f);return {seq,activity:activity(seq)};});
}
export function validateSample(sample){
  if(!sample||!['idle','run','turn','load','crouch','jump'].includes(sample.action)||!Array.isArray(sample.frames)||sample.frames.length<16||sample.frames.length>80)throw new Error('样本帧数或动作名称无效，请重录。');
  let previous=-Infinity;
  for(const f of sample.frames){if(!Number.isFinite(f.t)||f.t<0||f.t<=previous||!validHand(f.points)||f.points.some(p=>Math.abs(p.z)>5)||!Number.isFinite(f.aspect)||f.aspect<.3||f.aspect>4)throw new Error('样本数据不完整，请重录。');if(previous!==-Infinity&&f.t-previous>250)throw new Error('录制中手部丢失超过 0.25 秒，请保持整只手可见后重录。');previous=f.t;}
  if(previous-sample.frames[0].t<1000||previous>2500)throw new Error('有效动作不足 1 秒，请重新录制。');
  return sample;
}
export function validateLibrary(data){
  if(data?.version!==SAMPLE_VERSION||!Array.isArray(data.samples)||data.samples.length>18)throw new Error('不是兼容的手势样本文件。');
  const counts={};for(const s of data.samples){validateSample(s);counts[s.action]=(counts[s.action]||0)+1;if(counts[s.action]>SAMPLE_LIMIT)throw new Error('每个动作最多保存 3 个样本。');}
  return structuredClone(data.samples);
}

export class SampleMatcher{
  constructor(samples=[]){this.setSamples(samples);}
  setSamples(samples){this.templates=samples.map(s=>({action:s.action,clips:clips(validateSample(s).frames)}));this.reset();}
  reset(){this.frames=[];this.lastSeen=-Infinity;this.lastMatch=-Infinity;this.candidate='idle';this.since=0;this.action='idle';this.recognitionMs=0;this.result={action:'idle',recognitionMs:0,nearest:null,distance:null,ambiguous:false};}
  update(points,now,aspect=16/9,tolerance=.28){
    if(!validHand(points))return this.tick(now);
    if(now-this.lastSeen>250)this.reset();this.lastSeen=now;
    if(!this.frames.length||now-this.frames.at(-1).t>=40)this.frames.push({t:now,points:structuredClone(points),aspect});
    this.frames=this.frames.filter(f=>now-f.t<1900);
    if(now-this.lastMatch<120||this.frames.length<9)return this.tick(now);this.lastMatch=now;
    const windows=[500,850,1250,1750].map(ms=>this.frames.filter(f=>now-f.t<=ms)).filter(f=>f.length>=9&&f.at(-1).t-f[0].t>=400).map(f=>{const seq=sequence(f);return {seq,activity:activity(seq)};});
    const ranked=new Map();
    for(const template of this.templates){let best=Infinity;
      for(const live of windows)for(const clip of template.clips){
        // A moving demonstration must not match a stationary copy of its starting pose.
        if(clip.activity>.055&&live.activity<clip.activity*.4)continue;
        best=Math.min(best,sequenceDistance(live.seq,clip.seq)+Math.abs(live.activity-clip.activity)*1.5);
      }
      ranked.set(template.action,Math.min(ranked.get(template.action)??Infinity,best));
    }
    const candidates=[...ranked].sort((a,b)=>a[1]-b[1]);const best=candidates[0],second=candidates[1];
    const ambiguous=!!(best&&second&&best[1]<tolerance&&second[1]<tolerance&&second[1]-best[1]<.045);
    const next=best&&best[1]<tolerance&&!ambiguous?best[0]:'idle';
    if(next!==this.candidate){this.candidate=next;this.since=now;}
    if(now-this.since>=(next==='idle'?180:110)&&this.action!==next){this.action=next;this.recognitionMs=now-this.since;}
    this.result={action:this.action,candidate:this.candidate,nearest:best?.[0]||null,distance:Number.isFinite(best?.[1])?best[1]:null,ambiguous,recognitionMs:this.recognitionMs,strength:1,direction:1};
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

export class GestureCapture{
  start(action,now){this.action=action;this.begin=now+2000;this.end=this.begin+CAPTURE_MS;this.frames=[];this.state='countdown';this.error=null;}
  cancel(){this.state='idle';this.frames=[];}
  update(points,now,aspect){
    if(!['countdown','recording'].includes(this.state))return;
    if(now>=this.begin&&now<this.end){this.state='recording';if(validHand(points)&&(!this.frames.length||now-this.frames.at(-1).t-this.begin>=45))this.frames.push({t:now-this.begin,points:structuredClone(points),aspect});}
    this.tick(now);
  }
  tick(now){
    if(!['countdown','recording'].includes(this.state))return;
    if(now>=this.begin)this.state='recording';
    if(now>=this.end){
      try{if(!this.frames.length||this.frames[0].t>220||CAPTURE_MS-this.frames.at(-1).t>220)throw new Error('开始或结束时没有看到完整手掌，请重新录制。');validateSample({action:this.action,frames:this.frames});this.state='review';}
      catch(e){this.error=e.message;this.state='error';}
    }
  }
  sample(){if(this.state!=='review')throw new Error('请先录制并回放样本。');return validateSample({id:crypto.randomUUID(),action:this.action,createdAt:new Date().toISOString(),frames:structuredClone(this.frames)});}
}
