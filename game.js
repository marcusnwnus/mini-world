import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";
import { createMouseModel } from "./src/mouse.js";

const TIERS = Object.freeze([
  { name:"Mouse", icon:"🐭", hp:45, damage:9, speed:7.4, range:1.35, cooldown:.52, xp:45, reward:10, scale:.82 },
  { name:"Rabbit", icon:"🐇", hp:72, damage:13, speed:8.0, range:1.5, cooldown:.5, xp:95, reward:18, scale:.95 },
  { name:"Fox", icon:"🦊", hp:110, damage:20, speed:8.3, range:1.75, cooldown:.62, xp:175, reward:30, scale:1.05 },
  { name:"Wolf", icon:"🐺", hp:160, damage:29, speed:8.5, range:1.95, cooldown:.72, xp:null, reward:48, scale:1.16 }
]);

const WORLD_HALF = 32;
const CREATURE_COUNT = 20;
const SPAWN_SHIELD = 3;
const SAVE_KEY = "mini-world-evolution-v1";

const shell = document.getElementById("gameShell");
const canvas = document.getElementById("game");
const ui = {
  speciesIcon:document.getElementById("speciesIcon"),
  speciesName:document.getElementById("speciesName"),
  tierLabel:document.getElementById("tierLabel"),
  healthText:document.getElementById("healthText"),
  healthBar:document.getElementById("healthBar"),
  xpText:document.getElementById("xpText"),
  xpBar:document.getElementById("xpBar"),
  kills:document.getElementById("kills"),
  protection:document.getElementById("protection"),
  targetCard:document.getElementById("targetCard"),
  targetName:document.getElementById("targetName"),
  targetHealth:document.getElementById("targetHealth"),
  pauseBtn:document.getElementById("pauseBtn"),
  attackBtn:document.getElementById("attackBtn"),
  evolveBtn:document.getElementById("evolveBtn"),
  joystick:document.getElementById("joystick"),
  joystickKnob:document.getElementById("joystickKnob"),
  startOverlay:document.getElementById("startOverlay"),
  playBtn:document.getElementById("playBtn"),
  pauseOverlay:document.getElementById("pauseOverlay"),
  resumeBtn:document.getElementById("resumeBtn"),
  toast:document.getElementById("toast")
};

let renderer;
let scene;
let camera;
let clock;
let worldGroup;
let creatures = [];
let currentTarget = null;
let started = false;
let paused = true;
let toastTimer = 0;
let hudTimer = 0;
let cameraShake = 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const keys = new Set();
const joystick = { x:0, z:0, pointerId:null };

const player = {
  tier:0,
  xp:0,
  kills:0,
  hp:TIERS[0].hp,
  group:null,
  cooldown:0,
  attackPulse:0,
  spawnShield:0,
  dead:false,
  respawnTimer:0,
  moveSpeed:0
};

const tempV = new THREE.Vector3();
const tempV2 = new THREE.Vector3();
const tempQ = new THREE.Quaternion();

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rand(a,b){ return a + Math.random() * (b-a); }
function chooseWeightedTier(){
  const r=Math.random();
  if(r<.46) return 0;
  if(r<.75) return 1;
  if(r<.93) return 2;
  return 3;
}
function tier(){ return TIERS[player.tier]; }

function toast(message,type=""){
  ui.toast.textContent=message;
  ui.toast.className="toast show "+type;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>ui.toast.className="toast",1500);
}

function fatal(message){
  ui.startOverlay.classList.add("show");
  ui.startOverlay.querySelector(".panel").innerHTML =
    "<h1>3D unavailable</h1><p>"+message+"</p><p class='tiny'>Try a current Safari, Chrome, Edge or Firefox browser with WebGL enabled.</p>";
}

function makeMat(color,roughness=.88){
  return new THREE.MeshStandardMaterial({color,roughness,metalness:0});
}

function shadowify(root){
  root.traverse(obj=>{
    if(obj.isMesh){
      obj.castShadow=true;
      obj.receiveShadow=true;
    }
  });
  return root;
}

