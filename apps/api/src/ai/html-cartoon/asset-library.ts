/**
 * Quality drawing engine inspired by motor-animacion/scene.html.
 * Island props are OPTIONAL helpers — Fake works for ANY topic via generic
 * primitives + mara/hero character + topic-specific props Claude composes.
 */
export function getAssetLibraryJs(): string {
  return `
const easeOut=t=>1-Math.pow(1-t,3);
const C={yellow:'#FFD23F',navy:'#14213D',red:'#FF3B3B',cyan:'#3FD0FF',skin:'#A9744F',skinD:'#8A5A3A',hair:'#17110F',vest:'#FF8A1F',vestD:'#D96A0A',shorts:'#2F6FD6',shortsD:'#2456A8',top:'#FFFFFF'};
function zoom(s,cx,cy){X.translate(cx,cy);X.scale(s,s);X.translate(-cx,-cy)}
function vignette(a){const g=X.createRadialGradient(W/2,H*.45,300,W/2,H*.45,1250);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,'+a+')');X.fillStyle=g;X.fillRect(0,0,W,H)}

function sky(hz,mode,t){
  mode=mode||0;t=t||0;
  const s=[['#4FA3E0','#8CC8F0','#CDEBFA'],['#5B6FB8','#E58A6B','#FFC27A'],['#0E1838','#1C2B5A','#33457A']][mode]||['#4FA3E0','#8CC8F0','#CDEBFA'];
  X.fillStyle=lg(0,0,0,hz,s);X.fillRect(0,0,W,hz+5);
  if(mode<2){const sy=mode?hz-120:260,sx=mode?820:800;const g=X.createRadialGradient(sx,sy,10,sx,sy,260);g.addColorStop(0,'rgba(255,245,210,.9)');g.addColorStop(1,'rgba(255,230,180,0)');X.fillStyle=g;X.fillRect(0,0,W,hz);ell(sx,sy,64,64,mode?'#FFE2A8':'#FFF6D8')}
  else{ell(820,300,50,50,'#F3F0DC');ell(840,288,44,44,'#1C2B5A');const r=rng(5);X.fillStyle='rgba(255,255,255,.8)';for(let i=0;i<60;i++)X.fillRect(r()*W,r()*hz*.9,3,3)}
  if(mode<2)[[260,240,1],[600,170,.8],[150,420,.7]].forEach(function(p){var cx=p[0],cy=p[1],sc=p[2];X.fillStyle='rgba(255,255,255,.9)';[[0,0,70],[60,10,52],[-60,12,48],[25,-28,48]].forEach(function(q){X.beginPath();X.arc(cx+q[0]*sc+t*5,cy+q[1]*sc,q[2]*sc,0,7);X.fill()})});
}
function sea(hz,shore,t){
  X.fillStyle=lg(0,hz,0,shore,['#1F7FB8','#2FA3C9','#5CCFD6']);X.fillRect(0,hz,W,shore-hz+40);
  X.strokeStyle='rgba(255,255,255,.4)';X.lineWidth=4;
  for(let k=0;k<9;k++){const f=k/9,yy=hz+10+(shore-hz)*Math.pow(f,1.3);X.beginPath();for(let x=0;x<=W;x+=24)X.lineTo(x,yy+Math.sin(x*.02+t*1.6+k*1.3)*(3+f*6));X.stroke()}
}
function sand(shore,t){
  X.fillStyle=lg(0,shore,0,H,['#F5DEA6','#EBCB88','#D9B271']);X.beginPath();X.moveTo(0,shore+20);
  for(let x=0;x<=W;x+=30)X.lineTo(x,shore+Math.sin(x*.006+.5)*25);X.lineTo(W,H);X.lineTo(0,H);X.fill();
  X.fillStyle='rgba(120,90,50,.18)';X.beginPath();for(let x=0;x<=W;x+=30)X.lineTo(x,shore+8+Math.sin(x*.006+.5)*25);for(let x=W;x>=0;x-=30)X.lineTo(x,shore+50+Math.sin(x*.006+.5)*25);X.fill();
  const fo=Math.sin(t*1.5)*12;X.strokeStyle='rgba(255,255,255,.9)';X.lineWidth=10;X.lineCap='round';X.beginPath();for(let x=0;x<=W;x+=30)X.lineTo(x,shore-6+fo+Math.sin(x*.006+.5)*25+Math.sin(x*.05+t*3)*4);X.stroke();
  const r=rng(9);X.fillStyle='rgba(160,120,70,.25)';for(let i=0;i<140;i++){const y=shore+60+r()*(H-shore);X.fillRect(r()*W,y,3,3)}
}
function palm(x,base,s,t){X.save();X.translate(x,base);X.scale(s,s);
  ell(40,0,110,18,'rgba(80,60,30,.25)');
  for(let i=0;i<12;i++){const y=-i*48,dx=Math.sin(i*.22)*i*6;X.fillStyle=i%2?'#9B6B3E':'#8A5C33';rr(-24+dx,y-50,48,52,14);X.fill()}
  const tx=Math.sin(11*.22)*66,ty=-600;
  [[-2.6,1],[-2.0,.9],[-1.2,1],[-.5,.95],[.2,1],[-3.0,.8]].forEach(function(p,k){var a=p[0],l=p[1];const sw=Math.sin(t*1.5+k)*.04;X.save();X.translate(tx,ty);X.rotate(a+sw);
    X.fillStyle=k%2?'#2E9E4A':'#3BB55A';X.beginPath();X.moveTo(0,0);X.quadraticCurveTo(140*l,-70,300*l,30);X.quadraticCurveTo(150*l,0,0,14);X.fill();
    X.strokeStyle='#23803A';X.lineWidth=4;X.beginPath();X.moveTo(0,6);X.quadraticCurveTo(150*l,-40,295*l,28);X.stroke();X.restore()});
  ell(tx-14,ty+18,20,20,'#6B4A2B');ell(tx+16,ty+22,20,20,'#5E4126');X.restore()}

function ground(y,t,cols){
  cols=cols||['#5C4A32','#3E3224','#2A2218'];
  X.fillStyle=lg(0,y,0,H,cols);X.beginPath();X.moveTo(0,y+10);
  for(let x=0;x<=W;x+=40)X.lineTo(x,y+Math.sin(x*.01+t*.4)*18);X.lineTo(W,H);X.lineTo(0,H);X.fill();
}
function room(floorY,wallCols,floorCols){
  wallCols=wallCols||['#F5E6D3','#E8D4BC'];
  floorCols=floorCols||['#C4A574','#A68554'];
  X.fillStyle=lg(0,0,0,floorY,wallCols);X.fillRect(0,0,W,floorY);
  X.fillStyle=lg(0,floorY,0,H,floorCols);X.fillRect(0,floorY,W,H-floorY);
  X.fillStyle='rgba(0,0,0,.06)';X.fillRect(0,floorY-8,W,16);
}
function citySkyline(hz,t){
  X.fillStyle=lg(0,0,0,hz,['#87B7E0','#D6E9F8']);X.fillRect(0,0,W,hz);
  const r=rng(11);
  for(let i=0;i<14;i++){const bw=50+r()*90,bh=80+r()*280,bx=i*(W/12)-20;X.fillStyle=r()>.5?'#3D4F66':'#2C3A4D';rr(bx,hz-bh,bw,bh,4);X.fill();
    X.fillStyle='rgba(255,220,120,.55)';for(let wy=hz-bh+20;wy<hz-20;wy+=28){for(let wx=bx+10;wx<bx+bw-10;wx+=22){if(r()>.35)X.fillRect(wx,wy,10,14)}}}
  X.fillStyle='#4A5562';X.fillRect(0,hz,W,H-hz);
}
function desk(x,y,s){X.save();X.translate(x,y);X.scale(s||1,s||1);
  X.fillStyle='#8B5A2B';rr(-220,-20,440,40,8);X.fill();X.fillStyle='#6B4423';rr(-200,20,40,120,6);X.fill();rr(160,20,40,120,6);X.fill();
  X.restore()}
function phone(x,y,s,t){X.save();X.translate(x,y);X.scale(s||1,s||1);X.rotate(Math.sin((t||0)*3)*.05);
  X.fillStyle='#1a1a1a';rr(-36,-70,72,140,16);X.fill();X.fillStyle='#3FD0FF';rr(-28,-58,56,100,8);X.fill();
  X.restore()}
function panel(x,y,w,h,title){X.fillStyle=C.navy;rr(x,y,w,h,16);X.fill();X.strokeStyle=C.yellow;X.lineWidth=4;X.stroke();
  if(title){X.fillStyle='#fff';X.font='32px P';X.textAlign='center';X.textBaseline='middle';X.fillText(title,x+w/2,y+40)}}
function smoke(x,y,t,seed,n){
  n=n||8;seed=seed||0;
  for(let k=0;k<n;k++){const ph=((t*.4+k/n+seed*.1)%1);ell(x+Math.sin(ph*6+k)*30*ph,y-ph*280,20+ph*40,20+ph*40,'rgba(180,180,180,'+(0.45*(1-ph))+')')}
}
function bunkerDoor(x,y,s,openAmt){
  openAmt=clamp(openAmt||0);X.save();X.translate(x,y);X.scale(s,s);
  X.fillStyle='#2A3038';rr(-160,-220,320,280,12);X.fill();
  X.fillStyle='#1a1f26';rr(-140,-200,280,240,8);X.fill();
  X.save();X.translate(-140*openAmt,0);X.fillStyle=lg(-140,-200,140,40,['#4A5562','#2F3740']);rr(-140,-200,140,240,[8,0,0,8]);X.fill();
  X.strokeStyle='#FFD23F';X.lineWidth=6;X.strokeRect(-120,-160,100,40);X.restore();
  X.save();X.translate(140*openAmt,0);X.fillStyle=lg(-140,-200,140,40,['#2F3740','#4A5562']);rr(0,-200,140,240,[0,8,8,0]);X.fill();X.restore();
  X.strokeStyle='#8A939E';X.lineWidth=10;X.beginPath();X.moveTo(-150,-40);X.lineTo(150,-40);X.moveTo(-150,40);X.lineTo(150,40);X.stroke();
  X.restore();
}
function rubble(x,y,s,seed){
  X.save();X.translate(x,y);X.scale(s||1,s||1);const r=rng(seed||3);
  for(let i=0;i<12;i++){const w=20+r()*40,h=14+r()*28;X.fillStyle=r()>.5?'#6B7280':'#4B5563';rr(-80+r()*160,-20+r()*40,w,h,4);X.fill()}
  X.restore();
}

function mara(cx,by,s,o){
  o=o||{};
  const ex=o.expr||'neutral',walk=o.walk||0,vest=o.vest!==false;
  const A=o.armL||[12,12],B=o.armR||[12,12];
  const vestC=o.vestColor||C.vest, vestD=o.vestDark||C.vestD, vestHi=o.vestHi||'#FFA347';
  const shortsC=o.shortsColor||C.shorts, shortsD=o.shortsDark||C.shortsD;
  const topC=o.topColor||C.top;
  X.save();X.translate(cx,by);X.scale(s,s);X.lineCap='round';X.lineJoin='round';
  [-1,1].forEach(function(sd){X.save();X.translate(sd*28,-150);X.rotate(Math.sin(walk)*.25*sd);X.fillStyle=lg(-15,0,15,0,[C.skin,C.skinD]);rr(-15,0,30,140,13);X.fill();ell(sd*6,142,24,11,C.skinD);X.restore()});
  X.fillStyle=lg(-58,0,58,0,[shortsC,shortsD]);rr(-58,-212,116,74,16);X.fill();
  const sh=-366;
  function arm(sd,angs){const a1=angs[0],a2=angs[1];const r1=a1*Math.PI/180,r2=a2*Math.PI/180;const ex1=sd*54+Math.sin(r1)*80*sd,ey1=sh+Math.cos(r1)*80;const hx=ex1+Math.sin(r2)*82*sd,hy=ey1+Math.cos(r2)*82;
    X.strokeStyle=C.skinD;X.lineWidth=30;X.beginPath();X.moveTo(sd*54,sh);X.lineTo(ex1,ey1);X.lineTo(hx,hy);X.stroke();
    X.strokeStyle=C.skin;X.lineWidth=24;X.beginPath();X.moveTo(sd*54,sh);X.lineTo(ex1,ey1);X.lineTo(hx,hy);X.stroke();ell(hx,hy,18,18,C.skin);return[hx,hy]}
  const hL=arm(-1,A),hR=arm(1,B);
  X.fillStyle=topC;rr(-62,-394,124,190,40);X.fill();
  if(vest){X.fillStyle=lg(-66,-390,66,-210,[vestHi,vestC,vestD]);rr(-66,-392,52,178,[30,10,14,24]);X.fill();rr(14,-392,52,178,[10,30,24,14]);X.fill();
    X.fillStyle='#E9EEF2';X.fillRect(-66,-300,52,14);X.fillRect(14,-300,52,14);X.fillStyle='#222';X.fillRect(-18,-302,36,10)}
  X.fillStyle=C.skinD;rr(-14,-418,28,28,8);X.fill();
  const hg=X.createRadialGradient(-18,-488,10,0,-458,80);hg.addColorStop(0,'#BE8A62');hg.addColorStop(1,C.skin);ell(0,-458,62,64,hg);
  X.fillStyle=C.hair;X.beginPath();X.arc(0,-470,64,Math.PI*1.02,Math.PI*1.98);X.fill();ell(0,-548,34,30,C.hair);ell(-52,-470,14,26,C.hair);ell(52,-470,14,26,C.hair);
  X.fillStyle='#FF5A7A';rr(-22,-526,44,10,5);X.fill();
  const surpr=ex=='surprised',worry=ex=='worried'||ex=='tired';
  [-22,22].forEach(function(fx){ell(fx,-460,surpr?12:10,surpr?15:12,'#fff');ell(fx+2,-458,6,7,'#1a1a1a');X.strokeStyle='#1a1a1a';X.lineWidth=3;X.beginPath();X.moveTo(fx-11,-470);X.lineTo(fx-15,-476);X.stroke()});
  X.strokeStyle=C.hair;X.lineWidth=6;X.beginPath();
  if(worry){X.moveTo(-34,-480);X.lineTo(-12,-488);X.moveTo(34,-480);X.lineTo(12,-488)}else if(surpr){X.moveTo(-34,-490);X.quadraticCurveTo(-22,-498,-10,-490);X.moveTo(34,-490);X.quadraticCurveTo(22,-498,10,-490)}else if(ex=='hero'){X.moveTo(-34,-488);X.lineTo(-10,-480);X.moveTo(34,-488);X.lineTo(10,-480)}else{X.moveTo(-34,-484);X.lineTo(-11,-487);X.moveTo(34,-484);X.lineTo(11,-487)}X.stroke();
  ell(-38,-436,10,6,'rgba(230,100,90,.4)');ell(38,-436,10,6,'rgba(230,100,90,.4)');
  X.fillStyle='#6B1F1F';X.strokeStyle='#6B1F1F';X.lineWidth=5;
  if(surpr)ell(0,-426,9,12,'#6B1F1F');
  else if(ex=='laugh'){X.beginPath();X.arc(0,-436,18,0,Math.PI);X.fill()}
  else if(ex=='happy'){X.beginPath();X.arc(0,-438,15,Math.PI*.15,Math.PI*.85);X.stroke()}
  else if(worry){X.beginPath();X.arc(0,-418,13,Math.PI*1.15,Math.PI*1.85);X.stroke()}
  else if(ex=='hero'){X.beginPath();X.moveTo(-12,-430);X.lineTo(12,-433);X.stroke()}
  else{X.beginPath();X.moveTo(-9,-430);X.lineTo(9,-430);X.stroke()}
  X.restore();return[[cx+hL[0]*s,by+hL[1]*s],[cx+hR[0]*s,by+hR[1]*s]];
}
/** Alias: same character engine for any topic. */
const hero=mara;

function fire(x,y,s,t,seed){X.save();X.translate(x,y);X.scale(s,s);seed=seed||0;
  X.strokeStyle='#6B4A2B';X.lineWidth=12;X.lineCap='round';X.beginPath();X.moveTo(-34,8);X.lineTo(34,-6);X.moveTo(-34,-6);X.lineTo(34,8);X.stroke();
  for(let i=0;i<3;i++){const f=1+Math.sin(t*14+i*2+seed)*.12;X.fillStyle=['#FF5A1F','#FF9A1F','#FFE04A'][i];X.beginPath();X.moveTo(-30+i*10,0);X.quadraticCurveTo(-26+i*8,-60*f*(1-i*.22),0,-100*f*(1-i*.25));X.quadraticCurveTo(26-i*8,-60*f*(1-i*.22),30-i*10,0);X.fill()}
  for(let k=0;k<6;k++){const ph=((t*.35+k/6+seed*.1)%1);ell(Math.sin(ph*6+k)*20*ph,-110-ph*360,26+ph*50,26+ph*50,'rgba(210,210,210,'+(0.45*(1-ph))+')')}
  X.restore()}

function wrapWordsLib(words,font,maxW){X.font=font;const lines=[[]];let w=0;const sp=X.measureText(' ').width;
  words.forEach(function(wd){const ww=X.measureText(wd.t).width;if(w+ww>maxW&&lines[lines.length-1].length){lines.push([]);w=0}lines[lines.length-1].push(Object.assign({},wd,{w:ww}));w+=ww+sp});return lines}
function drawLinesLib(lines,font,cx,cy,lh,stroke,scale){scale=scale==null?1:scale;X.save();X.translate(cx,cy);X.scale(scale,scale);X.font=font;X.textBaseline='middle';X.textAlign='left';X.lineJoin='round';
  const sp=X.measureText(' ').width,tot=lines.length*lh;
  lines.forEach(function(ln,i){const lw=ln.reduce(function(a,b){return a+b.w},0)+sp*(ln.length-1);let x=-lw/2;const y=-tot/2+lh*(i+.5);
    ln.forEach(function(wd){X.lineWidth=stroke;X.strokeStyle='#0B0B0B';X.strokeText(wd.t,x,y);X.fillStyle=wd.k?C.yellow:'#fff';X.fillText(wd.t,x,y);x+=wd.w+sp})});X.restore()}
function toWordsLib(text,kw){const out=[];const lo=String(text||'').toLowerCase(),ki=kw?lo.indexOf(String(kw).toLowerCase()):-1;let pos=0;
  String(text||'').split(' ').forEach(function(t){if(!t)return;const st=lo.indexOf(t.toLowerCase(),pos);pos=st+t.length;out.push({t:t,k:ki>=0&&st<ki+kw.length&&st+t.length>ki})});return out}
function headline(items,y,t0,t,size,t1){
  size=size||90;t1=t1==null?1e9:t1;if(t<t0||t>t1)return;if(!items||!items.length)return;
  const p=clamp((t-t0)/.28),sc=back(p);let lines=[];
  items.forEach(function(it){var s=Array.isArray(it)?it[0]:it,k=Array.isArray(it)?it[1]:'';lines=lines.concat(wrapWordsLib(toWordsLib(s,k),size+'px P',960))});
  drawLinesLib(lines,size+'px P',W/2,y,size*1.12,size*.16,Math.max(.01,sc))}
function pill(text,x,y,t0,t,o){o=o||{};if(t<t0||(o.t1&&t>o.t1))return;const p=clamp((t-t0)/.25),sc=back(p);X.save();X.translate(x,y);X.scale(sc,sc);
  const fs=o.fs||38;X.font=fs+'px P';const tw=X.measureText(text).width,pw=tw+70,ph=fs*1.8;X.fillStyle=o.bg||C.navy;X.shadowColor='rgba(0,0,0,.35)';X.shadowBlur=18;
  rr(-pw/2,-ph/2,pw,ph,ph/2);X.fill();X.shadowBlur=0;X.fillStyle=o.dot||C.yellow;X.beginPath();X.arc(-pw/2+30,0,9,0,7);X.fill();
  X.fillStyle='#fff';X.textBaseline='middle';X.textAlign='center';X.fillText(text,12,2);X.restore()}
function bigX(x,y,s,p){X.save();X.translate(x,y);X.scale(s*p,s*p);X.lineCap='round';[['#fff',58],[C.red,40]].forEach(function(pair){X.strokeStyle=pair[0];X.lineWidth=pair[1];X.beginPath();X.moveTo(-150,-150);X.lineTo(150,150);X.moveTo(150,-150);X.lineTo(-150,150);X.stroke()});X.restore()}
function stamp(txt,x,y,t0,t,col){col=col||C.red;if(t<t0)return;const p=clamp((t-t0)/.2);X.save();X.translate(x,y);X.rotate(-.18);X.scale(lerp(1.8,1,p),lerp(1.8,1,p));X.globalAlpha=p;X.font='76px P';const w=X.measureText(txt).width+60;X.strokeStyle=col;X.lineWidth=11;rr(-w/2,-58,w,116,16);X.stroke();X.fillStyle=col;X.textAlign='center';X.textBaseline='middle';X.fillText(txt,0,6);X.restore()}

window.C=C;window.sky=sky;window.sea=sea;window.sand=sand;window.palm=palm;window.ground=ground;
window.room=room;window.citySkyline=citySkyline;window.desk=desk;window.phone=phone;window.panel=panel;
window.smoke=smoke;window.bunkerDoor=bunkerDoor;window.rubble=rubble;window.mara=mara;window.hero=hero;window.fire=fire;
window.zoom=zoom;window.vignette=vignette;window.headline=headline;window.pill=pill;window.bigX=bigX;window.stamp=stamp;
window.easeOut=easeOut;
`;
}

