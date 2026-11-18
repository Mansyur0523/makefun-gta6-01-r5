// The living world: the player on foot or in a car, traffic that follows the
// road grid, pedestrians on the sidewalks, parked cars to steal, pickups, and
// the collisions that keep everyone out of the buildings.
import { CAR, CITY, HEAT, PLAYER } from './config.js';
import { angleDelta, clamp, createRandom, distance2D } from './random.js';
import { collideBuildings, groundAt } from './city.js';

export const EVENT_NONE = 0;
export const EVENT_PICKUP = 1;
export const EVENT_CRASH = 2;
export const EVENT_CAR_STOLEN = 4;
export const EVENT_PUNCH_HIT = 8;
export const EVENT_SHOT_HIT = 16;

const PED_SHIRTS = ['#3a7bd5', '#d5a03a', '#7a3ad5', '#3ad56a', '#d53a6a', '#e8e4da', '#5a5a5a'];
const PED_SKINS = ['#e8b98a', '#c98d5f', '#8a5a3a', '#f0c8a0'];

function randomPed(rng, x, z) {
  return {
    active: true,
    x,
    z,
    heading: rng.range(0, Math.PI * 2),
    speed: rng.range(1.2, 2.2),
    shirt: rng.pick(PED_SHIRTS),
    skin: rng.pick(PED_SKINS),
    pants: rng.pick(['#2c3e50', '#5a4a3a', '#3a3a3a', '#4a5a7a']),
    wander: rng.range(2, 6),
    flee: 0,
    walkPhase: rng.range(0, Math.PI * 2),
  };
}

function randomTrafficCar(rng, id, color) {
  const line = rng.pick([-232, -174, -116, -58, 0, 58, 116, 174, 232]);
  const along = rng.range(-240, 240);
  const horizontal = rng.chance(0.5);
  return {
    id,
    active: true,
    kind: 'traffic',
    x: horizontal ? along : line,
    z: horizontal ? line : along,
    heading: horizontal ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2),
    speed: rng.range(7, 11),
    targetSpeed: rng.range(7, 11),
    color,
    driver: true,
  };
}

export function createWorld(city, seed) {
  const rng = createRandom(seed);
  const state = {
    seed,
    time: 0,
    clock: 17.6,
    cash: 150,
    health: 100,
    ammo: 24,
    wanted: 0,
    heat: 0,
    score: 0,
    carsStolen: 0,
    missionsDone: 0,
    player: {
      x: -200, z: 200, heading: Math.PI / 4, speed: 0, onFoot: true, carId: null,
      punchCooldown: 0, shootCooldown: 0, invulnerable: 0, runT: 0,
    },
    cars: [],
    peds: [],
    pickups: [],
    particles: [],
    tracer: null,
    marker: null,
    heli: { active: false, x: 0, z: 0, alt: 55 },
    radioStation: 0,
    bustTimer: 0,
    hiddenTimer: 0,
    message: '',
    messageTimer: 0,
  };
  // Parked cars from the city, then traffic.
  let id = 1;
  for (const parked of city.parked) {
    state.cars.push({ id: id++, active: true, kind: 'parked', x: parked.x, z: parked.z, heading: parked.heading, speed: 0, targetSpeed: 0, color: parked.color, driver: false });
  }
  const trafficColors = ['#c0392b', '#2e86c1', '#f1c40f', '#e67e22', '#16a085', '#ecf0f1', '#2c3e50', '#27ae60'];
  for (let i = 0; i < 12; i += 1) state.cars.push(randomTrafficCar(rng, id++, trafficColors[i % trafficColors.length]));
  // The player's own starter car, a yellow coupe by the hideout.
  state.cars.push({ id: id++, active: true, kind: 'player', x: -196, z: 196, heading: Math.PI * 0.75, speed: 0, targetSpeed: 0, color: '#f1c40f', driver: false });
  state.nextCarId = id;
  for (let i = 0; i < 22; i += 1) {
    state.peds.push(randomPed(rng, rng.range(-230, 230), rng.range(-230, 230)));
  }
  state.pickups = [
    { active: true, kind: 'health', x: -180, z: 180 },
    { active: true, kind: 'ammo', x: 60, z: -60 },
    { active: true, kind: 'cash', x: 180, z: 60 },
    { active: true, kind: 'health', x: -60, z: -180 },
    { active: true, kind: 'ammo', x: 200, z: -140 },
  ];
  state.rng = rng;
  return state;
}