function createRabbitModel(){
  const g=new THREE.Group();
  const fur=makeMat(0xc9b7a4),light=makeMat(0xf1ddd0),dark=makeMat(0x202023);
  const mesh=(geo,mat,pos,scale)=>{
    const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);g.add(m);return m;
  };
  const body=mesh(new THREE.SphereGeometry(.72,12,8),fur,[0,.72,-.05],[.82,.82,1.22]);
  const head=mesh(new THREE.SphereGeometry(.5,12,8),fur,[0,1.05,.82],[.9,.9,1]);
  for(const s of [-1,1]){
    const ear=mesh(new THREE.SphereGeometry(.24,10,7),light,[s*.24,1.68,.73],[.58,1.55,.48]);
    ear.rotation.z=s*.12;
    mesh(new THREE.SphereGeometry(.07,8,6),dark,[s*.29,1.13,1.2],[1,1,1]);
    mesh(new THREE.SphereGeometry(.15,8,6),fur,[s*.33,.2,.48],[1,.45,1.6]);
  }
  mesh(new THREE.SphereGeometry(.2,8,6),light,[0,.7,-.91],[1,1,1]);
  g.userData.animate=(time,speed)=>{
    const stride=Math.min(1,speed/5);
    body.position.y=.72+Math.abs(Math.sin(time*8))*.055*stride;
    head.rotation.z=Math.sin(time*4)*.025;
  };
  return shadowify(g);
}

function createPredatorModel(tierIndex){
  const isWolf=tierIndex===3;
  const g=new THREE.Group();
  const fur=makeMat(isWolf?0x66727c:0xc86f3d);
  const light=makeMat(isWolf?0xb9c1c5:0xf0c49b);
  const dark=makeMat(0x17191b);
  const mesh=(geo,mat,pos,scale)=>{
    const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);g.add(m);return m;
  };
  const body=mesh(new THREE.SphereGeometry(.75,12,8),fur,[0,.82,-.05],[.82,.82,1.42]);
  const chest=mesh(new THREE.SphereGeometry(.42,10,7),light,[0,.73,.62],[.72,.7,1.08]);
  const head=mesh(new THREE.SphereGeometry(.5,12,8),fur,[0,1.12,1.02],[.94,.88,1.08]);
  const muzzle=mesh(new THREE.SphereGeometry(.26,10,7),light,[0,1.02,1.43],[.85,.7,1.18]);
  mesh(new THREE.SphereGeometry(.095,8,6),dark,[0,1.03,1.68],[1,1,1]);
  for(const s of [-1,1]){
    const ear=mesh(new THREE.ConeGeometry(.23,.48,5),fur,[s*.3,1.58,.86],[1,1,1]);
    ear.rotation.z=-s*.08;
    mesh(new THREE.SphereGeometry(.07,8,6),dark,[s*.3,1.2,1.35],[1,1,1]);
    mesh(new THREE.SphereGeometry(.16,8,6),fur,[s*.39,.22,.52],[1,.45,1.45]);
    mesh(new THREE.SphereGeometry(.17,8,6),fur,[s*.42,.22,-.57],[1,.45,1.45]);
  }
  const tailCurve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,.78,-.95),
    new THREE.Vector3(.35,.84,-1.28),
    new THREE.Vector3(.52,.67,-1.65),
    new THREE.Vector3(.35,.53,-1.92)
  ]);
  const tail=new THREE.Mesh(new THREE.TubeGeometry(tailCurve,10,isWolf?.13:.15,5,false),fur);
  g.add(tail);
  g.userData.animate=(time,speed)=>{
    const stride=Math.min(1,speed/5);
    body.position.y=.82+Math.sin(time*10)*.025*stride;
    head.rotation.z=Math.sin(time*5)*.02;
    tail.rotation.y=Math.sin(time*5)*.13;
    chest.rotation.x=Math.sin(time*10)*.012*stride;
  };
  return shadowify(g);
}

function createModelForTier(tierIndex){
  let model;
  if(tierIndex===0) model=createMouseModel();
  else if(tierIndex===1) model=createRabbitModel();
  else model=createPredatorModel(tierIndex);
  model.scale.multiplyScalar(TIERS[tierIndex].scale);
  return model;
}

