/* Classic worker: MediaPipe's WASM loader uses importScripts. All assets are local. */
self.exports = {};
importScripts('/vendor/vision_bundle.js');
const vision = self.exports;
let detector;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{const files=await vision.FilesetResolver.forVisionTasks('/wasm');detector=await vision.HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'/models/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:data.config.max_hands,minHandDetectionConfidence:data.config.min_detection_confidence,minHandPresenceConfidence:data.config.min_presence_confidence,minTrackingConfidence:data.config.min_tracking_confidence});postMessage({type:'ready'});}catch(e){postMessage({type:'error',message:String(e)});}
 }else if(data.type==='frame'){
  const start=performance.now();try{const r=detector.detectForVideo(data.bitmap,data.timestamp);postMessage({type:'result',timestamp:data.timestamp,landmarks:r.landmarks[0]||null,handedness:r.handedness[0]?.[0]||null,inferenceMs:performance.now()-start});}catch(e){postMessage({type:'error',message:String(e)});}finally{data.bitmap.close();}
 }
};
