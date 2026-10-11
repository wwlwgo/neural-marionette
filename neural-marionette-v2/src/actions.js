import {clamp, approach, validHand} from './core.js';
import {runSupport,middleFingerMotion,RUN_START,RUN_STOP,RUN_WINDOW_MS} from './run-gesture.js';

export const ACTIONS = {
  idle: {name:'待机', en:'IDLE', hint:'张开手掌，放松停留', key:'1'},
  run: {name:'疾跑', en:'SPRINT', hint:'手掌朝下，拇指、小指张开，中间三指前后摆动；停手即停', key:'2'},
  turn: {name:'旋身跃起', en:'SPIN LEAP', hint:'只伸出食指，其余收起，像转钥匙一样转腕', key:'3'},
  load: {name:'负重', en:'HEAVY LIFTING', hint:'拇指与食指捏合并保持，松开卸力', key:'4'},
  crouch: {name:'下蹲', en:'CROUCH', hint:'握拳向下压，保持拳头维持下蹲', key:'5'},
  jump: {name:'跳跃', en:'JUMP', hint:'下蹲后快速上提并张手，完成一次跳跃', key:'6'},
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

// Distances and velocities are measured in palm lengths, independent of camera distance.
export function handFeatures(points,mirror=false,aspect=16/9,runActive=false){
  if(!validHand(points))return null;
  const p=points.map(p=>({...p,x:mirror?1-p.x:p.x}));
  const scale=Math.max(.035,distance(p[0],p[9]));
  const extension=[5,9,13,17].map(m=>{
    const a={x:p[m+1].x-p[m].x,y:p[m+1].y-p[m].y};
    const b={x:p[m+3].x-p[m+1].x,y:p[m+3].y-p[m+1].y};
    const straight=(a.x*b.x+a.y*b.y)/(Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y)||1);
    return straight>.55&&distance(p[m+3],p[0])>distance(p[m+1],p[0])*1.08;
  });
  const thumbTucked=distance(p[4],p[9])/scale<.85;
  const run=runSupport(points,aspect,runActive);
  const two=extension[0]&&extension[1]&&!extension[2]&&!extension[3]&&thumbTucked;
  const pointsDown=[5,9].every(m=>(p[m+3].y-p[m].y)/Math.max(.001,distance(p[m+3],p[m]))>.40);
  const tipX=((p[8].x+p[12].x)/2-p[0].x)/scale;
  const tipY=((p[8].y+p[12].y)/2-p[0].y)/scale;
  return {x:p[0].x,y:p[0].y,scale,tipX,tipY,thumbTucked,thumbSpread:run.thumbSpread,pinkySpread:run.pinkySpread,runPose:run.runPose,runReady:run.ready,runPinched:run.pinched,pinch:distance(p[4],p[8])/scale,
    angle:Math.atan2(p[9].y-p[0].y,p[9].x-p[0].x),
    open:extension.every(Boolean),fist:extension.every(v=>!v),
    two,twoDown:two&&pointsDown,indexOnly:extension[0]&&!extension[1]&&!extension[2]&&!extension[3]&&thumbTucked,extension};
}

