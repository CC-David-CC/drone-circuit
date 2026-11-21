import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera.js';
import {Engine} from '@babylonjs/core/Engines/engine.js';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {Scene} from '@babylonjs/core/scene.js';
import {SynthAudio} from '../audio/synth.js';
import {
  COURSES,DroneCircuitSession,decodeSave,encodeSave,sessionFromSave,
} from '../model/drone.js';

interface FileContext{
 owner:string;valid():boolean;path(value:string):string;name(value:string):string;
 files:{
  read(path:string):Promise<{data:Uint8Array;version:string;status?:string}>;
  write(path:string,data:Uint8Array,expected?:string|null):Promise<{version:string;status?:string}>;
  stat?(path:string):Promise<{version:string;status?:string}>;
  subscribe?(callback:()=>void):()=>void;
 };
}
export interface Host{
 signal?:AbortSignal;
 w?:{
  title?:string;ownerSub?:string;
  launchContext?:{version:1;storage:'mirror';path:string;owner:string};
  droneCircuit?:{dirty:boolean};
 };
 ui:{
  make(tag:string,className?:string,text?:string):HTMLElement;
  textButton(label:string,action:()=>void):HTMLButtonElement;
  appInput(label:string,value?:string):HTMLInputElement;
  confirm?(message:string,options?:{title?:string;confirmLabel?:string;cancelLabel?:string;danger?:boolean;signal?:AbortSignal}):Promise<boolean>;
 };
 storage:{
  signedInSubject():string;
  mirrorFileContext():Promise<FileContext>;
  pickFile(options:{extensions:string[];signal?:AbortSignal}):Promise<string|null>;
  pickFolder(options:{signal?:AbortSignal}):Promise<string|null>;
 };
}
export interface ViewHandle{element:HTMLElement;dispose():void}