function resolveBuildingCollision(city, obj, radius) {
  const b = collideBuildings(city, obj.x, obj.z, radius);
  if (!b) return false;
  // Push out along the smallest penetration axis.
  const left = obj.x - (b.x - b.w / 2);
  const right = (b.x + b.w / 2) - obj.x;
  const top = obj.z - (b.z - b.d / 2);
  const bottom = (b.z + b.d / 2) - obj.z;
  const min = Math.min(left, right, top, bottom);
  if (min === left) obj.x = b.x - b.w / 2 - radius;
  else if (min === right) obj.x = b.x + b.w / 2 + radius;
  else if (min === top) obj.z = b.z - b.d / 2 - radius;
  else obj.z = b.z + b.d / 2 + radius;
  return true;
}

function addParticles(state, x, y, z, color, count, spread) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x, y, z,
      vx: (Math.random() - 0.5) * spread,
      vy: Math.random() * 3,
      vz: (Math.random() - 0.5) * spread,
      life: 0.7,
      maxLife: 0.7,
      color,
    });
  }
  if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
}

export function addHeat(state, amount) {
  state.heat = clamp(state.heat + amount, 0, 100);
  const stars = [0, 1, 2, 3, 4, 5];
  let wanted = 0;
  for (let i = 5; i >= 1; i -= 1) {
    if (state.heat >= HEAT.starAt[i]) { wanted = stars[i]; break; }
  }
  state.wanted = wanted;
}

function stepPlayerOnFoot(state, city, input, dt) {
  const p = state.player;
  const run = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const fwd = input.forward ? 1 : input.back ? -0.5 : 0;
  const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  if (fwd !== 0) {
    p.heading += turn * 2.4 * dt * (fwd < 0 ? -1 : 1);
    const speed = run * fwd;
    p.x += Math.sin(p.heading) * speed * dt;
    p.z += Math.cos(p.heading) * speed * dt;
    p.speed = Math.abs(speed);
    p.runT += dt;
  } else {
    p.heading += turn * 2.0 * dt;
    p.speed = 0;
  }
  // Stay inside the map and out of the water.
  p.x = clamp(p.x, -258, 296);
  p.z = clamp(p.z, -258, 258);
  if (groundAt(city, p.x, p.z) === 'water') {
    p.x = clamp(p.x, -258, 296);
  }
  resolveBuildingCollision(city, p, PLAYER.radius);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
}

function stepPlayerCar(state, city, input, dt) {
  const car = state.cars.find((c) => c.id === state.player.carId);
  if (!car) {
    state.player.onFoot = true;
    state.player.carId = null;
    return 0;
  }
  const p = state.player;
  const accel = input.forward ? CAR.accel : input.back ? -CAR.brake : 0;
  car.speed = clamp(car.speed + accel * dt, -CAR.reverseMax, CAR.maxSpeed);
  if (!input.forward && !input.back) car.speed *= Math.max(0, 1 - 1.6 * dt);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerFactor = clamp(Math.abs(car.speed) / 8, 0, 1);
  car.heading += steer * CAR.steer * steerFactor * dt * (car.speed < 0 ? -1 : 1) * (input.handbrake ? 1.6 : 1);
  if (input.handbrake) car.speed *= Math.max(0, 1 - 2.2 * dt);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.x = clamp(car.x, -258, 380);
  car.z = clamp(car.z, -258, 258);
  if (groundAt(city, car.x, car.z) === 'water' && car.x > CITY.waterX) {
    car.x = CITY.waterX - 2;
    car.speed *= 0.4;
  }
  const hit = resolveBuildingCollision(city, car, CAR.radius);
  if (hit && Math.abs(car.speed) > 6) {
    car.speed *= -0.25;
    addParticles(state, car.x, 1, car.z, '#ffcf5a', 8, 6);
    return EVENT_CRASH;
  }
  if (hit) car.speed *= 0.5;
  p.x = car.x;
  p.z = car.z;
  p.heading = car.heading;
  p.speed = Math.abs(car.speed);
  return 0;
}

