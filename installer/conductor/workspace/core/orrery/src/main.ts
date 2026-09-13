import * as pc from 'playcanvas';
import { items, genes, type Item } from './data';
import './styles.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<canvas id="world" aria-label="Mundo tridimensional de Orrery"></canvas><div id="labels"></div>
<header><div class="brand">ORRERY</div><div class="divider"></div><div class="context"><div class="eyebrow">Cognituum / Organización de ejemplo</div><div class="sub">Un territorio para comprender el trabajo</div></div><div class="badge">ESQUICIO 01 · DATOS SIMULADOS</div></header>
<div class="intro"><div class="eyebrow">Perspectiva espacial</div><h2>El mundo permanece.</h2><p>El criterio lo alcanza. El trabajo lo recorre.</p></div>
<nav class="panel left" aria-label="Explorar el mundo"><h2>EXPLORAR</h2><button class="nav active" data-view="all">◎ &nbsp; Organización</button><button class="nav" data-view="a"><span class="dot"></span>Proyecto A</button><button class="nav" data-view="b"><span class="dot purple"></span>Proyecto B</button><div class="rule"></div><label class="switch"><input id="gravity" type="checkbox" checked> Campos de Gravity</label><label class="switch"><input id="genes" type="checkbox" checked> Conexiones · Genes</label><label class="switch"><input id="names" type="checkbox" checked> Nombres</label><div class="rule"></div><select id="objects" aria-label="Seleccionar elemento" style="width:100%;background:#172632;color:#cddcde;padding:7px;border:1px solid #ffffff22;border-radius:6px"><option value="">Encontrar elemento…</option>${items.map(i=>`<option value="${i.id}">${i.kind} · ${i.name}</option>`).join('')}</select><p class="hint">Arrastrá para orbitar.<br>Rueda para acercarte.<br>Shift + arrastrar para desplazar.<br>Seleccioná un objeto o su nombre.</p></nav>
<aside class="panel right" aria-label="Inspector"><div id="kind" class="eyebrow">TU PUNTO DE ATENCIÓN</div><h1 id="title">Un mundo por recorrer</h1><p id="description">Acercate a un territorio o seleccioná un elemento para descubrir sus relaciones.</p><div class="rule"></div><p id="detail">Las formas son exploratorias. Todos los nombres, relaciones y eventos de esta escena son ejemplos.</p><button id="focus" class="focus">Volver a la vista general</button></aside>
<section class="panel bottom" aria-label="Simulación del trabajo"><div class="runtime-head"><span class="dot" style="background:#79dcac"></span><strong>Revisar acceso → Compartir resultado</strong><span class="eyebrow">CONSTELLATION · EJEMPLO</span></div><div class="transport"><button id="play">Pausar</button><button id="reset" aria-label="Reiniciar simulación">↺</button><input id="timeline" aria-label="Tiempo de la simulación" type="range" min="0" max="30" step="0.05" value="0"><span id="time" class="time">0 / 30 s</span></div><div id="status" class="status" aria-live="polite"></div></section><div id="perf">Iniciando escena…</div><div id="error" role="alert"></div>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('world');
try { start(); } catch (error) { $('error').textContent = `No pudimos iniciar la escena 3D. ${String(error)}`; }

