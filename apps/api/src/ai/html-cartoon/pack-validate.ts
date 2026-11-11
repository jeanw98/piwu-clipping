export interface PackValidationResult {
  ok: boolean;
  reason?: string;
  js: string;
}

const FORBIDDEN =
  /\b(Math\.random|requestAnimationFrame|fetch\s*\(|XMLHttpRequest|eval\s*\(|Function\s*\(|import\s+|require\s*\(|document\.|window\.location|SC\s*=|S\s*=\s*\[|S\[\s*\d+\s*\]\s*=)/;

/**
 * Light validation for topic-pack JS before injection into the runtime shell.
 */
export function validateTopicPackJs(raw: string): PackValidationResult {
  let js = raw.trim();
  const fenced = js.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  if (fenced) js = fenced[1]!.trim();
  js = js.replace(/^<!DOCTYPE[\s\S]*?<script[^>]*>/i, '');
  js = js.replace(/<\/script>[\s\S]*$/i, '');

  if (js.length < 80) {
    return { ok: false, reason: 'pack too short', js: '' };
  }
  if (js.length > 60_000) {
    return { ok: false, reason: 'pack too large', js: '' };
  }
  if (FORBIDDEN.test(js)) {
    return { ok: false, reason: 'pack contains forbidden APIs', js: '' };
  }
  if (!/\bfunction\s+drawHero\s*\(/.test(js) && !/\bdrawHero\s*=\s*function/.test(js)) {
    return { ok: false, reason: 'missing drawHero', js: '' };
  }
  if (!/\bfunction\s+drawEnv\s*\(/.test(js) && !/\bdrawEnv\s*=\s*function/.test(js)) {
    return { ok: false, reason: 'missing drawEnv', js: '' };
  }

  try {
    // Dry-run compile in a sandbox-ish Function (not executed with canvas).
    // eslint-disable-next-line no-new-func
    new Function(
      'W',
      'H',
      'X',
      'C',
      'clamp',
      'lerp',
      'prog',
      'ease',
      'easeOut',
      'back',
      'rng',
      'rr',
      'ell',
      'lg',
      'zoom',
      'vignette',
      'sky',
      'ground',
      'room',
      'citySkyline',
      'desk',
      'phone',
      'panel',
      'smoke',
      'fire',
      'sea',
      'sand',
      'palm',
      'bunkerDoor',
      'rubble',
      'mara',
      'hero',
      'headline',
      'pill',
      'bigX',
      'stamp',
      'window',
      `"use strict";\n${js}\nreturn typeof drawHero;`,
    );
  } catch (error) {
    return {
      ok: false,
      reason: `pack syntax: ${(error as Error).message}`,
      js: '',
    };
  }

  // Ensure pack exports to window for the runtime
  if (!/window\.drawHero\s*=/.test(js)) {
    js += `\nwindow.drawHero=drawHero;window.drawEnv=drawEnv;if(typeof drawProp==='function')window.drawProp=drawProp;`;
  }

  return { ok: true, js };
}

/** Generic non-island hero+env when AI pack fails. */
export function genericFallbackPackJs(palette: string[] = []): string {
  const c0 = palette[0] || '#3B82F6';
  const c1 = palette[1] || '#1E293B';
  const c2 = palette[2] || '#F8FAFC';
  const c3 = palette[3] || '#FBBF24';
  return `
function drawHero(cx,by,s,o){
  o=o||{};
  var expr=o.expr||'happy', walk=o.walk||0;
  var A=o.armL||[20,30], B=o.armR||[20,30];
  var top=o.topColor||'${c2}', pants=o.pantsColor||'${c1}', accent=o.accentColor||'${c0}';
  X.save();X.translate(cx,by);X.scale(s,s);X.lineCap='round';X.lineJoin='round';
  [-1,1].forEach(function(sd){X.save();X.translate(sd*26,-140);X.rotate(Math.sin(walk)*.22*sd);X.fillStyle='#A9744F';rr(-14,0,28,130,12);X.fill();ell(sd*5,132,22,10,'#8A5A3A');X.restore()});
  X.fillStyle=pants;rr(-54,-200,108,70,14);X.fill();
  var sh=-350;
  function arm(sd,angs){var r1=angs[0]*Math.PI/180,r2=angs[1]*Math.PI/180;var ex1=sd*50+Math.sin(r1)*74*sd,ey1=sh+Math.cos(r1)*74;var hx=ex1+Math.sin(r2)*78*sd,hy=ey1+Math.cos(r2)*78;
    X.strokeStyle='#8A5A3A';X.lineWidth=28;X.beginPath();X.moveTo(sd*50,sh);X.lineTo(ex1,ey1);X.lineTo(hx,hy);X.stroke();
    X.strokeStyle='#A9744F';X.lineWidth=22;X.beginPath();X.moveTo(sd*50,sh);X.lineTo(ex1,ey1);X.lineTo(hx,hy);X.stroke();ell(hx,hy,16,16,'#A9744F');return[hx,hy]}
  var hL=arm(-1,A),hR=arm(1,B);
  X.fillStyle=top;rr(-58,-370,116,180,36);X.fill();
  X.fillStyle=accent;rr(-58,-370,116,36,18);X.fill();
  ell(0,-430,58,60,'#A9744F');
  X.fillStyle='#17110F';X.beginPath();X.arc(0,-442,60,Math.PI*1.02,Math.PI*1.98);X.fill();
  [-20,20].forEach(function(fx){ell(fx,-432,9,11,'#fff');ell(fx+2,-430,5,6,'#1a1a1a')});
  X.strokeStyle='#6B1F1F';X.lineWidth=4;X.beginPath();
  if(expr==='surprised')ell(0,-400,8,11,'#6B1F1F');
  else if(expr==='happy'||expr==='laugh'){X.beginPath();X.arc(0,-408,14,Math.PI*.15,Math.PI*.85);X.stroke()}
  else{X.beginPath();X.moveTo(-8,-402);X.lineTo(8,-402);X.stroke()}
  X.restore();
  return[[cx+hL[0]*s,by+hL[1]*s],[cx+hR[0]*s,by+hR[1]*s]];
}
function drawEnv(t){
  room(980,['#EEF2FF','#E0E7FF'],['#CBD5E1','#94A3B8']);
  desk(540,1180,1);
  panel(140,280,800,220,'TIP');
  vignette(.35);
}
function drawProp(name,x,y,s,t){
  s=s||1;t=t||0;
  if(name==='phone'){phone(x,y,s,t);return}
  if(name==='laptop'){X.save();X.translate(x,y);X.scale(s,s);X.fillStyle='#1e293b';rr(-70,-50,140,90,8);X.fill();X.fillStyle='#38bdf8';rr(-60,-40,120,70,4);X.fill();X.restore();return}
  X.fillStyle='${c3}';rr(x-30*s,y-30*s,60*s,60*s,10);X.fill();
}
window.drawHero=drawHero;window.drawEnv=drawEnv;window.drawProp=drawProp;
`;
}
