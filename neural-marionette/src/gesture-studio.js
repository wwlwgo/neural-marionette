import {ACTIONS} from './actions.js';
import {CONNECTIONS,containRect,screenPoint,validHand} from './core.js';
import {GestureCapture,SampleMatcher,SAMPLE_LIMIT,SAMPLE_VERSION,validateLibrary,sequenceDistance,resolveGestureIntent} from './gesture-samples.js';
const STORAGE='nm-personal-gestures-v1';
const $=id=>document.getElementById(id);
const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};

export class GestureStudio{
  constructor({getMode,video,connect,download}){
    this.getMode=getMode;this.video=video;this.download=download;this.samples=[];this.capture=new GestureCapture();this.capture.cancel();this.lastSeen=-Infinity;this.lastUI=0;this.message='先连接摄像头，选择动作，再录下你自然做出的手势。';
    try{const stored=localStorage.getItem(STORAGE);if(stored)this.samples=validateLibrary(JSON.parse(stored));}catch{this.message='无法读取已存样本。可重新录制；浏览器中的旧数据未清除。';}
    this.matcher=new SampleMatcher(this.samples);this.mode=this.samples.length?'hybrid':'rules';$('learn-mode').value=this.mode;this.effective={action:'idle',source:'none'};
    if(this.samples.length)this.message='已恢复你的样本：已绑定动作使用录制手势，其余动作继续使用原有规则。';
    for(const [key,meta] of Object.entries(ACTIONS)){const option=document.createElement('option');option.value=key;option.textContent=meta.name;$('learn-action').append(option);}
    $('learn-action').value='run';
    $('learn-connect').onclick=connect;
    $('learn-mode').onchange=()=>{this.mode=$('learn-mode').value;this.matcher.reset();this.message=this.mode==='hybrid'?'已绑定动作使用录制手势，其余动作继续使用原有规则。':this.enabled?'按已录样本识别；未录入的动作保持待机。':'已切回原有手势规则。';};
    $('learn-record').onclick=()=>{
      if(['countdown','recording'].includes(this.capture.state))return;
      if(this.getMode()!=='camera'){this.message='请先连接摄像头，等待手部追踪准备完成。';return;}
      const action=$('learn-action').value;
      if(this.samples.filter(s=>s.action===action).length>=SAMPLE_LIMIT){this.message='这个动作已保存 3 段样本。先导出备份，再移除不合适的样本。';return;}
      this.reviewError=null;this.capture.start(action,performance.now());this.matcher.reset();this.message='两秒后开始，请把完整手掌放回画面，再做一次动作。';
    };
    $('learn-cancel').onclick=()=>{this.capture.cancel();this.matcher.reset();this.message='本次录制已取消，已保存的样本不受影响。';};
    $('learn-save').onclick=()=>this.save();
    $('learn-export').onclick=()=>download(new Blob([JSON.stringify({version:SAMPLE_VERSION,samples:this.samples},null,2)],{type:'application/json'}),`my-gestures-${Date.now()}.json`);
    $('learn-import').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      try{if(file.size>2500000)throw new Error('样本文件超过 2.5 MB。');const samples=validateLibrary(JSON.parse(await file.text()));this.persist(samples);this.samples=samples;this.matcher.setSamples(samples);this.capture.cancel();this.renderLibrary();this.message='样本已导入。选择「混合模式」即可搭配原有规则使用。';}catch(error){this.message=error.message;}e.target.value='';
    };
    $('learn-tolerance').oninput=()=>{$('learn-tolerance-value').textContent=Number($('learn-tolerance').value).toFixed(2);this.matcher.reset();};
    this.renderLibrary();
  }
  get enabled(){return this.mode!=='rules';}
  get sourceLabel(){return this.mode==='hybrid'?`混合模式 · ${this.effective.source==='sample'?'录制手势':this.effective.source==='rules'?'原有规则':'等待样本匹配'}`:this.enabled?'我的录制手势':'手势控制';}
  persist(samples){localStorage.setItem(STORAGE,JSON.stringify({version:SAMPLE_VERSION,samples}));}
  save(){
    try{
      const sample=this.capture.sample();const proposed=new SampleMatcher([sample]);
      for(const old of this.matcher.templates){if(old.action===sample.action)continue;
        const similar=proposed.templates[0].clips.some(a=>old.clips.some(b=>Math.abs(a.activity-b.activity)<.035&&sequenceDistance(a.seq,b.seq)<.08));
        if(similar)throw new Error(`这段与「${ACTIONS[old.action].name}」样本太相似，请重录一个更容易区分的动作。`);
      }
      const samples=[...this.samples,sample];validateLibrary({version:SAMPLE_VERSION,samples});this.persist(samples);this.samples=samples;this.matcher.setSamples(samples);
      this.capture.cancel();this.mode='hybrid';$('learn-mode').value='hybrid';this.renderLibrary();this.message=`已绑定到「${ACTIONS[sample.action].name}」。现在再做一次，观察下方识别结果。其余未录制动作仍使用原有规则，无需逐个录制。`;
    }catch(e){this.reviewError=e.message||'保存失败，可能是浏览器存储空间不足。';}
  }
  renderLibrary(){
    $('learn-library').replaceChildren();
    for(const [action,meta] of Object.entries(ACTIONS)){
      const list=this.samples.filter(s=>s.action===action),row=document.createElement('div');row.className='sample-row';
      const label=document.createElement('span');label.textContent=`${meta.name} · ${list.length} / 3`;row.append(label);
      list.forEach((sample,i)=>{const button=document.createElement('button');button.textContent=`移除第 ${i+1} 段`;button.onclick=()=>{
        try{const next=this.samples.filter(s=>s!==sample);this.persist(next);this.samples=next;this.matcher.setSamples(next);this.renderLibrary();this.message='所选样本已移除。';}catch{this.message='浏览器未能保存更改。';}
      };row.append(button);});$('learn-library').append(row);
    }
    $('learn-export').disabled=!this.samples.length;
  }
  ingest(points,now,aspect){
    if(this.getMode()!=='camera')return;
    if(validHand(points)){this.raw=points;this.lastSeen=now;}
    this.capture.update(points,now,aspect);
    if(this.enabled&&!['countdown','recording','review'].includes(this.capture.state))this.matcher.update(points,now,aspect,Number($('learn-tolerance').value));
  }
  stop(){this.matcher.reset();this.lastSeen=-Infinity;if(['countdown','recording'].includes(this.capture.state)){this.capture.cancel();this.message='摄像头连接或输入模式发生变化，请重新录制。';}}
  intent(fallback,now){
    this.capture.tick(now);
    if(['countdown','recording','review'].includes(this.capture.state))return this.effective={action:'idle',source:'none'};
    return this.effective=resolveGestureIntent(this.mode,this.samples,this.matcher.tick(now),fallback);
  }
  tick(now){
    this.capture.tick(now);if(now-this.lastUI<65)return;this.lastUI=now;
    const state=this.capture.state,busy=['countdown','recording'].includes(state),review=state==='review',mode=this.getMode(),live=mode==='camera';
    // The same hand may be needed to click the mouse. Validate the captured
    // sequence after the countdown instead of requiring a hand at click time.
    $('learn-action').disabled=busy||review;$('learn-record').disabled=!live||busy;
    $('learn-connect').disabled=live||mode==='loading';
    text('learn-connect',live?'摄像头已连接':mode==='loading'?'正在连接…':'连接摄像头');
    text('learn-readiness',mode==='loading'?'正在连接摄像头并加载手部追踪，请稍候。':!live?'摄像头未连接。连接后即可点击录制；切到后台会自动关闭摄像头。':now-this.lastSeen<=250?'已检测到手部关键点，可以开始录制。':'摄像头已连接，尚未看到完整手掌。可先点击录制，再在倒计时内把手放入画面。');
    $('learn-record').textContent=review?'重新录这段':'录制我的手势';$('learn-cancel').disabled=!busy&&!review;$('learn-save').disabled=!review;
    $('learn-mode').disabled=busy||review;
    const message=state==='countdown'?`${Math.ceil((this.capture.begin-now)/1000)} 秒后录制「${ACTIONS[this.capture.action].name}」· 请把完整手掌放入画面`:state==='recording'?`录制中 · 请做一次动作 · 剩余 ${Math.max(0,(this.capture.end-now)/1000).toFixed(1)} 秒`:review?(this.reviewError||`骨架回放 · ${this.capture.frames.length} 帧 · 确认这是你的动作后点击「保存并绑定」`):state==='error'?this.capture.error:this.message;
    text('learn-status',message);
    const result=this.matcher.result;
    text('learn-result',this.mode==='hybrid'&&now-this.lastSeen<=250?`${this.sourceLabel} · 当前：${ACTIONS[this.effective.action].name}`:!this.enabled?'当前使用原有规则':!this.samples.length?'还没有录制样本':now-this.lastSeen>250?'等待手部输入':result.ambiguous?'样本难以区分，请补录不同的动作':result.nearest?`最接近：${ACTIONS[result.nearest].name} · ${result.action==='idle'&&result.nearest!=='idle'?'尚未通过匹配':'当前：'+ACTIONS[result.action].name}`:'观察手势中…');
    for(const button of document.querySelectorAll('[data-action]')){const action=button.dataset.action,count=this.samples.filter(s=>s.action===action).length,label=this.enabled?(count?`使用你录制的 ${count} 段样本`:this.mode==='hybrid'?`原有规则 · ${ACTIONS[action].hint}`:'尚未绑定 · 仍可点击试播动画'):ACTIONS[action].hint;if(button.querySelector('span').textContent!==label)button.querySelector('span').textContent=label;}
    this.draw(now,review);
  }
  draw(now,review){
    const canvas=$('learn-preview'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    ctx.fillStyle='#101b2a';ctx.fillRect(0,0,w,h);let points,aspect;
    if(review){const frames=this.capture.frames,t=(now-this.capture.end)%(frames.at(-1).t-frames[0].t)+frames[0].t;const f=frames.find(f=>f.t>=t)||frames.at(-1);points=f.points;aspect=f.aspect;}
    else{aspect=this.video.videoWidth/this.video.videoHeight||16/9;points=now-this.lastSeen<250?this.raw:null;}
    const rect=containRect({x:0,y:0,w,h},aspect,1);
    if(!review&&this.getMode()==='camera'&&this.video.readyState>=2){ctx.save();ctx.translate(rect.x+rect.w,rect.y);ctx.scale(-1,1);ctx.drawImage(this.video,0,0,rect.w,rect.h);ctx.restore();}
    if(points){const p=points.map(v=>screenPoint(v,rect,true));ctx.strokeStyle='#ffcf89';ctx.lineWidth=2;for(const [a,b]of CONNECTIONS){ctx.beginPath();ctx.moveTo(p[a].x,p[a].y);ctx.lineTo(p[b].x,p[b].y);ctx.stroke();}ctx.fillStyle='#fff0d7';for(const v of p){ctx.beginPath();ctx.arc(v.x,v.y,3,0,Math.PI*2);ctx.fill();}}
    ctx.fillStyle='#fff';ctx.font='13px sans-serif';ctx.fillText(review?'骨架回放 · 未保存摄像头影像':'实时取景 · 请让整只手可见',12,22);
  }
  diagnostics(){return {mode:this.mode,effective:this.effective,enabled:this.enabled,samples:this.samples.map(s=>({action:s.action,frames:s.frames.length})),captureState:this.capture.state,result:this.matcher.result};}
}
