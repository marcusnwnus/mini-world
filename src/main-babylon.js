(function () {
  "use strict";

  const TIERS = Object.freeze([
    { name:"Mouse", icon:"🐭", hp:45, damage:9, speed:7.4, range:1.35, cooldown:.52, xp:45, reward:10, scale:.82 },
    { name:"Rabbit", icon:"🐇", hp:72, damage:13, speed:8.0, range:1.5, cooldown:.50, xp:95, reward:18, scale:.95 },
    { name:"Fox", icon:"🦊", hp:110, damage:20, speed:8.3, range:1.75, cooldown:.62, xp:175, reward:30, scale:1.05 },
    { name:"Wolf", icon:"🐺", hp:160, damage:29, speed:8.5, range:1.95, cooldown:.72, xp:null, reward:48, scale:1.16 }
  ]);

  const WORLD_HALF = 32;
  const CREATURE_COUNT = 20;
  const SPAWN_SHIELD = 3;
  const SAVE_KEY = "mini-world-evolution-babylon-v1";

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

  if (!canvas || !window.BABYLON || !window.MiniWorldModels) {
    const message = "Babylon.js could not initialize. Refresh the page or check your network connection.";
    if (ui.startOverlay) {
      ui.startOverlay.classList.add("show");
      const panel = ui.startOverlay.querySelector(".panel");
      if (panel) panel.innerHTML = "<h1>3D unavailable</h1><p>" + message + "</p>";
    }
    return;
  }

  let engine, scene, camera, shadowGenerator, mats;
  let creatures = [];
  let currentTarget = null;
  let started = false;
  let paused = true;
  let toastTimer = 0;
  let hudTimer = 0;
  let elapsed = 0;
  let cameraShake = 0;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const keys = new Set();
  const joystick = { x:0, z:0, pointerId:null };

  const player = {
    tier:0, xp:0, kills:0, hp:TIERS[0].hp,
    root:null, cooldown:0, attackPulse:0,
    spawnShield:0, dead:false, respawnTimer:0, moveSpeed:0
  };

  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function rand(a,b){ return a + Math.random()*(b-a); }
  function tier(){ return TIERS[player.tier]; }

  function chooseWeightedTier(){
    const r=Math.random();
    if(r<.46) return 0;
    if(r<.75) return 1;
    if(r<.93) return 2;
    return 3;
  }

  function toast(message,type){
    ui.toast.textContent=message;
    ui.toast.className="toast show "+(type||"");
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){ ui.toast.className="toast"; },1500);
  }

  function mat(name,color){
    const m=new BABYLON.StandardMaterial(name,scene);
    m.diffuseColor=BABYLON.Color3.FromHexString(color);
    m.specularColor=new BABYLON.Color3(.05,.05,.05);
    return m;
  }

  function makeMaterials(){
    mats={
      ground:mat("ground","#6B9D55"),
      path:mat("path","#83966A"),
      trunk:mat("trunk","#78533C"),
      leaf:mat("leaf","#3F7F4C"),
      rock:mat("rock","#7E8588"),
      mouseFur:mat("mouseFur","#8F7F78"),
      mouseBelly:mat("mouseBelly","#CBB7AA"),
      mouseEar:mat("mouseEar","#D89A9E"),
      rabbit:mat("rabbit","#C9B7A4"),
      rabbitLight:mat("rabbitLight","#F1DDD0"),
      fox:mat("fox","#C86F3D"),
      foxLight:mat("foxLight","#F0C49B"),
      wolf:mat("wolf","#66727C"),
      wolfLight:mat("wolfLight","#B9C1C5"),
      dark:mat("dark","#17191B")
    };
  }

  function addShadowCaster(node){
    node.getChildMeshes().forEach(function(mesh){
      shadowGenerator.addShadowCaster(mesh);
      mesh.receiveShadows=true;
    });
  }

  function sphere(name,parent,material,position,scaling,diameter){
    const mesh=BABYLON.MeshBuilder.CreateSphere(name,{diameter:diameter||1,segments:10},scene);
    mesh.parent=parent;
    mesh.material=material;
    mesh.position.set(position[0],position[1],position[2]);
    mesh.scaling.set(scaling[0],scaling[1],scaling[2]);
    return mesh;
  }

  function createRabbitModel(){
    const root=new BABYLON.TransformNode("rabbit",scene);
    const body=sphere("rabbit-body",root,mats.rabbit,[0,.72,-.05],[.82,.82,1.22],1.44);
    const head=sphere("rabbit-head",root,mats.rabbit,[0,1.05,.82],[.9,.9,1],1);
    [-1,1].forEach(function(side){
      const ear=sphere("rabbit-ear",root,mats.rabbitLight,[side*.24,1.68,.73],[.58,1.55,.48],.48);
      ear.rotation.z=side*.12;
      sphere("rabbit-eye",root,mats.dark,[side*.29,1.13,1.2],[1,1,1],.14);
      sphere("rabbit-foot",root,mats.rabbit,[side*.33,.2,.48],[1,.45,1.6],.3);
    });
    sphere("rabbit-tail",root,mats.rabbitLight,[0,.7,-.91],[1,1,1],.4);
    root.metadata={
      animate:function(time,speed){
        const stride=Math.min(1,(speed||0)/5);
        body.position.y=.72+Math.abs(Math.sin(time*8))*.055*stride;
        head.rotation.z=Math.sin(time*4)*.025;
      }
    };
    addShadowCaster(root);
    return root;
  }

  function createPredatorModel(tierIndex){
    const wolf=tierIndex===3;
    const fur=wolf?mats.wolf:mats.fox;
    const light=wolf?mats.wolfLight:mats.foxLight;
    const root=new BABYLON.TransformNode(wolf?"wolf":"fox",scene);
    const body=sphere("predator-body",root,fur,[0,.82,-.05],[.82,.82,1.42],1.5);
    const chest=sphere("predator-chest",root,light,[0,.73,.62],[.72,.7,1.08],.84);
    const head=sphere("predator-head",root,fur,[0,1.12,1.02],[.94,.88,1.08],1);
    sphere("predator-muzzle",root,light,[0,1.02,1.43],[.85,.7,1.18],.52);
    sphere("predator-nose",root,mats.dark,[0,1.03,1.68],[1,1,1],.19);
    [-1,1].forEach(function(side){
      const ear=BABYLON.MeshBuilder.CreateCylinder("predator-ear",{height:.48,diameterTop:0,diameterBottom:.46,tessellation:5},scene);
      ear.parent=root; ear.material=fur; ear.position.set(side*.3,1.58,.86); ear.rotation.z=-side*.08;
      sphere("predator-eye",root,mats.dark,[side*.3,1.2,1.35],[1,1,1],.14);
      sphere("predator-front-foot",root,fur,[side*.39,.22,.52],[1,.45,1.45],.32);
      sphere("predator-back-foot",root,fur,[side*.42,.22,-.57],[1,.45,1.45],.34);
    });
    const tail=BABYLON.MeshBuilder.CreateTube("predator-tail",{
      path:[
        new BABYLON.Vector3(0,.78,-.95),
        new BABYLON.Vector3(.35,.84,-1.28),
        new BABYLON.Vector3(.52,.67,-1.65),
        new BABYLON.Vector3(.35,.53,-1.92)
      ],
      radius:wolf?.13:.15,tessellation:6,cap:BABYLON.Mesh.CAP_ALL
    },scene);
    tail.parent=root; tail.material=fur;
    root.metadata={
      animate:function(time,speed){
        const stride=Math.min(1,(speed||0)/5);
        body.position.y=.82+Math.sin(time*10)*.025*stride;
        head.rotation.z=Math.sin(time*5)*.02;
        tail.rotation.y=Math.sin(time*5)*.13;
        chest.rotation.x=Math.sin(time*10)*.012*stride;
      }
    };
    addShadowCaster(root);
    return root;
  }

  function createModelForTier(index){
    let root;
    if(index===0) root=MiniWorldModels.createMouseModel(scene,mats,{scale:TIERS[index].scale});
    else if(index===1) root=createRabbitModel();
    else root=createPredatorModel(index);
    root.scaling.setAll(TIERS[index].scale);
    addShadowCaster(root);
    return root;
  }

  function disposeNode(node){
    if(node) node.dispose(false,false);
  }

  function replacePlayerModel(){
    const previousPosition=player.root?player.root.position.clone():BABYLON.Vector3.Zero();
    const previousRotation=player.root?player.root.rotation.y:0;
    disposeNode(player.root);
    player.root=createModelForTier(player.tier);
    player.root.position.copyFrom(previousPosition);
    player.root.rotation.y=previousRotation;
    player.hp=TIERS[player.tier].hp;
  }

  function seededRandom(seed){
    let s=seed>>>0;
    return function(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  }

  function buildWorld(){
    const ground=BABYLON.MeshBuilder.CreateGround("ground",{width:WORLD_HALF*2.15,height:WORLD_HALF*2.15},scene);
    ground.material=mats.ground;
    ground.receiveShadows=true;

    const rng=seededRandom(20260925);
    for(let i=0;i<34;i++){
      const angle=rng()*Math.PI*2;
      const radius=11+rng()*19;
      const x=Math.cos(angle)*radius;
      const z=Math.sin(angle)*radius;
      if(i<23){
        const trunk=BABYLON.MeshBuilder.CreateCylinder("tree-trunk",{height:1.8,diameterTop:.36,diameterBottom:.48,tessellation:7},scene);
        trunk.material=mats.trunk;
        trunk.position.set(x,.9,z);
        const crown=BABYLON.MeshBuilder.CreateCylinder("tree-crown",{height:2.4,diameterTop:0,diameterBottom:1.9,tessellation:8},scene);
        crown.material=mats.leaf;
        crown.position.set(x,2.6,z);
        const scale=.75+rng()*.65;
        trunk.scaling.setAll(scale);
        crown.scaling.setAll(scale);
        shadowGenerator.addShadowCaster(trunk);
        shadowGenerator.addShadowCaster(crown);
      }else{
        const rock=BABYLON.MeshBuilder.CreatePolyhedron("rock",{type:1,size:.75},scene);
        rock.material=mats.rock;
        rock.position.set(x,.45,z);
        rock.scaling.set(1.15*(.55+rng()*.8),.7*(.55+rng()*.8),.9*(.55+rng()*.8));
        rock.rotation.y=rng()*Math.PI;
        shadowGenerator.addShadowCaster(rock);
        rock.receiveShadows=true;
      }
    }
  }

  function randomSpawn(minRadius){
    minRadius=minRadius||7;
    for(let i=0;i<30;i++){
      const angle=Math.random()*Math.PI*2;
      const radius=rand(minRadius,WORLD_HALF-3);
      const pos=new BABYLON.Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius);
      if(player.root&&BABYLON.Vector3.Distance(pos,player.root.position)<6) continue;
      return pos;
    }
    return new BABYLON.Vector3(rand(-20,20),0,rand(-20,20));
  }

  function spawnCreature(slot,tierIndex){
    tierIndex=tierIndex==null?chooseWeightedTier():tierIndex;
    disposeNode(slot.root);
    slot.tier=tierIndex;
    slot.root=createModelForTier(tierIndex);
    slot.root.position.copyFrom(randomSpawn());
    slot.root.rotation.y=rand(-Math.PI,Math.PI);
    slot.hp=TIERS[tierIndex].hp;
    slot.maxHp=slot.hp;
    slot.alive=true;
    slot.attackTimer=rand(0,.4);
    slot.wanderTimer=0;
    slot.wanderAngle=rand(-Math.PI,Math.PI);
    slot.respawnTimer=0;
    slot.hitTimer=0;
    slot.aggressive=Math.random()<.35+tierIndex*.13;
  }

  function createCreatures(){
    creatures=[];
    for(let i=0;i<CREATURE_COUNT;i++){
      const slot={root:null,alive:false};
      creatures.push(slot);
      spawnCreature(slot);
    }
  }

  function killCreature(creature,playerKill){
    if(!creature.alive) return;
    creature.alive=false;
    creature.root.setEnabled(false);
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

  function initScene(){
    engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,adaptToDeviceRatio:true});
    engine.setHardwareScalingLevel(Math.max(1,(window.devicePixelRatio||1)/1.5));

    scene=new BABYLON.Scene(engine);
    scene.clearColor=new BABYLON.Color4(.57,.79,.86,1);
    scene.fogMode=BABYLON.Scene.FOGMODE_LINEAR;
    scene.fogStart=36;
    scene.fogEnd=82;
    scene.fogColor=new BABYLON.Color3(.57,.79,.86);

    camera=new BABYLON.FreeCamera("camera",new BABYLON.Vector3(9,8.5,11),scene);
    camera.minZ=.1;
    camera.maxZ=120;
    camera.fov=.92;
    scene.activeCamera=camera;

    const hemi=new BABYLON.HemisphericLight("hemi",new BABYLON.Vector3(0,1,0),scene);
    hemi.intensity=1.15;
    hemi.groundColor=new BABYLON.Color3(.31,.38,.23);

    const sun=new BABYLON.DirectionalLight("sun",new BABYLON.Vector3(-.45,-1,.3),scene);
    sun.position.set(-12,22,8);
    sun.intensity=1.65;

    shadowGenerator=new BABYLON.ShadowGenerator(1024,sun);
    shadowGenerator.usePercentageCloserFiltering=true;
    shadowGenerator.bias=.0008;

    makeMaterials();
    buildWorld();
    loadProgress();
    replacePlayerModel();
    createCreatures();
    updateCamera(1);
    updateHUD(true);
  }

  function moveInput(){
    let x=joystick.x,z=joystick.z;
    if(keys.has("KeyA")||keys.has("ArrowLeft")) x-=1;
    if(keys.has("KeyD")||keys.has("ArrowRight")) x+=1;
    if(keys.has("KeyW")||keys.has("ArrowUp")) z-=1;
    if(keys.has("KeyS")||keys.has("ArrowDown")) z+=1;
    const len=Math.hypot(x,z);
    if(len>1){x/=len;z/=len;}
    return {x:x,z:z,len:Math.min(1,len)};
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
    const cfg=tier();
    player.moveSpeed=input.len*cfg.speed;

    if(input.len>.04){
      const cameraForward=player.root.position.subtract(camera.position);
      cameraForward.y=0;
      cameraForward.normalize();
      const cameraRight=BABYLON.Vector3.Cross(cameraForward,BABYLON.Axis.Y).normalize();
      const moveDir=cameraRight.scale(input.x).add(cameraForward.scale(-input.z));
      if(moveDir.lengthSquared()>1) moveDir.normalize();

      player.root.position.addInPlace(moveDir.scale(cfg.speed*dt));
      const desired=Math.atan2(moveDir.x,moveDir.z);
      player.root.rotation.y+=shortestAngle(player.root.rotation.y,desired)*Math.min(1,dt*12);
    }

    const max=WORLD_HALF-2.2;
    player.root.position.x=clamp(player.root.position.x,-max,max);
    player.root.position.z=clamp(player.root.position.z,-max,max);

    const pulse=player.attackPulse>0?1+Math.sin((.15-player.attackPulse)/.15*Math.PI)*.12:1;
    player.root.scaling.setAll(cfg.scale*pulse);
    if(player.root.metadata&&player.root.metadata.animate){
      player.root.metadata.animate(time,reducedMotion?0:player.moveSpeed);
    }
  }

  function nearestLowerCreature(from,tierIndex,maxDist){
    let best=null,bestD=maxDist;
    creatures.forEach(function(c){
      if(!c.alive||c===from||c.tier>=tierIndex) return;
      const d=BABYLON.Vector3.Distance(c.root.position,from.root.position);
      if(d<bestD){bestD=d;best=c;}
    });
    return best;
  }

  function moveCreature(c,dir,speed,dt){
    if(dir.lengthSquared()<.0001) return;
    dir.y=0;
    dir.normalize();
    c.root.position.addInPlace(dir.scale(speed*dt));
    const max=WORLD_HALF-2.3;
    c.root.position.x=clamp(c.root.position.x,-max,max);
    c.root.position.z=clamp(c.root.position.z,-max,max);
    const desired=Math.atan2(dir.x,dir.z);
    c.root.rotation.y+=shortestAngle(c.root.rotation.y,desired)*Math.min(1,dt*8);
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
      if(c.respawnTimer<=0) spawnCreature(c);
      return;
    }

    c.attackTimer=Math.max(0,c.attackTimer-dt);
    c.hitTimer=Math.max(0,c.hitTimer-dt);

    const cfg=TIERS[c.tier];
    const toPlayer=player.root.position.subtract(c.root.position);
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
        moveCreature(c,toPlayer.scale(-1),cfg.speed*.8,dt);
        moving=true;
      }
    }

    if(!moving&&c.tier>0){
      const prey=nearestLowerCreature(c,c.tier,6.5);
      if(prey){
        const toPrey=prey.root.position.subtract(c.root.position);
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
      moveCreature(c,new BABYLON.Vector3(Math.sin(c.wanderAngle),0,Math.cos(c.wanderAngle)),cfg.speed*.2,dt);
    }

    const pulse=c.hitTimer>0?1.12:1;
    c.root.scaling.setAll(cfg.scale*pulse);
    if(c.root.metadata&&c.root.metadata.animate){
      c.root.metadata.animate(time,reducedMotion?0:cfg.speed*.25);
    }
  }

  function selectTarget(){
    if(player.dead) return null;
    let best=null,bestScore=Infinity;
    const forward=new BABYLON.Vector3(Math.sin(player.root.rotation.y),0,Math.cos(player.root.rotation.y));
    creatures.forEach(function(c){
      if(!c.alive) return;
      const offset=c.root.position.subtract(player.root.position);
      const d=offset.length();
      if(d>6) return;
      offset.normalize();
      const facing=BABYLON.Vector3.Dot(forward,offset);
      const score=d+(facing<-.15?5:0);
      if(score<bestScore){bestScore=score;best=c;}
    });
    return best;
  }

  function attack(){
    if(!started||paused||player.dead||player.cooldown>0) return;
    const cfg=tier();
    player.cooldown=cfg.cooldown;
    player.attackPulse=.15;

    const forward=new BABYLON.Vector3(Math.sin(player.root.rotation.y),0,Math.cos(player.root.rotation.y));
    let best=null,bestD=cfg.range+.75;
    creatures.forEach(function(c){
      if(!c.alive) return;
      const to=c.root.position.subtract(player.root.position);
      const d=to.length();
      if(d>bestD) return;
      to.normalize();
      if(BABYLON.Vector3.Dot(forward,to)<-.05) return;
      best=c;bestD=d;
    });

    if(best){
      damageCreature(best,cfg.damage,true);
      best.aggressive=true;
      cameraShake=.09;
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
    replacePlayerModel();
    player.spawnShield=1.5;
    toast("Evolved into "+tier().name+"!","good");
    if(navigator.vibrate) navigator.vibrate([20,35,30]);
    saveProgress();
    updateHUD(true);
  }

  function handlePlayerDeath(){
    player.dead=true;
    player.respawnTimer=1.8;
    player.root.setEnabled(false);
    toast("Defeated — respawning one tier lower","bad");
  }

  function respawnPlayer(){
    if(player.tier>0) player.tier--;
    player.xp=0;
    replacePlayerModel();
    player.root.setEnabled(true);
    player.root.position.set(0,0,0);
    player.spawnShield=SPAWN_SHIELD;
    player.dead=false;
    player.cooldown=.5;
    toast("Respawned as "+tier().name+" with a spawn shield");
    saveProgress();
    updateHUD(true);
  }

  function updateCamera(dt){
    if(!player.root) return;
    const p=player.root.position;
    let desired=new BABYLON.Vector3(p.x+9,p.y+8.5,p.z+11);
    if(cameraShake>0&&!reducedMotion){
      cameraShake=Math.max(0,cameraShake-dt);
      desired.x+=rand(-.12,.12);
      desired.y+=rand(-.08,.08);
    }
    camera.position=BABYLON.Vector3.Lerp(camera.position,desired,1-Math.exp(-5.5*dt));
    camera.setTarget(new BABYLON.Vector3(p.x,p.y+1,p.z));
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

  function updateHUD(force){
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

  function update(dt){
    if(!started||paused) return;
    elapsed+=dt;
    hudTimer=Math.max(0,hudTimer-dt);
    updatePlayer(dt,elapsed);
    creatures.forEach(function(c){ updateCreature(c,dt,elapsed); });
    updateCamera(dt);
    updateHUD(false);
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
    updateHUD(true);
  }

  function setupKeyboard(){
    addEventListener("keydown",function(e){
      if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
      keys.add(e.code);
      if(e.code==="Space"&&!e.repeat) attack();
      if(e.code==="KeyE"&&!e.repeat) evolve();
      if(e.code==="Escape"&&!e.repeat&&started) setPaused(!paused);
    },{passive:false});
    addEventListener("keyup",function(e){ keys.delete(e.code); });
  }

  function setupJoystick(){
    const joy=ui.joystick;
    const knob=ui.joystickKnob;

    function updateJoy(e){
      const rect=joy.getBoundingClientRect();
      const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      let dx=e.clientX-cx,dy=e.clientY-cy;
      const max=rect.width*.34;
      const len=Math.hypot(dx,dy)||1;
      if(len>max){dx=dx/len*max;dy=dy/len*max;}
      joystick.x=dx/max;
      joystick.z=dy/max;
      knob.style.transform="translate("+dx+"px,"+dy+"px)";
    }

    joy.addEventListener("pointerdown",function(e){
      joystick.pointerId=e.pointerId;
      joy.setPointerCapture(e.pointerId);
      updateJoy(e);
    });
    joy.addEventListener("pointermove",function(e){
      if(e.pointerId===joystick.pointerId) updateJoy(e);
    });

    function end(e){
      if(e.pointerId!==joystick.pointerId) return;
      joystick.pointerId=null;
      joystick.x=0;
      joystick.z=0;
      knob.style.transform="translate(0,0)";
    }

    joy.addEventListener("pointerup",end);
    joy.addEventListener("pointercancel",end);
  }

  ui.playBtn.addEventListener("click",startGame);
  ui.pauseBtn.addEventListener("click",function(){ setPaused(!paused); });
  ui.resumeBtn.addEventListener("click",function(){ setPaused(false); });
  ui.attackBtn.addEventListener("pointerdown",function(e){ e.preventDefault(); attack(); });
  ui.evolveBtn.addEventListener("click",function(e){ e.preventDefault(); evolve(); });

  addEventListener("resize",function(){ if(engine) engine.resize(); });
  document.addEventListener("visibilitychange",function(){
    if(document.hidden&&started&&!paused) setPaused(true);
  });

  setupKeyboard();
  setupJoystick();

  try{
    initScene();
    let last=performance.now();
    engine.runRenderLoop(function(){
      const now=performance.now();
      const dt=Math.min(.05,(now-last)/1000);
      last=now;
      update(dt);
      scene.render();
    });
  }catch(error){
    console.error(error);
    ui.startOverlay.classList.add("show");
    const panel=ui.startOverlay.querySelector(".panel");
    if(panel) panel.innerHTML="<h1>3D unavailable</h1><p>Babylon.js could not start on this device.</p>";
  }
})();