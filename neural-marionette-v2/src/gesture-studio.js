import {ACTIONS} from './actions.js';
import {CONNECTIONS,containRect,screenPoint,validHand} from './core.js';
import {GestureCapture,SampleMatcher,SAMPLE_LIMIT,SAMPLE_VERSION,validateLibrary,sequenceDistance,resolveGestureIntent,checkSampleBindings,libraryRunTrigger} from './gesture-samples.js';
const STORAGE='nm-personal-gestures-v1';
const $=id=>document.getElementById(id);
const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};

export class GestureStudio{
  constructor({getMode,video,connect,download,onWorkspaceChange=()=>{}}){
    this.editing=false;this.onWorkspaceChange=onWorkspaceChange;
    $('learn-enter').onclick=()=>this.setEditing(true);$('learn-exit').onclick=()=>this.setEditing(false);
    this.getMode=getMode;this.video=video;this.download=download;this.samples=[];this.capture=new GestureCapture();this.capture.cancel();this.lastSeen=-Infinity;this.lastUI=0;this.message='先连接摄像头，选择动作，再录下你自然做出的手势。';
    this.runTrigger='finger';
    try{const stored=localStorage.getItem(STORAGE);if(stored){const data=JSON.parse(stored);this.samples=validateLibrary(data);this.runTrigger=libraryRunTrigger(data);}}catch{this.message='无法读取已存样本。可重新录制；浏览器中的旧数据未清除。';}
    this.matcher=new SampleMatcher(this.samples,{runTrigger:this.runTrigger});this.mode=this.samples.length?'hybrid':'rules';$('learn-mode').value=this.mode;$('learn-run-trigger').value=this.runTrigger;this.effective={action:'idle',source:'none'};
    if(this.samples.length)this.message='已恢复你的样本：已绑定动作使用录制手势，其余动作继续使用原有规则。';
    for(const [key,meta] of Object.entries(ACTIONS)){const option=document.createElement('option');option.value=key;option.textContent=meta.name;$('learn-action').append(option);}
    $('learn-action').value='run';
    $('learn-connect').onclick=connect;
    $('learn-run-trigger').onchange=()=>{
      const next=$('learn-run-trigger').value;
      try{this.persist(this.samples,next);this.runTrigger=next;this.matcher.setRunTrigger(next);text('learn-check-result','');this.message=next==='finger'?'已保存：食指动才跑，食指停下就停。原样本用于识别手型，无需重录。':next==='pose'?'已保存：保持录制手型就持续疾跑，换手型或移开手停止。现有样本无需重录。':'已保存：疾跑需要持续摆动，停手后停止。';}
      catch{ $('learn-run-trigger').value=this.runTrigger;this.message='无法保存触发方式，已保留原设置和样本。'; }
    };
    $('learn-check').onclick=()=>{
      const results=checkSampleBindings(this.samples,Number($('learn-tolerance').value),{runTrigger:this.runTrigger});
      text('learn-check-result',results.length?results.map((r,i)=>`第 ${i+1} 段 ${ACTIONS[r.action].name} · ${(r.durationMs/1000).toFixed(1)} 秒 / ${r.frames} 帧 · ${this.runTrigger==='finger'&&r.action==='run'?(r.matched?'回放检测到食指运动':'该回放没有足够的食指运动'):(r.matched?'自检可触发':'自检未触发')} · ${this.runTrigger==='finger'&&r.action==='run'?'回放中疾跑占比':'有效回放匹配'} ${(r.ratio*100).toFixed(0)}%`).join('；')+`。疾跑方式：${this.runTrigger==='finger'?'食指动才跑（静止不触发，回放比例不代表准确率）':this.runTrigger==='pose'?'保持手型':'持续摆动'}。自检只回放已存关键点，不代表真人准确率，不修改绑定。`:'还没有保存的样本。');
    };
    $('learn-mode').onchange=()=>{this.mode=$('learn-mode').value;this.matcher.reset();this.message=this.mode==='hybrid'?'已绑定动作使用录制手势，其余动作继续使用原有规则。':this.enabled?'按已录样本识别；未录入的动作保持待机。':'已切回原有手势规则。';};
    $('learn-record').onclick=()=>{
      if(['countdown','waiting','recording'].includes(this.capture.state))return;
      if(!this.editing)return;
      if(this.getMode()!=='camera'){this.message='请先连接摄像头，等待手部追踪准备完成。';return;}
      const action=$('learn-action').value;
      if(this.samples.filter(s=>s.action===action).length>=SAMPLE_LIMIT&&!$('learn-replace').checked){this.message='这个动作已有 3 段样本。可勾选「保存时替换这个动作的旧样本」后重录。';return;}
      this.reviewError=null;this.capture.start(action,performance.now(),Number($('learn-duration').value),{runTrigger:this.runTrigger});this.matcher.reset();this.message='准备 3 秒，手进入画面后开始完整采样。';
    };
    $('learn-cancel').onclick=()=>{this.capture.cancel();this.matcher.reset();this.message='本次录制已取消，已保存的样本不受影响。';};
    $('learn-save').onclick=()=>this.save();
    $('learn-finish').onclick=()=>this.capture.finish(performance.now());
    $('learn-export').onclick=()=>download(new Blob([JSON.stringify({version:SAMPLE_VERSION,runControlVersion:2,runTrigger:this.runTrigger,samples:this.samples},null,2)],{type:'application/json'}),`my-gestures-${Date.now()}.json`);
    $('learn-import').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      try{if(file.size>12000000)throw new Error('样本文件超过 12 MB。');const data=JSON.parse(await file.text()),samples=validateLibrary(data),runTrigger=libraryRunTrigger(data);this.persist(samples,runTrigger);this.samples=samples;this.runTrigger=runTrigger;$('learn-run-trigger').value=runTrigger;this.matcher.setSamples(samples);this.matcher.setRunTrigger(runTrigger);this.capture.cancel();if(!samples.length){this.mode='rules';$('learn-mode').value='rules';}this.renderLibrary();this.message='样本和疾跑触发方式已导入。选择「混合模式」即可搭配原有规则使用。';}catch(error){this.message=error.message;}e.target.value='';
    };
    $('learn-tolerance').oninput=()=>{$('learn-tolerance-value').textContent=Number($('learn-tolerance').value).toFixed(2);this.matcher.reset();};
    this.renderLibrary();
  }
  setEditing(editing){
    if(this.editing===editing)return;
    this.editing=editing;this.capture.cancel();this.matcher.reset();this.raw=null;this.lastSeen=-Infinity;this.effective={action:'idle',source:'none'};
    $('learn-panel').hidden=!editing;$('learn-enter').hidden=editing;
    $('learn-enter').setAttribute('aria-expanded',String(editing));
    $('main-view').hidden=editing;$('studio-paused').hidden=!editing;
    this.message=editing?'录制模式：正常操控已暂停。点击录制后才采样，完成后返回正常操控。':'已返回正常操控，录制取景已关闭；未保存的临时录制已取消。';
    this.onWorkspaceChange(editing);
  }
  get enabled(){return this.mode!=='rules';}
  get sourceLabel(){if(this.editing)return '录制模式 · 正常操控已暂停';return this.mode==='hybrid'?`混合模式 · ${this.effective.source==='sample'?'录制手势':this.effective.source==='rules'?'原有规则':'等待样本匹配'}`:this.enabled?'我的录制手势':'手势控制';}
  persist(samples,runTrigger=this.runTrigger){localStorage.setItem(STORAGE,JSON.stringify({version:SAMPLE_VERSION,runControlVersion:2,runTrigger,samples}));}
  save(){
    try{
      const sample=this.capture.sample();const proposed=new SampleMatcher([sample]);
      for(const old of this.matcher.templates){if(old.action===sample.action)continue;
        const similar=proposed.templates[0].clips.some(a=>old.clips.some(b=>Math.abs(a.activity-b.activity)<.035&&sequenceDistance(a.seq,b.seq)<.08));
        if(similar)throw new Error(`这段与「${ACTIONS[old.action].name}」样本太相似，请重录一个更容易区分的动作。`);
      }
      const samples=[...this.samples.filter(s=>!$('learn-replace').checked||s.action!==sample.action),sample];validateLibrary({version:SAMPLE_VERSION,samples});this.persist(samples);this.samples=samples;this.matcher.setSamples(samples);$('learn-replace').checked=false;
      this.capture.cancel();this.mode='hybrid';$('learn-mode').value='hybrid';this.renderLibrary();this.message=`已绑定到「${ACTIONS[sample.action].name}」。点击「返回正常操控」后再做一次，观察识别结果。其余未录制动作仍使用原有规则，无需逐个录制。`;
    }catch(e){this.reviewError=e.message||'保存失败，可能是浏览器存储空间不足。';}
  }
  renderLibrary(){
    $('learn-library').replaceChildren();
    for(const [action,meta] of Object.entries(ACTIONS)){
      const list=this.samples.filter(s=>s.action===action),row=document.createElement('div');row.className='sample-row';
      const label=document.createElement('span');label.textContent=`${meta.name} · ${list.length} / 3`;row.append(label);
      list.forEach(sample=>{const detail=document.createElement('small');detail.textContent=`${((sample.frames.at(-1).t-sample.frames[0].t)/1000).toFixed(1)} 秒 · ${sample.frames.length} 帧${sample.createdAt?' · '+new Date(sample.createdAt).toLocaleString():''}`;row.append(detail);});
      list.forEach((sample,i)=>{const button=document.createElement('button');button.textContent=`移除第 ${i+1} 段`;button.onclick=()=>{
        try{const next=this.samples.filter(s=>s!==sample);this.persist(next);this.samples=next;this.matcher.setSamples(next);if(!next.length){this.mode='rules';$('learn-mode').value='rules';}this.renderLibrary();this.message=next.length?'所选样本已移除。':'样本已全部移除，已恢复原有手势规则。';}catch{this.message='浏览器未能保存更改。';}
      };row.append(button);});$('learn-library').append(row);
    }
    $('learn-export').disabled=!this.samples.length;
    $('learn-check').disabled=!this.samples.length;
  }
  ingest(points,now,aspect){
    if(this.getMode()!=='camera')return;
    if(validHand(points)){if(this.editing)this.raw=points;this.lastSeen=now;}
    if(this.editing){this.capture.update(points,now,aspect);return;}
    if(this.enabled&&this.samples.length)this.matcher.update(points,now,aspect,Number($('learn-tolerance').value));
  }
  stop(){this.matcher.reset();this.raw=null;this.lastSeen=-Infinity;if(['countdown','waiting','recording'].includes(this.capture.state)){this.capture.cancel();this.message='摄像头连接或输入模式发生变化，请重新录制。';}}
  intent(fallback,now){
    if(this.editing)this.capture.tick(now);
    if(this.editing)return this.effective={action:'idle',source:'none'};
    return this.effective=resolveGestureIntent(this.mode,this.samples,this.matcher.tick(now),fallback);
  }
  tick(now){
    if(this.editing)this.capture.tick(now);if(now-this.lastUI<65)return;this.lastUI=now;
    const state=this.capture.state,busy=['countdown','waiting','recording'].includes(state),review=state==='review',mode=this.getMode(),live=mode==='camera';
    // The same hand may be needed to click the mouse. Validate the captured
    // sequence after the countdown instead of requiring a hand at click time.
    $('learn-action').disabled=busy||review;$('learn-duration').disabled=busy||review;$('learn-replace').disabled=busy;$('learn-run-trigger').disabled=busy||review;
    $('learn-finish').disabled=state!=='recording'||now-this.capture.begin<1200||this.capture.frames.length<16;$('learn-record').disabled=!this.editing||!live||busy;
    $('learn-connect').disabled=live||mode==='loading';
    text('learn-connect',live?'摄像头已连接':mode==='loading'?'正在连接…':'连接摄像头');
    text('learn-readiness',mode==='loading'?'正在连接摄像头并加载手部追踪，请稍候。':!live?'摄像头未连接。连接后即可点击录制；切到后台会自动关闭摄像头。':now-this.lastSeen<=250?'已检测到手部关键点，可以开始录制。':'摄像头已连接，尚未看到完整手掌。可先点录制；准备结束后会等待手进入画面，再开始采样。');
    $('learn-record').textContent=state==='countdown'?'准备中…':state==='waiting'?'等待手掌…':state==='recording'?'正在录制…':review?'重新录这段':'录制我的手势';$('learn-cancel').disabled=!busy&&!review;$('learn-save').disabled=!review;
    $('learn-mode').disabled=this.editing;
    const message=state==='countdown'?`准备 ${Math.ceil((this.capture.readyAt-now)/1000)} 秒 · 尚未采样，请把手放入画面`:state==='waiting'?'等待完整手掌 · 尚未采样；看到手部关键点后自动开始':state==='recording'?`正在采样 · ${((now-this.capture.begin)/1000).toFixed(1)} / ${this.capture.duration/1000} 秒 · ${this.capture.action==='run'?(this.runTrigger==='finger'?'摆出手型，再反复弯曲食指':this.runTrigger==='pose'?'保持要绑定的手型':'持续重复摆动，不要只做一次'):'自然示范动作'} · ${this.capture.frames.length} 帧`:review?(this.reviewError||`骨架回放 · ${((this.capture.end-this.capture.begin)/1000).toFixed(1)} 秒 / ${this.capture.frames.length} 帧 · 确认后保存并绑定`):state==='error'?this.capture.error:this.message;
    text('learn-status',message);
    const result=this.matcher.result;
    const explanations={'finger-motion':'手型已就绪，等待食指弯曲或摆动；食指静止时不会跑',observing:'正在收集手势，请连续做动作',pose:'疾跑手型或朝向与录制差异较大',motion:'疾跑未检测到足够的持续运动',distance:'尚未匹配到样本：运动幅度或轨迹仍有差异',ambiguous:'多个动作样本相近，暂不触发',confirming:'已接近样本，正在确认',matched:'样本已匹配'};
    text('learn-match-detail',this.editing?'正常操控与样本匹配已暂停，当前仅用于录制。':!live?'重新连接摄像头后，可查看实时匹配原因。':!this.enabled?'当前使用原有规则。':now-this.lastSeen>250?'没有连续的手部关键点输入，请先检查取景骨架。':`${explanations[result.reason]||'观察手势中'}${Number.isFinite(result.distance)?` · 距离 ${result.distance.toFixed(3)} / 宽松度 ${Number($('learn-tolerance').value).toFixed(2)}`:''}`);
    text('learn-result',this.editing?'录制模式 · 保存后返回正常操控试用':this.effective.action==='run'&&this.effective.source==='sample'?(this.runTrigger==='finger'?'疾跑持续中 · 食指运动已检测到 · 食指停下就停':this.runTrigger==='pose'?'疾跑持续中 · 手型已匹配 · 换手型或移开手停止':`疾跑持续中 · ${result.holding?'短暂保持，继续摆动':'持续摆动已识别'} · 停手后收势`):this.mode==='hybrid'&&now-this.lastSeen<=250?`${this.sourceLabel} · 当前：${ACTIONS[this.effective.action].name}`:!this.enabled?'当前使用原有规则':!this.samples.length?'还没有录制样本':now-this.lastSeen>250?'等待手部输入':result.ambiguous?'样本难以区分，请补录不同的动作':result.nearest?`最接近：${ACTIONS[result.nearest].name} · ${result.action==='idle'&&result.nearest!=='idle'?'尚未通过匹配':'当前：'+ACTIONS[result.action].name}`:'观察手势中…');
    for(const button of document.querySelectorAll('[data-action]')){const action=button.dataset.action,count=this.samples.filter(s=>s.action===action).length,label=this.enabled?(count?`使用你录制的 ${count} 段样本`:this.mode==='hybrid'?`原有规则 · ${ACTIONS[action].hint}`:'尚未绑定 · 仍可点击试播动画'):ACTIONS[action].hint;if(button.querySelector('span').textContent!==label)button.querySelector('span').textContent=label;}
    if(this.editing)this.draw(now,review);
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
    const state=this.capture.state;
    if(['countdown','waiting','recording'].includes(state)){
      const title=state==='countdown'?`准备 ${Math.max(0,Math.ceil((this.capture.readyAt-now)/1000))}`:state==='waiting'?'等待手掌':`录制 ${Math.max(0,(now-this.capture.begin)/1000).toFixed(1)} / ${this.capture.duration/1000}s`;
      ctx.fillStyle='#101b2ae8';ctx.fillRect(0,h-65,w,65);ctx.fillStyle=state==='recording'?'#ffcf89':'#fff';ctx.font='bold 24px sans-serif';ctx.fillText(title,12,h-25);
      if(state==='recording'){ctx.fillStyle='#ffcf89';ctx.fillRect(0,h-5,w*Math.min(1,(now-this.capture.begin)/this.capture.duration),5);}
    }
  }
  diagnostics(){return {workspace:this.editing?'record':'control',mode:this.mode,runTrigger:this.runTrigger,effective:this.effective,enabled:this.enabled,samples:this.samples.map(s=>({action:s.action,frames:s.frames.length})),captureState:this.capture.state,captureFrames:this.capture.frames.length,captureDurationMs:this.capture.duration,result:this.matcher.result};}
}
