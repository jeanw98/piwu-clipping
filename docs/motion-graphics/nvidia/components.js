const SC=[[0,3.5],[3.5,6],[6,17],[17,19.5],[19.5,30],[30,37],[37,44],[44,50]];
const C={yellow:'#FFD23F',navy:'#14213D',red:'#FF3B3B',cyan:'#3FD0FF',green:'#76B900',greenL:'#A8E05F'};
function techBg(t,dim=0){X.fillStyle=lg(0,0,0,H,['#06120A','#0B1E12','#050B07']);X.fillRect(0,0,W,H);
  X.strokeStyle='rgba(118,185,0,.10)';X.lineWidth=2;for(let x=0;x<=W;x+=60){X.beginPath();X.moveTo(x,0);X.lineTo(x,H);X.stroke()}for(let y=(t*20)%60;y<=H;y+=60){X.beginPath();X.moveTo(0,y);X.lineTo(W,y);X.stroke()}
  const r=rng(4);for(let i=0;i<40;i++){const x=Math.floor(r()*18)*60,y=Math.floor(r()*32)*60,ph=(t*.5+r())%1;X.fillStyle=`rgba(168,224,95,${.5*(1-ph)})`;X.fillRect(x-3,y-3,6,6)}
  if(dim){X.fillStyle=`rgba(0,0,0,${dim})`;X.fillRect(0,0,W,H)}}
function chip(x,y,s,t,glow=1){X.save();X.translate(x,y);X.scale(s,s);
  if(glow){const g=X.createRadialGradient(0,0,40,0,0,320);g.addColorStop(0,`rgba(118,185,0,${.45*glow})`);g.addColorStop(1,'rgba(118,185,0,0)');X.fillStyle=g;X.fillRect(-340,-340,680,680)}
  X.fillStyle='#B8C2B0';for(let i=-4;i<=4;i++){X.fillRect(i*36-6,-230,12,40);X.fillRect(i*36-6,190,12,40);X.fillRect(-230,i*36-6,40,12);X.fillRect(190,i*36-6,40,12)}
  X.fillStyle='#1C2A1F';rr(-195,-195,390,390,30);X.fill();X.fillStyle='#2C3D2F';rr(-150,-150,300,300,20);X.fill();
  X.strokeStyle=C.green;X.lineWidth=4;X.globalAlpha=.6+.4*Math.sin(t*4);rr(-150,-150,300,300,20);X.stroke();X.globalAlpha=1;
  X.font='64px P';X.textAlign='center';X.textBaseline='middle';X.fillStyle=C.greenL;X.fillText('IA',0,4);X.restore()}
function silhouette(x,base,s,col='#1F2A22',rim=C.green){X.save();X.translate(x,base);X.scale(s,s);
  X.shadowColor=rim;X.shadowBlur=24;X.fillStyle=col;X.beginPath();X.moveTo(-120,0);X.quadraticCurveTo(-125,-250,-60,-290);X.lineTo(60,-290);X.quadraticCurveTo(125,-250,120,0);X.closePath();X.fill();
  ell(0,-370,70,80,col);X.restore()}
function newspaper(x,y,s,t){X.save();X.translate(x,y);X.rotate(-.05);X.scale(s,s);X.fillStyle='#F3EFE4';rr(-360,-260,720,520,12);X.fill();
  X.fillStyle='#222';X.font='38px P';X.textAlign='center';X.fillText('EDICIÓN ESPECIAL',0,-195);X.fillRect(-320,-170,640,6);
  X.font='52px P';X.fillText('¿ESPIONAJE EN',0,-100);X.fillText('LA CIMA DE LA IA?',0,-40);
  X.fillStyle='#9C968A';for(let i=0;i<6;i++){X.fillRect(-320,20+i*36,i%3==2?380:640,14)}X.restore()}
function eye(x,y,s,t){X.save();X.translate(x,y);X.scale(s,s);X.fillStyle='rgba(255,59,59,.15)';ell(0,0,170,170,'rgba(255,59,59,.15)');X.fillStyle='#fff';X.beginPath();X.moveTo(-140,0);X.quadraticCurveTo(0,-110,140,0);X.quadraticCurveTo(0,110,-140,0);X.fill();
  const px=Math.sin(t*1.5)*30;ell(px,0,52,52,C.red);ell(px,0,22,22,'#111');X.restore()}
function boxChip(x,y,s){X.save();X.translate(x,y);X.scale(s,s);X.fillStyle='#C9A26A';rr(-60,-50,120,100,8);X.fill();X.fillStyle='#A9844F';X.fillRect(-60,-12,120,16);chip(0,-6,.16,0,0);X.restore()}
function building(x,base,s,label){X.save();X.translate(x,base);X.scale(s,s);X.fillStyle='#24302A';X.fillRect(-130,-420,260,420);X.fillStyle='rgba(168,224,95,.55)';for(let r=0;r<8;r++)for(let k=0;k<4;k++)X.fillRect(-105+k*58,-395+r*48,34,26);
  X.font='34px P';X.textAlign='center';X.fillStyle='#fff';X.fillText(label,0,50);X.restore()}
