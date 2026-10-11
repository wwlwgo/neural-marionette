import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureCapture,SampleMatcher,validateSample,validateLibrary,checkSampleBindings} from '../src/gesture-samples.js';
import {hand} from './fixtures/gesture-hand.js';
function sample(action='run',kind='open',moving=true){return {action,frames:Array.from({length:32},(_,i)=>({t:i*50,aspect:16/9,points:hand(kind,{x:moving?.10*Math.sin(i*50/140):0})}))};}

test('capture requires actual complete frames, then produces a reviewable clip',()=>{
 const c=new GestureCapture();c.start('run',0);
 for(let t=0;t<=9000;t+=50)c.update(hand('open',{x:.1*Math.sin(t/140)}),t,16/9);
 assert.equal(c.state,'review');assert.equal(c.sample().frames.length,60);assert.equal(c.end-c.begin,6000);
 c.start('run',4000);c.tick(18000);assert.equal(c.state,'error');assert.throws(()=>c.sample());
});
test('tracking gap, malformed import, nonfinite points and too many samples are rejected',()=>{
 const s=sample();s.frames.splice(8,7);assert.throws(()=>validateSample(s),/丢失/);
 const invalid=sample();invalid.frames[5].points[8].x=NaN;assert.throws(()=>validateSample(invalid));
 assert.throws(()=>validateLibrary({version:5,samples:[]}));
 assert.throws(()=>validateLibrary({version:1,samples:Array.from({length:4},()=>sample())}));
});
test('a user-recorded open-palm movement can mean run without matching the built-in finger rule',()=>{
 const matcher=new SampleMatcher([sample()]);let matched=false;
 for(let t=0;t<2500;t+=50){const r=matcher.update(hand('open',{x:.10*Math.sin(t/160)+.06}),t,16/9);matched||=r.action==='run';}
 assert.ok(matched);
 assert.equal(matcher.tick(2800).action,'idle');
});
test('a stationary copy of a dynamic sample and unrelated fists do not trigger it',()=>{
 for(const kind of ['open','fist']){const m=new SampleMatcher([sample()]);for(let t=0;t<2400;t+=50)assert.equal(m.update(hand(kind),t,16/9).action,'idle');}
});
test('two actions with identical demonstrations reject as ambiguous',()=>{
 const a=sample(),b=structuredClone(a);b.action='turn';const m=new SampleMatcher([a,b]);let ambiguous=false;
 for(let t=0;t<2500;t+=50){const r=m.update(hand('open',{x:.10*Math.sin(t/140)}),t,16/9);assert.equal(r.action,'idle');ambiguous||=r.ambiguous;}
 assert.ok(ambiguous);
});
test('static hand poses can be recorded, and restored samples behave identically',()=>{
 const s=sample('load','pinch',false),restored=validateLibrary(JSON.parse(JSON.stringify({version:1,samples:[s]}))),m=new SampleMatcher(restored);
 for(let t=0;t<1800;t+=50)m.update(hand('pinch',{x:.03}),t,16/9);
 assert.equal(m.result.action,'load');
});
test('a still neutral sample can coexist with movement using the same open hand',()=>{
 const m=new SampleMatcher([sample(),sample('idle','open',false)]);let runFrames=0;
 for(let t=0;t<3000;t+=50)if(m.update(hand('open',{x:.1*Math.sin(t/160)}),t,16/9).action==='run')runFrames++;
 assert.ok(runFrames>25);
 for(let t=3000;t<6000;t+=50)m.update(hand('open'),t,16/9);
 assert.equal(m.result.action,'idle');
});

// Thumb and pinky stay apart; only the middle three fingers flex. The wrist
// stays still, so recognizing this cannot depend on whole-hand translation.
function paddle(t,{period=650,phase=0,amplitude=1,offset=0}={}){
 const p=hand('open',{x:offset});
 const bend=.5+amplitude*.5*Math.sin(t/period*Math.PI*2+phase);
 for(const m of [5,9,13]){
   p[m+2].y=.49+.07*bend;p[m+3].y=.53+.16*bend;
   p[m+2].z=-.035*bend;p[m+3].z=-.07*bend;
 }
 return p;
}
function paddleSample(){return {action:'run',frames:Array.from({length:100},(_,i)=>({t:i*60,aspect:16/9,points:paddle(i*60)}))};}
function variedPaddle(t,angle,drift=0){
 return paddle(t).map(p=>{const dx=p.x-.5,dy=p.y-.8;return {x:.5+drift+dx*Math.cos(angle)-dy*Math.sin(angle),y:.7+dx*Math.sin(angle)+dy*Math.cos(angle),z:p.z};});
}
function variedSample(){return {action:'run',frames:Array.from({length:66},(_,i)=>({t:i*90,aspect:16/9,points:variedPaddle(i*90,-.5+i/65,-.2+.4*i/65)}))};}

