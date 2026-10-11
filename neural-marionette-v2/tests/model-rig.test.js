import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {inspectModel,ModelRig,REQUIRED_BONES} from '../src/model-rig.js';
import {validateLocalGlb} from '../src/model-import.js';

function fixture({prefix='',scale=1}={}){
 const scene=new THREE.Group();scene.scale.setScalar(scale);const bones={};
 function b(name,parent,p,rot=[0,0,0]){const o=new THREE.Bone();o.name=prefix+name;o.position.set(...p);o.rotation.set(...rot);parent.add(o);bones[name]=o;return o;}
 const root=b('Root',scene,[0,1.65,0]),chest=b('Chest',root,[0,.33,0]);b('Head',chest,[0,1.13,0]);
 for(const [s,k]of [['Left',1],['Right',-1]]){const a=b(s+'UpperArm',chest,[k*.68,.78,0],[0,0,k*.26]);const e=b(s+'LowerArm',a,[0,-.78,0],[-.16,0,0]);b(s+'Hand',e,[0,-.64,0]);const l=b(s+'UpperLeg',root,[k*.29,-.27,0]);const n=b(s+'LowerLeg',l,[0,-.72,0]);b(s+'Foot',n,[0,-.64,0]);}
 const geometry=new THREE.BoxGeometry(1,3.9,1);const count=geometry.attributes.position.count;
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());scene.add(mesh);scene.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(Object.values(bones)));return {scene,bones,mesh};
}
test('detects a complete bound humanoid and accepts Mixamo prefix',()=>{const f=fixture({prefix:'mixamorig:'});const {report}=inspectModel(f.scene);assert.equal(report.compatible,true);assert.equal(report.bones.length,REQUIRED_BONES.length);assert.equal(report.triangles,12);});
test('rejects static GLB, missing joints and unbound decorative bones',()=>{const f=fixture();f.bones.LeftHand.name='unknown';assert.deepEqual(inspectModel(f.scene).report.missing,['LeftHand']);const fake=new THREE.Bone();fake.name='LeftHand';f.scene.add(fake);assert.equal(inspectModel(f.scene).report.compatible,false);assert.equal(inspectModel(new THREE.Group()).report.compatible,false);});
test('world-space retarget preserves bind axes and scales root motion correctly',()=>{
 const source=fixture(),target=fixture({scale:.01});
 target.bones.LeftLowerArm.rotation.y=.7;target.scene.updateMatrixWorld(true);target.mesh.bind(new THREE.Skeleton(Object.values(target.bones)));
 const rig=new ModelRig(target.scene,source.bones),rest=target.bones.LeftLowerArm.getWorldQuaternion(new THREE.Quaternion());
 source.bones.LeftLowerArm.rotation.x+=.4;source.scene.updateMatrixWorld(true);rig.update();
 const sourceRest=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,.26)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.16,0,0)));
 const expected=source.bones.LeftLowerArm.getWorldQuaternion(new THREE.Quaternion()).multiply(sourceRest.invert()).multiply(rest);
 assert.ok(target.bones.LeftLowerArm.getWorldQuaternion(new THREE.Quaternion()).angleTo(expected)<1e-6);
 const before=rig.point('Root');source.bones.Root.position.x+=.5;source.bones.Root.position.y+=.7;source.scene.updateMatrixWorld(true);rig.update();const after=rig.point('Root');assert.ok(Math.abs(after.x-before.x-.5)<1e-6);assert.ok(Math.abs(after.y-before.y-.7)<1e-6);
 for(let i=0;i<100;i++)rig.update();assert.ok(rig.point('Root').distanceTo(after)<1e-6);rig.dispose();
});
function glb(json){const text=new TextEncoder().encode(JSON.stringify(json)),len=Math.ceil(text.length/4)*4,out=new ArrayBuffer(20+len),v=new DataView(out);[0x46546c67,2,20+len,len,0x4e4f534a].forEach((n,i)=>v.setUint32(i*4,n,true));new Uint8Array(out,20).fill(32);new Uint8Array(out,20,text.length).set(text);return out;}
test('local GLB validation blocks external resources and unsupported compression',()=>{assert.throws(()=>validateLocalGlb(new ArrayBuffer(10)));assert.throws(()=>validateLocalGlb(glb({images:[{uri:'https://example.com/a.png'}]})),/外部/);assert.throws(()=>validateLocalGlb(glb({extensionsRequired:['KHR_draco_mesh_compression']})),/压缩/);assert.deepEqual(validateLocalGlb(glb({asset:{version:'2.0'}})),{asset:{version:'2.0'}});});
test('retarget keeps lowest ankle height with unequal source and target leg proportions',()=>{
 const source=fixture(),target=fixture();
 for(const side of ['Left','Right']){target.bones[side+'LowerLeg'].position.y=-1;target.bones[side+'Foot'].position.y=-1.1;}
 target.scene.updateMatrixWorld(true);target.mesh.bind(new THREE.Skeleton(Object.values(target.bones)));
 const rig=new ModelRig(target.scene,source.bones);
 for(const amount of [0,.25,.6,1]){
  source.bones.Root.position.y=1.65-amount*.5;
  for(const side of ['Left','Right']){source.bones[side+'UpperLeg'].rotation.x=-amount;source.bones[side+'LowerLeg'].rotation.x=amount*2;}
  source.scene.updateMatrixWorld(true);rig.update();
  const sourceFloor=Math.min(...['Left','Right'].map(side=>source.bones[side+'Foot'].getWorldPosition(new THREE.Vector3()).y));
  const targetFloor=Math.min(rig.point('LeftFoot').y,rig.point('RightFoot').y);
  assert.ok(Math.abs(targetFloor-(rig.targetFootRest+sourceFloor-rig.sourceFootRest))<1e-6);
 }
 rig.dispose();
});
