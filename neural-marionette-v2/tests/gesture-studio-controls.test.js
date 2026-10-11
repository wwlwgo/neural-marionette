import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureStudio} from '../src/gesture-studio.js';
import {hand} from './fixtures/gesture-hand.js';

test('studio capture, safe replacement, and persisted run-trigger controls survive reload and import',async()=>{
  const previousDocument=globalThis.document,previousStorage=globalThis.localStorage;
  class Element{
    constructor(){this.value='';this.textContent='';this.disabled=false;this.children=[];}
    setAttribute(key,value){this[key]=value;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
  }
  const elements=new Map(),storage=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  globalThis.document={getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]};
  globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  try{
    let mode='off';
    const studio=new GestureStudio({getMode:()=>mode,video:{},connect:()=>{},download:()=>{}});
    assert.equal(studio.runTrigger,'finger','UI defaults to moving the index finger, not holding the pose');
    studio.draw=()=>{}; // Canvas painting is independent of these control-state checks.
    const refresh=()=>{studio.lastUI=-Infinity;studio.tick(performance.now());};
    refresh();assert.equal(get('learn-record').disabled,true);
    mode='loading';refresh();assert.equal(get('learn-record').disabled,true);assert.equal(get('learn-connect').disabled,true);
    mode='camera';refresh();assert.equal(get('learn-record').disabled,true);studio.setEditing(true);refresh();
    assert.equal(get('learn-record').disabled,false);assert.match(get('learn-readiness').textContent,/尚未看到完整手掌/);
    get('learn-record').onclick();assert.equal(studio.capture.state,'countdown');refresh();
    assert.equal(get('learn-record').disabled,true);assert.equal(get('learn-action').disabled,true);
    const ready=studio.capture.readyAt;get('learn-record').onclick();assert.equal(studio.capture.readyAt,ready);
    // No hand was present at click time. Valid input arrives when countdown ends.
    for(let t=ready;t<=ready+300;t+=50)studio.ingest(hand('open'),t,16/9);
    const begin=studio.capture.begin;
    for(let t=begin+50;t<studio.capture.end;t+=50)studio.ingest(hand('open',{x:.1*Math.sin(t/140)}),t,16/9);
    studio.tick(studio.capture.end+1);assert.equal(studio.capture.state,'review');
    assert.equal(get('learn-save').disabled,false);
    studio.save();assert.equal(studio.samples.length,1);assert.equal(studio.mode,'hybrid');
    assert.equal(studio.editing,true,'Saving keeps control paused until explicit return');
    const saved=storage.get('nm-personal-gestures-v1');
    studio.lastSeen=-Infinity;refresh();get('learn-record').onclick();
    studio.lastUI=-Infinity;studio.tick(studio.capture.readyAt+10001);
    assert.equal(studio.capture.state,'error');assert.equal(get('learn-save').disabled,true);
    assert.match(get('learn-status').textContent,/手部/);
    assert.equal(storage.get('nm-personal-gestures-v1'),saved);
    refresh();assert.equal(get('learn-record').disabled,false);
    get('learn-record').onclick();mode='off';studio.stop();refresh();
    assert.equal(studio.capture.state,'idle');assert.equal(get('learn-record').disabled,true);
    assert.equal(get('learn-connect').disabled,false);assert.equal(storage.get('nm-personal-gestures-v1'),saved);

    // Replacement is committed only after validation and a successful write.
    const run=studio.samples[0],idle={...structuredClone(run),action:'idle',frames:run.frames.map(f=>({...f,points:hand('fist')}))};
    studio.samples=[run,{...structuredClone(run),id:'run-2'},{...structuredClone(run),id:'run-3'},idle];
    studio.persist(studio.samples);studio.matcher.setSamples(studio.samples);
    const beforeReplacement=storage.get('nm-personal-gestures-v1');
    get('learn-replace').checked=true;mode='camera';get('learn-record').onclick();
    assert.equal(studio.capture.state,'countdown','Replacement can be recorded even with three old samples');
    get('learn-cancel').onclick();assert.equal(storage.get('nm-personal-gestures-v1'),beforeReplacement);
    studio.capture.state='review';studio.capture.action='run';studio.capture.frames=structuredClone(run.frames);
    const persist=globalThis.localStorage.setItem;
    globalThis.localStorage.setItem=()=>{throw new Error('storage full');};
    studio.save();assert.equal(studio.samples.length,4);assert.equal(studio.capture.state,'review');
    assert.equal(storage.get('nm-personal-gestures-v1'),beforeReplacement);
    globalThis.localStorage.setItem=persist;studio.save();
    assert.equal(studio.samples.length,2);assert.equal(studio.samples.filter(s=>s.action==='run').length,1);
    assert.equal(studio.samples.find(s=>s.action==='idle'),idle,'Other action bindings stay intact');
    assert.equal(get('learn-replace').checked,false);assert.equal(studio.capture.state,'idle');

    const beforeModeChange=JSON.stringify(studio.samples);
    get('learn-run-trigger').value='motion';get('learn-run-trigger').onchange();
    assert.equal(studio.matcher.runTrigger,'motion');
    let exported;
    const restored=new GestureStudio({getMode:()=>mode,video:{},connect:()=>{},download:blob=>{exported=blob;}});
    assert.equal(restored.runTrigger,'motion');assert.equal(get('learn-run-trigger').value,'motion');
    get('learn-run-trigger').value='pose';get('learn-run-trigger').onchange();
    assert.equal(restored.matcher.runTrigger,'pose');assert.equal(JSON.stringify(restored.samples),beforeModeChange);
    get('learn-export').onclick();const exportedData=JSON.parse(await exported.text());
    assert.equal(exportedData.runTrigger,'pose');assert.deepEqual(exportedData.samples,restored.samples);
    get('learn-run-trigger').value='motion';get('learn-run-trigger').onchange();
    await get('learn-import').onchange({target:{files:[exported],value:'test.json'}});
    assert.equal(restored.runTrigger,'pose');assert.equal(restored.matcher.runTrigger,'pose');
    const reopened=new GestureStudio({getMode:()=>mode,video:{},connect:()=>{},download:()=>{}});
    assert.equal(reopened.runTrigger,'pose');assert.equal(JSON.stringify(reopened.samples),beforeModeChange);
    globalThis.localStorage.setItem=()=>{throw new Error('storage full');};
    get('learn-run-trigger').value='motion';get('learn-run-trigger').onchange();
    assert.equal(reopened.runTrigger,'pose');assert.equal(get('learn-run-trigger').value,'pose');
    globalThis.localStorage.setItem=persist;
  }finally{
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
    if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;
  }
});


