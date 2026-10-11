const STORAGE='nm-music-v1';
const TRACK='/music/neon-orbit.mp3';
const clamp=v=>Math.min(1,Math.max(0,v));

export class BackgroundMusic {
  constructor(){
    this.enabled=true;this.volume=.25;this.active=false;this.preview=false;this.version=0;this.offset=0;this.error='';
    try{const saved=JSON.parse(localStorage.getItem(STORAGE));if(typeof saved?.enabled==='boolean')this.enabled=saved.enabled;if(Number.isFinite(saved?.volume))this.volume=clamp(saved.volume);}catch{}
    this.button=document.getElementById('music-toggle');this.slider=document.getElementById('music-volume');this.status=document.getElementById('music-status');
    this.slider.value=Math.round(this.volume*100);
    this.button.onclick=()=>{
      if(this.wanted&&!this.error){this.enabled=false;this.preview=false;}else{this.enabled=true;this.preview=!this.active;}
      this.persist();this.sync();
    };
    this.slider.oninput=()=>{this.volume=clamp(Number(this.slider.value)/100);this.persist();if(this.master)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.04);this.render();};
    document.addEventListener('visibilitychange',()=>this.sync());
    window.addEventListener('pagehide',()=>{this.active=false;this.preview=false;this.sync();});
    this.render();
  }
  get wanted(){return this.enabled&&(this.active||this.preview)&&!document.hidden;}
  persist(){try{localStorage.setItem(STORAGE,JSON.stringify({enabled:this.enabled,volume:this.volume}));}catch{}}
  setActive(active){this.active=active;if(!active)this.preview=false;this.sync();}
  setup(){
    if(this.context)return;
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('当前浏览器不支持配乐播放');
    this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=this.volume;
    this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;this.master.connect(this.analyser);this.analyser.connect(this.context.destination);
  }
  async load(){
    if(!this.loading)this.loading=fetch(TRACK).then(r=>{if(!r.ok)throw new Error('配乐文件加载失败');return r.arrayBuffer();}).then(bytes=>this.context.decodeAudioData(bytes)).then(buffer=>{this.buffer=buffer;return buffer;}).catch(e=>{this.loading=null;throw e;});
    return this.loading;
  }
  async sync(){
    const version=++this.version;clearTimeout(this.suspendTimer);
    if(!this.wanted){this.stop();this.error='';this.render();return;}
    if(this.source){this.render();return;}
    this.pending=true;this.error='';this.render();
    try{
      this.setup();
      // resume is invoked before awaiting fetch, within the initiating user click.
      await Promise.all([this.context.resume(),this.load()]);
      if(version!==this.version||!this.wanted)return;
      if(this.context.state!=='running')throw new Error('点击播放配乐以启用声音');
      const source=this.context.createBufferSource(),gate=this.context.createGain(),now=this.context.currentTime;
      source.buffer=this.buffer;source.loop=true;source.loopEnd=this.buffer.duration;
      gate.gain.setValueAtTime(0,now);gate.gain.linearRampToValueAtTime(1,now+.65);
      source.connect(gate);gate.connect(this.master);source.onended=()=>{source.disconnect();gate.disconnect();};
      this.source=source;this.gate=gate;this.started=now;source.start(now,this.offset%this.buffer.duration);
    }catch(e){if(version===this.version)this.error=e.message||'配乐暂不可用，点击重试';}
    finally{if(version===this.version){this.pending=false;this.render();}}
  }
  stop(){
    this.pending=false;
    if(this.source){
      const now=this.context.currentTime;this.offset=(this.offset+now-this.started)%this.buffer.duration;
      this.gate.gain.cancelAndHoldAtTime(now);this.gate.gain.linearRampToValueAtTime(0,now+.20);this.source.stop(now+.22);this.source=null;
    }
    if(this.context)this.suspendTimer=setTimeout(()=>{if(!this.wanted)this.context.suspend().catch(()=>{});},260);
  }
  render(){
    const playing=!!this.source&&this.context?.state==='running';
    this.button.textContent=this.error?'重试配乐':this.pending?'取消配乐':playing?'暂停配乐':'播放配乐';
    this.button.setAttribute('aria-pressed',String(playing));
    document.getElementById('music-panel').dataset.playing=String(playing);
    document.getElementById('music-volume-value').textContent=`${Math.round(this.volume*100)}%`;
    this.slider.setAttribute('aria-valuetext',`${Math.round(this.volume*100)}%`);
    this.status.textContent=this.error|| (this.pending?'正在准备配乐…':playing?(this.volume===0?'已静音 · 调高音量即可听见':'正在播放 · 循环配乐'):document.hidden?'后台暂停':this.enabled?'随摄像头或动作试播播放':'已关闭 · 可随时开启');
  }
  diagnostics(){
    const data=new Float32Array(256);this.analyser?.getFloatTimeDomainData(data);
    return {enabled:this.enabled,volume:this.volume,playing:!!this.source,state:this.context?.state||'uninitialized',duration:this.buffer?.duration||0,loop:this.source?.loop||false,offset:this.offset,error:this.error,rms:Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length)};
  }
}
