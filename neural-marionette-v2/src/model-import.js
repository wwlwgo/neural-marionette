import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ModelRig,disposeModel,inspectModel} from './model-rig.js';

export function validateLocalGlb(buffer){
 const view=new DataView(buffer);if(buffer.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw new Error('请选择完整的 GLB 2.0 文件。');
 const length=view.getUint32(12,true);if(view.getUint32(16,true)!==0x4e4f534a||length>buffer.byteLength-20)throw new Error('GLB 文件结构损坏。');
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)).trim());
 for(const resource of [...(json.buffers||[]),...(json.images||[])])if(resource.uri&&!resource.uri.startsWith('data:'))throw new Error('请导出纹理内嵌的 GLB；不加载外部文件或网址。');
 if((json.extensionsRequired||[]).some(e=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(e)))throw new Error('请导出未使用 Draco、Meshopt 或 KTX2 压缩的 GLB。');
 return json;
}

export function setupModelImport(stage){
 const input=document.getElementById('character-file'),status=document.getElementById('character-status'),restore=document.getElementById('character-restore'),report=document.getElementById('character-report'),guardian=document.getElementById('character-guardian');
 let serial=0;
 const message=text=>{status.textContent=text;};
 async function load(name,getBuffer){
  const token=++serial;input.disabled=true;guardian.disabled=true;message('正在本地读取、检查骨架…');let gltf=null,rig=null;
  try{
   const buffer=await getBuffer();if(token!==serial)return;
   if(buffer.byteLength>150*1024*1024)throw new Error('文件超过 150 MB，请先重拓扑并降低纹理尺寸。');
   validateLocalGlb(buffer);gltf=await new GLTFLoader().parseAsync(buffer,'');
   if(token!==serial){disposeModel(gltf.scene);return;}
   report.textContent=JSON.stringify({file:name,...inspectModel(gltf.scene).report},null,2);
   rig=new ModelRig(gltf.scene,stage.bones);stage.setCharacter(rig);restore.disabled=false;
   message(`${name} · ${rig.report.triangles.toLocaleString()} 三角面 · ${rig.report.bones.length} 骨骼。已接入动作试播。手势控制全身，手指暂不单独运动。`);
   report.textContent=JSON.stringify({file:name,...rig.report,note:'本地基础蒙皮；飘带随躯干。大幅动作仍可能出现装甲穿插。'},null,2);
  }catch(error){if(rig)rig.dispose();else if(gltf)disposeModel(gltf.scene);if(token===serial)message(`导入未完成：${error.message} 原角色保持可用。`);}
  finally{if(token===serial){input.disabled=false;guardian.disabled=false;}input.value='';}
 }
 input.onchange=()=>{const file=input.files[0];if(file)load(file.name,()=>file.arrayBuffer());};
 guardian.onclick=()=>load('鹿角机甲 · 免费版',async()=>{const response=await fetch('/models/guardian-rigged.glb');if(!response.ok)throw new Error('内置模型读取失败');return response.arrayBuffer();});
 restore.onclick=()=>{serial++;stage.setCharacter(null);restore.disabled=true;input.disabled=false;guardian.disabled=false;report.textContent='';message('已恢复默认机器人。可再次载入鹿角机甲或选择其他 GLB。');};
 guardian.click();
}