function replacePlayerModel(){
  if(player.group) scene.remove(player.group);
  player.group=createModelForTier(player.tier);
  player.group.position.set(0,0,0);
  scene.add(player.group);
  player.hp=TIERS[player.tier].hp;
}

function makeTree(x,z,scale){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,1.8,7),makeMat(0x78533c));
  trunk.position.y=.9;
  const crown=new THREE.Mesh(new THREE.ConeGeometry(.95,2.4,8),makeMat(0x3f7f4c));
  crown.position.y=2.6;
  g.add(trunk,crown);
  g.position.set(x,0,z);
  g.scale.setScalar(scale);
  shadowify(g);
  worldGroup.add(g);
}

function makeRock(x,z,scale){
  const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.75,0),makeMat(0x7e8588));
  rock.scale.set(1.15,.7,.9);
  rock.position.set(x,.45*scale,z);
  rock.rotation.set(rand(-.15,.15),rand(0,Math.PI),rand(-.12,.12));
  rock.scale.multiplyScalar(scale);
  rock.castShadow=true;rock.receiveShadow=true;
  worldGroup.add(rock);
}

function seededRandom(seed){
  let s=seed>>>0;
  return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
}

function buildWorld(){
  worldGroup=new THREE.Group();
  scene.add(worldGroup);

  const ground=new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF*2.15,WORLD_HALF*2.15,1,1),
    new THREE.MeshStandardMaterial({color:0x6b9d55,roughness:1})
  );
  ground.rotation.x=-Math.PI/2;
  ground.receiveShadow=true;
  worldGroup.add(ground);

  const path=new THREE.Mesh(
    new THREE.RingGeometry(8,9.2,64),
    new THREE.MeshStandardMaterial({color:0x83966a,roughness:1,side:THREE.DoubleSide})
  );
  path.rotation.x=-Math.PI/2;
  path.position.y=.012;
  worldGroup.add(path);

  const rng=seededRandom(20260925);
  for(let i=0;i<34;i++){
    const a=rng()*Math.PI*2;
    const radius=11+rng()*19;
    const x=Math.cos(a)*radius,z=Math.sin(a)*radius;
    if(i<23) makeTree(x,z,.75+rng()*.65);
    else makeRock(x,z,.55+rng()*.8);
  }

  const rim=new THREE.Mesh(
    new THREE.RingGeometry(WORLD_HALF-1,WORLD_HALF+2,64),
    new THREE.MeshStandardMaterial({color:0x49653e,roughness:1,side:THREE.DoubleSide})
  );
  rim.rotation.x=-Math.PI/2;
  rim.position.y=.01;
  worldGroup.add(rim);
}

function randomSpawn(minRadius=7){
  for(let i=0;i<30;i++){
    const a=Math.random()*Math.PI*2;
    const r=rand(minRadius,WORLD_HALF-3);
    const pos=new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r);
    if(player.group&&pos.distanceTo(player.group.position)<6) continue;
    return pos;
  }
  return new THREE.Vector3(rand(-20,20),0,rand(-20,20));
}

function spawnCreature(slot,tierIndex=chooseWeightedTier()){
  if(slot.group) scene.remove(slot.group);
  slot.tier=tierIndex;
  slot.group=createModelForTier(tierIndex);
  slot.group.position.copy(randomSpawn());
  slot.group.rotation.y=rand(-Math.PI,Math.PI);
  slot.hp=TIERS[tierIndex].hp;
  slot.maxHp=slot.hp;
  slot.alive=true;
  slot.attackTimer=rand(0,.4);
  slot.wanderTimer=0;
  slot.wanderAngle=rand(-Math.PI,Math.PI);
  slot.respawnTimer=0;
  slot.hitTimer=0;
  slot.aggressive=Math.random()<.35+tierIndex*.13;
  scene.add(slot.group);
}

function createCreatures(){
  creatures=[];
  for(let i=0;i<CREATURE_COUNT;i++){
    const slot={group:null,alive:false};
    creatures.push(slot);
    spawnCreature(slot);
  }
}

