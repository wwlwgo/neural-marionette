import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureInterpreter} from '../src/actions.js';
import {runSupport,middleFingerMotion} from '../src/run-gesture.js';
import {hand,orientHand} from './fixtures/gesture-hand.js';
const bends=(t,period=750,offsets=[0,0,0])=>offsets.map(o=>.5+.5*Math.sin(t/period*Math.PI*2+o));

test('three-finger motion survives extension/flexion, asynchronous fingers, palm-down and back-facing orientations',()=>{
 for(const pitch of [0,.9,Math.PI/2,Math.PI])for(const mirror of [false,true])for(const interval of [33,90]){
  const g=new GestureInterpreter();let run=0,total=0;
  const pose=t=>orientHand(hand('run',{middleBend:bends(t,900,[0,.7,1.4])}),{pitch,mirror,roll:.2,yaw:.4});
  for(let t=0;t<5000;t+=interval){const r=g.update(pose(t),t);if(t>900){total++;run+=r.action==='run';}}
  assert.ok(run/total>.94,`${pitch}, ${mirror}, ${interval}: ${run}/${total}`);
  for(let t=5000;t<6000;t+=interval){const r=g.update(pose(5000),t);if(t>=5500)assert.equal(r.action,'idle');}
 }
});

test('rigid whole-hand rotations and translation, a single moving finger, or tiny three-finger jitter cannot start sprint',()=>{
 for(const variant of ['rigid','index','middle','ring','jitter']){
  const g=new GestureInterpreter();
  for(let t=0;t<4000;t+=50){
   const b=bends(t),values=variant==='jitter'?b.map(v=>.5+.02*v):[.5,.5,.5];
   if(['index','middle','ring'].includes(variant)){const i=['index','middle','ring'].indexOf(variant);values[i]=b[i];}
   const pose=hand('run',{middleBend:values});
   const p=variant==='rigid'?orientHand(pose,{pitch:t/1800,yaw:.6*Math.sin(t/900),roll:t/2100,scale:1+.15*Math.sin(t/450),shift:.08*Math.sin(t/600)}):pose;
   assert.notEqual(g.update(p,t).action,'run',variant);
  }
 }
});

test('depth-only finger motion is retained; changing the outer supporting fingers stops the action',()=>{
 const frames=[];const g=new GestureInterpreter();
 for(let t=0;t<2000;t+=50){
  const p=hand('open');
  for(const m of [5,9,13])for(let j=1;j<=3;j++)p[m+j].z=.025*j*Math.sin(t/140);
  frames.push({points:p,t,aspect:16/9});g.update(p,t);
 }
 assert.ok(middleFingerMotion(frames,1950).movingCount>=2);
 assert.equal(g.action,'run');
 const folded=hand('fist');assert.equal(g.update(folded,2000).action,'idle');
 assert.equal(runSupport(folded).runPose,false);
});

test('two fingers can corroborate movement when the third is less visible, but removing the hand always stops',()=>{
 const g=new GestureInterpreter();
 for(let t=0;t<3000;t+=50)g.update(hand('run',{middleBend:[...bends(t).slice(0,2),.5]}),t);
 assert.equal(g.action,'run');assert.equal(g.tick(3300).action,'idle');
});
