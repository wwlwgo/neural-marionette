import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,GestureInterpreter,handFeatures,sampleAction,legIK,ActionDirector,TURN_DURATION} from '../src/actions.js';
import {calibration,mapPose,syntheticHand} from '../src/core.js';
import {readFileSync} from 'node:fs';
const cfg=JSON.parse(readFileSync(new URL('../config/app_config.json',import.meta.url)));

import {hand} from './fixtures/gesture-hand.js';
function trace(g,kind,from,to,opts=()=>({})){let r;for(let t=from;t<=to;t+=20)r=g.update(hand(kind,opts(t)),t);return r;}

test('features separate open, fist, two fingers and pinch across scale and rotation',()=>{
 for(const scale of [.7,1,1.2])for(const angle of [-.5,0,.5]){
  assert.equal(handFeatures(hand('open',{scale,angle})).open,true);
  assert.equal(handFeatures(hand('fist',{scale,angle})).fist,true);
  assert.equal(handFeatures(hand('two',{scale,angle})).two,true);
  assert.equal(handFeatures(hand('twoDown',{scale,angle})).twoDown,true);
  assert.equal(handFeatures(hand('one',{scale,angle})).indexOnly,true);
  assert.equal(handFeatures(hand('two',{scale,angle})).twoDown,false);
  assert.ok(handFeatures(hand('pinch',{scale,angle})).pinch<.25);
 }
});
test('pinch enters once, survives small noise, releases, and cannot survive tracking loss',()=>{
 const g=new GestureInterpreter();trace(g,'open',0,100);assert.equal(trace(g,'pinch',120,260).action,'load');
 assert.equal(trace(g,'pinch',280,1000,t=>({x:Math.sin(t)*.002})).action,'load');
 assert.ok(g.recognitionMs<=100,'confirmation metric must not grow with time spent holding');
 assert.equal(trace(g,'open',1020,1280).action,'idle');trace(g,'pinch',1300,1500);assert.equal(g.tick(1800).action,'idle');
 assert.equal(g.features,null);
});
test('downward two fingers swing to run; stationary and upright fingers do not',()=>{
 const g=new GestureInterpreter();assert.equal(trace(g,'twoDown',0,200).action,'idle');
 assert.equal(trace(g,'twoDown',220,600,t=>({y:Math.sin((t-200)/110)*.055})).action,'run');
 assert.equal(trace(g,'twoDown',620,1500).action,'idle');
 const upright=new GestureInterpreter();assert.equal(trace(upright,'two',0,700,t=>({x:Math.sin(t/100)*.06})).action,'idle');
});
test('single index rotation triggers spin, while single index translation never runs',()=>{
 const g=new GestureInterpreter();assert.equal(trace(g,'one',0,400,t=>({x:Math.sin(t/100)*.06})).action,'idle');
 assert.equal(trace(g,'one',420,760,t=>({angle:(t-400)*.002})).action,'turn');
 assert.equal(trace(g,'one',780,1600,()=>({angle:.72})).action,'idle');
});
test('run and spin hand shapes are mutually exclusive for either mirror setting',()=>{
 for(const mirror of [true,false]){
  const two=new GestureInterpreter(),one=new GestureInterpreter();
  for(let t=0;t<800;t+=20){
   assert.notEqual(two.update(hand('twoDown',{angle:Math.sin(t/160)*.6,x:Math.sin(t/120)*.04}),t,mirror).candidate,'turn');
   assert.notEqual(one.update(hand('one',{angle:Math.sin(t/160)*.6,x:Math.sin(t/120)*.04}),t,mirror).candidate,'run');
  }
 }
});
test('switching hand shape clears old movement and cannot trigger a new action while still',()=>{
 const g=new GestureInterpreter();trace(g,'one',0,400,t=>({angle:t*.002}));assert.equal(g.action,'turn');
 assert.equal(g.update(hand('twoDown'),420).candidate,'idle');assert.equal(trace(g,'twoDown',440,750).action,'idle');
 trace(g,'twoDown',770,1100,t=>({x:(t-750)*.0004}));assert.equal(g.action,'run');
 assert.equal(g.update(hand('one'),1120).candidate,'idle');assert.equal(trace(g,'one',1140,1500).action,'idle');
});
test('toward-camera swinging can drive running without wrist translation',()=>{
 const g=new GestureInterpreter();const result=trace(g,'twoDown',0,600,t=>({scale:1+.14*Math.sin(t/120)}));
 assert.equal(result.action,'run');
});
test('crouch needs downward fist; upward opening jumps once and held open never repeats',()=>{
 const g=new GestureInterpreter();assert.equal(trace(g,'fist',0,200).action,'idle');
 assert.equal(trace(g,'fist',220,440,t=>({y:(t-200)*.0002})).action,'crouch');
 let jumped=false;for(let t=460;t<=640;t+=20){const r=g.update(hand('open',{y:.048-(t-440)*.0004}),t);jumped||=r.action==='jump';}
 assert.ok(jumped);assert.equal(trace(g,'open',660,1600,()=>({y:-.032})).action,'idle');
});
test('palm rotation no longer drives all finger joints',()=>{
 const p=syntheticHand(0),base=calibration(p,false),r=.5;
 const rotated=p.map(v=>{const x=v.x-p[0].x,y=v.y-p[0].y;return {...v,x:p[0].x+x*Math.cos(r)-y*Math.sin(r),y:p[0].y+x*Math.sin(r)+y*Math.cos(r)};});
 const pose=mapPose(rotated,base,false,cfg.motion);for(const k of ['left','right','head','nod','chest'])assert.ok(Math.abs(pose[k])<1e-8,k);
});
test('IK holds ankles and horizontal soles for every action throughout its cycle',()=>{
 for(const action of Object.keys(ACTIONS))for(let t=0;t<2;t+=.013){const p=sampleAction(action,t);for(const side of ['left','right']){
  const ik=legIK(p.height,p[side+'FootY'],p[side+'FootZ']);
  const y=p.height-.27-.72*Math.cos(ik.hip)-.64*Math.cos(ik.hip+ik.knee);
  const z=-.72*Math.sin(ik.hip)-.64*Math.sin(ik.hip+ik.knee);
  assert.ok(Math.abs(y-p[side+'FootY'])<1e-6,`${action} ankle height`);assert.ok(Math.abs(z-p[side+'FootZ'])<1e-6);
  assert.ok(Math.abs(ik.hip+ik.knee+ik.ankle)<1e-9);assert.ok(y>=.2-1e-9);
 }}
});
test('director completes jump despite released input, does not repeat held command, and blends transitions',()=>{
 const d=new ActionDirector();d.update({action:'idle'},100);d.update({action:'jump'},120);
 assert.equal(d.update({action:'idle'},500).action,'jump');assert.ok(d.pose.height>1.8);
 assert.equal(d.update({action:'idle'},1600).action,'idle');
 d.update({action:'jump'},1700);for(let t=1720;t<3600;t+=20)d.update({action:'jump'},t);assert.equal(d.action,'idle');
 const before=d.pose.height;d.update({action:'crouch'},3620);assert.equal(d.pose.height,before);assert.ok(d.update({action:'crouch'},3820).height<1.25);assert.ok(Math.abs(d.update({action:'crouch'},4620).height-1.18)<.001);
});