function killCreature(creature,playerKill){
  if(!creature.alive) return;
  creature.alive=false;
  creature.group.visible=false;
  creature.respawnTimer=rand(3.5,7);
  if(playerKill){
    player.kills++;
    const delta=creature.tier-player.tier;
    const mult=delta>=1?1.6:delta===0?1:delta===-1?.45:.12;
    const gained=Math.max(1,Math.round(TIERS[creature.tier].reward*mult));
    player.xp+=gained;
    toast("+"+gained+" XP · "+TIERS[creature.tier].name+" defeated","good");
    if(navigator.vibrate) navigator.vibrate(18);
    saveProgress();
  }
}

function respawnCreature(creature){
  spawnCreature(creature,chooseWeightedTier());
}

function initThree(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
  }catch(err){
    fatal("This device could not start the WebGL renderer.");
    throw err;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setSize(innerWidth,innerHeight,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;

  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x91cadc);
  scene.fog=new THREE.Fog(0x91cadc,36,82);

  camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,120);
  camera.position.set(10,9,12);

  const hemi=new THREE.HemisphereLight(0xdff4ff,0x50623b,2.05);
  scene.add(hemi);

  const sun=new THREE.DirectionalLight(0xfff2d1,2.3);
  sun.position.set(-12,22,8);
  sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left=-32;sun.shadow.camera.right=32;
  sun.shadow.camera.top=32;sun.shadow.camera.bottom=-32;
  sun.shadow.camera.near=1;sun.shadow.camera.far=70;
  scene.add(sun);

  clock=new THREE.Clock();
  buildWorld();
  loadProgress();
  replacePlayerModel();
  createCreatures();
  updateHUD(true);
}

function loadProgress(){
  try{
    const data=JSON.parse(localStorage.getItem(SAVE_KEY));
    if(!data) return;
    player.tier=clamp(Number(data.tier)||0,0,TIERS.length-1);
    player.xp=Math.max(0,Number(data.xp)||0);
    player.kills=Math.max(0,Number(data.kills)||0);
  }catch{}
}

function saveProgress(){
  try{
    localStorage.setItem(SAVE_KEY,JSON.stringify({tier:player.tier,xp:player.xp,kills:player.kills}));
  }catch{}
}

function moveInput(){
  let x=joystick.x,z=joystick.z;
  if(keys.has("KeyA")||keys.has("ArrowLeft")) x-=1;
  if(keys.has("KeyD")||keys.has("ArrowRight")) x+=1;
  if(keys.has("KeyW")||keys.has("ArrowUp")) z-=1;
  if(keys.has("KeyS")||keys.has("ArrowDown")) z+=1;
  const len=Math.hypot(x,z);
  if(len>1){x/=len;z/=len;}
  return {x,z,len:Math.min(1,len)};
}

function shortestAngle(a,b){
  let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;
  if(d<-Math.PI)d+=Math.PI*2;
  return d;
}

function updatePlayer(dt,time){
  if(player.dead){
    player.respawnTimer-=dt;
    if(player.respawnTimer<=0) respawnPlayer();
    return;
  }

  player.cooldown=Math.max(0,player.cooldown-dt);
  player.spawnShield=Math.max(0,player.spawnShield-dt);
  player.attackPulse=Math.max(0,player.attackPulse-dt);

  const input=moveInput();
  const t=tier();
  player.moveSpeed=input.len*t.speed;

  if(input.len>.04){
    player.group.position.x+=input.x*t.speed*dt;
    player.group.position.z+=input.z*t.speed*dt;
    const desired=Math.atan2(input.x,input.z);
    player.group.rotation.y+=shortestAngle(player.group.rotation.y,desired)*Math.min(1,dt*12);
  }

  const max=WORLD_HALF-2.2;
  player.group.position.x=clamp(player.group.position.x,-max,max);
  player.group.position.z=clamp(player.group.position.z,-max,max);

  const pulse=player.attackPulse>0?1+Math.sin((.15-player.attackPulse)/.15*Math.PI)*.12:1;
  const base=t.scale;
  player.group.scale.setScalar(base*pulse);
  if(player.group.userData.animate) player.group.userData.animate(time,reducedMotion?0:player.moveSpeed);
}