function stepTraffic(state, city, dt) {
  for (const car of state.cars) {
    if (!car.active || car.kind !== 'traffic') continue;
    // Follow the road grid: at each intersection, sometimes turn.
    const nearLineX = Math.abs(((car.x + 261) % 58) - 29) < 2;
    const nearLineZ = Math.abs(((car.z + 261) % 58) - 29) < 2;
    if ((nearLineX || nearLineZ) && state.rng.chance(dt * 1.4)) {
      car.heading += (state.rng.chance(0.5) ? 1 : -1) * Math.PI / 2;
    }
    // Slow for the car ahead.
    let slow = false;
    for (const other of state.cars) {
      if (other === car || !other.active) continue;
      const d = distance2D(car.x, car.z, other.x, other.z);
      if (d < 9 && Math.abs(angleDelta(car.heading, Math.atan2(other.x - car.x, other.z - car.z))) < 0.5) { slow = true; break; }
    }
    const target = slow ? 0 : car.targetSpeed;
    car.speed += clamp(target - car.speed, -8 * dt, 6 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    if (car.x < -255 || car.x > 255 || car.z < -255 || car.z > 255) {
      car.heading += Math.PI;
      car.x = clamp(car.x, -250, 250);
      car.z = clamp(car.z, -250, 250);
    }
    resolveBuildingCollision(city, car, CAR.radius);
  }
}

function stepPeds(state, city, dt) {
  for (const p of state.peds) {
    if (!p.active) continue;
    p.wander -= dt;
    if (p.wander <= 0) {
      p.wander = state.rng.range(2, 7);
      p.heading += state.rng.range(-1.4, 1.4);
    }
    let speed = p.speed;
    if (p.flee > 0) {
      p.flee -= dt;
      speed = 4.5;
      const dx = p.x - state.player.x;
      const dz = p.z - state.player.z;
      p.heading = Math.atan2(dx, dz);
    }
    p.x += Math.sin(p.heading) * speed * dt;
    p.z += Math.cos(p.heading) * speed * dt;
    p.x = clamp(p.x, -255, 295);
    p.z = clamp(p.z, -255, 255);
    resolveBuildingCollision(city, p, 0.5);
  }
}

function nearestCar(state, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (!car.active) continue;
    const d = distance2D(x, z, car.x, car.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Enter the nearest car, or step out of the current one. Returns an event flag. */
export function tryEnterCar(state, city) {
  const p = state.player;
  if (!p.onFoot) {
    const car = state.cars.find((c) => c.id === p.carId);
    if (car) {
      p.x = car.x + Math.cos(car.heading) * 2.4;
      p.z = car.z - Math.sin(car.heading) * 2.4;
      car.speed = 0;
    }
    p.onFoot = true;
    p.carId = null;
    return EVENT_NONE;
  }
  const car = nearestCar(state, p.x, p.z, 4.5);
  if (!car) return EVENT_NONE;
  p.onFoot = false;
  p.carId = car.id;
  car.driver = true;
  if (car.kind === 'parked' || car.kind === 'traffic') {
    car.kind = 'player';
    state.carsStolen += 1;
    addHeat(state, HEAT.stealCar);
    return EVENT_CAR_STOLEN;
  }
  return EVENT_NONE;
}

function punch(state) {
  const p = state.player;
  if (!p.onFoot || p.punchCooldown > 0) return EVENT_NONE;
  p.punchCooldown = 0.45;
  let hit = false;
  for (const ped of state.peds) {
    if (!ped.active) continue;
    const d = distance2D(p.x, p.z, ped.x, ped.z);
    if (d < PLAYER.punchRange && Math.abs(angleDelta(p.heading, Math.atan2(ped.x - p.x, ped.z - p.z))) < 1.1) {
      ped.flee = 5;
      addHeat(state, HEAT.punch);
      addParticles(state, ped.x, 1.2, ped.z, '#ffffff', 6, 4);
      hit = true;
    }
  }
  for (const cop of state.cars) {
    if (cop.kind !== 'police' || !cop.active) continue;
    const d = distance2D(p.x, p.z, cop.x, cop.z);
    if (d < PLAYER.punchRange + 1.5) {
      addHeat(state, HEAT.killCop);
      addParticles(state, cop.x, 1, cop.z, '#ff5d5d', 8, 5);
      hit = true;
    }
  }
  return hit ? EVENT_PUNCH_HIT : EVENT_NONE;
}

function shoot(state, audio) {
  const p = state.player;
  if (!p.onFoot || p.shootCooldown > 0 || state.ammo <= 0) return EVENT_NONE;
  p.shootCooldown = 0.32;
  state.ammo -= 1;
  const ox = p.x;
  const oz = p.z;
  // Auto-aim: nearest hostile or fleeing ped inside a cone ahead.
  let target = null;
  let bestD = PLAYER.shootRange;
  const candidates = [];
  for (const ped of state.peds) if (ped.active) candidates.push({ x: ped.x, z: ped.z, y: 1.1, kind: 'ped', ref: ped });
  for (const cop of state.cars) {
    if (cop.kind === 'police' && cop.active) candidates.push({ x: cop.x, z: cop.z, y: 1, kind: 'cop', ref: cop });
  }
  for (const c of candidates) {
    const d = distance2D(ox, oz, c.x, c.z);
    const ang = Math.abs(angleDelta(p.heading, Math.atan2(c.x - ox, c.z - oz)));
    if (d < bestD && ang < 0.7) {
      bestD = d;
      target = c;
    }
  }
  const endX = target ? target.x : ox + Math.sin(p.heading) * PLAYER.shootRange;
  const endZ = target ? target.z : oz + Math.cos(p.heading) * PLAYER.shootRange;
  const endY = target ? target.y : 1.1;
  state.tracer = { x0: ox, y0: 1.3, z0: oz, x1: endX, y1: endY, z1: endZ, life: 0.18 };
  addParticles(state, endX, endY, endZ, '#ffe9a8', 5, 3);
  if (audio) audio.shoot();
  if (!target) return EVENT_NONE;
  addHeat(state, target.kind === 'cop' ? HEAT.killCop : HEAT.shoot);
  if (target.kind === 'ped') {
    target.ref.flee = 6;
    for (const ped of state.peds) {
      if (ped.active && distance2D(ped.x, ped.z, target.x, target.z) < 18) ped.flee = 4;
    }
  }
  return EVENT_SHOT_HIT;
}

export function stepWorld(state, city, input, dt, audio) {
  let events = EVENT_NONE;
  state.time += dt;
  state.clock += dt / 240; // One game hour per 4 real minutes.
  if (state.clock >= 24) state.clock -= 24;
  if (state.tracer) {
    state.tracer.life -= dt;
    if (state.tracer.life <= 0) state.tracer = null;
  }
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.z += pt.vz * dt;
    pt.vy -= 6 * dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  if (state.player.onFoot) stepPlayerOnFoot(state, city, input, dt);
  else events |= stepPlayerCar(state, city, input, dt);
  if (input.interact) events |= tryEnterCar(state, city);
  if (input.punch) events |= punch(state);
  if (input.shoot) events |= shoot(state, audio);
  stepTraffic(state, city, dt);
  stepPeds(state, city, dt);
  // Pickups.
  for (const pk of state.pickups) {
    if (!pk.active) continue;
    if (distance2D(state.player.x, state.player.z, pk.x, pk.z) < 2.6) {
      pk.active = false;
      if (pk.kind === 'health') state.health = Math.min(100, state.health + 40);
      if (pk.kind === 'ammo') state.ammo = Math.min(PLAYER.maxAmmo, state.ammo + 24);
      if (pk.kind === 'cash') {
        state.cash += 120;
        state.score += 120;
      }
      events |= EVENT_PICKUP;
      if (audio) audio.pickup();
      addParticles(state, pk.x, 1, pk.z, '#7dff8a', 10, 4);
    }
  }
  // Car-to-car bumps.
  for (let i = 0; i < state.cars.length; i += 1) {
    for (let j = i + 1; j < state.cars.length; j += 1) {
      const a = state.cars[i];
      const b = state.cars[j];
      if (!a.active || !b.active) continue;
      const d = distance2D(a.x, a.z, b.x, b.z);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const nx = (a.x - b.x) / d;
        const nz = (a.z - b.z) / d;
        a.x += nx * push;
        a.z += nz * push;
        b.x -= nx * push;
        b.z -= nz * push;
        if (Math.abs(a.speed) > 8 || Math.abs(b.speed) > 8) {
          a.speed *= 0.6;
          b.speed *= 0.6;
          if (a.kind === 'player' || b.kind === 'player') events |= EVENT_CRASH;
        }
      }
    }
  }
  return events;
}
