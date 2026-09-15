// Original procedural score; no sampled music. Run from app directory (requires ffmpeg).
import {writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const sr=32000,bpm=100,beat=60/bpm,bar=beat*4,seconds=bar*32,n=Math.round(sr*seconds);
const mix=[new Float32Array(n),new Float32Array(n)],space=[new Float32Array(n),new Float32Array(n)];
let seed=71923;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
const hz=m=>440*2**((m-69)/12),tau=2*Math.PI;
function add(start,duration,voice,level=.1,pan=0,wet=false){
 const length=Math.floor(duration*sr),at=Math.round(start*sr),dest=wet?space:mix;
 const left=Math.sqrt((1-pan)/2)*level,right=Math.sqrt((1+pan)/2)*level;
 for(let i=0;i<length;i++){const v=voice(i/sr,i,duration),j=(at+i+n)%n;dest[0][j]+=v*left;dest[1][j]+=v*right;}
}
const chords=[[50,57,60,64,69],[46,53,57,62,65],[53,57,60,64,67],[48,55,60,62,67],[50,57,60,64,69],[46,53,57,62,65],[43,50,53,57,62],[45,52,55,59,64]];
for(let section=0;section<8;section++)chords[section].forEach((m,k)=>{const f=hz(m);add(section*4*bar,4*bar+1.8,(t,i,d)=>{
 const env=Math.min(1,t/1.2)*Math.min(1,(d-t)/1.8);
 return env*(Math.sin(tau*f*t)+.30*Math.sin(tau*f*1.002*t)+.12*Math.sin(tau*f*2*t))*(.87+.13*Math.sin(tau*.13*t+k));
},.031,(k-2)*.30,true);});
const pattern=[0,2,1,3,2,4,1,3];
for(let b=0;b<32;b++){
 const chord=chords[Math.floor(b/4)],root=chord[0]-12;
 for(const pos of [0,1.5,2,3.5]){const f=hz(root+(pos===3.5&&b%4===3?7:0));add(b*bar+pos*beat,.48,t=>(Math.sin(tau*f*t)+.22*Math.sin(tau*f*2*t))*Math.min(1,t/.009)*Math.exp(-t*8),.19);}
 for(const pos of [0,2,...(b%8===7?[2.75]:[])])add(b*bar+pos*beat,.30,t=>Math.sin(tau*(45*t+70*.025*(1-Math.exp(-t/.025))))*Math.min(1,t/.003)*Math.exp(-t*15),.27);
 for(const pos of [1,3])add(b*bar+pos*beat,.16,t=>(noise()*.44+Math.sin(tau*180*t)*.25)*Math.min(1,t/.001)*Math.exp(-t*36),.060,.08);
 for(let h=0;h<8;h++){let last=0;add(b*bar+h*beat/2,.065,t=>{const next=noise(),v=next-last;last=next;return v*Math.min(1,t/.001)*Math.exp(-t*80);},h%2?.020:.011,h%2?.4:-.4);}
 for(let step=0;step<8;step++){
  if((b<4||b>=28)&&step%2)continue;
  const f=hz(chord[pattern[(step+b%4)%8]]+12);
  add(b*bar+step*beat/2+(step%2?.013:0),.65,t=>(Math.sin(tau*f*t+1.4*Math.exp(-t*16)*Math.sin(tau*f*2*t))+.12*Math.sin(tau*f*3*t))*Math.min(1,t/.007)*Math.exp(-t*7),.037,Math.sin(step*1.6)*.45,true);
 }
 if(b%4===2||b%4===3)for(const [pos,k] of [[.5,4],[2.5,3]]){const f=hz(chord[k]+12);add(b*bar+pos*beat,1.8,(t,i,d)=>Math.sin(tau*f*t+.45*Math.sin(tau*f*2*t))*Math.min(1,t/.03)*Math.exp(-t*2.5)*Math.min(1,(d-t)/.2),.045,b%2?.25:-.25,true);}
}
// Circular ambience preserves tails at the loop boundary.
for(let ch=0;ch<2;ch++)for(let i=0;i<n;i++){
 let v=space[ch][i];for(const [delay,gain]of [[.225,.22],[.45,.14],[.675,.08],[1.05,.055]])v+=space[1-ch][(i-Math.round(delay*sr)+n)%n]*gain;
 mix[ch][i]+=v;
}
let peak=0,sum=0;for(let i=0;i<n;i++)for(let ch=0;ch<2;ch++){mix[ch][i]=Math.tanh(mix[ch][i]*1.1);peak=Math.max(peak,Math.abs(mix[ch][i]));}
const gain=.79/peak,pcm=Buffer.alloc(n*4);
for(let i=0;i<n;i++)for(let ch=0;ch<2;ch++){const v=mix[ch][i]*gain;sum+=v*v;pcm.writeInt16LE(Math.round(v*32767),i*4+ch*2);}
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(sr,24);header.writeUInt32LE(sr*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
const temp=mkdtempSync(join(tmpdir(),'neon-orbit-')),wav=join(temp,'neon-orbit.wav');writeFileSync(wav,Buffer.concat([header,pcm]));
mkdirSync('public/music',{recursive:true});
const result=spawnSync('ffmpeg',['-v','error','-y','-i',wav,'-codec:a','libmp3lame','-b:a','160k','-metadata','title=Neon Orbit','-metadata','comment=Original procedural score for Neural Marionette; no sampled music','public/music/neon-orbit.mp3'],{stdio:'inherit'});
if(result.status!==0)throw new Error('ffmpeg encoding failed');
console.log(JSON.stringify({seconds,bpm,peak:.79,rms:Math.sqrt(sum/(n*2)),masterWav:wav,output:'public/music/neon-orbit.mp3'}));