function nearestLowerCreature(from,tierIndex,maxDist){
  let best=null,bestD=maxDist;
  for(const c of creatures){
    if(!c.alive||c===from||c.tier>=tierIndex) continue;
    const d=c.group.position.distanceTo(from.group.position);
    if(d<bestD){bestD=d;best=c;}
  }
  return best;
}

function moveCreature(c,dir,speed,dt){
  if(dir.lengthSq()<.0001) return;
  dir.y=0;dir.normalize();
  c.group.position.addScaledVector(dir,speed*dt);
  const max=WORLD_HALF-2.3;
  c.group.position.x=clamp(c.group.position.x,-max,max);
  c.group.position.z=clamp(c.group.position.z,-max,max);
  const desired=Math.atan2(dir.x,dir.z);
  c.group.rotation.y+=shortestAngle(c.group.rotation.y,desired)*Math.min(1,dt*8);
}

function damagePlayer(amount){
  if(player.dead||player.spawnShield>0) return;
  player.hp=Math.max(0,player.hp-amount);
  cameraShake=.18;
  if(navigator.vibrate) navigator.vibrate(12);
  if(player.hp<=0) handlePlayerDeath();
}

function damageCreature(c,amount,fromPlayer){
  if(!c.alive) return;
  c.hp=Math.max(0,c.hp-amount);
  c.hitTimer=.12;
  if(c.hp<=0) killCreature(c,fromPlayer);
}

function updateCreature(c,dt,time){
  if(!c.alive){
    c.respawnTimer-=dt;
    if(c.respawnTimer<=0) respawnCreature(c);
    return;
  }

  c.attackTimer=Math.max(0,c.attackTimer-dt);
  c.hitTimer=Math.max(0,c.hitTimer-dt);

  const cfg=TIERS[c.tier];
  const toPlayer=tempV.copy(player.group.position).sub(c.group.position);
  const playerDist=toPlayer.length();
  let moving=false;

  if(!player.dead&&playerDist<9.5){
    if(c.tier>player.tier||(c.tier===player.tier&&c.aggressive)){
      if(playerDist>cfg.range*.78){
        moveCreature(c,toPlayer,cfg.speed*.66,dt);
        moving=true;
      }
      if(playerDist<cfg.range&&c.attackTimer<=0){
        c.attackTimer=cfg.cooldown*1.2;
        damagePlayer(cfg.damage*.72);
      }
    }else if(c.tier<player.tier&&playerDist<7){
      moveCreature(c,toPlayer.multiplyScalar(-1),cfg.speed*.8,dt);
      moving=true;
    }
  }

  if(!moving&&c.tier>0){
    const prey=nearestLowerCreature(c,c.tier,6.5);
    if(prey){
      const toPrey=tempV2.copy(prey.group.position).sub(c.group.position);
      const d=toPrey.length();
      if(d>cfg.range*.78){
        moveCreature(c,toPrey,cfg.speed*.52,dt);
        moving=true;
      }
      if(d<cfg.range&&c.attackTimer<=0){
        c.attackTimer=cfg.cooldown*1.3;
        damageCreature(prey,cfg.damage*.58,false);
      }
    }
  }

  if(!moving){
    c.wanderTimer-=dt;
    if(c.wanderTimer<=0){
      c.wanderTimer=rand(1.4,3.8);
      c.wanderAngle+=rand(-1.5,1.5);
    }
    const wander=tempV.set(Math.sin(c.wanderAngle),0,Math.cos(c.wanderAngle));
    moveCreature(c,wander,cfg.speed*.2,dt);
  }

  const pulse=c.hitTimer>0?1.12:1;
  c.group.scale.setScalar(cfg.scale*pulse);
  if(c.group.userData.animate) c.group.userData.animate(time,reducedMotion?0:cfg.speed*.25);
}

