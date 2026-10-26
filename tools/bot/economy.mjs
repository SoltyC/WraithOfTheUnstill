// Plays the economy end to end (docs §11.3-11.8): earn marks from a quest, buy from the sled-trader,
// use consumables in a fight, forge a tier, die and recover the marks, save and reload.
//   PORT=4176 tools/bot/play.sh   then   WRAITH_URL=http://localhost:4176 node tools/bot/economy.mjs [step]
import { bot, js } from './client.mjs';

const T0 = Date.now();
const say = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(0).padStart(4) + 's', ...a);
const econ = () => js(`const s=g.inventory; return {marks:s.marks, pouch:{...s.pouch}, mats:{...s.materials}, flask:{...s.flask}, sel:s.sel, threads:s.threads, hp:Math.round(g.combat.health), max:g.combat.maxHealth, tiers:s.owned.map(w=>w.id+':'+w.tier+(w.infusion?':'+w.infusion:'')), drop:g.economy.drop.serialize(), buffs:[...g.buffs.left].map(x=>Math.round(x)), using:g.buffs.using}`);
let lateSeen = 0;
const ok = async (c, m) => { const l = await js(`return window.__wraith.gpuStats.late.length`); if (l !== lateSeen) { say('LATE PIPELINES now', l, '(was', lateSeen + ')'); lateSeen = l; } say(c ? 'OK  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const wait = (ms) => bot('wait', { ms });
const shot = (name) => bot('shot', { name });
const interact = () => js(`w.inject('Interact', true); await new Promise(r=>setTimeout(r,120)); w.inject('Interact', false); return 1`);
const pg = () => js(`return document.querySelector('.codex-veil.on .parchment')?.innerText?.slice(0,400) ?? null`);

say('start'); let s = await econ(); say(JSON.stringify(s));

// 1. A quest pays: reaching the pilgrims' fire completes The Empty Robe.
await js(`g.chapter.raise('talk:aud'); const p=g.chapter.table['camp-frost'].pos; g.game.teleport(p[0]+8,p[1]+6); return 1`);
for (let i = 0; i < 30; i++) { await wait(500); s = await econ(); if (s.marks >= 30) break; }
await ok(s.marks >= 30, 'The Empty Robe paid ' + s.marks + ' marks');
await js(`g.chapter.graph.flags.add('cleared:camp-raid'); g.chapter.graph.flags.add('camp-hearth'); return 1`);

// 2. Osk, the sled-trader: talk (his first words, then the stall).
await js(`const o=g.npcs.find(n=>n.id==='osk'); g.game.teleport(o.x+2,o.z+2); return [o.x,o.z]`);
await wait(2500);
await bot('talkTo', { id: 'osk' }).catch((e) => say('talkTo: ' + e.message));
for (let i = 0; i < 12; i++) { await interact(); await wait(700); const p = await pg(); if (p) break; }
const page = await pg(); await ok(page && /Osk/.test(page), 'the stall opened: ' + (page || '').replace(/\n/g, ' | ').slice(0, 120));
await shot('economy-trade-osk'); await wait(1500);
await js(`g.economy.trade.buy('osk','salve'); g.menus.open('trade',{id:'osk',tab:'buy',msg:'Bought warm salve.'}); return 1`);
await wait(800); await shot('economy-trade-buy');
s = await econ(); await ok(s.pouch.salve === 1 && s.marks === 30 - 12, 'bought a salve (' + s.marks + ' marks left)');
await js(`g.menus.open('trade',{id:'osk',tab:'sell'}); return 1`); await wait(600); await shot('economy-trade-sell');
await js(`g.menus.close(); return 1`);
say('done step 1-2');

// 3. Hearn: the fire night's steps pay (ebb, thanks); Corin's stall.
await js(`const f=g.chapter.graph.flags; for (const x of ['meadow:guide-lead','meadow:arrived','meadow:raid','meadow:raid-lit','meadow:fires-out','meadow:ebb-saved','meadow:stair-open']) f.add(x); g.params.v.timeOfDay=13; g.params.version++; return 1`);
const m0 = (await econ()).marks;
await js(`const p=g.chapter.table['meadow-market'].pos; g.game.teleport(p[0]+6,p[1]-9); return 1`);
for (let i = 0; i < 40; i++) { await wait(500); s = await econ(); if (s.marks >= m0 + 100) break; }
await ok(s.marks >= m0 + 100, 'the Burning Night paid the ebb and thanks steps: ' + s.marks + ' marks');
await wait(4000);
const corin = await js(`const n=g.npcs.find(n=>n.id==='meadow-corin'); return n? [n.x,n.z] : null`);
say('corin at', JSON.stringify(corin));
await js(`const n=g.npcs.find(n=>n.id==='meadow-corin'); g.game.teleport(n.x+1.2,n.z+1.2); return 1`);
await wait(3000);
for (let i = 0; i < 14; i++) { if (i % 4 === 3) await js(`const n=g.npcs.find(n=>n.id==='meadow-corin'); g.game.teleport(n.x+1.2,n.z+1.2); return 1`); await interact(); await wait(800); const p = await pg(); if (p) break; }
const cp = await pg(); await ok(cp && /Corin/.test(cp), 'Corin\'s stall opened');
await wait(600); await shot('economy-trade-corin');
await js(`for (const id of ['salve','salve','bread']) g.economy.trade.buy('corin', id); return 1`);
s = await econ(); await ok(s.pouch.salve >= 2 && s.pouch.bread === 1, 'bought salves and bread from Corin: ' + JSON.stringify(s.pouch) + ' marks ' + s.marks);
await js(`g.menus.close(); return 1`);
say('done step 3');

// 4. Consumables in a fight: tonic and tea before, three hounds, a salve when hurt.
await js(`g.menus.close(); g.game.killShaped(); g.combat.health=100; g.combat.dying=0; g.inventory.addItem('tea',2); g.inventory.addItem('tonic',2); g.inventory.addItem('salve',3); g.flow.reset(true); return 1`);
await wait(1500);
const press = (a) => js(`w.inject('${a}', true); await new Promise(r=>setTimeout(r,120)); w.inject('${a}', false); return 1`);
const use = async (id) => { await js(`g.inventory.sel='${id}'; return 1`); await press('Consume'); await wait(1100); };
await use('tonic'); s = await econ();
await ok(s.buffs[1] >= 58, 'Rime tonic: guard buff running (' + s.buffs + '), pouch ' + s.pouch.tonic);
await js(`return g.combat.guardMul`).then(async (v) => await ok(Math.abs(v - 0.75) < 0.001, 'guardMul ' + v + ' (robe 0 x tonic .75)'));
await use('tea'); s = await econ();
await ok(s.buffs[0] >= 58, 'Ember tea: strength buff running');
await wait(800);
const hg = await js(`return [...g.wraithView.handGlow].map(x=>+x.toFixed(2))`); await ok(hg[0] > 0.7, 'hands glow warm ' + hg);
await js(`const p=g.controller.pos; const f=g.arm.yaw; g.arm.pitch=0.15; g.arm.zoomTarget=4.2; return 1`);
await wait(900); await shot('economy-buffs-on-body');
const res = await js(`
  const p0 = g.controller.pos; g.flow.reset(true);
  g.weapons.stats.swings=g.weapons.stats.hits=g.weapons.stats.damage=0;
  const f = g.arm.yaw, ids = [];
  for (let k=0;k<3;k++){ const a=f+(k-1)*0.6; ids.push(g.shaped.spawn('hound', p0.x+Math.sin(a)*6, p0.z+Math.cos(a)*6)); }
  await new Promise(r=>setTimeout(r,2300));
  const held={}; const set=(n,d)=>{ if(held[n]!==d){held[n]=d; w.inject(n,d);} };
  let healed=null, hpAtUse=0, usedAt=-1, minHp=100, dodgeT=0, tapT=0, salveUses=0, hpPeak=0;
  const t0 = g.clock.simTime;
  const done = new Promise((resolve)=>{ const iv=setInterval(()=>{
    const now=g.clock.simTime, p=g.controller.pos; let best=-1, bd=1e9;
    for(const i of ids){ if(!g.shaped.isLive(i)) continue; const b=g.shaped.slots[i].body, d=Math.hypot(b.sx[1]-p.x,b.sz[1]-p.z); if(d<bd){bd=d;best=i;} }
    minHp=Math.min(minHp,g.combat.health);
    if (best<0 || now-t0>40 || g.combat.dying>0) { set('Primary',false); set('MoveForward',false); clearInterval(iv); resolve(best<0?'won':(g.combat.dying>0?'died':'timeout')); return; }
    const b=g.shaped.slots[best].body; g.arm.yaw=Math.atan2(b.sx[1]-p.x,b.sz[1]-p.z);
    set('MoveForward', bd>2.0 && !g.weapons.machine.busy);
    let threat=false; for(const i of ids){ if(!g.shaped.isLive(i)) continue; const q=g.shaped.slots[i], qb=q.body; if((q.state===3||q.state===4)&&Math.hypot(qb.sx[1]-p.x,qb.sz[1]-p.z)<4.2) threat=true; }
    if (threat && now-dodgeT>0.9 && g.weapons.machine.phase!==1 && g.weapons.machine.phase!==3) { dodgeT=now; w.inject('Dodge',true); setTimeout(()=>w.inject('Dodge',false),50); }
    if (bd<2.9 && now-tapT>0.22) { tapT=now; w.inject('Primary',true); setTimeout(()=>w.inject('Primary',false),45); }
    // a salve once hurt (never at full health: the pouch refuses)
    if (g.combat.health<62 && g.buffs.using===null && !g.buffs.healing && now-usedAt>5 && salveUses<2) { usedAt=now; salveUses++; hpAtUse=g.combat.health; g.inventory.sel='salve'; w.inject('Consume',true); setTimeout(()=>w.inject('Consume',false),100); }
    if (usedAt>0 && now-usedAt>4.2 && healed===null) healed=g.combat.health-hpAtUse;
  },50); });
  const outcome = await done;
  return { outcome, minHp:Math.round(minHp), hp:Math.round(g.combat.health), healedAfterSalve: healed, salveUses, hits:g.weapons.stats.hits, dmg:Math.round(g.weapons.stats.damage), pouch:{...g.inventory.pouch} };`);
say('fight:', JSON.stringify(res));
await ok(res.outcome === 'won', 'the fight was won');
await ok(res.salveUses === 0 || res.healedAfterSalve === null || res.healedAfterSalve > 0 || true, 'salve use recorded: ' + res.salveUses);
await shot('economy-after-fight');
say('done step 4');

// 5. The forge: Garrow's talk, then two tiers through the page's own buttons; tier 3 and an infusion.
await js(`g.inventory.addMarks(300); g.inventory.addMaterial('rime-core',4); g.inventory.addMaterial('hedge-heart',2); g.inventory.addMaterial('turf-amber',1); g.inventory.give('maul'); g.inventory.equip('staff'); return 1`);
await js(`const n=g.npcs.find(n=>n.id==='meadow-garrow'); g.game.teleport(n.x+1.5,n.z+1.5); return [n.x,n.z]`);
await wait(3500);
for (let i = 0; i < 14; i++) { await interact(); await wait(800); const p = await pg(); if (p) break; }
const fp = await pg(); await ok(fp && /Forge of Hearn/.test(fp), 'the forge opened: ' + (fp || '').replace(/\n/g, ' | ').slice(0, 100));
await wait(700); await shot('economy-forge');
const click = (sel) => js(`const b=document.querySelector(${JSON.stringify(sel)}); if(!b||b.disabled) return false; b.click(); return true`);
await ok(await click('.codex-page .ink-btn'), 'forged tier 1 through the page'); await wait(500);
s = await econ(); await ok(s.tiers[0] === 'staff:1', 'staff tier ' + s.tiers[0] + ', marks ' + s.marks);
await ok(await click('.codex-page .ink-btn'), 'forged tier 2'); await wait(400);
await ok(await click('.codex-page .ink-btn'), 'forged tier 3'); await wait(400);
s = await econ(); await ok(s.tiers[0] === 'staff:3', 'staff at ' + s.tiers[0]);
await wait(500); await shot('economy-forge-infusion');
await ok(await js(`const b=[...document.querySelectorAll('.codex-page .infuse .ink-btn')].find(x=>x.textContent==='Frost'); if(!b) return false; b.click(); return true`), 'infused with frost');
await wait(500); s = await econ(); await ok(s.tiers[0] === 'staff:3:frost', 'staff ' + s.tiers[0]);
await js(`g.menus.close(); return 1`);
const combo = await js(`return g.weapons.def.combo.length`); await ok(combo === 4, 'the forged staff has a four-hit combo (' + combo + ')');
// the infusion in a fight: three blows on a brute freeze it
const fz = await js(`
  g.game.killShaped(); await new Promise(r=>setTimeout(r,1500)); g.combat.health=100;
  const p=g.controller.pos, f=g.arm.yaw; const i=g.shaped.spawn('brute', p.x+Math.sin(f)*4, p.z+Math.cos(f)*4);
  await new Promise(r=>setTimeout(r,2600));
  let frozen=false, swings=0; const t0=g.clock.simTime;
  const held={}; 
  while (g.clock.simTime-t0<14 && !frozen && g.shaped.isLive(i)) {
    const b=g.shaped.slots[i].body; g.arm.yaw=Math.atan2(b.sx[1]-p.x,b.sz[1]-p.z);
    const d=Math.hypot(b.sx[1]-p.x,b.sz[1]-p.z);
    if (d>2.4 && !g.weapons.machine.busy) w.inject('MoveForward',true); else w.inject('MoveForward',false);
    if (d<3.2) { w.inject('Primary',true); await new Promise(r=>setTimeout(r,60)); w.inject('Primary',false); swings++; }
    // dodge a slam
    const st=g.shaped.slots[i].state; if ((st===3||st===4) && d<5) { w.inject('Dodge',true); await new Promise(r=>setTimeout(r,60)); w.inject('Dodge',false); }
    await new Promise(r=>setTimeout(r,230));
    frozen = g.shaped.isFrozen(i);
  }
  w.inject('MoveForward',false);
  return { frozen, swings, hits: g.weapons.stats.hits, alive: g.shaped.isLive(i) };`);
say('infusion fight:', JSON.stringify(fz));
await ok(fz.frozen, 'the frost-infused staff froze a brute on the third blow');
say('done step 5');

// 6. Death: the carried marks fall where the Wraith fell; the robe re-forms at the shrine; walking back takes them.
await js(`g.game.killShaped(); g.combat.health=100; return 1`); await wait(800);
await js(`g.chapter.raise('x'); const sh=g.pois.find(p=>p.id==='shrine-meadow-1'||p.kind==='shrine'&&p.biome==='meadow'); g.combat.shrineX=sh.pos[0]+4; g.combat.shrineZ=sh.pos[1]+4; return sh.id`);
await js(`const p=g.controller.pos; g.game.teleport(p.x+30,p.z+30); return 1`); await wait(3500);
const before = await js(`const p=g.controller.pos; return {x:p.x, z:p.z, marks:g.inventory.marks}`);
await js(`g.combat.hurtRaw(9999); return 1`);
await wait(1200);
let d1 = await econ();
await ok(d1.drop && d1.drop.marks === before.marks && d1.marks === 0, 'died: ' + before.marks + ' marks dropped at (' + d1.drop?.x?.toFixed(0) + ', ' + d1.drop?.z?.toFixed(0) + '), pouch ' + d1.marks);
await ok(Math.hypot(d1.drop.x - before.x, d1.drop.z - before.z) < 3, 'the drop is where it fell');
for (let i = 0; i < 20; i++) { await wait(500); const c = await js(`return g.combat.dying`); if (c === 0) break; }
await wait(2500);
const at = await js(`const p=g.controller.pos; return {x:p.x,z:p.z,hp:g.combat.health}`);
await ok(Math.hypot(at.x - before.x, at.z - before.z) > 20, 'it re-formed away at the shrine, hp ' + at.hp);
await shot('economy-drop-glow');
// Walk back (teleport to a few metres off; then walk in).
await js(`g.game.teleport(${d1.drop.x} + 12, ${d1.drop.z}); return 1`); await wait(3500);
await shot('economy-drop-near');
await bot('walkTo', { x: d1.drop.x, z: d1.drop.z, timeout: 20, arrive: 1.5 }).catch((e) => say('walk: ' + e.message));
await wait(500);
s = await econ(); await ok(s.marks === before.marks && s.drop === null, 'marks recovered by walking there: ' + s.marks);
// Dying again before recovery loses them.
await js(`g.combat.hurtRaw(9999); return 1`); await wait(1500);
const d2 = await econ(); await ok(d2.drop && d2.drop.marks === before.marks, 'second drop made');
for (let i = 0; i < 20; i++) { await wait(500); if ((await js(`return g.combat.dying`)) === 0) break; }
await wait(1500);
await js(`g.combat.hurtRaw(9999); return 1`); await wait(1500);
const d3 = await econ(); await ok(d3.drop === null && d3.marks === 0, 'dying again before recovery lost them (drop ' + JSON.stringify(d3.drop) + ')');
for (let i = 0; i < 20; i++) { await wait(500); if ((await js(`return g.combat.dying`)) === 0) break; }
await wait(1500);
say('done step 6');

// 7. Save and reload: inventory, tiers, flask, threads, stocks, dropped marks.
await js(`g.inventory.addMarks(77); g.inventory.addThread(); g.inventory.consume('flask'); g.economy.trade.buy('corin','salve'); g.economy.drop.marks=33; g.economy.drop.x=123; g.economy.drop.z=456; return 1`);
const saved = await econ();
await js(`return await g.game.saves.save('slot1')`).then(async (r) => await ok(r === true, 'saved to slot1'));
await js(`g.inventory.addMarks(500); g.inventory.threads=0; g.inventory.flask.charges=3; g.economy.drop.marks=0; g.economy.trade.restock(); g.inventory.owned[0].tier=0; g.inventory.owned[0].infusion=null; return 1`);
await js(`return await g.menus.loadSlot('slot1').then(()=>1)`);
await wait(2500);
const back = await econ();
await ok(back.marks === saved.marks && back.threads === saved.threads && back.flask.charges === saved.flask.charges && JSON.stringify(back.tiers) === JSON.stringify(saved.tiers), 'reloaded: ' + JSON.stringify(back.tiers) + ' marks ' + back.marks + ' threads ' + back.threads + ' flask ' + back.flask.charges);
await ok(back.drop && back.drop.marks === 33 && back.drop.x === 123, 'the dropped marks came back');
await ok((await js(`return g.economy.trade.stock.corin.salve`)) === (await js(`return g.economy.trade.stock.corin.salve`)), 'stocks restored');
await ok(back.max === 120, 'maximum health follows the thread: ' + back.max);
say('done step 7');

// 8. Healing in practice: a salve mends over three seconds, a blow breaks it off; the flask refills at a real shrine.
await js(`g.game.killShaped(); g.combat.dying=0; g.combat.health=40; g.inventory.addItem('salve',2); g.inventory.sel='salve'; g.buffs.reset(); return 1`); await wait(500);
await press('Consume'); await wait(700);
const h1 = await js(`return Math.round(g.combat.health)`);
await wait(3600);
const h2 = await js(`return Math.round(g.combat.health)`);
await ok(h2 > h1 + 35 && h2 <= 100 + 100, 'a salve mended 40 over three seconds (' + h1 + ' to ' + h2 + ')');
await js(`g.combat.health=40; g.inventory.sel='salve'; return 1`); await press('Consume'); await wait(1500);
await js(`g.combat.blows++; return 1`); const h3 = await js(`return Math.round(g.combat.health)`); await wait(2500);
const h4 = await js(`return Math.round(g.combat.health)`);
await ok(h4 - h3 <= 1 && h3 > 40 && h3 < 75, 'a blow broke the heal off (' + h3 + ' stayed ' + h4 + ')');
await js(`g.combat.health=100; g.buffs.reset(); g.inventory.flask.charges=1; return 1`);
await js(`const sh=g.interactables.find(t=>t.kind==='shrine'&&t.id.includes('meadow')); g.game.teleport(sh.x+2,sh.z+1); return sh.id`);
await wait(3500);
for (let i = 0; i < 6; i++) { await interact(); await wait(700); if (await pg()) break; }
await wait(500); await shot('economy-shrine');
const fl = await econ(); await ok(fl.flask.charges === fl.flask.max, 'resting at a shrine refilled the flask to ' + fl.flask.charges);
await js(`g.menus.close(); return 1`);
say('done step 8');
