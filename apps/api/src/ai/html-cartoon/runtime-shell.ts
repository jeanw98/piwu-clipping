import { getAssetLibraryJs } from './asset-library';

/**
 * Fixed canvas runtime: library primitives + SC/dmap + captions.
 * Claude only fills the PIWU_SCENES placeholder.
 */

export function buildRuntimeShell(width: number, height: number): string {
  const library = getAssetLibraryJs();
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=${width}, height=${height}"/>
<title>PIWU Canvas Cartoon</title>
<style>
@font-face{font-family:P;src:url(fonts/Poppins-Bold.ttf) format('truetype');font-weight:700;font-style:normal}
html,body{margin:0;padding:0;overflow:hidden;background:#000;width:${width}px;height:${height}px}
canvas{display:block;width:${width}px;height:${height}px}
</style>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>
(function(){
const W=${width}, H=${height};
const canvas=document.getElementById('c');
const X=canvas.getContext('2d');

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const prog=(t,a,b)=>clamp((t-a)/(b-a||1e-6));
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const back=t=>{const c=1.70158;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2)};
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function rr(x,y,w,h,r){X.beginPath();X.roundRect(x,y,w,h,Math.max(0,r||0))}
function ell(x,y,rx,ry,fill){X.beginPath();X.ellipse(x,y,Math.max(0.1,rx||1),Math.max(0.1,ry||1),0,0,Math.PI*2);X.fillStyle=fill||'#888';X.fill()}
function lg(x0,y0,x1,y1,colores){
  const g=X.createLinearGradient(x0,y0,x1,y1);
  const cols=Array.isArray(colores)&&colores.length?colores:['#333','#111'];
  cols.forEach((c,i)=>g.addColorStop(i/Math.max(1,cols.length-1), c||'#000'));
  return g;
}
window.W=W;window.H=H;window.X=X;
window.clamp=clamp;window.lerp=lerp;window.prog=prog;window.ease=ease;window.back=back;window.rng=rng;
window.rr=rr;window.ell=ell;window.lg=lg;

${library}

try {
/*__PIWU_PACK__*/
} catch (packBootErr) {
  console.error('PIWU pack boot error', packBootErr);
}

let TM={sc:[[0,30]],cues:[],cueTexts:[],end:30};
let SC=[[0,5],[5,12],[12,20]];
const S=[];

function captions(t){
  if(!TM.cues||!TM.cues.length) return;
  let i=TM.cues.findIndex(c=>t>=c[0]&&t<c[1]);
  if(i<0){ if(t>=TM.cues[TM.cues.length-1][1]) i=TM.cues.length-1; else return; }
  const meta=TM.cueTexts&&TM.cueTexts[i]?TM.cueTexts[i]:{text:'',highlight:''};
  const text=meta.text||'';
  if(!text) return;
  const [c0]=TM.cues[i];
  const zoomAmt=lerp(1.1,1,ease(prog(t,c0,c0+0.12)));
  const words=toWordsLib(text, meta.highlight||'');
  const lines=wrapWordsLib(words,'58px P',900);
  drawLinesLib(lines,'58px P',W/2,1150,76,12,zoomAmt);
}

function dmap(i,t){
  if(!TM.sc[i]||!SC[i]) return t;
  const [r0,r1]=TM.sc[i],[d0,d1]=SC[i];
  const span=Math.max(1e-3,r1-r0);
  const designDur=Math.max(1e-3,d1-d0);
  return Math.min(designDur-0.001, ((t-r0)/span)*designDur);
}

function render(t){
  const D=TM.end||30;
  t=Math.max(0,Math.min(D,Number(t)||0));
  window.__PIWU_TIME=t;
  X.save();
  X.setTransform(1,0,0,1,0,0);
  X.clearRect(0,0,W,H);
  let i=(TM.sc||[]).findIndex(s=>t>=s[0]&&t<s[1]);
  if(i<0) i=Math.max(0,(TM.sc||[]).length-1);
  X.save();
  try{
    if(typeof S[i]==='function') S[i](dmap(i,t));
    else {
      X.fillStyle='#1a2233';X.fillRect(0,0,W,H);
      headline([['SCENE '+i,'SCENE']],440,0,t,72);
    }
  }catch(err){
    X.fillStyle='#3b1020';X.fillRect(0,0,W,H);
    console.error('PIWU scene error',i,err);
  }
  X.restore();
  try{ captions(t); }catch(e){ console.error('PIWU captions',e); }
  X.restore();
}

window.render=render;
window.__PIWU_SET_TIME=render;
window.__PIWU_INJECT_TIMING=function(tm){
  if(!tm) return;
  TM={ sc:tm.sc||TM.sc, cues:tm.cues||[], cueTexts:tm.cueTexts||[], end:tm.end||TM.end };
  window.TM=TM;
  if(window.__PIWU_PENDING_TIMING) delete window.__PIWU_PENDING_TIMING;
  render(0);
};
window.SC=SC; window.S=S; window.TM=TM;

try {
/*__PIWU_SCENES__*/
} catch (sceneBootErr) {
  console.error('PIWU scenes boot error', sceneBootErr);
}

if(Array.isArray(window.SC)) SC=window.SC;
if(Array.isArray(window.S)) { for(let i=0;i<window.S.length;i++) S[i]=window.S[i]; }
window.SC=SC; window.S=S;

window.ready = (document.fonts && document.fonts.load)
  ? document.fonts.load('64px P').catch(function(){ return null; })
  : Promise.resolve();

if(window.__PIWU_PENDING_TIMING){
  window.__PIWU_INJECT_TIMING(window.__PIWU_PENDING_TIMING);
} else {
  TM={sc:SC.map(function(p){return [p[0],p[1]]}), cues:[], cueTexts:[], end:SC.length?SC[SC.length-1][1]:30};
  window.TM=TM;
  window.ready.then(function(){ render(0); });
}
})();
</script>
</body>
</html>`;
}

export function assembleCartoonHtml(
  width: number,
  height: number,
  scenesJs: string,
  packJs = '',
): string {
  const shell = buildRuntimeShell(width, height);
  const pack = packJs.trim() || '/* no topic pack */';
  const block = scenesJs.trim() || defaultScenesBlock();
  return shell
    .replace('/*__PIWU_PACK__*/', pack)
    .replace('/*__PIWU_SCENES__*/', block);
}

function defaultScenesBlock(): string {
  return `
SC=[[0,5],[5,12],[12,20]];
window.SC=SC;
S[0]=function(t){
  X.save(); zoom(1+t*.012,540,1000);
  if(typeof drawEnv==='function') drawEnv(t); else { citySkyline(700,t); desk(540,1180,1.05); }
  var hands=(typeof drawHero==='function'?drawHero:hero)(540,1380,1.05,{expr:'happy',walk:t*5,armL:[100,140],armR:[20,20]});
  if(typeof drawProp==='function') drawProp('phone',hands[0][0],hands[0][1],0.85,t); else phone(hands[0][0],hands[0][1],0.85,t);
  X.restore();
  headline([['EMPIEZA AQUÍ','EMPIEZA']],440,.2,t,90,4);
};
S[1]=function(t){
  X.save();
  if(typeof drawEnv==='function') drawEnv(t); else room(980,['#EEF2FF','#E0E7FF'],['#CBD5E1','#94A3B8']);
  panel(140,320,800,280,'DATO CLAVE');
  (typeof drawHero==='function'?drawHero:hero)(540,1360,1.1,{expr:'happy',armL:[40,80],armR:[40,80]});
  X.restore();
  headline([['PASO DOS','DOS']],440,.2,t,96);
};
S[2]=function(t){
  X.save();
  if(typeof drawEnv==='function') drawEnv(t); else { sky(640,1,t); ground(1000,t); }
  (typeof drawHero==='function'?drawHero:hero)(560,1340,1.1,{expr:'hero',walk:t*4,armL:[30,40],armR:[150,170]});
  X.restore();
  headline([['CIERRE','CIERRE']],440,.2,t,96);
};
window.S=S;
`;
}
