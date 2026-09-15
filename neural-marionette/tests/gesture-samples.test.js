import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureCapture,SampleMatcher,validateSample,validateLibrary} from '../src/gesture-samples.js';
import {hand} from './fixtures/gesture-hand.js';
function sample(action='run',kind='open',moving=true){return {action,frames:Array.from({length:32},(_,i)=>({t:i*50,aspect:16/9,points:hand(kind,{x:moving?.10*Math.sin(i*50/140):0})}))};}

test('capture requires actual complete frames, then produces a reviewable clip',()=>{
 const c=new GestureCapture();c.start('run',0);
 for(let t=0;t<=3600;t+=50)c.update(hand('open',{x:.1*Math.sin(t/140)}),t,16/9);
 assert.equal(c.state,'review');assert.equal(c.sample().frames.length,32);
 c.start('run',4000);c.tick(8000);assert.equal(c.state,'error');assert.throws(()=>c.sample());
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
