import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('public/wasm',{recursive:true});await mkdir('public/vendor',{recursive:true});
for(const f of ['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'])await copyFile(`node_modules/@mediapipe/tasks-vision/wasm/${f}`,`public/wasm/${f}`);
await copyFile('node_modules/@mediapipe/tasks-vision/vision_bundle.cjs','public/vendor/vision_bundle.js');
const url='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
let data;try{data=await readFile('public/models/hand_landmarker.task');}catch{const response=await fetch(url);if(!response.ok)throw new Error(`Model HTTP ${response.status}`);data=Buffer.from(await response.arrayBuffer());await writeFile('public/models/hand_landmarker.task',data);}
await writeFile('assets/licenses/model-manifest.json',JSON.stringify({url,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length},null,2));
console.log(`Local model ready: ${data.length} bytes. WASM and worker bundle copied.`);
