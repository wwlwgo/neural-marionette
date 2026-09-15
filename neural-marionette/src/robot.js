import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {legIK} from './actions.js';

export class RobotStage {
 constructor(){
  // main.js copies this canvas immediately after update(), in the same frame.
  this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:false});this.renderer.setClearColor(0,0);this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(32,16/9,.1,100);this.camera.position.set(0,3.0,14.8);this.camera.lookAt(0,2.1,0);
  this.scene.add(new THREE.HemisphereLight(0xc7e4ff,0x34404e,3));
  for(const [color,power,pos] of [[0xe7f1ff,80,[-3,7,5]],[0xffbd6b,55,[5,4,3]],[0x79bfff,85,[1,5,-3]]]){const l=new THREE.PointLight(color,power,25);l.position.set(...pos);this.scene.add(l);}
  this.materials={shell:new THREE.MeshStandardMaterial({color:0x8275b4,metalness:.64,roughness:.27}),dark:new THREE.MeshStandardMaterial({color:0x182032,metalness:.8,roughness:.3}),joint:new THREE.MeshStandardMaterial({color:0x8294aa,metalness:.9,roughness:.24}),light:new THREE.MeshStandardMaterial({color:0xffbb60,emissive:0xff910f,emissiveIntensity:2.2,metalness:.3,roughness:.25}),visor:new THREE.MeshStandardMaterial({color:0x071323,metalness:.7,roughness:.16})};
  this.rig=new THREE.Group();this.rig.position.set(2.55,0,0);this.scene.add(this.rig);this.bones={};
  const bone=(name,parent,x,y,z)=>{const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);this.bones[name]=b;return b;};
  const root=bone('Root',this.rig,0,1.65,0);this.box(root,[.70,.42,.49],[0,0,0],'dark');this.box(root,[.57,.22,.12],[0,.04,.28]);
  const chest=bone('Chest',root,0,.33,0);this.box(chest,[1.02,.9,.57],[0,.44,0]);this.box(chest,[.80,.34,.12],[0,.67,.31],'dark');this.box(chest,[.12,.18,.065],[0,.67,.4],'light');
  for(const sign of [-1,1]){this.box(chest,[.22,.33,.08],[sign*.31,.27,.31],'joint');this.box(chest,[.065,.24,.05],[sign*.34,.28,.37],'light');}
  this.sphere(chest,.15,[0,1.01,0],'joint');
  const head=bone('Head',chest,0,1.13,0);this.box(head,[.78,.61,.64],[0,.22,0]);this.box(head,[.69,.24,.095],[0,.24,.335],'visor');this.box(head,[.45,.048,.02],[0,.24,.39],'light');this.box(head,[.27,.055,.075],[0,.005,.34],'joint');
  for(const sign of [-1,1]){
   this.sphere(head,.105,[sign*.40,.22,0],'joint');
   const side=sign===-1?'Right':'Left';const arm=bone(side+'UpperArm',chest,sign*.68,.78,0);arm.rotation.z=sign*.26;
   this.sphere(arm,.21,[0,0,0],'joint');this.box(arm,[.37,.41,.42],[0,-.10,0]);this.box(arm,[.25,.50,.30],[0,-.43,0]);this.box(arm,[.065,.3,.02],[0,-.41,.17],'light');
   const elbow=bone(side+'LowerArm',arm,0,-.78,0);elbow.rotation.x=-.16;this.sphere(elbow,.145,[0,0,0],'joint');this.box(elbow,[.31,.53,.36],[0,-.31,0]);this.box(elbow,[.18,.26,.065],[0,-.28,.20],'dark');
   const hand=bone(side+'Hand',elbow,0,-.64,0);this.box(hand,[.27,.25,.30],[0,-.06,0],'joint');for(let f=0;f<3;f++)this.box(hand,[.065,.20,.13],[(f-1)*.085,-.25,.025]);this.box(hand,[.07,.18,.11],[sign*.17,-.13,.04]);
   const thigh=bone(side+'UpperLeg',root,sign*.29,-.27,0);this.sphere(thigh,.19,[0,0,0],'joint');this.box(thigh,[.38,.59,.44],[0,-.34,0]);const knee=bone(side+'LowerLeg',thigh,0,-.72,0);this.sphere(knee,.16,[0,0,0],'joint');this.box(knee,[.32,.50,.38],[0,-.30,0]);this.box(knee,[.13,.20,.06],[0,-.30,.22],'dark');
   const foot=bone(side+'Foot',knee,0,-.64,0);this.box(foot,[.41,.20,.64],[0,0,.14],'dark');this.box(foot,[.35,.12,.34],[0,.09,.29]);
   this.box(arm,[.48,.19,.50],[sign*.035,.10,0]);this.box(thigh,[.27,.30,.09],[0,-.25,.25]);
  }
  this.skeleton=new THREE.Skeleton(Object.values(this.bones));
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(1.65,1.8,.12,80),new THREE.MeshStandardMaterial({color:0x132333,metalness:.65,roughness:.45}));pedestal.position.set(2.55,.015,0);this.scene.add(pedestal);
  for(const r of [1.4,1.73,2.05]){const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.009,6,100),new THREE.MeshBasicMaterial({color:r===1.73?0xc99050:0x2b465b,transparent:true,opacity:.7}));ring.rotation.x=Math.PI/2;ring.position.set(2.55,.095,0);this.scene.add(ring);}
  const grid=new THREE.GridHelper(18,36,0x304559,0x182e42);grid.position.y=-.06;grid.material.transparent=true;grid.material.opacity=.32;this.scene.add(grid);
  this.impactRing=new THREE.Mesh(new THREE.TorusGeometry(1,.025,6,80),new THREE.MeshBasicMaterial({color:0xffc875,transparent:true,opacity:0,depthWrite:false}));
  this.impactRing.rotation.x=Math.PI/2;this.impactRing.position.set(2.55,.11,0);this.scene.add(this.impactRing);
  this.trails=['LeftHand','RightHand'].map(name=>{
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(24),3));
   geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(Array.from({length:8},(_,i)=>[i/7,i/7*.70,i/7*.33]).flat()),3));
   const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));line.frustumCulled=false;this.scene.add(line);
   return {name,line,history:[]};
  });
  this.lastAction=null;this.reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 }
 box(parent,size,pos,mat='shell'){const mesh=new THREE.Mesh(new RoundedBoxGeometry(...size,2,.05),this.materials[mat]);mesh.position.set(...pos);parent.add(mesh);return mesh;}
 sphere(parent,r,pos,mat){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,20,14),this.materials[mat]);mesh.position.set(...pos);parent.add(mesh);return mesh;}
 resize(w,h){this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 update(pose,time,active,motion){
  const m=motion,yaw=m.yaw+m.facing+pose.root*.15;
  this.bones.Root.position.set(pose.x*.22+Math.sin(yaw)*m.rootZ+Math.cos(yaw)*m.rootX,m.height,Math.cos(yaw)*m.rootZ-Math.sin(yaw)*m.rootX);this.bones.Root.rotation.y=yaw;
  this.bones.Chest.rotation.set(m.chest,m.chestYaw,m.roll+pose.chest*.12);this.bones.Head.rotation.set(m.headPitch+pose.nod*.2,m.head+pose.head*.3,-m.roll*.55);
  for(const [side,sign] of [['Left',1],['Right',-1]]){
   const key=side.toLowerCase(),leg=legIK(m.height,m[key+'FootY'],m[key+'FootZ']);
   this.bones[side+'UpperLeg'].position.x=sign*(.29+m.stance);
   this.bones[side+'UpperLeg'].rotation.x=leg.hip;this.bones[side+'LowerLeg'].rotation.x=leg.knee;this.bones[side+'Foot'].rotation.x=leg.ankle;
   this.bones[side+'UpperArm'].rotation.set(m[key+'Arm'],0,sign*m.spread+(side==='Left'?pose.left:pose.right)*.12);
   this.bones[side+'LowerArm'].rotation.x=m[key+'Elbow'];
   this.bones[side+'Hand'].rotation.z=m[key+'Wrist'];
  }
  this.scene.updateMatrixWorld(true);
  this.impactRing.material.opacity=this.reducedMotion?0:m.impact*.65;this.impactRing.scale.setScalar(1+(1-m.impact)*1.1);
  for(const trail of this.trails){
   const point=this.bones[trail.name].getWorldPosition(new THREE.Vector3());
   if(this.lastAction!==m.action||!trail.history.length)trail.history=Array.from({length:8},()=>point.clone());
   trail.history.shift();trail.history.push(point);
   const attr=trail.line.geometry.attributes.position;trail.history.forEach((p,i)=>attr.setXYZ(i,p.x,p.y,p.z));attr.needsUpdate=true;
   trail.line.material.opacity=this.reducedMotion?0:m.energy*.65;
  }
  this.lastAction=m.action;this.renderer.render(this.scene,this.camera);
 }
 project(name,w,h){const offsets={Head:[0,.23,.38],Chest:[0,.66,.39],Root:[0,.05,.30],LeftHand:[0,-.05,.18],RightHand:[0,-.05,.18]};const p=new THREE.Vector3(...offsets[name]);this.bones[name].localToWorld(p);p.project(this.camera);return{x:(p.x+1)*w/2,y:(1-p.y)*h/2};}
}
