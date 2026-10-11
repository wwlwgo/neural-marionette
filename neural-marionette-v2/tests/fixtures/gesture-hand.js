// Synthetic landmarks for deterministic tests; not a recorded human hand.
export function hand(kind='open',{x=0,y=0,angle=0,scale=1,indexBend=0,middleBend=null}={}){
  if(kind==='twoDown'){kind='two';angle+=Math.PI;y-=.60;}
  const p=Array.from({length:21},()=>({x:.5,y:.7,z:0}));p[0]={x:.5,y:.8,z:0};
  p[1]={x:.42,y:.73,z:0};p[2]={x:.36,y:.68,z:0};p[3]={x:.30,y:.62,z:0};p[4]={x:.25,y:.56,z:0};
  [5,9,13,17].forEach((m,i)=>{const fx=.40+i*.065,fold=kind==='fist'||(kind==='run'&&(i===1||i===2))||(kind==='two'&&i>1)||(kind==='one'&&i>0);
    p[m]={x:fx,y:.58,z:0};p[m+1]={x:fx,y:.46,z:0};p[m+2]={x:fx,y:fold?.54:.36,z:0};p[m+3]={x:fx,y:fold?.65:.27,z:0};});
  if(kind==='run'){p[6].y+=.025*indexBend;p[7].y+=.085*indexBend;p[8].y+=.16*indexBend;}
  if(middleBend!==null){
    [5,9,13].forEach((m,i)=>{
      const bend=Array.isArray(middleBend)?middleBend[i]:middleBend;
      [.12,.10,.09].forEach((length,j)=>{
        const a=.2+(.6+j*.55)*bend,prev=p[m+j];
        p[m+j+1]={x:prev.x,y:prev.y-length*Math.cos(a),z:prev.z+length*Math.sin(a)/(16/9)};
      });
    });
  }
  if(kind==='pinch')p[4]={...p[8],x:p[8].x+.025};
  if(['two','one','fist'].includes(kind))p[4]={x:.48,y:.62,z:0};
  return p.map(v=>{const dx=(v.x-.5)*scale,dy=(v.y-.8)*scale;return {x:.5+x+dx*Math.cos(angle)-dy*Math.sin(angle),y:.8+y+dx*Math.sin(angle)+dy*Math.cos(angle),z:v.z*scale};});
}

// Rotate in equal image-height units, then return MediaPipe-style x/y/z.
export function orientHand(points,{pitch=0,yaw=0,roll=0,aspect=16/9,scale=1,shift=0,mirror=false}={}){
 const wrist=points[0];
 return points.map(p=>{
  let x=(p.x-wrist.x)*aspect,y=p.y-wrist.y,z=(p.z-wrist.z)*aspect;
  [y,z]=[y*Math.cos(pitch)-z*Math.sin(pitch),y*Math.sin(pitch)+z*Math.cos(pitch)];
  [x,z]=[x*Math.cos(yaw)+z*Math.sin(yaw),-x*Math.sin(yaw)+z*Math.cos(yaw)];
  [x,y]=[x*Math.cos(roll)-y*Math.sin(roll),x*Math.sin(roll)+y*Math.cos(roll)];
  return {x:.5+(mirror?-1:1)*x*scale/aspect+shift,y:.6+y*scale,z:z*scale/aspect};
 });
}