function chair(x,y,s,t,empty=true){X.save();X.translate(x,y);X.scale(s,s);const g=X.createRadialGradient(0,-200,20,0,0,520);g.addColorStop(0,'rgba(255,240,200,.35)');g.addColorStop(1,'rgba(255,240,200,0)');X.fillStyle=g;X.beginPath();X.moveTo(-60,-900);X.lineTo(60,-900);X.lineTo(420,220);X.lineTo(-420,220);X.fill();
  X.fillStyle='#2A1F1A';rr(-150,-420,300,330,60);X.fill();X.fillStyle='#3A2B23';rr(-180,-110,360,90,30);X.fill();X.fillStyle='#555';X.fillRect(-12,-20,24,140);X.fillRect(-150,110,300,16);X.restore()}
function nameplate(x,y,s,txt,sub,col=C.yellow){X.save();X.translate(x,y);X.scale(s,s);X.fillStyle='#14213D';rr(-300,-60,600,120,20);X.fill();X.strokeStyle=col;X.lineWidth=6;rr(-300,-60,600,120,20);X.stroke();
  X.textAlign='center';X.textBaseline='middle';X.fillStyle='#fff';X.font='44px P';X.fillText(txt,0,sub?-14:4);if(sub){X.fillStyle=col;X.font='30px P';X.fillText(sub,0,32)}X.restore()}
function stock(x0,y0,w,h,p,t){X.save();X.fillStyle='rgba(0,0,0,.45)';rr(x0-20,y0-20,w+40,h+40,20);X.fill();X.strokeStyle='rgba(255,255,255,.15)';X.lineWidth=2;for(let i=0;i<5;i++){X.beginPath();X.moveTo(x0,y0+i*h/4);X.lineTo(x0+w,y0+i*h/4);X.stroke()}
  const pts=[];for(let i=0;i<=40;i++){const k=i/40;let v=.25+Math.sin(i*1.3)*.04;if(k>.55)v+= (k-.55)*1.1+Math.sin(i*2.1)*.03;pts.push([x0+k*w,y0+v*h])}
  const n=Math.floor(p*40);X.strokeStyle=C.red;X.lineWidth=8;X.lineJoin='round';X.beginPath();for(let i=0;i<=n;i++)X.lineTo(...pts[i]);X.stroke();if(n>0){const[a,b]=pts[n];ell(a,b,12,12,C.red)}X.restore()}
function safe(x,y,s,t,ok){X.save();X.translate(x,y);X.scale(s,s);X.fillStyle='#4A5560';rr(-220,-240,440,480,30);X.fill();X.fillStyle='#5E6B78';rr(-180,-200,360,400,20);X.fill();
  ell(0,0,90,90,'#333C45');X.save();X.rotate(t*.8);X.strokeStyle='#C9D2DC';X.lineWidth=12;for(let k=0;k<3;k++){X.rotate(Math.PI*2/3);X.beginPath();X.moveTo(0,0);X.lineTo(0,-80);X.stroke()}X.restore();ell(0,0,26,26,'#C9D2DC');
  X.fillStyle='#2BB673';if(ok){ell(150,-170,46,46,'#2BB673');X.strokeStyle='#fff';X.lineWidth=12;X.lineCap='round';X.beginPath();X.moveTo(128,-170);X.lineTo(144,-154);X.lineTo(172,-186);X.stroke()}X.restore()}
function dateBadge(txt,x,y,t0,t){pill(txt,x,y,t0,t,{bg:C.red,dot:'#fff',fs:40})}
const S=[];
S[0]=t=>{techBg(t,.25);chip(540,1400,.9,t);
  const p1=clamp(t/.28);X.save();X.translate(W/2,600);X.scale(back(p1),back(p1));X.fillStyle=C.yellow;rr(-480,-74,960,148,40);X.fill();X.font='82px P';X.textAlign='center';X.textBaseline='middle';X.fillStyle=C.navy;X.fillText('¿QUÉ PASARÍA SI',0,6);X.restore();
  [['LOS ESPÍAS VAN','#fff'],['TRAS EL JEFE',"#fff"],['DE NVIDIA?',C.greenL]].forEach(([s,col],i)=>{const t0=.5+i*.22;if(t<t0)return;const p=back(clamp((t-t0)/.28));X.save();X.translate(W/2,790+i*125);X.scale(p,p);X.font='104px P';X.textAlign='center';X.textBaseline='middle';X.lineJoin='round';X.lineWidth=18;X.strokeStyle='#0B0B0B';X.strokeText(s,0,0);X.fillStyle=col;X.fillText(s,0,0);X.restore()});
  if(t>3.25){X.fillStyle=`rgba(255,255,255,${clamp((t-3.25)/.25)*.85})`;X.fillRect(0,0,W,H)}};
