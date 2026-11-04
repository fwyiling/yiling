// Offline readers written next to downloaded files. Double-click to open in any browser.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const BASE_CSS = `
:root{--a:ACCENT;--bg:#0e0e12;--p:#17171e;--l:#2a2a36;--t:#ededf2;--m:#9a9aab}
:root.light{--bg:#f5f5f7;--p:#fff;--l:#ddd;--t:#1c1c1e;--m:#666}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--t);font:15px/1.5 "Segoe UI",system-ui,sans-serif}
.bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;padding:10px 14px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--l);transition:transform .25s}
.bar.hide{transform:translateY(-100%)}
.bar h1{font-size:15px;margin:0 8px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:28vw}
select,button{font:inherit;color:var(--t);background:var(--p);border:1px solid var(--l);border-radius:8px;padding:6px 10px;cursor:pointer}
select{max-width:40vw}button:hover{border-color:var(--a)}button.pri{background:var(--a);border-color:var(--a);color:#fff}
.sp{flex:1}.end{display:flex;justify-content:center;gap:10px;padding:40px 16px 80px}
.prog{position:fixed;left:0;top:0;height:3px;background:var(--a);z-index:9;width:0}
`;

export function buildMangaReader(series, chapters, accent = '#fa1e4e') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(series)}</title><style>${BASE_CSS.replace('ACCENT', accent)}
#pages{display:flex;flex-direction:column;align-items:center;gap:var(--gap,0px);padding:0 0 10px}
#pages img{display:block;width:100%;max-width:var(--w,800px);height:auto;background:var(--p);min-height:200px}
#pages img[data-ok]{min-height:0}
</style></head><body>
<div class="prog" id="prog"></div>
<div class="bar" id="bar"><h1>${esc(series)}</h1>
<button id="prev" title="Previous chapter (←)">‹</button><select id="ch"></select><button id="next" title="Next chapter (→)">›</button>
<span class="sp"></span>
<button id="narrow" title="Narrower">−</button><button id="wide" title="Wider">+</button>
<button id="gap" title="Gap between pages">Gap</button><button id="theme" title="Light / dark">◐</button></div>
<div id="pages"></div>
<div class="end"><button id="prev2">‹ Previous</button><button class="pri" id="next2">Next chapter ›</button></div>
<script>
const SERIES=${json(series)},CH=${json(chapters)};
const K='shield-reader:'+SERIES,st=JSON.parse(localStorage.getItem(K)||'{}');
const $=id=>document.getElementById(id),root=document.documentElement;
let cur=Math.min(st.ch||0,CH.length-1),w=st.w||800,gap=st.gap||0;
if(st.light)root.classList.add('light');
CH.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=c.label;$('ch').append(o)});
function save(){st.ch=cur;st.w=w;st.gap=gap;st.light=root.classList.contains('light');localStorage.setItem(K,JSON.stringify(st))}
function show(i,keepScroll){cur=Math.max(0,Math.min(CH.length-1,i));$('ch').value=cur;
 const box=$('pages');box.innerHTML='';
 CH[cur].pages.forEach((p,n)=>{const im=new Image();im.loading=n<3?'eager':'lazy';im.decoding='async';im.alt='Page '+(n+1);im.src=p.split('/').map(encodeURIComponent).join('/');im.onload=()=>im.dataset.ok=1;box.append(im)});
 $('prev').disabled=$('prev2').disabled=cur===0;$('next').disabled=$('next2').disabled=cur===CH.length-1;
 document.title=CH[cur].label+' · '+SERIES;if(!keepScroll)scrollTo(0,0);save()}
function layout(){root.style.setProperty('--w',w+'px');root.style.setProperty('--gap',gap+'px')}
$('ch').onchange=e=>show(+e.target.value);
$('prev').onclick=$('prev2').onclick=()=>show(cur-1);$('next').onclick=$('next2').onclick=()=>show(cur+1);
$('narrow').onclick=()=>{w=Math.max(320,w-80);layout();save()};$('wide').onclick=()=>{w=Math.min(2400,w+80);layout();save()};
$('gap').onclick=()=>{gap=gap?0:12;layout();save()};$('theme').onclick=()=>{root.classList.toggle('light');save()};
addEventListener('keydown',e=>{if(e.target.tagName==='SELECT')return;if(e.key==='ArrowRight')show(cur+1);if(e.key==='ArrowLeft')show(cur-1)});
let ly=0;addEventListener('scroll',()=>{const y=scrollY,h=document.documentElement.scrollHeight-innerHeight;
 $('prog').style.width=(h>0?y/h*100:0)+'%';$('bar').classList.toggle('hide',y>ly&&y>120);ly=y;st.y=y;
 clearTimeout(window._t);window._t=setTimeout(save,400)});
layout();show(cur,true);if(st.y)setTimeout(()=>scrollTo(0,st.y),300);
</script></body></html>`;
}

