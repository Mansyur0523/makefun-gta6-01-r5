// The wanted system: heat 0-100 becomes 1-5 stars, police cars spawn and chase,
// a helicopter joins at 3 stars, and the player gets busted (on foot, cornered)
// or wasted (health hits zero). Hide to cool off — heat falls much faster when
// no cop can see you.
import { CAR, CITY } from './config.js';
import { angleDelta, clamp, distance2D } from './random.js';
import { addHeat } from './entities.js';

const POLICE_COLORS = ['#e8e8e8'];

function spawnPoliceCar(state, x, z) {
  state.cars.push({
    id: state.nextCarId++, active: true, kind: 'police', x, z,
    heading: Math.atan2(state.player.x - x, state.player.z - z),
    speed: 0, targetSpeed: 0, color: POLICE_COLORS[0], driver: true,
  });
}

function nearestPoliceDistance(state) {
  let best = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'police' || !car.active) continue;
    best = Math.min(best, distance2D(state.player.x, state.player.z, car.x, car.z));
  }
  return best;
}

export function updatePolice(state, city, dt, audio) {
  const wanted = state.wanted;
  // Count live police and top up to the wanted level.
  let policeCount = 0;
  for (const car of state.cars) if (car.kind === 'police' && car.active) policeCount += 1;
  const wantPolice = wanted === 0 ? 0 : Math.min(6, wanted + 1);
  if (policeCount < wantPolice) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 40;
    const x = clamp(state.player.x + Math.sin(angle) * dist, -250, 250);
    const z = clamp(state.player.z + Math.cos(angle) * dist, -250, 250);
    spawnPoliceCar(state, x, z);
    policeCount += 1;
  }
  // Helicopter at 3 stars and up.
  state.heli.active = wanted >= 3;
  if (state.heli.active) {
    const h = state.heli;
    h.x += (state.player.x - h.x) * Math.min(1, dt * 0.8);
    h.z += (state.player.z - h.z) * Math.min(1, dt * 0.8);
    h.alt = 55 + Math.sin(state.time * 0.7) * 3;
  }
  // Heat decay: fast when no cop is near, slow while chased.
  const nearest = nearestPoliceDistance(state);
  const hidden = wanted === 0 || nearest > 55;
  if (hidden) state.hiddenTimer += dt;
  else state.hiddenTimer = 0;
  const decay = hidden ? 7 : 2.2;
  if (state.heat > 0) {
    state.heat = Math.max(0, state.heat - decay * dt);
    // Recompute stars from heat.
    const thresholds = [0, 20, 40, 60, 80, 95];
    let w = 0;
    for (let i = 5; i >= 1; i -= 1) {
      if (state.heat >= thresholds[i]) { w = i; break; }
    }
    state.wanted = w;
  }
  // Police chase AI.
  const playerCar = state.player.onFoot ? null : state.cars.find((c) => c.id === state.player.carId);
  const playerSpeed = playerCar ? Math.abs(playerCar.speed) : (state.player.speed || 0);
  for (const car of state.cars) {
    if (car.kind !== 'police' || !car.active) continue;
    const dx = state.player.x - car.x;
    const dz = state.player.z - car.z;
    const dist = Math.hypot(dx, dz) || 1;
    const targetHeading = Math.atan2(dx, dz);
    const turn = angleDelta(car.heading, targetHeading);
    const topSpeed = 12 + wanted * 4.5;
    car.speed = clamp(car.speed + (topSpeed - car.speed) * Math.min(1, dt * 0.9), 0, topSpeed);
    car.heading += clamp(turn, -2.4 * dt, 2.4 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.x = clamp(car.x, -258, 300);
    car.z = clamp(car.z, -258, 258);
    // Ram the player's car.
    if (playerCar && dist < 4.2) {
      playerCar.speed *= 0.82;
      car.speed *= 0.7;
    }
    // Shoot at the player when close and wanted is 2+.
    if (wanted >= 2 && dist < 26 && state.player.invulnerable <= 0) {
      car.shootTimer = (car.shootTimer || 0) - dt;
      if (car.shootTimer <= 0) {
        car.shootTimer = 0.9 + Math.random() * 0.7;
        state.health -= 6 + wanted * 2;
        state.tracer = {
          x0: car.x, y0: 1.2, z0: car.z,
          x1: state.player.x, y1: 1.2, z1: state.player.z, life: 0.15,
        };
        if (audio) audio.shoot();
      }
    }
    // Busted: a cop catches the player on foot while slow.
    if (state.player.onFoot && dist < 2.6 && playerSpeed < 3) {
      state.bustTimer += dt;
      if (state.bustTimer > 1.2) {
        state.bustTimer = 0;
        return 'busted';
      }
    }
  }
  if (state.player.onFoot && nearest > 4) state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
  if (state.health <= 0) return 'wasted';
  return null;
}

/** Clear the heat at a repaint garage ("Quick Coat") for cash. */
export function repaintCar(state) {
  if (state.cash < 100 || state.wanted === 0) return false;
  state.cash -= 100;
  state.heat = 0;
  state.wanted = 0;
  for (const car of state.cars) {
    if (car.kind === 'police') car.active = false;
  }
  state.heli.active = false;
  return true;
}