S[1]=t=>{const lt=t-3.5;X.save();zoom(1+lt*.04,540,900);techBg(t);chip(540,900,1.15,t);X.restore();
  X.fillStyle=C.red;X.fillRect(0,1420,W,90);X.font='44px P';X.textBaseline='middle';X.fillStyle='#fff';const off=(t*260)%1400;for(let k=-1;k<2;k++){X.textAlign='left';X.fillText('ÚLTIMA HORA  •  NVIDIA  •  ÚLTIMA HORA  •  NVIDIA  •',W-off+k*1400,1467)}
  headline([['ESTA SEMANA','SEMANA']],440,3.6,t,110)};
S[2]=t=>{const lt=t-6;techBg(t,.1);
  if(lt<4.2){newspaper(540,880,1.05,t);dateBadge('29 OCT 2026',540,560,6.1,t);pill('SEGÚN THE NEW YORK TIMES',540,1250,6.6,t,{fs:34})}
  else{const p=ease(prog(lt,4.2,5));silhouette(lerp(340,330,p),1500,1.1,'#1F2A22',C.green);silhouette(760,1500,1.0,'#2A1F24','#FF5A7A');
    X.font='38px P';X.textAlign='center';X.fillStyle='#fff';X.lineWidth=8;X.strokeStyle='#000';X.strokeText('CEO DE NVIDIA',330,1560);X.fillText('CEO DE NVIDIA',330,1560);X.strokeText('EMPRESARIA',760,1560);X.fillText('EMPRESARIA',760,1560);
    if(lt>6)eye(760,800,.8,t);if(lt>6)pill('¿AGENTE DE INTELIGENCIA?',540,640,12.0,t,{dot:C.red,fs:36});
    if(lt>8.6){building(820,1000,.55,'SU EMPRESA');for(let i=0;i<4;i++){const ph=((lt*.7+i/4)%1);boxChip(lerp(240,760,ph),lerp(900,820,ph)-Math.sin(ph*Math.PI)*80,.9)}}}
  headline([['EL REPORTE','REPORTE']],440,6.1,t,100,10.2);if(lt>4.2)headline([['LA SOSPECHA','SOSPECHA']],440,10.2,t,100,14.6);if(lt>8.6)headline([['COMPRABA CHIPS','CHIPS'],['DE NVIDIA','NVIDIA']],440,14.6,t,92)};
S[3]=t=>{const lt=t-17;techBg(t,.2);X.save();X.translate(540,980);X.fillStyle='#fff';rr(-380,-180,760,300,60);X.fill();X.beginPath();X.moveTo(-120,110);X.lineTo(-200,240);X.lineTo(-20,110);X.fill();X.fillStyle='#14213D';X.font='60px P';X.textAlign='center';X.textBaseline='middle';X.fillText('"PURA INVENCIÓN"',0,-30);X.restore();
  if(lt>.9){const p=clamp((lt-.9)/.2);X.save();X.translate(560,1240);X.rotate(-.12);X.scale(lerp(1.8,1,p),lerp(1.8,1,p));X.globalAlpha=p;X.strokeStyle=C.red;X.lineWidth=12;rr(-260,-60,520,120,16);X.stroke();X.fillStyle=C.red;X.font='72px P';X.textAlign='center';X.textBaseline='middle';X.fillText('CALUMNIA',0,6);X.restore()}
  headline([['CHINA LO NIEGA','NIEGA']],440,17.1,t,100)};
S[4]=t=>{const lt=t-19.5;techBg(t,.1);
  if(lt<4.2){dateBadge('8 NOV 2026',540,560,19.6,t);X.save();X.translate(540,1000);X.fillStyle='#F4F6FA';rr(-300,-260,600,520,24);X.fill();X.fillStyle='#14213D';X.font='40px P';X.textAlign='center';X.fillText('MENSAJE A',0,-180);X.fillText('LOS EMPLEADOS',0,-130);X.fillStyle='#B0B8C8';for(let i=0;i<6;i++)X.fillRect(-240,-70+i*48,i%3==2?300:480,18);X.restore();
    headline([['LO ADMITIÓ','ADMITIÓ']],440,19.8,t,100,23.7)}
  else if(lt<7.6){silhouette(540,1560,1.15,'#1F2A22',C.green);const mx=540+Math.sin(t*1.6)*120;X.save();X.translate(mx,1000);X.strokeStyle='#E7ECF5';X.lineWidth=22;ell(0,0,120,120,'rgba(63,208,255,.18)');X.beginPath();X.arc(0,0,120,0,7);X.stroke();X.lineCap='round';X.lineWidth=34;X.beginPath();X.moveTo(85,85);X.lineTo(190,190);X.stroke();X.restore();
    headline([['INVESTIGACIÓN','INVESTIGACIÓN']],440,23.7,t,96,27.1);pill('¿FUE BLANCO DE ESPIONAJE?',540,620,24.6,t,{dot:C.red,fs:36})}
  else{silhouette(540,1560,1.1,'#1F2A22',C.green);silhouette(250,1600,.8,'#2A1F24','#FF5A7A');silhouette(830,1600,.8,'#2A1F24','#FF5A7A');
    X.font='120px P';X.textAlign='center';X.fillStyle='rgba(255,255,255,.9)';X.fillText('?',250,1180);X.fillText('?',830,1180);
    headline([['+2 RELACIONES','+2'],['REPORTADAS','REPORTADAS']],440,27.1,t,92);pill('SIN CONFIRMAR',540,700,27.6,t,{dot:C.red})}};