export async function startView(host:Host,signal:AbortSignal):Promise<ViewHandle>{
 const {make,textButton,appInput}=host.ui;
 const owner=host.w?.launchContext?.owner||host.storage.signedInSubject();
 const windowState=host.w?.droneCircuit??{dirty:false};
 if(host.w){host.w.droneCircuit=windowState;host.w.ownerSub=owner;}
 const audio=new SynthAudio();
 let session=new DroneCircuitSession(`drone-${crypto.randomUUID()}`,0);
 let paused=true,disposed=false,busy=false,dirty=false,revision=0,savedPath:string|null=null,savedVersion:string|null=null;
 let unwatch=()=>{},watchSerial=0,engine:Engine|null=null,scene:Scene|null=null,camera:ArcRotateCamera|null=null;
 let drone:Mesh|null=null,ghost:Mesh|null=null,frame=0,previous=performance.now(),chase=false,lastGate=0,lastTicks=0,observedWindow:HTMLElement|null=null;

 const element=make('section','drone-view');
 const shell=make('div','drone-shell');
 const header=make('header','drone-header');
 const heading=make('div');
 heading.append(
  make('h2','drone-title','Drone Circuit'),
  make('p','drone-subtitle','Thread the gates in order. Stable trackside and chase views.'),
 );
 const toolbar=make('div','drone-toolbar');
 const course=document.createElement('select');course.setAttribute('aria-label','Course');
 COURSES.forEach((item,index)=>course.append(new Option(`Course ${index+1}`,''+item.id)));
 const run=textButton('Run',()=>toggleRun());
 const reset=textButton('Reset drone',()=>resetDrone());
 const view=textButton('Camera: trackside',()=>toggleCamera());
 const openButton=textButton('Open from My files',()=>void open());
 const saveButton=textButton('Save to My files',()=>void save());
 toolbar.append(course,run,reset,view,openButton,saveButton);
 header.append(heading,toolbar);

 const stageWrap=make('div','drone-stage-wrap');
 const loading=make('div','drone-loading','Building the circuit…');
 const canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','3D drone circuit');
 stageWrap.append(loading,canvas);
 const side=make('aside','drone-side');
 const telemetry=make('div','drone-panel drone-telemetry');
 const gateText=make('span','','Gate'),gateValue=make('strong','','0/0');
 const timeText=make('span','','Time'),timeValue=make('strong','','0.0 s');
 const penaltyText=make('span','','Penalty'),penaltyValue=make('strong','','0 s');
 const speedText=make('span','','Speed'),speedValue=make('strong','','0');
 const medalText=make('span','','Result'),medalValue=make('strong','','In flight');
 telemetry.append(gateText,gateValue,timeText,timeValue,penaltyText,penaltyValue,speedText,speedValue,medalText,medalValue);

 const warning=make('p','drone-warning');warning.hidden=true;warning.setAttribute('role','status');
 const status=make('div','drone-status app-status','Press Run to fly.');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const settings=document.createElement('details');settings.className='drone-details';
 const soundLabel=make('label','','Sound effects '),sound=document.createElement('input'),volumeLabel=make('label','','Volume '),volume=document.createElement('input');
 sound.type='checkbox';sound.setAttribute('aria-label','Sound effects');volume.type='range';volume.min='0';volume.max='100';volume.value='30';volume.disabled=true;volume.setAttribute('aria-label','Sound volume');
 soundLabel.prepend(sound);volumeLabel.append(volume);
 const ghostLabel=make('label','','Show best-run ghost '),showGhost=document.createElement('input');showGhost.type='checkbox';showGhost.checked=true;showGhost.setAttribute('aria-label','Show best-run ghost');ghostLabel.prepend(showGhost);
 settings.append(make('summary','','Settings'),soundLabel,volumeLabel,ghostLabel);
 const help=document.createElement('details');help.className='drone-details drone-help';
 help.append(make('summary','','How to play'),make('p','','Fly forward with W, reverse with S, strafe with A/D, and change altitude with the arrow keys. Phone buttons are hold controls. Pass every gate in order and in the forward direction. Reset returns to the last gate and adds a five-second penalty.'));
 const saveDetails=document.createElement('details');saveDetails.className='drone-details drone-save';
 const saveFields=make('div','drone-save-fields');
 const path=appInput('Drone save path',host.w?.launchContext?.path||'/Drone Circuit.game.json');
 const folder=textButton('Choose folder',()=>void chooseFolder());
 saveFields.append(path,folder);saveDetails.append(make('summary','','Save location'),saveFields);
 const riveNote=make('p','drone-rive-pending','Telemetry mechanic: procedural fallback; final Rive artwork and spatial XR panel are pending.');
 side.append(telemetry,warning,settings,help,saveDetails,riveNote,status);
 const phoneControls=make('div','drone-phone-controls');
 shell.append(header,stageWrap,side,phoneControls);element.append(shell);

 const valid=()=>!disposed&&!signal.aborted&&element.isConnected&&owner===host.storage.signedInSubject();
 const announce=(message:string)=>{if(valid())status.textContent=message};
 const setDirty=(value:boolean)=>{dirty=value;windowState.dirty=value};
 const mark=()=>{revision++;setDirty(true)};

 function toggleRun():void{
  if(busy||!valid())return;
  paused=!paused;if(paused)clearControls();previous=performance.now();
  if(!paused&&sound.checked)audio.unlock();
  run.textContent=paused?'Run':'Pause';run.setAttribute('aria-label',run.textContent);
  announce(paused?'Flight paused. Current pose and ghost trace retained.':'Flight active. Fly through the gates in order.');
 }
 function resetDrone():void{
  if(busy||!valid())return;
  clearControls();session.reset();mark();lastGate=session.gateIndex;announce('Drone reset to the last gate. Five-second penalty applied.');audio.tone(150,120);
 }
 function toggleCamera():void{
  chase=!chase;view.textContent='Camera: '+(chase?'chase':'trackside');view.setAttribute('aria-label',view.textContent);
  if(scene&&camera){camera.alpha=chase?-Math.PI/2:-Math.PI/2;camera.beta=chase?1.18:1.4;camera.radius=chase?9:52}
 }
 async function newCourse(id:number):Promise<void>{
  if(busy||!valid())return;const prior=session,atRevision=revision,before=encodeSave(session);busy=true;clearControls();
  try{
   if(dirty&&!await host.ui.confirm?.('Change course and discard current flight?',{title:'Unsaved flight',confirmLabel:'Change course',cancelLabel:'Keep flight',danger:true,signal})){course.value=''+session.courseId;return}
   if(!valid()||session!==prior||revision!==atRevision||encodeSave(session)!==before)throw Error('The flight changed while confirming. Try again.');
   session=new DroneCircuitSession(`drone-${crypto.randomUUID()}`,id);paused=true;lastGate=0;lastTicks=0;savedPath=null;savedVersion=null;
   clearWatch();if(host.w)delete host.w.launchContext;setDirty(false);path.value='/Drone Circuit.game.json';run.textContent='Run';buildScene();refresh();announce('Course ready. Press Run to fly.');
  }catch(error){course.value=''+session.courseId;announce('Could not change course: '+(error instanceof Error?error.message:'unknown error'))}finally{busy=false}
 }
 course.addEventListener('change',()=>void newCourse(Number(course.value)));

 const held=new Map<number,{axis:'x'|'y'|'z';value:number}>(),keys=new Set<string>();
 const pulses=new Map<string,{axis:'x'|'y'|'z';value:number;timer:ReturnType<typeof setTimeout>}>();
 function syncControls():void{
  const count=(axis:'x'|'y'|'z',positive:string,negative:string)=>{
   let n=Number(keys.has(positive))-Number(keys.has(negative));
   for(const input of held.values())if(input.axis===axis)n+=input.value;
   for(const input of pulses.values())if(input.axis===axis)n+=input.value;
   session.setThrottle(axis,Math.max(-1,Math.min(1,n)));
  };
  count('x','w','s');count('y','arrowup','arrowdown');count('z','d','a');
 }
 function clearControls():void{keys.clear();held.clear();for(const pulse of pulses.values())clearTimeout(pulse.timer);pulses.clear();syncControls()}
 function bindHold(button:HTMLButtonElement,axis:'x'|'y'|'z',value:number):void{
  const pulseKey=axis+':'+value;
  button.addEventListener('pointerdown',event=>{if(event.button!==0||busy||paused||!valid())return;event.preventDefault();button.setPointerCapture(event.pointerId);held.set(event.pointerId,{axis,value});syncControls()});
  const release=(event:PointerEvent)=>{if(!held.delete(event.pointerId))return;syncControls();if(button.hasPointerCapture(event.pointerId))button.releasePointerCapture(event.pointerId)};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release as EventListener);
  button.addEventListener('click',event=>{if(event.detail!==0||busy||paused||!valid())return;const existing=pulses.get(pulseKey);if(existing)clearTimeout(existing.timer);const timer=setTimeout(()=>{pulses.delete(pulseKey);syncControls()},140);pulses.set(pulseKey,{axis,value,timer});syncControls()});
 }
 for(const [label,axis,value] of [['Forward','x',1],['Back','x',-1],['Left','z',-1],['Right','z',1],['Rise','y',1],['Fall','y',-1]] as const){const button=textButton(label,()=>{});bindHold(button,axis,value);phoneControls.append(button)}
 phoneControls.append(textButton('Reset',resetDrone),textButton('Camera',toggleCamera));

 const keyboard=(event:KeyboardEvent):void=>{
  const key=event.key.toLowerCase();
  if(!['w','a','s','d','arrowup','arrowdown','r','escape'].includes(key))return;
  event.preventDefault();if((key==='r'||key==='escape')&&event.repeat)return;
  if(key==='r'){resetDrone();return}if(key==='escape'){toggleRun();return}
  if(busy||paused)return;keys.add(key);syncControls();
 };
 const keyup=(event:KeyboardEvent):void=>{keys.delete(event.key.toLowerCase());syncControls()};
 const canvasBlur=():void=>{keys.clear();syncControls()};
 canvas.addEventListener('keydown',keyboard);canvas.addEventListener('keyup',keyup);canvas.addEventListener('blur',canvasBlur);

 function refresh():void{
  gateValue.textContent=`${session.gateIndex}/${session.course.gates.length}`;
  timeValue.textContent=`${(session.ticks/60+session.penaltySeconds).toFixed(1)} s`;
  penaltyValue.textContent=`${session.penaltySeconds} s`;
  speedValue.textContent=Math.hypot(session.velocity.x,session.velocity.y,session.velocity.z).toFixed(1);
  medalValue.textContent=session.finished?(session.medal()?.toUpperCase()||'FINISHED'):'In flight';
 }

 function clearMeshes():void{ghost?.dispose();ghost=null;for(const mesh of scene?.meshes.slice()??[])if(mesh!==drone)mesh.dispose();}
 function buildScene():void{
  if(!scene)return;
  clearMeshes();
  scene.clearColor=new Color4(.025,.06,.12,1);
  const ground=MeshBuilder.CreateGround('track',{width:90,height:24},scene);ground.position.x=28;ground.position.y=-6;
  const groundMat=new StandardMaterial('track-material',scene);groundMat.diffuseColor=Color3.FromHexString('#1d3550');ground.material=groundMat;
  const grid=new StandardMaterial('line-material',scene);grid.emissiveColor=Color3.FromHexString('#57a9d2');
  for(let x=-5;x<=65;x+=5){const line=MeshBuilder.CreateBox('line-'+x,{width:.05,height:.04,depth:22},scene);line.position.set(x,-5.95,0);line.material=grid}
  const droneMat=new StandardMaterial('drone-material',scene);droneMat.emissiveColor=Color3.FromHexString('#43d4f1');
  if(!drone){drone=MeshBuilder.CreateSphere('drone',{diameter:1.2,segments:16},scene);drone.material=droneMat}
  drone.position.set(session.position.x,session.position.y,session.position.z);
  for(const [index,item] of session.course.gates.entries()){
   const gate=MeshBuilder.CreateTorus('gate-'+index,{diameter:4.2,thickness:.22,tessellation:24},scene);
   gate.position.set(item.x,item.y,item.z);gate.rotation.z=Math.PI/2;
   const material=new StandardMaterial('gate-mat-'+index,scene);
   material.emissiveColor=Color3.FromHexString(index<session.gateIndex?'#58d48a':index===session.gateIndex?'#f2d05a':'#5c7a9c');gate.material=material;
  }
  for(const [index,item] of session.course.obstacles.entries()){
   const obstacle=MeshBuilder.CreateSphere('obstacle-'+index,{diameter:item.radius*2,segments:12},scene);obstacle.position.set(item.x,item.y,item.z);
   const material=new StandardMaterial('obstacle-mat-'+index,scene);material.emissiveColor=Color3.FromHexString('#ce5f65');obstacle.material=material;
  }
  loading.hidden=true;
 }

 function updateGhost():void{
  if(!scene)return;
  ghost?.dispose();ghost=null;
  if(!showGhost.checked||session.bestSamples.length<2)return;
  const lines=MeshBuilder.CreateLines('best-ghost',{points:session.bestSamples.map(point=>new Vector3(point.x,point.y,point.z))},scene);
  lines.color=Color3.FromHexString('#85d6ff');lines.alpha=.25;ghost=lines;
 }

 function tick(now:number):void{
  if(disposed)return;
  watchWindow();
  const delta=Math.min(100,Math.max(0,now-previous));previous=now;
  if(!paused&&!session.finished){session.advance(delta);if(session.ticks!==lastTicks){lastTicks=session.ticks;mark()}}
  if(session.gateIndex!==lastGate){lastGate=session.gateIndex;announce(session.finished?'Course complete.':'Gate clear. Next gate highlighted.');audio.tone(520,90,'triangle');updateGhost()}
  if(session.finished&&paused===false){paused=true;run.textContent='Run';announce(`Course complete: ${(session.ticks/60+session.penaltySeconds).toFixed(1)} seconds.`)}
  if(drone)drone.position.set(session.position.x,session.position.y,session.position.z);
  if(camera){camera.target.copyFrom(chase?drone?.position??Vector3.Zero():new Vector3(30,0,0))}
  refresh();scene?.render();frame=requestAnimationFrame(tick);
 }

 function suspend():void{clearControls();if(paused)return;paused=true;run.textContent='Run';announce('Flight paused when its window lost attention. Press Run when ready.')}
 const visibility=()=>{if(document.hidden)suspend()};window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',visibility);
 const windowObserver=new MutationObserver(()=>{if(observedWindow&&(observedWindow.hidden||!observedWindow.classList.contains('focused')||observedWindow.classList.contains('rolled')))suspend()});
 const watchWindow=()=>{const target=element.closest<HTMLElement>('.window');if(target!==observedWindow){windowObserver.disconnect();observedWindow=target;if(target)windowObserver.observe(target,{attributes:true,attributeFilter:['class','hidden']})}if(target&&(target.hidden||!target.classList.contains('focused')||target.classList.contains('rolled')))suspend()};

 function clearWatch():void{watchSerial++;unwatch();unwatch=()=>{}}
 function watch(context:FileContext,p:string,version:string):void{
  clearWatch();const serial=watchSerial;
  const check=async()=>{
   if(!valid()||!context.valid()||savedPath!==p||savedVersion!==version)return;
   let text='';try{const current=context.files.stat?await context.files.stat(p):await context.files.read(p);text=current.status==='conflict'?'This save has conflicting copies. Resolve them in Files.':current.version!==version?'The saved flight changed. Your current flight is unchanged; save a copy or reopen it.':''}catch{text='The saved flight is unavailable. Your current flight is unchanged.'}
   if(valid()&&serial===watchSerial){warning.textContent=text;warning.hidden=!text}
  };
  unwatch=context.files.subscribe?.(check)||(()=>{});queueMicrotask(check);
 }
 async function chooseFolder():Promise<void>{
  try{const selected=await host.storage.pickFolder({signal});if(selected===null||!valid())return;const context=await host.storage.mirrorFileContext();if(!valid()||!context.valid())return;path.value=context.path((selected==='/'?'':selected)+'/'+context.name(path.value.split('/').pop()||'Drone Circuit.game.json'))}catch(error){announce('Could not choose folder: '+(error instanceof Error?error.message:'unknown error'))}
 }
 async function save():Promise<void>{
  if(busy||!valid())return;busy=true;paused=true;clearControls();run.textContent='Run';
  const previousDirty=dirty,capturedRevision=revision,captured=encodeSave(session),requested=path.value;setDirty(true);let committed=false;
  try{
   const context=await host.storage.mirrorFileContext(),target=context.path(requested);
   if(!target.toLowerCase().endsWith('.game.json'))throw Error('Use a .game.json file name.');
   let expected:string|null=null;
   try{const current=context.files.stat?await context.files.stat(target):await context.files.read(target);if(current.status==='conflict')throw Error('Resolve the conflict in Files first.');if(target===savedPath&&savedVersion){if(current.version!==savedVersion)throw Error('The saved flight changed. Save a copy or reopen it.')}else if(!await host.ui.confirm?.('Replace '+target+'?',{title:'Replace flight',confirmLabel:'Replace',cancelLabel:'Cancel',danger:true,signal})){announce('Save cancelled.');return}expected=current.version}catch(error){if(!(error instanceof Error)||error.message!=='File not found.')throw error;if(target===savedPath&&savedVersion)throw Error('The saved flight was removed. Save a copy or reopen it.')}
   if(!valid()||!context.valid())return;const result=await context.files.write(target,new TextEncoder().encode(captured),expected);if(!valid()||!context.valid())return;
   savedPath=target;savedVersion=result.version;path.value=target;setDirty(revision!==capturedRevision||encodeSave(session)!==captured);committed=true;
   if(host.w){host.w.launchContext=Object.freeze({version:1,storage:'mirror',path:target,owner});host.w.title=target.split('/').pop()+' — Drone Circuit'}
   watch(context,target,result.version);announce(result.status==='conflict'?'Saved with conflicting copies. Resolve them in Files.':'Flight saved to My files; syncing with the server.');
  }catch(error){announce('Could not save flight: '+(error instanceof Error?error.message:'unknown error'))}finally{if(!committed&&valid()&&revision===capturedRevision)setDirty(previousDirty);busy=false;refresh()}
 }
 async function open(selected?:string):Promise<void>{
  if(busy||!valid())return;busy=true;paused=true;clearControls();run.textContent='Run';
  const startingSession=session,startingRevision=revision,startingSnapshot=encodeSave(session);
  try{
   if(dirty&&!await host.ui.confirm?.('Open a saved flight and discard current progress?',{title:'Unsaved flight',confirmLabel:'Discard progress',cancelLabel:'Keep flight',danger:true,signal})){announce('Flight paused. Press Run to continue.');return}
   if(!valid())return;if(session!==startingSession||revision!==startingRevision||encodeSave(session)!==startingSnapshot)throw Error('The flight changed while confirming. Try again.');const choice=selected||await host.storage.pickFile({extensions:['.json'],signal});if(!choice||!valid())return;
   const context=await host.storage.mirrorFileContext(),target=context.path(choice),file=await context.files.read(target);
   if(file.status==='conflict')throw Error('Resolve the conflict in Files first.');if(file.data.byteLength>8*1024*1024)throw Error('Flight file is too large.');
   const decoded=decodeSave(new TextDecoder('utf-8',{fatal:true}).decode(file.data)),replacement=sessionFromSave(decoded);
   if(!valid()||!context.valid())return;if(session!==startingSession||revision!==startingRevision||encodeSave(session)!==startingSnapshot)throw Error('The flight changed while opening. Try again.');session=replacement;course.value=''+session.courseId;lastGate=session.gateIndex;lastTicks=session.ticks;
   savedPath=target;savedVersion=file.version;path.value=target;setDirty(false);warning.hidden=true;
   if(host.w){host.w.launchContext=Object.freeze({version:1,storage:'mirror',path:target,owner});host.w.title=target.split('/').pop()+' — Drone Circuit'}
   buildScene();updateGhost();watch(context,target,file.version);refresh();announce('Flight loaded and paused. Press Run to continue.');
  }catch(error){announce('Could not open flight: '+(error instanceof Error?error.message:'unknown error'))}finally{busy=false}
 }

 sound.addEventListener('change',()=>{volume.disabled=!sound.checked;audio.setMuted(!sound.checked);if(sound.checked)audio.unlock()});
 volume.addEventListener('input',()=>audio.setVolume(Number(volume.value)/100));
 showGhost.addEventListener('change',updateGhost);
 queueMicrotask(()=>{
  if(disposed)return;
  try{
   engine=new Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true},true);
   if (typeof ResizeObserver !== 'undefined') {
     const resizeObserver = new ResizeObserver(() => {
       engine?.resize();
     });
     resizeObserver.observe(stageWrap);
   }
   scene=new Scene(engine);const cameraLight=new HemisphericLight('light',new Vector3(0,1,0),scene);cameraLight.intensity=.9;
   camera=new ArcRotateCamera('camera',-Math.PI/2,1.4,52,new Vector3(30,0,0),scene);camera.attachControl(canvas,false);camera.lowerRadiusLimit=4;camera.upperRadiusLimit=90;
   buildScene();refresh();frame=requestAnimationFrame(tick);
   const initial=host.w?.launchContext;
   if(initial?.storage==='mirror'&&initial.owner===owner){const wait=(attempt=0):void=>{if(disposed||signal.aborted)return;if(!element.isConnected&&attempt<60)setTimeout(()=>wait(attempt+1),16);else if(valid())void open(initial.path)};wait()}
   engine.resize();
  }catch(error){loading.textContent='Babylon.js could not start: '+(error instanceof Error?error.message:'unknown error');announce(loading.textContent)}
 });
 return{element,dispose(){
  if(disposed)return;disposed=true;cancelAnimationFrame(frame);clearWatch();clearControls();windowObserver.disconnect();
  canvas.removeEventListener('keydown',keyboard);canvas.removeEventListener('keyup',keyup);canvas.removeEventListener('blur',canvasBlur);window.removeEventListener('blur',suspend);document.removeEventListener('visibilitychange',visibility);
  audio.dispose();scene?.dispose();engine?.dispose();scene=null;engine=null;camera=null;drone=null;ghost=null;element.replaceChildren();
 }};
}
