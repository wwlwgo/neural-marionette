export const LM = Object.freeze({WRIST:0,THUMB_TIP:4,INDEX_MCP:5,INDEX_TIP:8,MIDDLE_MCP:9,MIDDLE_TIP:12,RING_TIP:16,PINKY_MCP:17});
export const CONNECTIONS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const deadzone=(x,d)=>Math.sign(x)*Math.max(0,Math.abs(x)-d);
export function approach(current,target,dt,tau,maxSpeed=Infinity){const delta=(target-current)*(1-Math.exp(-Math.max(0,dt)/Math.max(.001,tau)));return current+clamp(delta,-maxSpeed*dt,maxSpeed*dt);}
export function validHand(points){return Array.isArray(points)&&points.length===21&&points.every(p=>['x','y','z'].every(k=>Number.isFinite(p[k]))&&p.x>-.25&&p.x<1.25&&p.y>-.25&&p.y<1.25);}
export function containRect(box,vw,vh){const scale=Math.min(box.w/vw,box.h/vh);const w=vw*scale,h=vh*scale;return{x:box.x+(box.w-w)/2,y:box.y+(box.h-h)/2,w,h};}
export function screenPoint(p,rect,mirror){return{x:rect.x+(mirror?1-p.x:p.x)*rect.w,y:rect.y+p.y*rect.h};}
export class LandmarkFilter{
 constructor(tau){this.tau=tau;this.points=null;this.time=null;}
 reset(){this.points=null;this.time=null;}
 update(points,time){if(!validHand(points))return null;const dt=this.time===null?1:clamp((time-this.time)/1000,0,.1);this.time=time;if(!this.points)this.points=structuredClone(points);else this.points=this.points.map((p,i)=>Object.fromEntries(['x','y','z'].map(k=>[k,approach(p[k],points[i][k],dt,this.tau/1000)])));return this.points;}
}
export class TrackingState{
 constructor(config){this.config=config;this.reset();}
 reset(){this.state='Searching';this.streak=0;this.lastSeen=-Infinity;this.lastFrame=-Infinity;this.locked=false;}
 frame(found,time,moving=false){this.lastFrame=time;if(found){this.lastSeen=time;this.streak++;if(this.streak>=this.config.acquire_frames)this.locked=true;this.state=this.locked?(moving?'Controlling':'Linked'):'Acquiring';}else{this.streak=0;this.tick(time);}return this.state;}
 tick(time){if(time-this.lastSeen>this.config.lost_timeout_ms){this.state=this.lastSeen===-Infinity?'Searching':'Lost';this.locked=false;this.streak=0;}if(time-this.lastSeen>this.config.lost_timeout_ms+1000)this.state='Searching';return this.state;}
 get active(){return this.locked&&(this.state==='Linked'||this.state==='Controlling');}
}
export function calibration(points,mirror){const p=points.map(p=>({...p,x:mirror?1-p.x:p.x}));const wrist=p[LM.WRIST];const scale=Math.max(.07,Math.hypot(p[LM.MIDDLE_MCP].x-wrist.x,p[LM.MIDDLE_MCP].y-wrist.y));return {wrist:{...wrist},scale,local:p.map(v=>({x:(v.x-wrist.x)/scale,y:(v.y-wrist.y)/scale})),roll:Math.atan2(p[5].y-p[17].y,p[5].x-p[17].x)};}
export function mapPose(points,base,mirror,config){const p=points.map(p=>({...p,x:mirror?1-p.x:p.x}));const wrist=p[0];const scale=Math.max(.07,Math.hypot(p[9].x-wrist.x,p[9].y-wrist.y));const limit=config.max_rotation_deg*Math.PI/180;const roll=Math.atan2(p[5].y-p[17].y,p[5].x-p[17].x)-base.roll;const local=(index,axis)=>{const dx=(p[index].x-wrist.x)/scale,dy=(p[index].y-wrist.y)/scale;const aligned=axis==='x'?dx*Math.cos(roll)+dy*Math.sin(roll):-dx*Math.sin(roll)+dy*Math.cos(roll);return deadzone(aligned-base.local[index][axis],config.dead_zone)*config.gain;};const bounded=x=>clamp(x,-limit,limit);return {x:clamp(deadzone(wrist.x-base.wrist.x,config.dead_zone)*3*config.gain,-.65,.65),y:clamp(-deadzone(wrist.y-base.wrist.y,config.dead_zone)*2*config.gain,-.4,.4),root:bounded((wrist.x-base.wrist.x)*1.3*config.gain),left:bounded(-local(4,'y')*.85+local(4,'x')*.25),right:bounded(local(8,'y')*.85-local(8,'x')*.25),head:bounded(local(12,'x')*.65),nod:bounded(local(12,'y')*.5),chest:bounded(local(16,'x')*.45)};}
export const NEUTRAL={x:0,y:0,root:0,left:0,right:0,head:0,nod:0,chest:0};
export function syntheticHand(time,cursor={x:.5,y:.5}){const base=[[.52,.84],[.42,.70],[.33,.61],[.25,.53],[.19,.46],[.42,.56],[.40,.39],[.40,.27],[.40,.17],[.53,.53],[.54,.34],[.55,.21],[.55,.11],[.64,.56],[.67,.39],[.68,.28],[.68,.19],[.73,.62],[.78,.49],[.81,.41],[.83,.34]];return base.map(([x,y],i)=>({x:x+(cursor.x-.5)*.35+Math.sin(time*.8)*.025,y:y+(cursor.y-.5)*.3+Math.sin(time*1.2+i*.37)*.018*(i%4),z:0}));}
export function curvePoint(a,b,bend,t){const c1={x:a.x+(b.x-a.x)*.36,y:a.y+bend},c2={x:a.x+(b.x-a.x)*.72,y:b.y+bend};const u=1-t;return{x:u**3*a.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t**3*b.x,y:u**3*a.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t**3*b.y};}