/** Core API card for choreography (topic pack adds drawHero/env/props). */
export const CORE_API_DOCS = `CORE LIBRARY (always loaded — DO NOT redefine):
- Utils: clamp,lerp,prog,ease,easeOut,back,rng, rr,ell,lg, zoom(s,cx,cy), vignette(a)
- Colors: C.yellow, C.navy, C.red, C.cyan, C.skin, C.vest, ...
- Text: headline([['LINE','KEYWORD'],...], y, t0, t, size?, t1?), pill(...), bigX(...), stamp(...)
- Canvas: W=1080 H=1920 X=ctx. Use X.save()/X.restore() with zoom/clip.
- Base envs: sky(hz, mode 0day|1sunset|2night, t), ground(y,t,cols?), room(floorY, wallCols?, floorCols?),
  citySkyline(hz,t), desk(x,y,s), phone(x,y,s,t), panel(x,y,w,h,title?), smoke(...), fire(...)
- Legacy only (prefer topic-pack drawHero): mara/hero — detailed caricature fallback.
- Optional theme helpers (ONLY if WorldSpec asks): sea, sand, palm, bunkerDoor, rubble

A TOPIC PACK is also loaded with drawHero + env/prop helpers for THIS clip. Prefer those.`

/** @deprecated Use CORE_API_DOCS — kept for callers during transition. */
export const LIBRARY_API_DOCS = CORE_API_DOCS;