export class GestureInterpreter{
  constructor(){this.reset();}
  reset(){this.previous=null;this.features=null;this.runFrames=[];this.runMotion={ready:false,activity:0,activities:[0,0,0],movingCount:0};this.candidate='idle';this.since=0;this.action='idle';this.lastTurn=-Infinity;this.crouchArmed=false;this.jumpLatched=false;this.lastSeen=-Infinity;this.direction=1;this.strength=1;this.recognitionMs=0;this.vx=this.vy=this.omega=0;}
  update(points,now,mirror=false,aspect=16/9){
    const f=handFeatures(points,mirror,aspect,this.action==='run');if(!f)return this.tick(now);
    if(now-this.lastSeen>250)this.reset();
    const prev=this.previous,dt=prev?clamp((now-prev.time)/1000,.008,.15):.033;
    const vx=prev?(f.x-prev.x)/f.scale/dt:0,vy=prev?(f.y-prev.y)/f.scale/dt:0;
    const family=f.runPose?'run':f.indexOnly?'turn':'other';
    const sameFamily=prev?.family===family;
    // A pose change cannot inherit rotation or swing energy from the previous hand shape.
    if(!sameFamily){this.lastTurn=-Infinity;this.omega=0;this.runFrames=[];}
    const omega=prev&&sameFamily?wrap(f.angle-prev.angle)/dt:0;
    this.vx=approach(this.vx,vx,dt,.035);this.vy=approach(this.vy,vy,dt,.035);this.omega=approach(this.omega,omega,dt,.045);
    this.runFrames=this.runFrames.filter(frame=>now-frame.t<=RUN_WINDOW_MS);
    if(f.runPose)this.runFrames.push({points,t:now,aspect});
    const threshold=this.action==='run'?RUN_STOP:RUN_START;
    const motion=middleFingerMotion(this.runFrames,now,threshold);this.runMotion=motion;
    const running=f.runPose&&!f.runPinched&&motion.ready&&motion.movingCount>=2;
    this.previous={...f,family,time:now};this.features=f;this.lastSeen=now;
    let next='idle';
    if(f.fist)this.jumpLatched=false;
    if(!running&&this.crouchArmed&&f.open&&this.vy<-1.15&&!this.jumpLatched){next='jump';this.jumpLatched=true;this.crouchArmed=false;}
    else if(f.pinch<(this.action==='load'?.38:.25)&&!f.fist&&(!f.runPose||f.runPinched))next='load';
    else if(f.fist&&!f.runPose&&(this.vy>.45||this.action==='crouch'||this.candidate==='crouch'))next='crouch';
    else if(f.indexOnly&&!running){
      if(Math.abs(this.omega)>1.05){this.lastTurn=now;this.direction=Math.sign(this.omega);}
      if(now-this.lastTurn<260){next='turn';this.strength=clamp(Math.abs(this.omega)/2,.55,1.4);}
    }else if(running){next='run';this.strength=clamp(motion.activity/.06,.7,1.5);}
    if(next!==this.candidate){this.candidate=next;this.since=now;}
    const dwell=next==='jump'||(next==='idle'&&this.action==='run')?0:next==='idle'?150:next==='turn'?65:80;
    if(now-this.since>=dwell){if(this.action!==next)this.recognitionMs=now-this.since;this.action=next;if(next==='crouch')this.crouchArmed=true;else if(next!=='jump')this.crouchArmed=false;}
    return this.snapshot(now);
  }
  tick(now){if(now-this.lastSeen>250)this.reset();return this.snapshot(now);}
  runHint(){
    const f=this.features;if(!f)return '疾跑检查：未检测到完整手掌。';
    if(!f.runReady)return '疾跑检查：手掌关键点重叠，请稍微调整角度，让指节可见。';
    if(!f.thumbSpread)return '疾跑检查：请保持拇指张开。';
    if(!f.pinkySpread)return '疾跑检查：请保持小指伸开。';
    if(f.runPinched)return '疾跑检查：请分开拇指和食指，避免捏合。';
    if(!this.runMotion.ready)return '疾跑手型已就绪：中间三指可以自由伸屈，请反复前后摆动。';
    if(this.runMotion.anchorNoise)return '疾跑检查：检测到手掌参考点波动，尚无足够的独立手指运动证据。';
    const names=['食指','中指','无名指'],threshold=this.action==='run'?RUN_STOP:RUN_START;
    const detail=this.runMotion.activities.map((v,i)=>`${names[i]}${v>=threshold?'在动':'未明显动'}`).join(' · ');
    if(this.runMotion.movingCount<2)return `疾跑检查：${detail}。请让中间三指持续摆动。`;
    return (this.action==='run'?'疾跑中 · 停手即停：':'正在确认疾跑：')+detail;
  }
  snapshot(now){return {runHint:this.runHint(),runMotion:this.runMotion,action:this.action,candidate:this.candidate,progress:clamp((now-this.since)/80,0,1),direction:this.direction,strength:this.strength,recognitionMs:this.recognitionMs,features:this.features};}
}

export const JUMP_DURATION=1.18;
export const TURN_DURATION=1.06;
const mix=(a,b,t)=>a+(b-a)*t;
const pulse=(t,start,peak,end)=>smooth((t-start)/(peak-start))*(1-smooth((t-peak)/(end-peak)));
const flight=(t,start,end)=>{const u=clamp((t-start)/(end-start),0,1);return 4*u*(1-u);};

// A complete stride includes a short planted push and a long, high recovery.
// The phase-offset legs share a flight interval: this is running, not walking.
function sprintFoot(phase){
  const u=((phase%(Math.PI*2))+Math.PI*2)%(Math.PI*2)/(Math.PI*2);
  if(u<.32)return {y:.20,z:mix(.52,-.52,u/.32)};
  const v=(u-.32)/.68;
  return {y:.20+Math.sin(Math.PI*v)**.85*.49,z:mix(-.52,.52,smooth(v))};
}

