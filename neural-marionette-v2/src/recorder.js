// Browser capability checks do not promise hardware encoding. Prefer H.264,
// then VP8; avoid choosing the more expensive VP9 path by default.
export const RECORDING_TYPES=['video/mp4;codecs=avc1.42E01F','video/webm;codecs=vp8','video/webm','video/mp4'];

export class StageRecorder{
  constructor(onFinish){this.onFinish=onFinish;this.job=null;this.last=null;}
  get state(){return this.job?.recorder.state||'inactive';}
  start(canvas,{fps,bitrate,duration_ms,mode}){
    if(this.job)throw new Error('上一段录像正在保存，请稍候。');
    if(!canvas.captureStream||!globalThis.MediaRecorder)throw new Error('当前浏览器不支持录像，请使用 Chrome。');
    let stream;
    try{
      stream=canvas.captureStream(0);
      let track=stream.getVideoTracks()[0];
      const manual=typeof track?.requestFrame==='function';
      if(!manual){stream.getTracks().forEach(t=>t.stop());stream=canvas.captureStream(fps);track=stream.getVideoTracks()[0];}
      for(const mimeType of RECORDING_TYPES){
        if(!MediaRecorder.isTypeSupported(mimeType))continue;
        let recorder;
        const job={stream,track,manual,chunks:[],error:null,mode,frames:0,startedAt:performance.now(),width:canvas.width,height:canvas.height};
        try{
          recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:bitrate});job.recorder=recorder;
          recorder.ondataavailable=e=>{if(e.data.size)job.chunks.push(e.data);};
          recorder.onerror=e=>{job.error=e.error?.message||'视频编码器发生错误';this.stop();};
          recorder.onstop=()=>this.finish(job);
          recorder.start(1000);
        }catch{
          if(recorder){recorder.ondataavailable=recorder.onerror=recorder.onstop=null;if(recorder.state!=='inactive')recorder.stop();}
          continue;
        }
        this.job=job;job.type=recorder.mimeType||mimeType;
        job.timer=setTimeout(()=>this.stop(),duration_ms);
        return;
      }
      throw new Error('没有成功启动的视频编码器。可开启「录屏优化」后使用系统录屏。');
    }catch(error){stream?.getTracks().forEach(t=>t.stop());throw error;}
  }
  frame(){const job=this.job;if(!job||job.recorder.state!=='recording')return;
    try{if(job.manual)job.track.requestFrame();job.frames++;}
    catch(error){job.error=error.message;this.stop();}
  }
  stop(){const job=this.job;if(!job)return;clearTimeout(job.timer);job.stoppedAt??=performance.now();if(job.recorder.state!=='inactive')job.recorder.stop();}
  finish(job){
    if(this.job!==job)return;
    clearTimeout(job.timer);job.stream.getTracks().forEach(t=>t.stop());
    const durationMs=(job.stoppedAt||performance.now())-job.startedAt;
    this.last={mimeType:job.type,width:job.width,height:job.height,durationMs,submittedFrames:job.frames,manualCapture:job.manual,error:job.error};
    const blob=new Blob(job.chunks,{type:job.type});this.job=null;
    this.onFinish({...this.last,blob,mode:job.mode});
  }
  dispose(){const job=this.job;if(!job)return;clearTimeout(job.timer);job.recorder.ondataavailable=job.recorder.onstop=job.recorder.onerror=null;if(job.recorder.state!=='inactive')job.recorder.stop();job.stream.getTracks().forEach(t=>t.stop());this.job=null;}
  diagnostics(){return {state:this.state,mimeType:this.job?.type||null,submittedFrames:this.job?.frames||0,manualCapture:this.job?.manual??null,last:this.last};}
}
