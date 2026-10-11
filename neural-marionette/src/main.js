import './style.css';
import defaults from '../config/app_config.json';
import links from '../config/landmark_to_bone.json';
import {ACTIONS,GestureInterpreter,ActionDirector} from './actions.js';
import {GestureStudio} from './gesture-studio.js';
import {BackgroundMusic} from './music.js';
import {StageRecorder} from './recorder.js';
import {RobotStage} from './robot.js';
import {CONNECTIONS,clamp,approach,containRect,screenPoint,LandmarkFilter,TrackingState,calibration,mapPose,NEUTRAL,syntheticHand,curvePoint,validHand} from './core.js';

const $=id=>document.getElementById(id),config=structuredClone(defaults);
const canvas=$('stage'),ctx=canvas.getContext('2d',{alpha:false}),video=$('camera');
let robot;try{robot=new RobotStage();}catch(e){$('welcome').hidden=true;$('notice').hidden=false;$('notice').textContent='无法启动 3D 渲染。请在 Chrome 设置 → 系统中开启图形加速，然后重新打开页面。';throw e;}
const machine=new TrackingState(config.tracking),filter=new LandmarkFilter(config.motion.landmark_tau_ms);
let mode='off',worker=null,workerReady=false,busy=false,stream=null,generation=0,lastFrameAt=-Infinity,lastVideoTime=-1,lastDispatch=0;
let points=null,raw=null,base=null,pose={...NEUTRAL},opacity=0,previous=performance.now(),start=previous,lastHud=previous,lastInference=0;
let cursor={x:.5,y:.5},manual={},recording=null,recordStart=0,lastError=null,handedness=null,holdCalibrate=false,calibrationSamples=[];
let manualCapture=false,automaticCapture=false,nextRenderAt=0,renderMs=0;
const background=document.createElement('canvas');
const stats={frames:0,samples:[],inferences:[],errors:[],mode:'off',startedAt:new Date().toISOString()};let frameWindow=[],trackingWindow=[],lastPositions=null,tetherSpeed=0;
const stateNames={Searching:'等待手掌',Acquiring:'正在建立连接',Linked:'提线已连接',Controlling:'实时操控中',Lost:'连接暂时丢失',Error:'连接异常'};
const qualityPresets=config.render.presets;
const gestures=new GestureInterpreter(),director=new ActionDirector();
let actionOverride=null,actionMotion=director.update({action:'idle'},performance.now()),intent={action:'idle'},resultAgeMs=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const actionButtons=new Map();
const music=new BackgroundMusic();
const studio=new GestureStudio({getMode:()=>mode,video,connect:startCamera,download,onWorkspaceChange:()=>{
 if(recording)stopRecording();
 resetTracking();intent={action:'idle'};pose={...NEUTRAL};actionMotion=director.update(intent,performance.now());updateButtons();
 for(const button of actionButtons.values())button.disabled=studio.editing;
}});
const recorder=new StageRecorder(result=>{
 recording=null;automaticCapture=false;resize();
 $('record').classList.remove('recording');$('record').querySelector('span').textContent='录制 25 秒';updateButtons();
 if(result.blob.size)download(result.blob,`neural-marionette-${result.mode==='demo'?'SIMULATION':'LIVE'}-${Date.now()}.${result.mimeType.includes('mp4')?'mp4':'webm'}`);
 if(result.error)notice(`录像中断：${result.error}。${result.blob.size?'已保存可恢复的片段。':'未生成视频，请开启录屏优化后用系统录屏。'}`);
 else if(!result.blob.size)notice('录像没有生成画面，请重试或开启录屏优化后使用系统录屏。');
});
function captureOptimized(){return manualCapture||automaticCapture;}
function renderPreset(){return qualityPresets[captureOptimized()?'low':config.render.quality];}
function renderFps(){return captureOptimized()?config.recording.fps:config.render.target_fps;}
function resize(){
 const q=renderPreset();canvas.width=q.width;canvas.height=q.height;robot.resize(canvas.width,canvas.height);nextRenderAt=0;
 $('resolution-label').textContent=`${canvas.width} × ${canvas.height} · ${renderFps()} FPS`;
 $('quality').disabled=captureOptimized();$('capture-optimize').checked=captureOptimized();$('capture-optimize').disabled=automaticCapture;
 setText('capture-status',captureOptimized()?(automaticCapture?'录像中 · ':'录屏优化已开启 · ')+'720p / 30 帧 · 停用重滤镜与辉光':'系统录屏前开启 · 内置录像自动开启');
 // The background never animates: paint once per resolution change.
 background.width=canvas.width;background.height=canvas.height;
 const c=background.getContext('2d'),w=canvas.width,h=canvas.height,s=w/1920;
 const bg=c.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#112133');bg.addColorStop(.48,'#122438');bg.addColorStop(1,'#0b1725');c.fillStyle=bg;c.fillRect(0,0,w,h);
 const halo=c.createRadialGradient(w*.74,h*.4,10,w*.74,h*.4,h*.57);halo.addColorStop(0,'#4c697727');halo.addColorStop(1,'#11203200');c.fillStyle=halo;c.fillRect(0,0,w,h);
 c.fillStyle='#8ca5b318';c.beginPath();for(let x=30*s;x<w;x+=60*s)for(let y=35*s;y<h;y+=60*s){c.moveTo(x+.8*s,y);c.arc(x,y,.8*s,0,Math.PI*2);}c.fill();
}
resize();
function setText(id,text){if($(id).textContent!==text)$(id).textContent=text;}
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
function resetTracking(){studio.stop();gestures.reset();director.reset();actionOverride=null;machine.reset();filter.reset();points=raw=base=lastPositions=null;handedness=null;calibrationSamples=[];lastFrameAt=mode==='camera'?performance.now():-Infinity;manual={};}
function stopResources(){generation++;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;worker?.terminate();worker=null;workerReady=false;busy=false;lastVideoTime=-1;}
function switchOff(){music.setActive(false);if(recording)stopRecording();stopResources();mode='off';stats.mode=mode;resetTracking();$('welcome').hidden=false;notice('');updateButtons();}
function fail(message,error){music.setActive(false);if(recording)stopRecording();stopResources();mode='error';lastError=message;stats.errors.push({at:Date.now(),message,detail:String(error||'')});resetTracking();machine.state='Error';$('welcome').hidden=false;notice(message);updateButtons();}
function updateButtons(){const live=mode==='camera';$('state-label').textContent=mode==='off'?'等待连接':mode==='loading'?'正在连接':stateNames[machine.state];$('mode-tag').textContent=mode==='demo'?'SIMULATION':live?'LIVE CAMERA':mode==='loading'?'INITIALIZING':'CAMERA OFF';$('camera-toggle').querySelector('span').textContent=live?'关闭摄像头':mode==='loading'?'取消连接':'连接摄像头';$('demo-toggle').querySelector('span').textContent=mode==='demo'?'退出模拟':'模拟操控';$('record').disabled=studio.editing||!(mode==='demo'||live);$('calibrate').disabled=!machine.active;}
async function startCamera(){
 if(mode==='loading'||mode==='camera')return;music.setActive(true);if(recording)stopRecording();stopResources();resetTracking();mode='loading';stats.mode=mode;lastError=null;const current=generation;$('welcome').hidden=true;notice('正在连接摄像头并加载本地追踪模型…');updateButtons();
 let cameraStream;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前环境不支持摄像头，请使用 Chrome 打开本机 localhost 地址。');
  cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:config.camera.width},height:{ideal:config.camera.height},frameRate:{ideal:config.camera.fps},...(config.camera.device_id?{deviceId:{exact:config.camera.device_id}}:{facingMode:'user'})}});
  if(current!==generation){cameraStream.getTracks().forEach(t=>t.stop());return;}stream=cameraStream;video.srcObject=stream;await video.play();
  if(current!==generation)return;
  for(const track of stream.getVideoTracks())track.onended=()=>{if(current===generation)fail('摄像头已断开。重新连接设备后，点击「连接摄像头」。');};
  worker=new Worker('/tracker.worker.js');
  const initTimer=setTimeout(()=>{if(current===generation&&!workerReady)fail('追踪模型加载超时。请重启项目，确认本地模型和 WASM 文件完整。');},config.tracking.model_timeout_ms);
  worker.onerror=e=>{clearTimeout(initTimer);if(current===generation)fail('手部追踪启动失败。请查看诊断报告并重新连接。',e.message);};
  worker.onmessage=({data})=>{
   if(current!==generation)return;
   if(data.type==='ready'){clearTimeout(initTimer);workerReady=true;mode='camera';stats.mode=mode;lastFrameAt=performance.now();notice('请张开手掌，稳定保持约半秒，自动建立中立姿态。');updateButtons();}
   if(data.type==='error'){clearTimeout(initTimer);fail('手部追踪发生错误，请重新连接摄像头。',data.message);}
   if(data.type==='result'){busy=false;const now=performance.now();if(now-data.timestamp>config.tracking.stale_timeout_ms)return;resultAgeMs=now-data.timestamp;lastInference=data.inferenceMs;stats.inferences.push(lastInference);if(stats.inferences.length>18000)stats.inferences.shift();trackingWindow.push(now);handedness=data.handedness;acceptFrame(data.landmarks,now);}
  };
  worker.postMessage({type:'init',config:config.tracking});
 }catch(e){if(current!==generation){cameraStream?.getTracks().forEach(t=>t.stop());return;}const messages={NotAllowedError:'摄像头权限未开启。点击地址栏的摄像头图标允许访问；如仍不可用，请在系统设置 → 隐私与安全性 → 摄像头中允许 Chrome。',NotFoundError:'没有找到摄像头。请连接 USB 摄像头或启用 iPhone 连续互通相机后重试。',NotReadableError:'无法读取摄像头。请关闭其他占用摄像头的应用后重试。'};fail(messages[e.name]||e.message,e);}
}
function startDemo(){if(studio.editing)studio.setEditing(false);music.setActive(true);if(recording)stopRecording();stopResources();resetTracking();mode='demo';stats.mode=mode;lastError=null;$('welcome').hidden=true;notice('动作试播 · 点击下方动作或按 1–6。移动指针可牵引位置；此模式不使用摄像头。');updateButtons();}
function acceptFrame(next,now){
 lastFrameAt=now;if(mode==='camera')studio.ingest(next,now,video.videoWidth/video.videoHeight||16/9);const valid=validHand(next);
 if(mode==='camera'&&studio.editing){machine.frame(valid,now,false);return;}
 if(valid){
  if(now-machine.lastSeen>config.tracking.lost_timeout_ms){filter.reset();base=null;calibrationSamples=[];}
  raw=next;points=filter.update(next,now);if(mode==='camera'&&!studio.editing)intent=gestures.update(next,now,config.camera.mirror_input,video.videoWidth/video.videoHeight||16/9);let speed=0;if(lastPositions)speed=Math.hypot(points[0].x-lastPositions.x,points[0].y-lastPositions.y);lastPositions={...points[0]};tetherSpeed=approach(tetherSpeed,clamp(speed*120,0,1),.033,.1);
  machine.frame(true,now,speed>config.tracking.movement_threshold);
  if(!base||holdCalibrate){calibrationSamples.push(structuredClone(points));if(calibrationSamples.length>config.tracking.calibration_samples)calibrationSamples.shift();const stable=calibrationSamples.length===config.tracking.calibration_samples&&[0,8].every(i=>Math.hypot(calibrationSamples[0][i].x-points[i].x,calibrationSamples[0][i].y-points[i].y)<config.tracking.calibration_stability);if(stable){const mean=points.map((_,i)=>Object.fromEntries(['x','y','z'].map(k=>[k,calibrationSamples.reduce((s,f)=>s+f[i][k],0)/calibrationSamples.length])));base=calibration(mean,config.camera.mirror_input);holdCalibrate=false;calibrationSamples=[];if(mode==='camera')notice('');} }
 }else{machine.frame(false,now);intent=studio.editing?{action:'idle'}:gestures.tick(now);calibrationSamples=[];}
}
async function dispatchFrame(now){if(mode!=='camera'||!workerReady||busy||video.readyState<2||video.currentTime===lastVideoTime||now-lastDispatch<1000/config.tracking.inference_fps)return;busy=true;lastVideoTime=video.currentTime;lastDispatch=now;const current=generation;try{const bitmap=await createImageBitmap(video,{resizeWidth:config.tracking.inference_width,resizeHeight:Math.round(config.tracking.inference_width*video.videoHeight/video.videoWidth)});if(current!==generation){bitmap.close();return;}worker.postMessage({type:'frame',bitmap,timestamp:now},[bitmap]);}catch(e){if(current===generation)fail('无法读取摄像头帧，请重新连接。',e);}}
function point(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function path(points,color,width){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function label(text,x,y,color='#7790a6',size=13){ctx.fillStyle=color;ctx.font=`${size}px "Avenir Next", "PingFang SC", sans-serif`;ctx.fillText(text,x,y);}
function draw(now){
 const w=canvas.width,h=canvas.height,s=w/1920,t=now/1000,q=renderPreset(),particleCount=Math.max(1,Math.round(q.particles*config.tethers.particles/6));ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.shadowBlur=0;
 ctx.drawImage(background,0,0);
 const b=config.layout.hand_viewport,box=mode==='camera'?{x:0,y:0,w,h}:{x:b.x*w,y:b.y*h,w:b.w*w,h:b.h*h};
 const rect=containRect(box,mode==='camera'?video.videoWidth||1280:700,mode==='camera'?video.videoHeight||720:700);
 ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();
 if(mode==='camera'&&video.readyState>=2){ctx.save();if(!captureOptimized())ctx.filter='saturate(0.65) brightness(0.72)';if(config.camera.mirror_input){ctx.translate(rect.x+rect.w,rect.y);ctx.scale(-1,1);ctx.drawImage(video,0,0,rect.w,rect.h);}else ctx.drawImage(video,rect.x,rect.y,rect.w,rect.h);ctx.restore();if(captureOptimized()){ctx.fillStyle='#101a2848';ctx.fillRect(box.x,box.y,box.w,box.h);}const wash=ctx.createLinearGradient(box.x,0,box.x+box.w,0);wash.addColorStop(0,'#13223620');wash.addColorStop(.8,'#10203505');wash.addColorStop(1,'#12243890');ctx.fillStyle=wash;ctx.fillRect(box.x,box.y,box.w,box.h);}
 ctx.restore();
 ctx.drawImage(robot.renderer.domElement,0,0,w,h);
 if(mode!=='camera')for(const [x,y,sx,sy] of [[box.x,box.y,1,1],[box.x+box.w,box.y,-1,1],[box.x,box.y+box.h,1,-1],[box.x+box.w,box.y+box.h,-1,-1]])path([{x,y:y+sy*23*s},{x,y},{x:x+sx*23*s,y}],'#537089',1*s);
 if(mode!=='camera')label(mode==='demo'?'SIMULATED INPUT / 模拟输入':'HAND CAPTURE / 手部取景',box.x,box.y-23*s,'#8197ab',12*s);
 label('NM–03 / '+ACTIONS[actionMotion.action].en,w*.62,h*.85,'#f6d3a3',24*s);label(ACTIONS[actionMotion.action].name+' · '+(actionOverride?'动作试播':mode==='camera'?(studio.sourceLabel):'等待输入'),w*.62,h*.89,'#bed0df',18*s);
 // Joint endpoints are derived from the same camera and bone transforms as the rendered robot.
 const endpoints=links.map(l=>robot.project(l.bone,w,h));
 endpoints.forEach((p,i)=>{point(p.x,p.y,4*s,'#bc966756');ctx.beginPath();ctx.arc(p.x,p.y,8*s,0,Math.PI*2);ctx.strokeStyle='#c6a87935';ctx.lineWidth=s;ctx.stroke();});
 if(points&&opacity>.005){
  const projected=points.map(p=>screenPoint(p,rect,config.camera.mirror_input));
  ctx.save();ctx.globalAlpha=opacity;
  if(mode==='demo'){const palm=[0,1,2,5,9,13,17].map(i=>projected[i]);ctx.beginPath();palm.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='#83adc015';ctx.fill();for(const [a,b]of CONNECTIONS)path([projected[a],projected[b]],'#84a9bc17',18*s);}
  for(const [a,b]of CONNECTIONS)path([projected[a],projected[b]],'#adc6d87d',1.4*s);
  projected.forEach((p,i)=>{point(p.x,p.y,3*s,'#d9e7ed');if([0,4,8,12,16].includes(i)){point(p.x,p.y,5*s,'#ffe0af');label(String(i).padStart(2,'0'),p.x+10*s,p.y-9*s,'#a4b8c5',10*s);}});
  links.forEach((l,i)=>{
   const a=projected[l.landmark],b=endpoints[i],distance=Math.hypot(b.x-a.x,b.y-a.y),tension=clamp(distance/(w*.65)+tetherSpeed*.2,0,1);
   const bend=(55*(1-tension)+Math.sin(t*1.4+i)*6+14*tetherSpeed)*s;
   const growth=clamp(opacity*1.5-i*.08,0,1),curve=[];for(let n=0;n<=64;n++)curve.push(curvePoint(a,b,bend,n/64*growth));
   ctx.globalAlpha=opacity*.14;ctx.shadowColor=l.color;ctx.shadowBlur=18*s*q.glow*config.tethers.glow_strength/1.2;path(curve,l.color,(6+(1-tension)*2)*s);
   ctx.shadowBlur=0;for(let strand=-1;strand<=1;strand+=2){ctx.globalAlpha=opacity*.22;const filament=[];for(let n=0;n<=40;n++){const u=n/40*growth;const f=curvePoint(a,b,bend+strand*22*s,u);f.y+=Math.sin(u*Math.PI)*Math.sin(u*12-t*2+i)*3*s;filament.push(f);}path(filament,l.color,.8*s);}ctx.globalAlpha=opacity*(.65+tension*.35);path(curve,l.color,(1.3+(1-tension)*.65)*s*config.tethers.width/1.4);
   if(machine.active&&!reducedMotion){for(let j=0;j<particleCount;j++){const phase=(t*(.12+tetherSpeed*.18)+j/particleCount+i*.13)%1;if(phase>growth)continue;const p=curvePoint(a,b,bend,phase),tail=curvePoint(a,b,bend,Math.max(0,phase-.014));ctx.globalAlpha=opacity*Math.sin(phase*Math.PI);path([tail,p],'#ffdfac',2.8*s);point(p.x,p.y,2*s,'#fff0cd');}}
   ctx.globalAlpha=opacity;point(b.x,b.y,3.5*s,'#ffdfa5');
  });ctx.restore();
 }
 ctx.globalAlpha=1;
 if(mode==='demo'){label('SIMULATION · 非真人追踪',40*s,42*s,'#e6b881',14*s);}else if(mode==='camera'){label('LIVE CAMERA · 实时摄像头',40*s,42*s,'#a6c7b9',14*s);}
 label(`${mode==='off'?'STANDBY':stateNames[machine.state]||machine.state}`,w-280*s,42*s,'#afbac3',13*s);
 if(recording){point(w-310*s,42*s,5*s,'#ff8b6a');label(`REC ${((now-recordStart)/1000).toFixed(1)}s`,w-220*s,h-45*s,'#ffba91',14*s);}
}
function tick(now){
 // Keep inference scheduling independent from the recording render cap.
 if(mode==='camera')dispatchFrame(now);
 if(now<nextRenderAt-1){requestAnimationFrame(tick);return;}
 const interval=1000/renderFps();nextRenderAt=nextRenderAt?nextRenderAt+interval:now+interval;if(now-nextRenderAt>interval)nextRenderAt=now+interval;
 const frameStarted=performance.now(),dt=clamp((now-previous)/1000,.001,.05);previous=now;stats.frames++;frameWindow.push(now);while(frameWindow[0]<now-1000)frameWindow.shift();while(trackingWindow[0]<now-1000)trackingWindow.shift();
 if(mode==='demo')acceptFrame(syntheticHand(now/1000,cursor),now);
 if(mode==='camera'){if(now-lastFrameAt>config.tracking.stale_timeout_ms){machine.frame(false,now);if(now-lastFrameAt>config.tracking.error_timeout_ms)fail('摄像头或追踪数据已停止更新，请重新连接。');}}
 if(mode!=='error')machine.tick(now);
 if(mode==='camera')intent=studio.editing?{action:'idle'}:gestures.tick(now);
 const active=!studio.editing&&machine.active&&base!==null;const target=active?mapPose(points,base,config.camera.mirror_input,config.motion):{...NEUTRAL};
 // Gesture actions own the limbs; only wrist translation and a little head orientation remain continuous.
 target.left=target.right=target.chest=target.nod=0;
 if(mode==='demo')Object.assign(target,manual);
 for(const k in pose){const translation=k==='x'||k==='y';pose[k]=approach(pose[k],target[k],dt,active?config.motion.joint_tau_ms/1000:config.motion.return_to_idle_ms/3000,translation?config.motion.max_translation_speed:config.motion.max_angular_speed);}
 opacity=approach(opacity,machine.active?1:machine.state==='Acquiring'?.3:0,dt,machine.state==='Lost'?.22:.16);
 const controlIntent=studio.intent(intent,now);studio.tick(now);
 const desired=actionOverride?{action:actionOverride,strength:1,direction:1}:mode==='camera'&&machine.active?controlIntent:{action:'idle'};
 actionMotion=director.update(desired,now);if(actionOverride==='jump'&&director.completedJump)actionOverride='idle';
 if(!studio.editing){robot.update(pose,now/1000,active,actionMotion);draw(now);recorder.frame();}renderMs=performance.now()-frameStarted;
 const runBound=studio.enabled&&studio.samples.some(s=>s.action==='run');
 setText('run-rule-status',studio.editing?'疾跑检查已暂停：正在录制模式。':mode!=='camera'?'原有疾跑：手掌朝下，拇指、小指张开，中间三指前后摆动；停手即停。':runBound?'疾跑使用已录制样本。选择「原有手势规则」可直接使用内置手势。':studio.mode==='personal'?'仅录制模式下疾跑尚未绑定，请切换「原有手势规则」。':intent.runHint||'请让整只手进入画面。');
 setText('action-name',ACTIONS[actionMotion.action].name);
 setText('action-source',actionOverride?'动作试播':mode==='camera'?(studio.sourceLabel):'等待输入');
 setText('gesture-hint',studio.editing?'正常操控已暂停；保存后点击「返回正常操控」。':studio.enabled&&!actionOverride?(studio.mode==='hybrid'?'已绑定动作使用你的录制；其余动作沿用原有规则。':'使用你录制的样本识别；未绑定的动作保持待机。'):actionOverride?ACTIONS[actionOverride].hint:mode==='camera'&&intent.candidate&&intent.candidate!==intent.action?'识别中：'+ACTIONS[intent.candidate].name:ACTIONS[actionMotion.action].hint);
 for(const [name,button] of actionButtons){const pressed=String(actionMotion.action===name);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);}
 if(now-lastHud>300){const fps=frameWindow.length;lastHud=now;$('frame-age').textContent=mode==='camera'?resultAgeMs.toFixed(0)+' ms':'—';$('gesture-delay').textContent=mode==='camera'?(controlIntent.recognitionMs??0)+' ms':'—';$('fps').textContent=fps;$('latency').textContent=mode==='camera'?lastInference.toFixed(0):'—';$('points-count').innerHTML=`${machine.active||machine.state==='Acquiring'?21:0}<span>/21</span>`;$('tracking-rate').textContent=mode==='camera'?`追踪 ${trackingWindow.length} Hz`:mode==='demo'?'模拟输入':'追踪 — Hz';$('handedness').textContent=mode==='demo'?'模拟 · 不使用摄像头':handedness&&machine.active?`${handedness.categoryName} · 左右手分类 ${(handedness.score*100).toFixed(0)}%`:'尚无手部输入';$('state-label').textContent=mode==='off'?'等待连接':mode==='loading'?'正在连接':stateNames[machine.state];$('mode-tag').textContent=mode==='demo'?'SIMULATION':mode==='camera'?'LIVE CAMERA':mode==='loading'?'INITIALIZING':'CAMERA OFF';$('status-dot').style.background=machine.active?'#eabc7b':mode==='error'?'#e38970':'#7e8e9d';$('calibrate').disabled=!machine.active;stats.samples.push({seconds:(now-start)/1000,fps,targetFps:renderFps(),captureOptimized:captureOptimized(),recording:!!recording,renderMs,trackingHz:trackingWindow.length,state:machine.state,mode,action:actionMotion.action,gesture:controlIntent.action,frameAgeMs:mode==='camera'?resultAgeMs:null,gestureConfirmationMs:mode==='camera'?(controlIntent.recognitionMs??0):null,inferenceMs:mode==='camera'?lastInference:null});if(stats.samples.length>3600)stats.samples.shift();if($('debug-panel').open)$('debug-data').textContent=JSON.stringify({mode,state:machine.state,action:actionMotion.action,gesture:intent,frameAgeMs:resultAgeMs,calibrated:!!base,pose,raw:raw?{wrist:raw[0],index:raw[8]}:null,filtered:points?{wrist:points[0],index:points[8]}:null},null,2);}
 requestAnimationFrame(tick);
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function exportStats(){const fps=stats.samples.filter(s=>s.seconds>2).map(s=>s.fps),sorted=[...stats.inferences].sort((a,b)=>a-b);download(new Blob([JSON.stringify({...stats,config,recording:recorder.diagnostics(),renderProfile:{optimized:captureOptimized(),width:canvas.width,height:canvas.height,targetFps:renderFps()},camera:stream?.getVideoTracks()[0]?.getSettings()||null,summary:{renderAvgFps:fps.reduce((a,b)=>a+b,0)/(fps.length||1),renderMinFps:fps.length?Math.min(...fps):null,inferenceP95Ms:sorted.length?sorted[Math.floor(sorted.length*.95)]:null},note:'推理耗时不等于摄像头到显示端到端延迟；模拟模式不构成真人追踪证据。'},null,2)],{type:'application/json'}),`neural-marionette-diagnostics-${Date.now()}.json`);}
function stopRecording(){if(!recording)return;recorder.stop();$('record').disabled=true;$('record').querySelector('span').textContent='正在保存…';}
function startRecording(){
 if(recording){stopRecording();return;}
 try{
  automaticCapture=true;resize();
  // Resizing clears both canvases. Compose a real frame before capture begins.
  const now=performance.now();robot.update(pose,now/1000,machine.active,actionMotion);draw(now);
  recorder.start(canvas,{...config.recording,mode});recording=recorder;recordStart=performance.now();
  $('record').classList.add('recording');$('record').querySelector('span').textContent='停止并保存';
 }catch(e){recording=null;automaticCapture=false;resize();notice(e.message);}
}
$('start-camera').onclick=startCamera;$('camera-toggle').onclick=()=>mode==='camera'||mode==='loading'?switchOff():startCamera();$('start-demo').onclick=startDemo;$('demo-toggle').onclick=()=>mode==='demo'?switchOff():startDemo();
$('calibrate').onclick=()=>{holdCalibrate=true;calibrationSamples=[];manual={};notice('保持手掌稳定，正在重新校准…');};
$('mirror').onchange=e=>{config.camera.mirror_input=e.target.checked;resetTracking();};
$('gain').oninput=e=>{config.motion.gain=Number(e.target.value);$('gain-value').value=`${config.motion.gain.toFixed(1)}×`;};
$('quality').onchange=e=>{config.render.quality=e.target.value;resize();};
$('capture-optimize').onchange=e=>{manualCapture=e.target.checked;resize();};
$('reset').onclick=()=>{config.motion.gain=defaults.motion.gain;$('gain').value=config.motion.gain;$('gain-value').value='1.0×';manual={};actionOverride=null;gestures.reset();director.reset();document.querySelectorAll('#joint-sliders input').forEach(el=>el.value=0);holdCalibrate=true;};
$('export').onclick=exportStats;$('record').onclick=startRecording;$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.workspace').requestFullscreen();}catch(e){notice('当前窗口不支持全屏，请在 Chrome 中打开。');}};
$('debug-toggle').onclick=()=>{$('debug-panel').open=!$('debug-panel').open;$('debug-toggle').setAttribute('aria-expanded',String($('debug-panel').open));};
for(const [key,name]of Object.entries({root:'骨盆转向',left:'左臂',right:'右臂',head:'头部',chest:'胸部'})){const label=document.createElement('label');label.textContent=name;const input=document.createElement('input');input.type='range';input.min=-35;input.max=35;input.value=0;input.setAttribute('aria-label',name);input.oninput=()=>{if(mode==='demo')manual[key]=Number(input.value)*Math.PI/180;};label.append(input);$('joint-sliders').append(label);}
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();cursor={x:clamp((e.clientX-r.left)/r.width/.5,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)};});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='camera'){switchOff();notice('切换到后台后已关闭摄像头。点击连接即可继续。');}});
window.addEventListener('beforeunload',()=>{recorder.dispose();stopResources();});
window.__NM_DIAGNOSTICS__=()=>({recording:recorder.diagnostics(),renderProfile:{optimized:captureOptimized(),manual:manualCapture,width:canvas.width,height:canvas.height,targetFps:renderFps(),renderMs},music:music.diagnostics(),studio:studio.diagnostics(),mode,action:actionMotion.action,actionOverride,motion:actionMotion,gesture:intent,frameAgeMs:resultAgeMs,feet:['LeftFoot','RightFoot'].map(name=>{const v=robot.bones[name].getWorldPosition(robot.bones[name].position.clone());return {name,x:v.x,y:v.y,z:v.z};}),state:machine.state,pose:{...pose},calibrated:!!base,points:points?.length||0,workerReady,errors:stats.errors,frames:stats.frames,samples:stats.samples.slice(-5),endpoints:links.map(l=>({bone:l.bone,...robot.project(l.bone,canvas.width,canvas.height)})),renderer:robot.renderer.info.render});
requestAnimationFrame(tick);

function previewAction(name){if(studio.editing||!ACTIONS[name])return;if(mode!=='demo')startDemo();if(name==='jump'&&actionMotion.action==='jump')return;actionOverride=name;}
for(const [name,meta] of Object.entries(ACTIONS)){const button=document.createElement('button');button.type='button';button.dataset.action=name;button.setAttribute('aria-pressed','false');button.innerHTML=`<kbd>${meta.key}</kbd><strong>${meta.name}</strong><span>${meta.hint}</span>`;button.onclick=()=>previewAction(name);$('action-buttons').append(button);actionButtons.set(name,button);}
$('gesture-control').onclick=()=>{studio.setEditing(false);actionOverride=null;gestures.reset();if(mode!=='camera')startCamera();else notice('手势控制已恢复。');};
document.addEventListener('keydown',e=>{if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;const match=Object.entries(ACTIONS).find(([,v])=>v.key===e.key);if(match){e.preventDefault();previewAction(match[0]);}});
