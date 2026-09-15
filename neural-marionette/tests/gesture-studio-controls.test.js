import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureStudio} from '../src/gesture-studio.js';
import {hand} from './fixtures/gesture-hand.js';

test('studio lets the mouse hand return during countdown; rejects empty captures and preserves saved samples',()=>{
  const previousDocument=globalThis.document,previousStorage=globalThis.localStorage;
  class Element{
    constructor(){this.value='';this.textContent='';this.disabled=false;this.children=[];}
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
    studio.draw=()=>{}; // Canvas painting is independent of these control-state checks.
    const refresh=()=>{studio.lastUI=-Infinity;studio.tick(performance.now());};
    refresh();assert.equal(get('learn-record').disabled,true);
    mode='loading';refresh();assert.equal(get('learn-record').disabled,true);assert.equal(get('learn-connect').disabled,true);
    mode='camera';refresh();
    assert.equal(get('learn-record').disabled,false);assert.match(get('learn-readiness').textContent,/尚未看到完整手掌/);
    get('learn-record').onclick();assert.equal(studio.capture.state,'countdown');refresh();
    assert.equal(get('learn-record').disabled,true);assert.equal(get('learn-action').disabled,true);
    const begin=studio.capture.begin;get('learn-record').onclick();assert.equal(studio.capture.begin,begin);
    // No hand was present at click time. Valid input arrives when countdown ends.
    for(let t=begin;t<studio.capture.end;t+=50)studio.ingest(hand('open'),t,16/9);
    studio.tick(studio.capture.end+1);assert.equal(studio.capture.state,'review');
    assert.equal(get('learn-save').disabled,false);
    studio.save();assert.equal(studio.samples.length,1);assert.equal(studio.mode,'hybrid');
    const saved=storage.get('nm-personal-gestures-v1');
    studio.lastSeen=-Infinity;refresh();get('learn-record').onclick();
    studio.lastUI=-Infinity;studio.tick(studio.capture.end+1);
    assert.equal(studio.capture.state,'error');assert.equal(get('learn-save').disabled,true);
    assert.match(get('learn-status').textContent,/手掌/);
    assert.equal(storage.get('nm-personal-gestures-v1'),saved);
    refresh();assert.equal(get('learn-record').disabled,false);
    get('learn-record').onclick();mode='off';studio.stop();refresh();
    assert.equal(studio.capture.state,'idle');assert.equal(get('learn-record').disabled,true);
    assert.equal(get('learn-connect').disabled,false);assert.equal(storage.get('nm-personal-gestures-v1'),saved);
  }finally{
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
    if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;
  }
});