test('sprint compresses then lunges, and has high cadence with genuine flight intervals',()=>{
 const prep=sampleAction('run',.12),sprint=sampleAction('run',.6);
 assert.ok(prep.height<1.35);assert.ok(sprint.rootZ>.65&&sprint.chest>.35);
 let contacts=0,airborne=0,previous=false;
 for(let t=1;t<2;t+=.002){const p=sampleAction('run',t),planted=p.leftFootY<=.201;
  if(planted&&!previous)contacts++;previous=planted;
  if(p.leftFootY>.22&&p.rightFootY>.22)airborne++;
 }
 assert.ok(contacts>=2);assert.ok(airborne>70);
});
test('spin leaps clear of the floor, completes a full turn, and lands before release takes effect',()=>{
 for(const direction of [-1,1]){
  const d=new ActionDirector();d.update({action:'idle'},100);const initial=d.yaw;
  d.update({action:'turn',direction},120);
  const airborne=d.update({action:'idle',direction:-direction},520);
  assert.equal(airborne.action,'turn');assert.ok(airborne.leftFootY>.8&&airborne.rightFootY>.8);
  const landed=d.update({action:'idle'},120+TURN_DURATION*1000+1);
  assert.equal(landed.action,'idle');assert.ok(Math.abs(landed.yaw-initial-direction*2*Math.PI)<1e-9);
  d.update({action:'idle'},1400);assert.ok(Math.abs(d.pose.leftFootY-.2)<1e-9);
 }
});
test('repeated spin cycle has no rotational snap at its boundary',()=>{
 const d=new ActionDirector();d.update({action:'turn'},100);
 const a=d.update({action:'turn'},1150),b=d.update({action:'turn'},1161);
 assert.ok(Math.abs(b.yaw-a.yaw)<.02);
 for(let t=1180;t<6000;t+=16){const p=d.update({action:'turn'},t);assert.ok(Object.values(p).filter(v=>typeof v==='number').every(Number.isFinite));}
});