export function sampleAction(action,t,strength=1,cycleTime=t){
  const p={height:1.80,chest:0,chestYaw:0,roll:0,head:0,headPitch:0,
    leftArm:.08,rightArm:.08,leftElbow:-.28,rightElbow:-.28,
    leftWrist:0,rightWrist:0,spread:.16,leftFootY:.20,rightFootY:.20,
    leftFootZ:0,rightFootZ:0,rootX:0,rootZ:0,facing:0,stance:0,spin:0,energy:0,impact:0};
  if(action==='idle'){
    const breath=Math.sin(t*2.2);p.height+=breath*.012;p.chest=breath*.018;
    p.roll=Math.sin(t*1.3)*.014;p.head=Math.sin(t*.85)*.055;p.headPitch=-breath*.012;
    p.leftArm=.06+Math.sin(t*2.2-.4)*.035;p.rightArm=.06+Math.sin(t*2.2+.4)*.035;
    p.leftElbow=-.30+Math.sin(t*1.4)*.04;p.rightElbow=-.30-Math.sin(t*1.4)*.04;
  }
  if(action==='run'){
    const launch=smooth((t-.12)/.18),compress=pulse(t,0,.12,.31);
    const phase=cycleTime*17*strength,swing=Math.sin(phase),left=sprintFoot(phase),right=sprintFoot(phase+Math.PI);
    p.height=mix(1.80,1.56+.045*Math.cos(phase*2),launch)-compress*.52;
    for(const [side,foot] of [['left',left],['right',right]]){p[side+'FootY']=mix(.20,foot.y,launch);p[side+'FootZ']=foot.z*launch;}
    p.rootZ=.72*smooth((t-.11)/.23);p.rootX=Math.sin(phase)*.035*launch;
    p.facing=-.45*launch;p.chest=.58*launch+.30*compress;p.chestYaw=swing*.19*launch;p.roll=Math.cos(phase)*.075*launch;p.headPitch=-p.chest*.70;
    p.leftArm=mix(.55,-.15+swing*1.05,launch);p.rightArm=mix(.55,-.15-swing*1.05,launch);
    p.leftElbow=-1.1-.24*swing*launch;p.rightElbow=-1.1+.24*swing*launch;
    p.leftWrist=-swing*.20;p.rightWrist=swing*.20;p.spread=.24;p.energy=launch;
  }
  if(action==='turn'){
    const prep=pulse(t,0,.13,.24),air=flight(t,.16,.72),tuck=pulse(t,.18,.40,.70),land=pulse(t,.71,.80,1.04);
    const rotation=smooth((t-.14)/.57);
    p.height=1.8-prep*.54+air*.78-land*.45;
    p.leftFootY+=air*.78+tuck*.32;p.rightFootY+=air*.78+tuck*.19;
    p.leftFootZ=tuck*.20;p.rightFootZ=-tuck*.15;
    p.spin=-.32*prep*(1-rotation)+Math.PI*2*rotation;
    p.chest=.20*prep-.12*tuck+.25*land;p.chestYaw=-.4*prep+.24*tuck;
    p.roll=Math.sin(rotation*Math.PI*2)*.15*air;p.head=-p.chestYaw*.55;
    p.leftArm=-.5-prep*.3-tuck*1.25;p.rightArm=.35-tuck*.65;
    p.leftElbow=-.5-tuck*.85;p.rightElbow=-.45-tuck*1.1;
    p.spread=.18+air*.50;p.leftWrist=-tuck*.4;p.rightWrist=tuck*.4;
    p.rootX=Math.sin(rotation*Math.PI)*.16;p.rootZ=air*.16;p.energy=air;
    p.impact=pulse(t,.72,.77,1.05);
  }
  if(action==='load'){
    // Deliberate gather -> explosive press -> overhead hold -> controlled return.
    const c=t%1.8,gather=pulse(c,0,.28,.48),press=smooth((c-.27)/.19)*(1-smooth((c-1.06)/.62));
    const recoil=pulse(c,.47,.55,.74);
    p.height=1.8-gather*.52-press*.04-recoil*.08;
    p.chest=.27*gather-.10*press;p.headPitch=-p.chest*.6;
    p.leftArm=-.72-press*1.95;p.rightArm=-.72-press*1.88;
    p.leftElbow=-1.05+press*.72;p.rightElbow=-1.0+press*.66;
    p.spread=.32;p.chestYaw=Math.sin(c*3)*.06*press;
    p.leftWrist=-.16*press;p.rightWrist=.16*press;p.energy=press*.7;
    p.impact=pulse(c,.29,.36,.60)*.6;
  }
  if(action==='crouch'){
    const drop=smooth(t/.16),settle=Math.sin(Math.max(0,t-.16)*19)*Math.exp(-Math.max(0,t-.16)*9)*.055;
    p.height=1.8-.62*drop+(t>.16?settle:0);p.chest=.32*drop;p.headPitch=-.23*drop;
    p.leftArm=-.8*drop;p.rightArm=-1.15*drop;p.leftElbow=-.8;p.rightElbow=-1.05;
    p.chestYaw=.12*drop;p.head=-.1*drop;p.roll=.025*drop;
    p.leftFootZ=.09*drop;p.rightFootZ=-.09*drop;p.stance=.06*drop;
    p.impact=pulse(t,.13,.20,.42)*.6;
  }
  if(action==='jump'){
    const prep=pulse(t,0,.13,.23),air=flight(t,.18,.76),tuck=pulse(t,.23,.46,.73),land=pulse(t,.75,.85,1.16);
    p.height=1.8-prep*.60+air*.98-land*.50;
    p.leftFootY+=air*.98+tuck*.27;p.rightFootY+=air*.98+tuck*.16;
    p.leftFootZ=tuck*.22;p.rightFootZ=-tuck*.16;
    p.leftArm=.6*prep-2.50*air-.5*land;p.rightArm=.6*prep-2.15*air-.85*land;
    p.leftElbow=-.45-.3*tuck;p.rightElbow=-.55-.3*tuck;
    p.spread=.20+air*.38;p.chest=.30*prep-.10*tuck+.30*land;p.headPitch=-p.chest*.65;
    p.chestYaw=.12*tuck;p.rootZ=.18*air;p.energy=air;p.impact=pulse(t,.76,.82,1.17);
  }
  return p;
}

