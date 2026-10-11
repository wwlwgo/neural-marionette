import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLocalGlb} from '../src/model-import.js';
import {REQUIRED_BONES} from '../src/model-rig.js';

test('shipped guardian GLB contains embedded textures, 15 bound joints and normalized weights',()=>{
 const file=readFileSync(new URL('../public/models/guardian-rigged.glb',import.meta.url));
 const buffer=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),view=new DataView(buffer);
 const json=validateLocalGlb(buffer),bin=20+view.getUint32(12,true)+8;
 assert.equal(json.skins.length,1);
 const names=json.skins[0].joints.map(i=>json.nodes[i].name);
 assert.deepEqual([...names].sort(),[...REQUIRED_BONES].sort());
 assert.ok(json.images.length>=2&&json.images.every(image=>image.bufferView!==undefined&&!image.uri));
 let triangles=0;
 for(const mesh of json.meshes)for(const primitive of mesh.primitives){
  triangles+=json.accessors[primitive.indices].count/3;
  const accessor=json.accessors[primitive.attributes.WEIGHTS_0],bv=json.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType,5126);assert.equal(accessor.type,'VEC4');
  for(let i=0;i<accessor.count;i++){
   let sum=0;
   for(let k=0;k<4;k++){const w=view.getFloat32(bin+(bv.byteOffset||0)+(accessor.byteOffset||0)+i*(bv.byteStride||16)+k*4,true);assert.ok(Number.isFinite(w)&&w>=0&&w<=1);sum+=w;}
   assert.ok(Math.abs(sum-1)<1e-5,`vertex ${i} has weight sum ${sum}`);
  }
 }
 assert.equal(triangles,100754);
});