export function buildNovelReader(series, chapters, accent = '#fa1e4e') {
  const data = chapters.map((c) => ({ t: c.title, p: c.text.split(/\n{2,}/) }));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(series)}</title><style>${BASE_CSS.replace('ACCENT', accent)}
:root.sepia{--bg:#f4ecd8;--p:#fbf5e6;--l:#e0d4b8;--t:#3b2f20;--m:#7a6a50}
article{max-width:var(--w,720px);margin:0 auto;padding:32px 22px 10px;font-family:var(--f,Georgia,serif);font-size:var(--fs,19px);line-height:1.75}
article h2{font-family:"Segoe UI",system-ui,sans-serif;font-size:1.4em;margin:0 0 1em}
article p{margin:0 0 1.1em}
</style></head><body>
<div class="prog" id="prog"></div>
<div class="bar" id="bar"><h1>${esc(series)}</h1>
<button id="prev">‹</button><select id="ch"></select><button id="next">›</button><span class="sp"></span>
<button id="sm" title="Smaller text">A−</button><button id="lg" title="Bigger text">A+</button>
<button id="font" title="Serif / sans">Aa</button><button id="theme" title="Dark / light / sepia">◐</button></div>
<article id="art"></article>
<div class="end"><button id="prev2">‹ Previous</button><button class="pri" id="next2">Next chapter ›</button></div>
<script>
const SERIES=${json(series)},CH=${json(data)};
const K='shield-novel:'+SERIES,st=JSON.parse(localStorage.getItem(K)||'{}');
const $=id=>document.getElementById(id),root=document.documentElement;
let cur=Math.min(st.ch||0,CH.length-1),fs=st.fs||19,serif=st.serif!==false,theme=st.theme||0;
const THEMES=['','light','sepia'];
CH.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=c.t;$('ch').append(o)});
function save(){Object.assign(st,{ch:cur,fs,serif,theme});localStorage.setItem(K,JSON.stringify(st))}
function look(){root.className=THEMES[theme];root.style.setProperty('--fs',fs+'px');root.style.setProperty('--f',serif?'Georgia,"Times New Roman",serif':'"Segoe UI",system-ui,sans-serif')}
function show(i,keep){cur=Math.max(0,Math.min(CH.length-1,i));$('ch').value=cur;const a=$('art');a.innerHTML='';
 const h=document.createElement('h2');h.textContent=CH[cur].t;a.append(h);
 CH[cur].p.forEach(t=>{const p=document.createElement('p');p.textContent=t;a.append(p)});
 $('prev').disabled=$('prev2').disabled=cur===0;$('next').disabled=$('next2').disabled=cur===CH.length-1;
 document.title=CH[cur].t+' · '+SERIES;if(!keep)scrollTo(0,0);save()}
$('ch').onchange=e=>show(+e.target.value);
$('prev').onclick=$('prev2').onclick=()=>show(cur-1);$('next').onclick=$('next2').onclick=()=>show(cur+1);
$('sm').onclick=()=>{fs=Math.max(13,fs-1);look();save()};$('lg').onclick=()=>{fs=Math.min(32,fs+1);look();save()};
$('font').onclick=()=>{serif=!serif;look();save()};$('theme').onclick=()=>{theme=(theme+1)%3;look();save()};
addEventListener('keydown',e=>{if(e.target.tagName==='SELECT')return;if(e.key==='ArrowRight')show(cur+1);if(e.key==='ArrowLeft')show(cur-1)});
let ly=0;addEventListener('scroll',()=>{const y=scrollY,h=document.documentElement.scrollHeight-innerHeight;
 $('prog').style.width=(h>0?y/h*100:0)+'%';$('bar').classList.toggle('hide',y>ly&&y>120);ly=y;st.y=y;
 clearTimeout(window._t);window._t=setTimeout(save,400)});
look();show(cur,true);if(st.y)setTimeout(()=>scrollTo(0,st.y),200);
</script></body></html>`;
}
