(() => {
  "use strict";

  const CONFIG = Object.freeze({
    size: 30,
    saveKey: "mini-world-v2",
    saveVersion: 2,
    stepMs: 620,
    dayEveryTicks: 6,
    maxEco: 100,
    startEco: 40,
    goalStability: 75,
    goalDays: 15,
    actionCost: Object.freeze({ plant: 2, herb: 5, carn: 8, remove: 3, rain: 10 }),
    tileW: 28,
    tileH: 14,
    landZ: 7
  });

  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);
  const ORIGIN_X = canvas.width / 2;
  const ORIGIN_Y = 58;

  let state;
  let hoverTile = null;
  let selectedTool = "plant";
  let accumulator = 0;
  let lastFrame = performance.now();
  let toastTimer = null;

  const rand = n => Math.floor(Math.random() * n);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const pick = arr => arr[rand(arr.length)];

  function defaultState() {
    return {
      version: CONFIG.saveVersion,
      grid: [],
      animals: [],
      day: 1,
      tick: 0,
      paused: false,
      speed: 1,
      rainBoost: 0,
      eco: CONFIG.startEco,
      missionStreak: 0,
      missionComplete: false,
      seasonIndex: 0,
      eventCooldown: 5,
      event: null,
      logs: []
    };
  }

  const seasons = [
    {name:"Spring", growth:1.25, moisture:.004, icon:"🌱"},
    {name:"Summer", growth:.85, moisture:-.005, icon:"☀️"},
    {name:"Autumn", growth:.95, moisture:-.001, icon:"🍂"},
    {name:"Winter", growth:.55, moisture:-.003, icon:"❄️"}
  ];

  function season() { return seasons[state.seasonIndex % seasons.length]; }

  function isoPoint(x,y,z=0) {
    return {
      x: ORIGIN_X + (x-y)*CONFIG.tileW/2,
      y: ORIGIN_Y + (x+y)*CONFIG.tileH/2 - z
    };
  }

  function tileCenter(x,y,z=0) { return isoPoint(x+.5,y+.5,z); }

  function diamondPath(x,y,z=0) {
    const a=isoPoint(x,y,z), b=isoPoint(x+1,y,z), c=isoPoint(x+1,y+1,z), d=isoPoint(x,y+1,z);
    ctx.beginPath();
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y); ctx.closePath();
  }

  function screenToTile(sx,sy) {
    const dx=sx-ORIGIN_X;
    const dy=sy-ORIGIN_Y+CONFIG.landZ*.5;
    const gx=dx/CONFIG.tileW+dy/CONFIG.tileH;
    const gy=dy/CONFIG.tileH-dx/CONFIG.tileW;
    const x=Math.floor(gx), y=Math.floor(gy);
    return x>=0&&y>=0&&x<CONFIG.size&&y<CONFIG.size ? {x,y} : null;
  }

  function blankCell(x,y) {
    const edge=Math.min(x,y,CONFIG.size-1-x,CONFIG.size-1-y);
    const waterChance=edge<2?.55:edge<4?.12:.025;
    return {
      terrain:Math.random()<waterChance?"water":"land",
      plant:Math.random()<.34?.35+Math.random()*.65:0,
      moisture:.45+Math.random()*.35
    };
  }

  function newWorld() {
    state=defaultState();
    state.grid=Array.from({length:CONFIG.size},(_,y)=>Array.from({length:CONFIG.size},(_,x)=>blankCell(x,y)));
    for(let i=0;i<38;i++) spawnAnimal("herb");
    for(let i=0;i<9;i++) spawnAnimal("carn");
    addLog("A new ecosystem begins.");
    save();
    updateUI();
    draw();
  }

  function animalAt(x,y,type=null) {
    return state.animals.find(a=>a.x===x&&a.y===y&&(!type||a.type===type));
  }

  function spawnAnimal(type,x=null,y=null) {
    if(x===null||y===null) {
      let tries=0;
      do { x=rand(CONFIG.size); y=rand(CONFIG.size); tries++; }
      while((state.grid[y][x].terrain==="water"||animalAt(x,y))&&tries<120);
      if(tries>=120) return false;
    }
    if(state.grid[y][x].terrain==="water"||animalAt(x,y)) return false;
    state.animals.push({
      type,x,y,
      energy:type==="herb"?8+Math.random()*3:11+Math.random()*4,
      age:0,cooldown:rand(8)
    });
    return true;
  }

  function validNeighbors(x,y) {
    const out=[];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&ny>=0&&nx<CONFIG.size&&ny<CONFIG.size&&state.grid[ny][nx].terrain==="land") out.push([nx,ny]);
    }
    return out;
  }

  function nearestTarget(a,predicate,radius=5) {
    let best=null,bestD=Infinity;
    for(let y=Math.max(0,a.y-radius);y<=Math.min(CONFIG.size-1,a.y+radius);y++) {
      for(let x=Math.max(0,a.x-radius);x<=Math.min(CONFIG.size-1,a.x+radius);x++) {
        if(!predicate(x,y)) continue;
        const d=Math.abs(x-a.x)+Math.abs(y-a.y);
        if(d<bestD) { bestD=d; best=[x,y]; }
      }
    }
    return best;
  }

  function stepToward(a,target) {
    const opts=validNeighbors(a.x,a.y).filter(([x,y])=>!animalAt(x,y)||(a.type==="carn"&&!!animalAt(x,y,"herb")));
    if(!opts.length) return;
    if(target) {
      opts.sort((p,q)=>
        Math.abs(p[0]-target[0])+Math.abs(p[1]-target[1])-
        (Math.abs(q[0]-target[0])+Math.abs(q[1]-target[1]))
      );
      [a.x,a.y]=opts[0];
    } else {
      [a.x,a.y]=pick(opts);
    }
  }

  function simulatePlants() {
    const births=[];
    const s=season();
    const eventGrowth = state.event?.type === "bloom" ? 1.8 : (state.event?.type === "drought" ? 0.45 : 1);
    for(let y=0;y<CONFIG.size;y++) for(let x=0;x<CONFIG.size;x++) {
      const c=state.grid[y][x];
      if(c.terrain==="water") continue;
      c.moisture=clamp(c.moisture+(Math.random()-.52)*.026+s.moisture+state.rainBoost+(state.event?.type==="drought"?-.009:0),.04,1);
      if(c.plant>0) {
        c.plant=clamp(c.plant+.017*c.moisture*s.growth*eventGrowth,0,1);
        if(c.plant>.72&&Math.random()<.016*c.moisture*s.growth*eventGrowth) {
          const opts=validNeighbors(x,y).filter(([nx,ny])=>state.grid[ny][nx].plant<.12);
          if(opts.length) births.push(pick(opts));
        }
      } else if(Math.random()<.0014*c.moisture*s.growth*eventGrowth) {
        c.plant=.15;
      }
    }
    births.forEach(([x,y])=>state.grid[y][x].plant=Math.max(state.grid[y][x].plant,.18));
    state.rainBoost*=.86;
  }

  function simulateAnimals() {
    const newborns=[];
    const deaths=new Set();

    state.animals.forEach((a,i)=>{
      a.age++;
      a.cooldown=Math.max(0,a.cooldown-1);
      a.energy -= a.type === "herb" ? 0.22 : 0.28;

      if(a.type==="herb") {
        const here=state.grid[a.y][a.x];
        if(here.plant>.12) {
          const bite=Math.min(.28,here.plant);
          here.plant-=bite;
          a.energy+=bite*4.35;
        } else {
          stepToward(a,nearestTarget(a,(x,y)=>state.grid[y][x].plant>.25,5));
        }

        if(a.energy>10.8&&a.cooldown===0&&Math.random()<.05) {
          const opts=validNeighbors(a.x,a.y).filter(([x,y])=>!animalAt(x,y));
          if(opts.length) {
            const [x,y]=pick(opts);
            newborns.push({type:"herb",x,y,energy:5.5,age:0,cooldown:10});
            a.energy-=3.8;a.cooldown=10;
          }
        }
      } else {
        const hunt=()=>{
          const prey=state.animals.find((b,j)=>j!==i&&!deaths.has(j)&&b.type==="herb"&&b.x===a.x&&b.y===a.y);
          if(prey) {
            deaths.add(state.animals.indexOf(prey));
            a.energy+=6.2;
            return true;
          }
          return false;
        };
        if(!hunt()) {
          stepToward(a,nearestTarget(a,(x,y)=>!!animalAt(x,y,"herb"),7));
          hunt();
        }

        if(a.energy>14&&a.cooldown===0&&Math.random()<.035) {
          const opts=validNeighbors(a.x,a.y).filter(([x,y])=>!animalAt(x,y));
          if(opts.length) {
            const [x,y]=pick(opts);
            newborns.push({type:"carn",x,y,energy:7,age:0,cooldown:14});
            a.energy-=5;a.cooldown=14;
          }
        }
      }

      if(a.energy<=0||a.age>(a.type==="herb"?240:280)) deaths.add(i);
    });

    state.animals=state.animals.filter((_,i)=>!deaths.has(i));
    state.animals.push(...newborns);
  }

  function populations() {
    let plant=0,land=0;
    for(const row of state.grid) for(const c of row) {
      if(c.terrain==="land") {
        land++;
        if(c.plant>.08) plant++;
      }
    }
    return {
      plant,land,
      herb:state.animals.filter(a=>a.type==="herb").length,
      carn:state.animals.filter(a=>a.type==="carn").length
    };
  }

  function stabilityScore() {
    const p=populations();
    const plantRatio=p.plant/Math.max(1,p.land);
    const herbPerPlant=p.herb/Math.max(1,p.plant);
    const carnPerHerb=p.carn/Math.max(1,p.herb);
    const s1=1-Math.min(1,Math.abs(plantRatio-.48)/.48);
    const s2=1-Math.min(1,Math.abs(herbPerPlant-.11)/.16);
    const s3=1-Math.min(1,Math.abs(carnPerHerb-.22)/.28);
    let score=(s1*.42+s2*.32+s3*.26)*100;
    if(p.plant<20||p.herb<3||p.carn<1) score*=.35;
    return Math.round(clamp(score,0,100));
  }

  function statusText(s,p) {
    if(p.plant<35) return "Vegetation is collapsing. Plant or trigger rain.";
    if(p.herb<4) return "Herbivores are nearly gone. Restore prey carefully.";
    if(p.carn<1) return "No predators remain. Herbivores may overgraze.";
    if(p.carn>p.herb*.5) return "Predator pressure is too high.";
    if(p.herb>p.plant*.2) return "Herbivores are consuming vegetation too quickly.";
    if(s>=CONFIG.goalStability) return "Balanced. Hold this state to complete the stewardship goal.";
    if(s>60) return "Stable, but the food web is still sensitive.";
    return "The ecosystem is under stress. Make small interventions.";
  }

  function addLog(msg) {
    state.logs.unshift("Day "+state.day+": "+msg);
    state.logs=state.logs.slice(0,12);
  }

  function toast(message,type="") {
    const el=$("toast");
    el.textContent=message;
    el.className="toast show "+type;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{el.className="toast";},1600);
  }

  function advanceDay() {
    state.day++;
    const p=populations();
    const stability=stabilityScore();

    const regen=2+Math.floor(stability/30);
    state.eco=clamp(state.eco+regen,0,CONFIG.maxEco);

    if(stability>=CONFIG.goalStability&&p.herb>0&&p.carn>0) state.missionStreak++;
    else state.missionStreak=0;

    if(!state.missionComplete&&state.missionStreak>=CONFIG.goalDays) {
      state.missionComplete=true;
      state.eco=CONFIG.maxEco;
      addLog("Stewardship goal complete. Endless mode continues.");
      toast("🏆 Ecosystem steward! Goal complete.","good");
    }

    if(state.day%18===1&&state.day>1) {
      state.seasonIndex=(state.seasonIndex+1)%seasons.length;
      addLog(season().name+" begins.");
    }

    state.eventCooldown--;
    if(state.event) {
      state.event.daysLeft--;
      if(state.event.daysLeft<=0) {
        addLog(state.event.label+" ended.");
        state.event=null;
      }
    } else if(state.eventCooldown<=0&&Math.random()<.35) {
      triggerRandomEvent();
      state.eventCooldown=10+rand(8);
    }

    if(p.herb===0) addLog("Herbivores went extinct.");
    else if(p.carn===0) addLog("Carnivores disappeared from the food web.");
    else if(stability>85&&state.day%5===0) addLog("The ecosystem is thriving.");
  }

  function triggerRandomEvent() {
    const options=[
      {type:"drought",label:"Drought",daysLeft:5,message:"A drought has begun. Moisture and plant growth will fall."},
      {type:"bloom",label:"Wild bloom",daysLeft:4,message:"A wild bloom is accelerating vegetation growth."},
      {type:"migration",label:"Migration",daysLeft:1,message:"A herd has migrated into the habitat."}
    ];
    const evt={...pick(options)};
    state.event=evt;
    if(evt.type==="migration") {
      for(let i=0;i<5;i++) spawnAnimal("herb");
    }
    addLog(evt.message);
    toast(evt.message,evt.type==="drought"?"bad":"good");
  }

  function spend(cost) {
    if(state.eco<cost) {
      toast("Not enough Eco Points.","bad");
      return false;
    }
    state.eco-=cost;
    return true;
  }

  function performAction(tool,x,y) {
    const c=state.grid[y][x];
    if(c.terrain==="water") {
      toast("That tile is water.","bad");
      return;
    }

    const cost=CONFIG.actionCost[tool];
    if(!spend(cost)) return;

    let changed=false;
    if(tool==="plant") {
      c.plant=1;c.moisture=Math.max(.72,c.moisture);changed=true;
    } else if(tool==="herb") {
      changed=spawnAnimal("herb",x,y);
    } else if(tool==="carn") {
      changed=spawnAnimal("carn",x,y);
    } else if(tool==="remove") {
      const before=state.animals.length;
      state.animals=state.animals.filter(a=>!(a.x===x&&a.y===y));
      changed=c.plant>0||state.animals.length!==before;
      c.plant=0;
    }

    if(!changed) {
      state.eco=clamp(state.eco+cost,0,CONFIG.maxEco);
      toast("Nothing changed on that tile.");
    } else {
      save();
      updateUI();
      draw();
    }
  }

  function rain() {
    if(!spend(CONFIG.actionCost.rain)) return;
    state.rainBoost=Math.min(.045,state.rainBoost+.014);
    addLog("Rain restored soil moisture.");
    toast("🌧 Rain is soaking the habitat.","good");
    save();updateUI();
  }

  function simulateTick() {
    if(state.paused) return;
    state.tick++;
    simulatePlants();
    simulateAnimals();
    if(state.tick%CONFIG.dayEveryTicks===0) {
      advanceDay();
      updateUI();
      save();
    }
  }

  function drawTile(x,y,c) {
    const z=c.terrain==="land"?CONFIG.landZ:0;
    const right=isoPoint(x+1,y,z),bottom=isoPoint(x+1,y+1,z),left=isoPoint(x,y+1,z);

    if(c.terrain==="land") {
      const rb=isoPoint(x+1,y+1,0),rr=isoPoint(x+1,y,0),ll=isoPoint(x,y+1,0);
      ctx.fillStyle="#294331";
      ctx.beginPath();ctx.moveTo(right.x,right.y);ctx.lineTo(bottom.x,bottom.y);ctx.lineTo(rb.x,rb.y);ctx.lineTo(rr.x,rr.y);ctx.closePath();ctx.fill();
      ctx.fillStyle="#1d3526";
      ctx.beginPath();ctx.moveTo(left.x,left.y);ctx.lineTo(bottom.x,bottom.y);ctx.lineTo(rb.x,rb.y);ctx.lineTo(ll.x,ll.y);ctx.closePath();ctx.fill();
      const m=c.moisture;
      ctx.fillStyle="rgb("+Math.round(43+m*17)+","+Math.round(75+m*35)+","+Math.round(45+m*11)+")";
    } else {
      const wave=(Math.sin((x+y+state.tick*.22)*.9)+1)*.5;
      ctx.fillStyle="rgb("+Math.round(34+wave*12)+","+Math.round(88+wave*18)+","+Math.round(162+wave*26)+")";
    }

    diamondPath(x,y,z);ctx.fill();
    ctx.strokeStyle=c.terrain==="land"?"rgba(10,28,17,.42)":"rgba(180,225,255,.11)";
    ctx.lineWidth=1;ctx.stroke();

    if(c.terrain==="water") {
      const p=tileCenter(x,y,0);
      ctx.strokeStyle="rgba(210,238,255,.17)";
      ctx.beginPath();ctx.moveTo(p.x-4,p.y);ctx.lineTo(p.x+4,p.y);ctx.stroke();
    }
  }

  function drawPlant(x,y,c) {
    if(c.terrain!=="land"||c.plant<=.08) return;
    const p=tileCenter(x,y,CONFIG.landZ);
    const h=3+c.plant*10;
    ctx.strokeStyle="#244f2b";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(p.x,p.y+1);ctx.lineTo(p.x,p.y-h);ctx.stroke();

    const r=2.5+c.plant*3.2;
    ctx.fillStyle="#309549";
    for(const [ox,oy,k] of [[-3,-1,1],[3,0,.95],[0,-4,1.12]]) {
      ctx.beginPath();ctx.arc(p.x+ox,p.y-h+oy,r*k,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle="#83e58c";
    ctx.beginPath();ctx.arc(p.x-1,p.y-h-5,r*.52,0,Math.PI*2);ctx.fill();
  }

  function drawAnimal(a) {
    const p=tileCenter(a.x,a.y,CONFIG.landZ);
    const herb=a.type==="herb";
    const bob=Math.sin((state.tick+a.x+a.y)*.7)*.6;

    ctx.fillStyle="rgba(0,0,0,.22)";
    ctx.beginPath();ctx.ellipse(p.x,p.y+3,7,3,0,0,Math.PI*2);ctx.fill();

    ctx.save();ctx.translate(p.x,p.y-4+bob);
    ctx.fillStyle=herb?"#f4c65e":"#e86d67";
    ctx.beginPath();ctx.ellipse(0,0,herb?6.5:7.5,herb?5:5.5,-.12,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=herb?"#ffe09a":"#ffaaa5";
    ctx.beginPath();ctx.arc(4,-3,herb?3.4:3.8,0,Math.PI*2);ctx.fill();

    if(herb) {
      ctx.strokeStyle="#f4c65e";ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(3,-6);ctx.lineTo(2,-11);ctx.moveTo(6,-6);ctx.lineTo(8,-10);ctx.stroke();
    } else {
      ctx.fillStyle="#d95753";
      ctx.beginPath();ctx.moveTo(2,-6);ctx.lineTo(4,-11);ctx.lineTo(6,-6);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(6,-6);ctx.lineTo(9,-10);ctx.lineTo(9,-4);ctx.closePath();ctx.fill();
      ctx.strokeStyle="#d95753";ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(-6,1);ctx.quadraticCurveTo(-11,-2,-9,-6);ctx.stroke();
    }
    ctx.fillStyle="#132034";ctx.beginPath();ctx.arc(5,-4,1.1,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawSelection(x,y) {
    if(!hoverTile||hoverTile.x!==x||hoverTile.y!==y) return;
    const c=state.grid[y][x];
    diamondPath(x,y,c.terrain==="land"?CONFIG.landZ:0);
    ctx.fillStyle="rgba(122,167,255,.17)";ctx.fill();
    ctx.strokeStyle="rgba(190,215,255,.95)";ctx.lineWidth=2;ctx.stroke();
  }

  function drawEventOverlay() {
    if(!state.event) return;
    ctx.save();
    if(state.event.type==="drought") ctx.fillStyle="rgba(220,150,70,.06)";
    else if(state.event.type==="bloom") ctx.fillStyle="rgba(80,230,130,.05)";
    else return;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,"#10263b");bg.addColorStop(1,"#071522");
    ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);

    const animalsByTile=new Map();
    for(const a of state.animals) {
      const key=a.x+","+a.y;
      if(!animalsByTile.has(key)) animalsByTile.set(key,[]);
      animalsByTile.get(key).push(a);
    }

    for(let sum=0;sum<=2*(CONFIG.size-1);sum++) {
      for(let x=0;x<CONFIG.size;x++) {
        const y=sum-x;
        if(y<0||y>=CONFIG.size) continue;
        const c=state.grid[y][x];
        drawTile(x,y,c);
        drawPlant(x,y,c);
        animalsByTile.get(x+","+y)?.forEach(drawAnimal);
        drawSelection(x,y);
      }
    }

    drawEventOverlay();
    const vignette=ctx.createRadialGradient(canvas.width/2,canvas.height*.52,120,canvas.width/2,canvas.height*.52,520);
    vignette.addColorStop(0,"rgba(0,0,0,0)");vignette.addColorStop(1,"rgba(0,0,0,.26)");
    ctx.fillStyle=vignette;ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  function updateUI() {
    const p=populations();
    const stability=stabilityScore();
    $("plantCount").textContent=p.plant;
    $("herbCount").textContent=p.herb;
    $("carnCount").textContent=p.carn;
    $("stability").textContent=stability;
    $("stabilityBar").style.width=stability+"%";
    $("plantBar").style.width=Math.min(100,p.plant/4.5)+"%";
    $("herbBar").style.width=Math.min(100,p.herb*1.5)+"%";
    $("carnBar").style.width=Math.min(100,p.carn*5)+"%";
    $("status").textContent=statusText(stability,p);
    $("dayBadge").textContent="Day "+state.day;
    $("seasonBadge").textContent=season().icon+" "+season().name;
    $("eventBadge").textContent=state.event?"⚡ "+state.event.label:"";
    $("eventBadge").hidden=!state.event;
    $("eco").textContent=Math.floor(state.eco);
    $("missionProgress").textContent=Math.min(state.missionStreak,CONFIG.goalDays)+"/"+CONFIG.goalDays+" days";
    $("missionBar").style.width=Math.min(100,state.missionStreak/CONFIG.goalDays*100)+"%";
    $("missionTitle").textContent=state.missionComplete?"Stewardship complete":"Hold "+CONFIG.goalStability+"% stability";
    $("pauseBtn").textContent=state.paused?"▶ Resume":"⏸ Pause";
    $("log").innerHTML=state.logs.map(x=>"<div>"+escapeHtml(x)+"</div>").join("");

    document.querySelectorAll("[data-speed]").forEach(btn=>btn.classList.toggle("active",Number(btn.dataset.speed)===state.speed));
    document.querySelectorAll("[data-tool]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.tool===selectedTool);
      btn.disabled=state.eco<CONFIG.actionCost[btn.dataset.tool];
    });
    $("rainBtn").disabled=state.eco<CONFIG.actionCost.rain;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function save() {
    try { localStorage.setItem(CONFIG.saveKey,JSON.stringify(state)); } catch {}
  }

  function load() {
    try {
      const raw=localStorage.getItem(CONFIG.saveKey);
      if(!raw) return false;
      const parsed=JSON.parse(raw);
      if(parsed.version!==CONFIG.saveVersion||!Array.isArray(parsed.grid)||parsed.grid.length!==CONFIG.size) return false;
      state={...defaultState(),...parsed};
      return true;
    } catch { return false; }
  }

  function pointerTile(e) {
    const rect=canvas.getBoundingClientRect();
    return screenToTile(
      (e.clientX-rect.left)/rect.width*canvas.width,
      (e.clientY-rect.top)/rect.height*canvas.height
    );
  }

  canvas.addEventListener("pointermove",e=>{
    if(e.pointerType==="touch") return;
    hoverTile=pointerTile(e);draw();
  });
  canvas.addEventListener("pointerleave",()=>{hoverTile=null;draw();});
  canvas.addEventListener("pointerdown",e=>{
    const t=pointerTile(e);
    if(!t) return;
    hoverTile=t;
    performAction(selectedTool,t.x,t.y);
  });

  document.querySelectorAll("[data-tool]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      selectedTool=btn.dataset.tool;
      updateUI();
      if(navigator.vibrate) navigator.vibrate(8);
    });
  });

  document.querySelectorAll("[data-speed]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      state.speed=Number(btn.dataset.speed);
      updateUI();save();
    });
  });

  $("rainBtn").addEventListener("click",rain);
  $("pauseBtn").addEventListener("click",()=>{state.paused=!state.paused;updateUI();save();});
  $("resetBtn").addEventListener("click",()=>{if(confirm("Start a completely new ecosystem?")) newWorld();});

  document.addEventListener("visibilitychange",()=>{
    if(document.hidden) {
      state.paused=true;
      updateUI();
      save();
    }
  });

  function frame(now) {
    const delta=Math.min(1200,now-lastFrame);
    lastFrame=now;
    if(!state.paused) {
      accumulator+=delta*state.speed;
      while(accumulator>=CONFIG.stepMs) {
        simulateTick();
        accumulator-=CONFIG.stepMs;
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  if(!load()) newWorld();
  else {
    addLog("Saved world restored.");
    updateUI();
  }

  requestAnimationFrame(frame);
})();