// Planar two-bone IK: keep the ankle target and sole level as the pelvis moves.
export function legIK(height,footY,footZ){
  const a=.72,b=.64,dy=height-.27-footY,dz=footZ,d=clamp(Math.hypot(dy,dz),.12,a+b-.001);
  const hip=Math.atan2(-dz,dy)-Math.acos(clamp((a*a+d*d-b*b)/(2*a*d),-1,1));
  const knee=Math.PI-Math.acos(clamp((a*a+b*b-d*d)/(2*a*b),-1,1));
  return {hip,knee,ankle:-hip-knee};
}

export class ActionDirector{
  constructor(){this.reset();}
  reset(){this.action='idle';this.entered=0;this.last=0;this.phase=0;this.tempo=1;this.yaw=-.30;this.turnBase=this.yaw;this.turnDirection=1;this.from=null;this.pose=sampleAction('idle',0);this.requestWasJump=false;this.completedJump=false;}
  update(intent,now){
    const dt=this.last?clamp((now-this.last)/1000,0,.06):1/60;this.last=now;
    let requested=ACTIONS[intent.action]?intent.action:'idle';
    if(requested!=='jump')this.requestWasJump=false;
    const age=(now-this.entered)/1000;
    if(this.action==='jump'&&age<JUMP_DURATION)requested='jump';
    else if(this.action==='jump'){requested='idle';this.completedJump=true;}
    else if(requested==='jump'&&this.requestWasJump)requested='idle';
    // An airborne spin always lands. A held turn starts a new complete cycle.
    if(this.action==='turn'){
      if(age<TURN_DURATION)requested='turn';
      else {
        this.yaw=this.turnBase+this.turnDirection*Math.PI*2;
        if(requested==='turn'){this.turnBase=this.yaw;this.turnDirection=intent.direction||1;this.entered=now;this.phase=0;}
      }
    }
    if(requested!==this.action){
      this.from={...this.pose};this.action=requested;this.entered=now;this.phase=0;
      if(requested==='turn'){this.turnBase=this.yaw;this.turnDirection=intent.direction||1;}
      if(requested==='jump'){this.requestWasJump=true;this.completedJump=false;}
    }
    this.tempo=approach(this.tempo,clamp(intent.strength||1,.85,1.35),dt,.10);this.phase+=dt*this.tempo;
    const elapsed=(now-this.entered)/1000,target=sampleAction(this.action,elapsed,1,this.phase);
    const blend=smooth(elapsed/(['jump','turn','run','crouch'].includes(this.action)?.055:.14));
    this.pose=Object.fromEntries(Object.entries(target).map(([k,v])=>[k,this.from?mix(this.from[k],v,blend):v]));
    if(this.action==='turn')this.yaw=this.turnBase+this.turnDirection*target.spin;
    return {...this.pose,yaw:this.yaw,action:this.action,elapsed};
  }
}