function selectTarget(){
  if(player.dead) return null;
  let best=null,bestScore=Infinity;
  const p=player.group.position;
  const forward=tempV.set(Math.sin(player.group.rotation.y),0,Math.cos(player.group.rotation.y));
  for(const c of creatures){
    if(!c.alive) continue;
    const offset=tempV2.copy(c.group.position).sub(p);
    const d=offset.length();
    if(d>6) continue;
    offset.normalize();
    const facing=forward.dot(offset);
    const score=d+(facing<-.15?5:0);
    if(score<bestScore){bestScore=score;best=c;}
  }
  return best;
}

function attack(){
  if(!started||paused||player.dead||player.cooldown>0) return;
  const cfg=tier();
  player.cooldown=cfg.cooldown;
  player.attackPulse=.15;

  const forward=new THREE.Vector3(Math.sin(player.group.rotation.y),0,Math.cos(player.group.rotation.y));
  let best=null,bestD=cfg.range+.75;
  for(const c of creatures){
    if(!c.alive) continue;
    const to=tempV.copy(c.group.position).sub(player.group.position);
    const d=to.length();
    if(d>bestD) continue;
    to.normalize();
    if(forward.dot(to)<-.05) continue;
    best=c;bestD=d;
  }

  if(best){
    damageCreature(best,cfg.damage,true);
    cameraShake=.09;
    best.aggressive=true;
  }
  updateHUD(true);
}

function canEvolve(){
  const cfg=tier();
  return cfg.xp!==null&&player.xp>=cfg.xp&&!player.dead;
}

function evolve(){
  if(!started||paused||!canEvolve()) return;
  const old=tier();
  player.xp=Math.max(0,player.xp-old.xp);
  player.tier=Math.min(TIERS.length-1,player.tier+1);
  const pos=player.group.position.clone();
  const rot=player.group.rotation.y;
  replacePlayerModel();
  player.group.position.copy(pos);
  player.group.rotation.y=rot;
  player.spawnShield=1.5;
  toast("Evolved into "+tier().name+"!","good");
  if(navigator.vibrate) navigator.vibrate([20,35,30]);
  saveProgress();
  updateHUD(true);
}

function handlePlayerDeath(){
  player.dead=true;
  player.respawnTimer=1.8;
  player.group.visible=false;
  toast("Defeated — respawning one tier lower","bad");
}

function respawnPlayer(){
  if(player.tier>0) player.tier--;
  player.xp=0;
  replacePlayerModel();
  player.group.visible=true;
  player.group.position.set(0,0,0);
  player.spawnShield=SPAWN_SHIELD;
  player.dead=false;
  player.cooldown=.5;
  toast("Respawned as "+tier().name+" with a spawn shield");
  saveProgress();
  updateHUD(true);
}

function updateCamera(dt){
  if(!player.group) return;
  const p=player.group.position;
  const desired=tempV.set(p.x+9,p.y+8.5,p.z+11);
  if(cameraShake>0&&!reducedMotion){
    cameraShake=Math.max(0,cameraShake-dt);
    desired.x+=rand(-.12,.12);
    desired.y+=rand(-.08,.08);
  }
  camera.position.lerp(desired,1-Math.exp(-5.5*dt));
  const look=tempV2.set(p.x,p.y+1,p.z);
  camera.lookAt(look);
}

function updateTargetUI(){
  currentTarget=selectTarget();
  if(!currentTarget){
    ui.targetCard.hidden=true;
    return;
  }
  ui.targetCard.hidden=false;
  ui.targetName.textContent=TIERS[currentTarget.tier].icon+" "+TIERS[currentTarget.tier].name;
  ui.targetHealth.style.width=(currentTarget.hp/currentTarget.maxHp*100)+"%";
}