function start() {
 const app = new pc.Application(canvas, { graphicsDeviceOptions: { antialias: true, alpha: false } });
 app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio, 1.75);
 app.setCanvasFillMode(pc.FILLMODE_NONE); app.setCanvasResolution(pc.RESOLUTION_AUTO);
 const resize = () => app.resizeCanvas(window.innerWidth,window.innerHeight);
 window.addEventListener('resize',resize); resize();
 app.scene.ambientLight = new pc.Color(.5,.6,.7);
 const camera = new pc.Entity('Observer'); camera.addComponent('camera',{clearColor:new pc.Color(.027,.047,.071),fov:47,nearClip:.1,farClip:300}); app.root.addChild(camera);
 const light = new pc.Entity('Light'); light.addComponent('light',{type:'directional',color:new pc.Color(.75,.88,1),intensity:1.4});light.setEulerAngles(45,25,0);app.root.addChild(light);
 const material = (hex:string,opacity=1,lit=true) => { const m=new pc.StandardMaterial(); const c=new pc.Color().fromString(hex);m.diffuse=c;m.emissive=c.clone().mulScalar(lit?.18:1);m.useLighting=lit;m.opacity=opacity;if(opacity<1){m.blendType=pc.BLEND_NORMAL;m.depthWrite=false;}m.update();return m;};
 const meshes = new Map<pc.MeshInstance,Item>(); const entities = new Map<string,pc.Entity>();
 function shape(name:string,type:'sphere'|'cylinder'|'box',pos:number[],scale:number[],mat:pc.StandardMaterial,item?:Item){const e=new pc.Entity(name);e.addComponent('render',{type,material:mat});e.setPosition(pos[0],pos[1],pos[2]);e.setLocalScale(scale[0],scale[1],scale[2]);app.root.addChild(e);if(item)e.render!.meshInstances.forEach(m=>meshes.set(m,item));return e;}
 const lines: {points:pc.Vec3[];color:pc.Color;group:string}[]=[];
 function ring(x:number,y:number,z:number,r:number,color:string,group='base'){const points:pc.Vec3[]=[];for(let j=0;j<96;j++){for(const a of [j/96*Math.PI*2,(j+1)/96*Math.PI*2])points.push(new pc.Vec3(x+Math.cos(a)*r,y,z+Math.sin(a)*r));}lines.push({points,color:new pc.Color().fromString(color),group});}
 for(let n=-30;n<=30;n+=2){lines.push({points:[new pc.Vec3(n,-.35,-30),new pc.Vec3(n,-.35,30),new pc.Vec3(-30,-.35,n),new pc.Vec3(30,-.35,n)],color:new pc.Color(.065,.11,.14),group:'base'});}
 const fieldEntities:pc.Entity[]=[];
 for(const item of items){const [x,y,z]=item.position;let e:pc.Entity;
  if(item.kind==='Domain'){e=shape(item.id,'cylinder',[x,-.05,z],[5.2,.35,5.2],material(item.project==='Proyecto A'?'#173b43':'#292c49'),item);ring(x,.15,z,2.65,item.color);shape('core','cylinder',[x,.25,z],[.22,.5,.22],material(item.color),item);}
  else if(item.kind==='Posture'){e=shape(item.id,'sphere',[x,y,z],[.45,.45,.45],material(item.color,1,false),item);fieldEntities.push(e);fieldEntities.push(shape('field','sphere',[x,.5,z],[11,5,11],material(item.color,.055,false)));ring(x,.25,z,5.5,'#79613e','gravity');ring(x,.28,z,4.5,'#483f31','gravity');}
  else {e=shape(item.id,item.kind==='Artifact'?'box':'sphere',[x,y,z],item.kind==='Artifact'?[.55,.8,.55]:[.5,.5,.5],material(item.color),item);}
  entities.set(item.id,e);
 }
 for(const [a,b] of genes){const from=items.find(i=>i.id===a)!.position,to=items.find(i=>i.id===b)!.position;const points:pc.Vec3[]=[];for(let k=0;k<36;k++){for(const t of [k/36,(k+1)/36])points.push(new pc.Vec3(pc.math.lerp(from[0],to[0],t),.35+Math.sin(t*Math.PI)*1.7,pc.math.lerp(from[2],to[2],t)));}lines.push({points,color:new pc.Color(.21,.43,.47),group:'genes'});}
 const labels=new Map<string,HTMLButtonElement>();for(const i of items){const b=document.createElement('button');b.className='label';b.innerHTML=`<small>${i.kind.toUpperCase()}</small>${i.name}`;b.onclick=()=>select(i);$('labels').appendChild(b);labels.set(i.id,b);}
 const marker=shape('Intent','sphere',[0,1,0],[.32,.32,.32],material('#a9f8cc',1,false));
 const selection=shape('Selection','sphere',[0,0,0],[.8,.8,.8],material('#d0f4ee',.15,false));selection.enabled=false;
 let selected:Item|undefined;let yaw=.32,pitch=.92,distance=40;const target=new pc.Vec3(0,0,0),desired=new pc.Vec3(0,0,0);let desiredDistance=40;
 function select(i:Item){selected=i;$('kind').textContent=`${i.kind} / ${i.project}`;$('title').textContent=i.name;$('description').textContent=i.description;$('detail').textContent=i.detail;$('focus').textContent='Acercarme a este elemento';labels.forEach((b,id)=>b.classList.toggle('selected',id===i.id));$<HTMLSelectElement>('objects').value=i.id;selection.enabled=true;selection.setPosition(i.position[0],i.kind==='Domain'?.6:i.position[1],i.position[2]);}
 $('focus').onclick=()=>{if(selected){desired.set(...selected.position);desiredDistance=selected.kind==='Domain'?15:12;}else{desired.set(0,0,0);desiredDistance=40;}};
 $('objects').onchange=()=>{const i=items.find(i=>i.id===$<HTMLSelectElement>('objects').value);if(i)select(i);};
 document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-view]').forEach(n=>n.classList.remove('active'));b.classList.add('active');const v=b.dataset.view;desired.set(v==='a'?-5:v==='b'?8:0,0,0);desiredDistance=v==='all'?40:24;});
 const gravity=$<HTMLInputElement>('gravity'),geneToggle=$<HTMLInputElement>('genes'),names=$<HTMLInputElement>('names');gravity.onchange=()=>fieldEntities.forEach(e=>e.enabled=gravity.checked);
 let drag:{x:number;y:number;distance:number}|undefined;const picker=new pc.Picker(app,512,512);let pendingPick=false;
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,distance:0};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.distance+=Math.abs(dx)+Math.abs(dy);drag.x=e.clientX;drag.y=e.clientY;if(e.shiftKey){desired.x-=dx*.025*Math.cos(yaw);desired.z+=dx*.025*Math.sin(yaw);desired.z-=dy*.025*Math.cos(yaw);desired.x-=dy*.025*Math.sin(yaw);}else{yaw-=dx*.006;pitch=pc.math.clamp(pitch+dy*.006,.18,1.48);}});
 canvas.addEventListener('pointerup',async e=>{const click=drag&&drag.distance<5;drag=undefined;if(!click||pendingPick)return;pendingPick=true;try{picker.prepare(camera.camera!,app.scene);const found=await picker.getSelectionAsync(e.clientX/window.innerWidth*512,e.clientY/window.innerHeight*512);const i=found.map(m=>meshes.get(m as pc.MeshInstance)).find(Boolean);if(i)select(i);}finally{pendingPick=false;}});
 canvas.addEventListener('pointercancel',()=>{drag=undefined;});canvas.addEventListener('wheel',e=>{e.preventDefault();desiredDistance=pc.math.clamp(desiredDistance+e.deltaY*.025,7,70);},{passive:false});
 let time=0,playing=true,lastStage='';const timeline=$<HTMLInputElement>('timeline');const updatePlay=()=>{$('play').textContent=playing?'Pausar':'Reproducir';};$('play').onclick=()=>{if(time>=30)time=0;playing=!playing;updatePlay();};$('reset').onclick=()=>{time=0;playing=true;updatePlay();};timeline.oninput=()=>{time=Number(timeline.value);};
 const route=[new pc.Vec3(-9,1,-3),new pc.Vec3(-3,1,3),new pc.Vec3(-3,1,-7),new pc.Vec3(8,1,-4),new pc.Vec3(9,1,4)];
 let elapsed=0,frames=0;const project=new pc.Vec3();
 app.on('update',(dt:number)=>{
  const smooth=1-Math.exp(-dt*7);target.lerp(target,desired,smooth);distance=pc.math.lerp(distance,desiredDistance,smooth);camera.setPosition(target.x+Math.sin(yaw)*Math.cos(pitch)*distance,target.y+Math.sin(pitch)*distance,target.z+Math.cos(yaw)*Math.cos(pitch)*distance);camera.lookAt(target);
  if(playing){time=Math.min(30,time+dt);if(time>=30){playing=false;updatePlay();}}timeline.value=String(time);$('time').textContent=`${Math.floor(time)} / 30 s`;
  const stage=time<7?'Intent 1 · Inspeccionar identidad':time<11?'Orbital · Segunda pasada de revisión':time<15?'Intent 2 · Espera de intervención simulada':time<21?'Intent 3 · Registrar evidencia':time<27?'Mandate 2 · Compartir conocimiento':'Artifact disponible · Recorrido completado';if(stage!==lastStage){$('status').textContent=stage;lastStage=stage;}
  let t:number;if(time<7)t=time/7;else if(time<11)t=1;else if(time<15)t=1;else if(time<21)t=1+(time-15)/6;else if(time<27)t=2+(time-21)/6;else t=3+(time-27)/3;
  const seg=Math.min(3,Math.floor(t)),f=t-seg;const position=new pc.Vec3().lerp(route[seg],route[seg+1],f);position.y+=Math.sin(f*Math.PI)*1.8;if(time>=7&&time<11){const angle=(time-7)/4*Math.PI*2;position.x+=Math.sin(angle)*1.2;position.z+=1.2-Math.cos(angle)*1.2;}
  marker.setPosition(position);entities.get('artifact')!.enabled=time>=21;
  for(const l of lines){if(l.group==='gravity'&&!gravity.checked||l.group==='genes'&&!geneToggle.checked)continue;app.drawLines(l.points,l.color);}
  for(let j=0;j<route.length-1;j++)app.drawLine(route[j],route[j+1],new pc.Color(.23,.48,.36));
  for(const i of items){const b=labels.get(i.id)!;camera.camera!.worldToScreen(new pc.Vec3(i.position[0],i.position[1]+.9,i.position[2]),project);b.style.left=`${project.x}px`;b.style.top=`${project.y + (i.kind === 'Posture' ? -30 : i.kind === 'Artifact' ? 28 : 0)}px`;b.style.display=names.checked&&project.z>0&&(i.kind!=='Posture'||gravity.checked)&&(i.id!=='artifact'||time>=21)?'block':'none';}
  elapsed+=dt;frames++;if(elapsed>.75){$('perf').textContent=`${Math.round(frames/elapsed)} FPS · WebGL2\nPlayCanvas · simulación local`;elapsed=0;frames=0;}
 });
 app.start();
}
