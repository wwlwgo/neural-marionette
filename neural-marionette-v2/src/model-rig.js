import * as THREE from 'three';

const aliases={
 Root:['hips','pelvis','root'],Chest:['spine2','chest','upperchest','spine1','spine'],Head:['head'],
 LeftUpperArm:['leftarm','leftupperarm','upperarml','arml'],RightUpperArm:['rightarm','rightupperarm','upperarmr','armr'],
 LeftLowerArm:['leftforearm','leftlowerarm','lowerarml','forearml'],RightLowerArm:['rightforearm','rightlowerarm','lowerarmr','forearmr'],
 LeftHand:['lefthand','handl'],RightHand:['righthand','handr'],
 LeftUpperLeg:['leftupleg','leftupperleg','thighl'],RightUpperLeg:['rightupleg','rightupperleg','thighr'],
 LeftLowerLeg:['leftleg','leftlowerleg','calfl','shinl'],RightLowerLeg:['rightleg','rightlowerleg','calfr','shinr'],
 LeftFoot:['leftfoot','footl'],RightFoot:['rightfoot','footr'],
};
export const REQUIRED_BONES=Object.keys(aliases);
const normalize=name=>name.toLowerCase().replace(/^.*mixamorig[:_]?/,'').replace(/[^a-z0-9]/g,'');

export function inspectModel(scene){
 const bones=[],meshes=[];scene.traverse(o=>{if(o.isBone)bones.push(o);if(o.isMesh)meshes.push(o);});
 const mapping={};const duplicateNames=[];
 for(const [key,names] of Object.entries(aliases)){
  for(const name of names){const matches=bones.filter(b=>normalize(b.name)===name);if(matches.length>1)duplicateNames.push(name);if(matches.length===1){mapping[key]=matches[0];break;}}
 }
 const skinned=meshes.filter(m=>m.isSkinnedMesh&&m.geometry.attributes.skinIndex&&m.geometry.attributes.skinWeight);
 const bound=new Set(skinned.flatMap(m=>m.skeleton.bones));
 const missing=REQUIRED_BONES.filter(k=>!mapping[k]||!bound.has(mapping[k]));
 const triangles=meshes.reduce((n,m)=>n+Math.floor((m.geometry.index?.count??m.geometry.attributes.position?.count??0)/3),0);
 const fingers=bones.filter(b=>/thumb|index|middle|ring|pinky|little/i.test(b.name));
 return {mapping,report:{triangles,meshes:meshes.length,skinnedMeshes:skinned.length,bones:bones.map(b=>b.name),fingerBones:fingers.map(b=>b.name),missing,duplicateNames,compatible:skinned.length>0&&missing.length===0&&duplicateNames.length===0}};
}