test('recording workspace gates capture, preview, sample recognition and control independently',()=>{
 const oldDocument=globalThis.document,oldStorage=globalThis.localStorage;
 class Element{
  constructor(){this.value='';this.children=[];this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this[key]=value;}
 }
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 globalThis.document={getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]};
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 try{
  let transitions=0,draws=0,captures=0,matches=0;
  const studio=new GestureStudio({getMode:()=> 'camera',video:{},connect:()=>{},download:()=>{},onWorkspaceChange:()=>transitions++});
  studio.draw=()=>draws++;
  const captureUpdate=studio.capture.update.bind(studio.capture);studio.capture.update=(...args)=>{captures++;return captureUpdate(...args);};
  studio.matcher.update=()=>matches++;
  studio.samples=[{action:'run',frames:[{t:0},{t:1200}]}];studio.mode='hybrid';
  studio.ingest(hand('open'),100,16/9);studio.tick(100);
  assert.equal(matches,1);assert.equal(captures,0);assert.equal(draws,0);
  assert.equal(studio.intent({action:'load'},100).action,'load');
  studio.setEditing(true);assert.equal(get('main-view').hidden,true);assert.equal(get('learn-panel').hidden,false);
  studio.ingest(hand('open'),200,16/9);studio.tick(200);
  assert.equal(matches,1,'Sample recognition must stop while recording workspace is open');
  assert.equal(captures,1);assert.equal(draws,1);assert.equal(studio.capture.frames.length,0,'Preview alone does not record');
  assert.equal(studio.intent({action:'run'},200).action,'idle');
  get('learn-record').onclick();assert.equal(studio.capture.state,'countdown');
  studio.setEditing(false);assert.equal(studio.capture.state,'idle');assert.equal(studio.raw,null);
  assert.equal(get('main-view').hidden,false);assert.equal(get('learn-panel').hidden,true);
  studio.ingest(hand('open'),300,16/9);studio.tick(300);
  assert.equal(matches,2);assert.equal(captures,1);assert.equal(draws,1);assert.equal(transitions,2);
  assert.equal(studio.samples.length,1,'Leaving recording preserves saved bindings');
  // Removing the last sample must not leave an empty personal-only route active.
  studio.mode='personal';studio.renderLibrary();
  const runRow=get('learn-library').children[1];runRow.children.find(c=>c.textContent.startsWith('移除')).onclick();
  assert.equal(studio.mode,'rules');assert.equal(get('learn-mode').value,'rules');
  assert.equal(studio.intent({action:'run'},400).action,'run');
 }finally{
  if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;
 }
});