S[5]=t=>{const lt=t-30;techBg(t,.3);chair(540,1250,1.1,t);
  if(lt<3.2){const fall=ease(prog(lt,1.2,2.4));X.save();X.translate(540,880+fall*300);X.rotate(fall*.6);nameplate(0,0,1,'CEO','JENSEN HUANG');X.restore();dateBadge('12 NOV 2026',540,560,30.1,t);headline([['RENUNCIÓ','RENUNCIÓ']],440,30.1,t,110,33.2);pill('TRAS 33 AÑOS',540,700,31.4,t)}
  else{nameplate(540,880,1,'COLETTE KRESS','CEO INTERINA',C.greenL);stock(160,1420,760,260,prog(lt,3.4,6.6),t);headline([['NUEVA JEFA','NUEVA'],['INTERINA','INTERINA']],440,33.2,t,96)}};
S[6]=t=>{const lt=t-37;techBg(t,.15);safe(540,1000,1.05,t,lt>2.2);
  headline([['¿SE FILTRÓ','FILTRÓ'],['ALGO?','']],440,37.1,t,100,39.2);if(lt>2.2)headline([['SIN PRUEBAS','SIN PRUEBAS'],['PÚBLICAS','']],440,39.2,t,100);pill('LA EMPRESA NO VE MOTIVOS PARA CREERLO',540,1400,40.6,t,{fs:30,dot:C.green})};
S[7]=t=>{const lt=t-44;X.save();zoom(1+lt*.012,540,1000);techBg(t,.35);chip(540,1050,.8,t,.6);X.restore();vignette(.6);
  headline([['¿ESCÁNDALO','ESCÁNDALO'],['PERSONAL…','PERSONAL']],440,44.1,t,100,46.6);if(lt>2.6)headline([['…O APENAS','APENAS'],['EMPIEZA?','EMPIEZA']],440,46.6,t,104);
  pill('COMENTA',540,700,47.2,t,{fs:42});X.font='26px P';X.textAlign='center';X.fillStyle='rgba(255,255,255,.75)';X.fillText('Información al 13 de noviembre de 2026',540,1300)};
let CUES=[],TM=null;
function captions(t){const k=TM.cues.findIndex(c=>t>=c[0]&&t<c[1]);if(k<0)return;const q=CUES[k];const p=clamp((t-TM.cues[k][0])/.12),sc=lerp(1.1,1,easeOut(p));
  const lines=wrapWords(toWords(q[0],q[1]),'56px P',900);drawLines(lines,'56px P',W/2,1150,74,12,sc)}
function dmap(i,t){const r0=TM.sc[i][0],r1=TM.sc[i][1],d0=SC[i][0],d1=SC[i][1];return Math.min(d1-.001,d0+(t-r0)*(d1-d0)/(r1-r0))}
function render(t){X.setTransform(1,0,0,1,0,0);X.fillStyle='#000';X.fillRect(0,0,W,H);let i=TM.sc.findIndex(s=>t>=s[0]&&t<s[1]);if(i<0)i=TM.sc.length-1;const r0=TM.sc[i][0];
  X.save();S[i](dmap(i,t));X.restore();
  if([2,5].includes(i)&&t-r0<.4){const p=ease((t-r0)/.4),xp=lerp(-500,W+500,p),k=.45;
    X.save();X.beginPath();X.moveTo(xp,0);X.lineTo(W+600,0);X.lineTo(W+600,H);X.lineTo(xp-k*H,H);X.closePath();X.clip();X.save();S[i-1](SC[i-1][1]-.001);X.restore();X.restore();
    X.save();X.shadowColor='#fff';X.shadowBlur=40;X.strokeStyle='#fff';X.lineWidth=36;X.beginPath();X.moveTo(xp,0);X.lineTo(xp-k*H,H);X.stroke();X.restore()}
  if(i>=1)captions(t)}
window.ready=document.fonts.load('64px P');