test('countdown and waiting do not consume the six seconds of recording',()=>{
 const c=new GestureCapture();c.start('run',0);
 for(let t=0;t<=5000;t+=50)c.update(null,t,16/9);
 assert.equal(c.state,'waiting');assert.equal(c.frames.length,0);assert.equal(c.begin,null);
 for(let t=5050;t<=5350;t+=50)c.update(paddle(t),t,16/9);
 assert.equal(c.state,'recording');assert.equal(c.begin,5350);assert.equal(c.end,11350);
 for(let t=5400;t<=11350;t+=50)c.update(paddle(t),t,16/9);
 assert.equal(c.state,'review');assert.ok(c.sample().frames.at(-1).t>5800);
});
test('long recordings allow early finish, retain old imports, and reject still run samples',()=>{
 const c=new GestureCapture();c.start('run',0,8000);
 for(let t=0;t<=4500;t+=50)c.update(paddle(t),t,16/9);
 assert.equal(c.finish(4500),true);assert.equal(c.state,'review');assert.equal(c.end-c.begin,1500);
 assert.equal(validateLibrary({version:1,samples:[sample()]}).length,1);
 assert.equal(validateLibrary({version:2,samples:[paddleSample()]}).length,1);
 c.start('run',10000,4000);for(let t=10000;t<=17000;t+=50)c.update(hand('open'),t,16/9);
 assert.equal(c.state,'error');assert.match(c.error,/几乎没有运动/);
});
test('three-finger flexing sustains running across phases, tempo changes and short missing frames',()=>{
 for(const phase of [0,1.2,3.1]){
  const m=new SampleMatcher([paddleSample()]);let matched=0,total=0,longestMiss=0,miss=0;
  for(let t=0;t<12000;t+=50){
   const missing=t%2300===0;
   const r=m.update(missing?null:paddle(t,{phase,period:t<6000?800:550,amplitude:.8,offset:.05}),t,16/9);
   if(t>1500){total++;if(r.action==='run'){matched++;miss=0;}else{miss+=50;longestMiss=Math.max(longestMiss,miss);}}
  }
  assert.ok(matched/total>.95,`phase ${phase}: ${matched}/${total}, gap ${longestMiss}ms`);
  assert.ok(longestMiss<300,`longest dropout ${longestMiss}ms`);
  for(let t=12000;t<=12800;t+=50)m.update(paddle(12000),t,16/9);
  assert.equal(m.result.action,'idle','stop within 800ms of stillness');
 }
});
test('a moving fist, pinch, open palm and tiny finger jitter cannot substitute for recorded flexing',()=>{
 for(const kind of ['fist','pinch','open','jitter']){
  const m=new SampleMatcher([paddleSample()]);
  for(let t=0;t<4000;t+=50){
   const p=kind==='jitter'?paddle(t,{amplitude:.03}):hand(kind,{x:.12*Math.sin(t/150)});
   assert.equal(m.update(p,t,16/9).action,'idle',kind);
  }
 }
});
test('a new hand pose or lost tracking releases a previously active run',()=>{
 for(const kind of ['fist','pinch',null]){
  const m=new SampleMatcher([paddleSample()]);
  for(let t=0;t<3000;t+=50)m.update(paddle(t),t,16/9);
  assert.equal(m.result.action,'run');
  for(let t=3000;t<=3700;t+=50)m.update(kind?hand(kind):null,t,16/9);
  assert.equal(m.result.action,'idle');
 }
});

