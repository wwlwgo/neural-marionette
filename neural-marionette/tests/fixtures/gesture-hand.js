// Synthetic landmarks for deterministic tests; not a recorded human hand.
export function hand(kind='open',{x=0,y=0,angle=0,scale=1}={}){
  if(kind==='twoDown'){kind='two';angle+=Math.PI;y-=.60;}
  const p=Array.from({length:21},()=>({x:.5,y:.7,z:0}));p[0]={x:.5,y:.8,z:0};
  p[1]={x:.42,y:.73,z:0};p[2]={x:.36,y:.68,z:0};p[3]={x:.30,y:.62,z:0};p[4]={x:.25,y:.56,z:0};
  [5,9,13,17].forEach((m,i)=>{const fx=.40+i*.065,fold=kind==='fist'||(kind==='two'&&i>1)||(kind==='one'&&i>0);
    p[m]={x:fx,y:.58,z:0};p[m+1]={x:fx,y:.46,z:0};p[m+2]={x:fx,y:fold?.54:.36,z:0};p[m+3]={x:fx,y:fold?.65:.27,z:0};});
  if(kind==='pinch')p[4]={...p[8],x:p[8].x+.025};
  if(['two','one','fist'].includes(kind))p[4]={x:.48,y:.62,z:0};
  return p.map(v=>{const dx=(v.x-.5)*scale,dy=(v.y-.8)*scale;return {x:.5+x+dx*Math.cos(angle)-dy*Math.sin(angle),y:.8+y+dx*Math.sin(angle)+dy*Math.cos(angle),z:0};});
}
