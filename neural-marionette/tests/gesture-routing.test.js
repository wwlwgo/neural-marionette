import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveGestureIntent as resolve} from '../src/gesture-samples.js';
const samples=[{action:'run'}], idle={action:'idle'};
test('recorded run wins in hybrid mode and retains matching metadata',()=>{
 assert.deepEqual(resolve('hybrid',samples,{action:'run',recognitionMs:120},{action:'turn'}),{action:'run',recognitionMs:120,source:'sample'});
});
test('all unrecorded actions retain original rules and motion parameters',()=>{
 for(const action of ['turn','load','crouch','jump','idle']){
  const fallback={action,direction:-1,strength:.8};
  assert.deepEqual(resolve('hybrid',samples,idle,fallback),{...fallback,source:'rules'});
 }
});
test('a recorded action cannot be accidentally activated by its old rule',()=>{
 assert.deepEqual(resolve('hybrid',samples,idle,{action:'run'}),{action:'idle',source:'none'});
});
test('neutral sample does not block original gestures for unbound actions',()=>{
 assert.equal(resolve('hybrid',[...samples,{action:'idle'}],idle,{action:'load'}).action,'load');
});
test('strict personal and rules modes remain available',()=>{
 assert.equal(resolve('personal',samples,idle,{action:'turn'}).action,'idle');
 assert.equal(resolve('rules',samples,{action:'run'},{action:'turn'}).action,'turn');
});
test('hybrid mode with an empty library uses all original rules',()=>{
 assert.equal(resolve('hybrid',[],idle,{action:'run'}).action,'run');
});
