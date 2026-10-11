import test from 'node:test';
import assert from 'node:assert/strict';
import {SampleMatcher,validateLibrary,libraryRunTrigger} from '../src/gesture-samples.js';
import {hand} from './fixtures/gesture-hand.js';

const sample={action:'run',frames:Array.from({length:66},(_,i)=>({t:i*90,aspect:16/9,points:hand('open')}))};
function indexHand(t,amplitude=1){
 const p=hand('open'),bend=amplitude*(.5+.5*Math.sin(t/650*Math.PI*2));
 p[6].y+=.025*bend;p[7].y+=.085*bend;p[8].y+=.16*bend;
 return p;
}
function matcher(){return new SampleMatcher([sample],{runTrigger:'finger'});}

test('index articulation drives a still recorded hand shape, then stops within 400ms of stillness',()=>{
 for(const interval of [33,50,90]){
  const m=matcher();let active=0,total=0;
  for(let t=0;t<6000;t+=interval){const result=m.update(indexHand(t),t,16/9);if(t>1000){total++;active+=result.action==='run';}}
  assert.ok(active/total>.95,`${interval}ms: ${active}/${total}`);
  for(let t=6000;t<8000;t+=interval){const result=m.update(indexHand(6000),t,16/9);if(t>=6400)assert.equal(result.action,'idle');}
 }
});

test('stillness, tiny jitter, other fingers and whole-hand motion cannot start index-driven running',()=>{
 for(const kind of ['still','jitter','thumb','middle','whole']){
  const m=matcher();
  for(let t=0;t<5000;t+=50){
   let p=kind==='jitter'?indexHand(t,.025):hand('open');
   if(kind==='thumb')p[4].x+=.06*Math.sin(t/100);
   if(kind==='middle')p[12].y+=.12*Math.sin(t/100);
   if(kind==='whole'){
    const angle=.2*Math.sin(t/140),scale=1+.15*Math.sin(t/200),a=16/9;
    p=p.map(v=>{const x=(v.x-.5)*a,y=v.y-.8;return {x:.5+.1*Math.sin(t/120)+scale*(x*Math.cos(angle)-y*Math.sin(angle))/a,y:.8+scale*(x*Math.sin(angle)+y*Math.cos(angle)),z:v.z*scale};});
   }
   assert.equal(m.update(p,t,16/9).action,'idle',kind);
  }
 }
});

test('index-driven running requires its recorded supporting hand shape and fresh tracking',()=>{
 const m=matcher();
 for(let t=0;t<2000;t+=50){const p=hand('fist');p[8].y+=.15*Math.sin(t/120);assert.equal(m.update(p,t,16/9).action,'idle');}
 for(let t=2000;t<5000;t+=50)m.update(indexHand(t),t,16/9);
 assert.equal(m.result.action,'run');assert.equal(m.tick(5300).action,'idle');
 const restored=new SampleMatcher(validateLibrary(JSON.parse(JSON.stringify({version:2,runTrigger:'finger',samples:[sample]}))),{runTrigger:'finger'});
 for(let t=0;t<2000;t+=50)restored.update(indexHand(t),100000+t,16/9);
 assert.equal(restored.result.action,'run');
});

test('the old hold default migrates to index motion without changing samples or new explicit preferences',()=>{
 assert.equal(libraryRunTrigger({runTrigger:'pose'}),'finger');
 assert.equal(libraryRunTrigger({}),'finger');
 assert.equal(libraryRunTrigger({runTrigger:'motion'}),'motion');
 assert.equal(libraryRunTrigger({runControlVersion:2,runTrigger:'finger'}),'finger');
 assert.equal(libraryRunTrigger({runControlVersion:2,runTrigger:'pose'}),'pose');
});