function updateHUD(force=false){
  if(!force&&hudTimer>0) return;
  hudTimer=.08;
  const cfg=tier();
  ui.speciesIcon.textContent=cfg.icon;
  ui.speciesName.textContent=cfg.name;
  ui.tierLabel.textContent="Tier "+(player.tier+1);
  ui.healthText.textContent=Math.ceil(player.hp)+" / "+cfg.hp;
  ui.healthBar.style.width=clamp(player.hp/cfg.hp*100,0,100)+"%";
  ui.kills.textContent=player.kills;
  ui.protection.hidden=player.spawnShield<=0;

  if(cfg.xp===null){
    ui.xpText.textContent="MAX";
    ui.xpBar.style.width="100%";
  }else{
    ui.xpText.textContent=Math.floor(player.xp)+" / "+cfg.xp;
    ui.xpBar.style.width=clamp(player.xp/cfg.xp*100,0,100)+"%";
  }

  ui.evolveBtn.disabled=!canEvolve()||paused;
  ui.attackBtn.disabled=player.dead||paused;
  ui.attackBtn.querySelector("small").textContent=player.cooldown>0?player.cooldown.toFixed(1)+"s":"Attack";
  updateTargetUI();
}

function update(dt,time){
  if(!started||paused) return;
  hudTimer=Math.max(0,hudTimer-dt);
  updatePlayer(dt,time);
  for(const c of creatures) updateCreature(c,dt,time);
  updateCamera(dt);
  updateHUD();
}

function render(){
  renderer.render(scene,camera);
}

function loop(){
  const dt=Math.min(.05,clock.getDelta());
  const time=clock.elapsedTime;
  update(dt,time);
  render();
  requestAnimationFrame(loop);
}

function resize(){
  if(!renderer||!camera) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
}

function setPaused(value){
  if(!started) return;
  paused=value;
  ui.pauseOverlay.classList.toggle("show",paused);
  ui.pauseBtn.textContent=paused?"▶":"Ⅱ";
  updateHUD(true);
}

function startGame(){
  started=true;
  paused=false;
  ui.startOverlay.classList.remove("show");
  ui.pauseOverlay.classList.remove("show");
  player.spawnShield=SPAWN_SHIELD;
  clock.getDelta();
  updateHUD(true);
}

function setupKeyboard(){
  addEventListener("keydown",e=>{
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if(e.code==="Space"&&!e.repeat) attack();
    if(e.code==="KeyE"&&!e.repeat) evolve();
    if(e.code==="Escape"&&!e.repeat&&started) setPaused(!paused);
  },{passive:false});
  addEventListener("keyup",e=>keys.delete(e.code));
}

function setupJoystick(){
  const joy=ui.joystick;
  const knob=ui.joystickKnob;
  const updateJoy=e=>{
    const rect=joy.getBoundingClientRect();
    const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    let dx=e.clientX-cx,dy=e.clientY-cy;
    const max=rect.width*.34;
    const len=Math.hypot(dx,dy)||1;
    if(len>max){dx=dx/len*max;dy=dy/len*max;}
    joystick.x=dx/max;
    joystick.z=dy/max;
    knob.style.transform="translate("+dx+"px,"+dy+"px)";
  };
  joy.addEventListener("pointerdown",e=>{
    joystick.pointerId=e.pointerId;
    joy.setPointerCapture(e.pointerId);
    updateJoy(e);
  });
  joy.addEventListener("pointermove",e=>{
    if(e.pointerId===joystick.pointerId) updateJoy(e);
  });
  const end=e=>{
    if(e.pointerId!==joystick.pointerId) return;
    joystick.pointerId=null;joystick.x=0;joystick.z=0;
    knob.style.transform="translate(0,0)";
  };
  joy.addEventListener("pointerup",end);
  joy.addEventListener("pointercancel",end);
}

ui.playBtn.addEventListener("click",startGame);
ui.pauseBtn.addEventListener("click",()=>setPaused(!paused));
ui.resumeBtn.addEventListener("click",()=>setPaused(false));
ui.attackBtn.addEventListener("pointerdown",e=>{e.preventDefault();attack();});
ui.evolveBtn.addEventListener("click",e=>{e.preventDefault();evolve();});
addEventListener("resize",resize);
document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&started&&!paused) setPaused(true);
});

setupKeyboard();
setupJoystick();

try{
  initThree();
  requestAnimationFrame(loop);
}catch(err){
  console.error(err);
}