test('saved running samples retain cold-start recognition after JSON restore and a new session clock',()=>{
 const original=[paddleSample()],restored=validateLibrary(JSON.parse(JSON.stringify({version:2,samples:original})));
 assert.deepEqual(checkSampleBindings(original),checkSampleBindings(restored));
 assert.equal(checkSampleBindings(restored)[0].matched,true);
 const a=new SampleMatcher(original),b=new SampleMatcher(restored);
 for(let t=0;t<6000;t+=50){
  const p=paddle(t,{phase:1.2,period:800});
  assert.deepEqual(a.update(p,t+50000,16/9),b.update(p,t,16/9));
 }
 assert.equal(b.result.action,'run');
 b.reset();
 for(let t=0;t<3000;t+=50)b.update(paddle(t),t+90000,16/9);
 assert.equal(b.result.action,'run','reconnecting must not require a new recording');
 for(let t=93000;t<95000;t+=50)b.update(paddle(3000),t,16/9);
 assert.equal(b.result.reason,'motion');
 for(let t=95000;t<97000;t+=50)b.update(hand('fist'),t,16/9);
 assert.equal(b.result.reason,'pose');
});

test('a long recording with gradual wrist rotation and drift recognizes its local variations on a fresh start',()=>{
 const restored=validateLibrary(JSON.parse(JSON.stringify({version:2,samples:[variedSample()]})));
 assert.ok(checkSampleBindings(restored)[0].ratio>.95,'most of the actual demonstration should recognize itself');
 for(const angle of [-.5,0,.5]){
  const m=new SampleMatcher(restored);let matches=0,total=0;
  assert.ok(m.templates[0].runProfiles.length<=10,'template work is bounded for long recordings');
  for(let t=0;t<6000;t+=90){
   const result=m.update(variedPaddle(t+250,angle,.06),t,16/9);
   if(t>=1200){total++;if(result.action==='run')matches++;}
  }
  assert.ok(matches/total>.95,`angle ${angle}: ${matches}/${total}`);
 }
});

test('local variations do not keep running on a held pose or replace it with a fist or pinch',()=>{
 for(const kind of ['still','fist','pinch']){
  const m=new SampleMatcher([variedSample()]);
  for(let t=0;t<3000;t+=90)m.update(variedPaddle(t,-.5),t,16/9);
  assert.equal(m.result.action,'run');
  for(let t=3000;t<6000;t+=90){
   const p=kind==='still'?variedPaddle(3000,-.5):hand(kind,{x:.1*Math.sin(t/140)});
   const result=m.update(p,t,16/9);
   if(t>=3900)assert.equal(result.action,'idle',kind);
  }
 }
});

test('pose-triggered running survives a held shape, releases on another shape or tracking loss, and restores',()=>{
 const sample= {action:'run',frames:Array.from({length:66},(_,i)=>({t:i*90,aspect:16/9,points:hand('twoDown',{x:i<10?.001*i:.01})}))};
 const data=JSON.parse(JSON.stringify({version:2,runTrigger:'pose',samples:[sample]})),saved=JSON.stringify(data);
 for(const change of ['fist','pinch','open',null]){
  const m=new SampleMatcher(validateLibrary(data),{runTrigger:data.runTrigger});
  for(let t=0;t<6000;t+=80){const r=m.update(hand('twoDown',{x:.06}),t,16/9);if(t>=1200)assert.equal(r.action,'run');}
  for(let t=6000;t<8000;t+=80){const r=m.update(change?hand(change):null,t,16/9);if(t>=6800)assert.equal(r.action,'idle',change);}
 }
 assert.equal(JSON.stringify(data),saved,'replaying and selecting a mode never mutates sample points');
 assert.ok(checkSampleBindings(data.samples,.28,{runTrigger:'pose'})[0].ratio>.95);
 assert.throws(()=>validateLibrary({...data,runTrigger:'unknown'}),/触发方式/);
});

test('pose mode accepts a still run recording while motion mode still requires movement',()=>{
 const capture=new GestureCapture();capture.start('run',0,4000,{runTrigger:'pose'});
 for(let t=0;t<=7000;t+=50)capture.update(hand('twoDown'),t,16/9);
 assert.equal(capture.state,'review');assert.equal(capture.sample().action,'run');
 capture.start('run',10000,4000,{runTrigger:'motion'});
 for(let t=10000;t<=17000;t+=50)capture.update(hand('twoDown'),t,16/9);
 assert.equal(capture.state,'error');assert.match(capture.error,/几乎没有运动/);
});
