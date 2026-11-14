const W=1080,H=1920,c=document.getElementById('c'),X=c.getContext('2d');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2,easeOut=t=>1-Math.pow(1-t,3);
const back=t=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)};
const prog=(t,a,b)=>clamp((t-a)/(b-a));
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const SC=[[0,3],[3,10],[10,17],[17,23],[23,31],[31,36],[36,44],[44,48]];
const C={yellow:'#FFD23F',navy:'#14213D',red:'#FF3B3B',cyan:'#3FD0FF',green:'#7CFF6B',skin:'#7A4A2E',skinD:'#5E3720',hair:'#16100D',coat:'#F4F6FA',coatD:'#D5DBE5',shirt:'#7B4DFF',pants:'#2B3550'};
function rr(x,y,w,h,r){X.beginPath();X.roundRect(x,y,w,h,r)}
function lg(x0,y0,x1,y1,stops){const g=X.createLinearGradient(x0,y0,x1,y1);stops.forEach((s,i)=>g.addColorStop(i/(stops.length-1),s));return g}
function ell(x,y,rx,ry,fill){X.beginPath();X.ellipse(x,y,rx,ry,0,0,Math.PI*2);X.fillStyle=fill;X.fill()}
function zoom(s,cx,cy){X.translate(cx,cy);X.scale(s,s);X.translate(-cx,-cy)}
function vignette(a){const g=X.createRadialGradient(W/2,H*.45,300,W/2,H*.45,1250);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${a})`);X.fillStyle=g;X.fillRect(0,0,W,H)}

// ---------- text ----------
function wrapWords(words,font,maxW){X.font=font;const lines=[[]];let w=0;const sp=X.measureText(' ').width;
  words.forEach(wd=>{const ww=X.measureText(wd.t).width;if(w+ww>maxW&&lines[lines.length-1].length){lines.push([]);w=0}lines[lines.length-1].push({...wd,w:ww});w+=ww+sp});return lines}
function drawLines(lines,font,cx,cy,lh,stroke,scale=1){X.save();X.translate(cx,cy);X.scale(scale,scale);X.font=font;X.textBaseline='middle';X.textAlign='left';X.lineJoin='round';
  const sp=X.measureText(' ').width,tot=lines.length*lh;
  lines.forEach((ln,i)=>{const lw=ln.reduce((a,b)=>a+b.w,0)+sp*(ln.length-1);let x=-lw/2;const y=-tot/2+lh*(i+.5);
    ln.forEach(wd=>{X.lineWidth=stroke;X.strokeStyle='#0B0B0B';X.strokeText(wd.t,x,y);X.fillStyle=wd.k?C.yellow:'#fff';X.fillText(wd.t,x,y);x+=wd.w+sp})});X.restore()}
function toWords(text,kw){const out=[];const lo=text.toLowerCase(),ki=kw?lo.indexOf(kw.toLowerCase()):-1;let pos=0;
  text.split(' ').forEach(t=>{const st=lo.indexOf(t.toLowerCase(),pos);pos=st+t.length;out.push({t,k:ki>=0&&st<ki+kw.length&&st+t.length>ki})});return out}
function headline(items,y,t0,t,size=90,t1=1e9){if(t<t0||t>t1)return;size*=.88;const p=clamp((t-t0)/.28),sc=back(p);
  let lines=[];items.forEach(([s,k])=>lines.push(...wrapWords(toWords(s,k),`${size}px P`,960)));
  drawLines(lines,`${size}px P`,W/2,y,size*1.12,size*.16,Math.max(.01,sc))}
function pill(text,x,y,t0,t,o={}){if(t<t0||(o.t1&&t>o.t1))return;const p=clamp((t-t0)/.25),sc=back(p);X.save();X.translate(x,y);X.scale(sc,sc);
  const fs=(o.fs||38)*.9;X.font=`${fs}px P`;const tw=X.measureText(text).width,pw=tw+70,ph=fs*1.8;X.fillStyle=o.bg||C.navy;X.shadowColor='rgba(0,0,0,.35)';X.shadowBlur=18;
  rr(-pw/2,-ph/2,pw,ph,ph/2);X.fill();X.shadowBlur=0;X.fillStyle=o.dot||C.yellow;X.beginPath();X.arc(-pw/2+30,0,9,0,7);X.fill();
  X.fillStyle='#fff';X.textBaseline='middle';X.textAlign='center';X.fillText(text,12,2);X.restore()}
function bigX(x,y,s,p){X.save();X.translate(x,y);X.scale(s*p,s*p);X.lineCap='round';[['#fff',58],[C.red,40]].forEach(([col,w])=>{X.strokeStyle=col;X.lineWidth=w;X.beginPath();X.moveTo(-150,-150);X.lineTo(150,150);X.moveTo(150,-150);X.lineTo(-150,150);X.stroke()});X.restore()}
function check(x,y,s,p){if(p<=0)return;X.save();X.translate(x,y);X.scale(s*back(p),s*back(p));ell(0,0,44,44,'#2BB673');X.strokeStyle='#fff';X.lineWidth=12;X.lineCap='round';X.beginPath();X.moveTo(-20,2);X.lineTo(-4,18);X.lineTo(22,-14);X.stroke();X.restore()}
function stamp(txt,x,y,t0,t,col=C.red){if(t<t0)return;const p=clamp((t-t0)/.2);X.save();X.translate(x,y);X.rotate(-.18);X.scale(lerp(1.8,1,p),lerp(1.8,1,p));X.globalAlpha=p;X.font='60px P';const w=X.measureText(txt).width+60;X.strokeStyle=col;X.lineWidth=10;rr(-w/2,-52,w,104,16);X.stroke();X.fillStyle=col;X.textAlign='center';X.textBaseline='middle';X.fillText(txt,0,6);X.restore()}