// Transfer rotations in world space: copying local Euler angles between rigs with
// different bind axes twists limbs. Each rig retains its own bind orientation.
export class ModelRig {
 constructor(scene,source){
  scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.pose();o.frustumCulled=false;}});
  scene.updateMatrixWorld(true);
  const {mapping,report}=inspectModel(scene);this.report=report;
  if(!report.compatible)throw new Error(!report.skinnedMeshes?'这个 GLB 没有蒙皮骨架，请先完成骨骼与蒙皮再导出。':`骨骼无法自动匹配：${report.missing.join('、')||report.duplicateNames.join('、')}。需针对这份模型配置映射。`);
  this.scene=scene;this.mapping=mapping;this.source=source;
  this.group=new THREE.Group();this.group.add(scene);
  const box=new THREE.Box3().setFromObject(scene);const size=box.getSize(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<.0001)throw new Error('模型尺寸无效。');
  const scale=3.9/size.y;this.group.scale.setScalar(scale);
  this.group.position.set(-(box.min.x+box.max.x)*scale/2,-box.min.y*scale,-(box.min.z+box.max.z)*scale/2);
  this.group.updateMatrixWorld(true);
  this.restRoot=mapping.Root.position.clone();this.rootScale=scale;
  this.entries=REQUIRED_BONES.map(name=>({name,bone:mapping[name],source:source[name],targetRest:mapping[name].getWorldQuaternion(new THREE.Quaternion())}));
  const depth=b=>{let n=0;for(let p=b.parent;p;p=p.parent)n++;return n;};
  this.entries.sort((a,b)=>depth(a.bone)-depth(b.bone));
  // Source rest is the procedural stage's neutral construction pose, not the
  // current animation frame when the user selects a file.
  this.sourceRest={};
  const rest=new THREE.Object3D();const sourceCopies={};
  const add=(name,parent,pos,rotation=[0,0,0])=>{const b=new THREE.Object3D();b.position.set(...pos);b.rotation.set(...rotation);parent.add(b);sourceCopies[name]=b;return b;};
  const root=add('Root',rest,[0,1.65,0]),chest=add('Chest',root,[0,.33,0]);add('Head',chest,[0,1.13,0]);
  for(const [side,sign] of [['Left',1],['Right',-1]]){const arm=add(side+'UpperArm',chest,[sign*.68,.78,0],[0,0,sign*.26]);const forearm=add(side+'LowerArm',arm,[0,-.78,0],[-.16,0,0]);add(side+'Hand',forearm,[0,-.64,0]);const leg=add(side+'UpperLeg',root,[sign*.29,-.27,0]);const knee=add(side+'LowerLeg',leg,[0,-.72,0]);add(side+'Foot',knee,[0,-.64,0]);}
  rest.updateMatrixWorld(true);this.sourceFootRest=Math.min(sourceCopies.LeftFoot.getWorldPosition(new THREE.Vector3()).y,sourceCopies.RightFoot.getWorldPosition(new THREE.Vector3()).y);this.targetFootRest=Math.min(mapping.LeftFoot.getWorldPosition(new THREE.Vector3()).y,mapping.RightFoot.getWorldPosition(new THREE.Vector3()).y);for(const name of REQUIRED_BONES)this.sourceRest[name]=sourceCopies[name].getWorldQuaternion(new THREE.Quaternion()).invert();
  this.q=new THREE.Quaternion();this.parentQ=new THREE.Quaternion();this.worldDelta=new THREE.Vector3();this.localDelta=new THREE.Vector3();this.origin=new THREE.Vector3();this.inverse=new THREE.Matrix4();
 }
 update(){
  this.group.updateMatrixWorld(true);
  for(const e of this.entries){
   e.source.getWorldQuaternion(this.q).multiply(this.sourceRest[e.name]).multiply(e.targetRest);
   e.bone.parent.getWorldQuaternion(this.parentQ).invert();e.bone.quaternion.copy(this.parentQ).multiply(this.q);e.bone.updateMatrixWorld(true);
  }
  // Convert stage displacement into the pelvis parent's coordinates (also
  // handles export unit scales and transformed armature roots).
  this.worldDelta.copy(this.source.Root.position);this.worldDelta.y-=1.65;
  const parent=this.mapping.Root.parent;parent.updateWorldMatrix(true,false);
  this.inverse.copy(parent.matrixWorld).invert();
  this.localDelta.copy(this.worldDelta).applyMatrix4(this.inverse).sub(this.origin.set(0,0,0).applyMatrix4(this.inverse));
  this.mapping.Root.position.copy(this.restRoot).add(this.localDelta);this.group.updateMatrixWorld(true);
  // Preserve the source's lowest ankle height when the imported leg lengths differ.
  const sourceFloor=Math.min(this.source.LeftFoot.getWorldPosition(this.worldDelta).y,this.source.RightFoot.getWorldPosition(this.localDelta).y);
  const targetFloor=Math.min(this.mapping.LeftFoot.getWorldPosition(this.worldDelta).y,this.mapping.RightFoot.getWorldPosition(this.localDelta).y);
  const correction=this.targetFootRest+sourceFloor-this.sourceFootRest-targetFloor;
  this.localDelta.set(0,correction,0).applyMatrix4(this.inverse).sub(this.origin.set(0,0,0).applyMatrix4(this.inverse));
  this.mapping.Root.position.add(this.localDelta);this.group.updateMatrixWorld(true);
 }
 point(name){return this.mapping[name]?.getWorldPosition(new THREE.Vector3());}
 dispose(){disposeModel(this.scene);this.group.removeFromParent();}
}

export function disposeModel(scene){
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 for(const t of textures){t.dispose();t.source?.data?.close?.();}for(const m of materials)m.dispose();for(const g of geometries)g.dispose();for(const s of skeletons)s.dispose();
}
