// Staged screenshot scenes behind ?shot=cover|drive|chase|mission. Each one
// plays the real game forward from a fresh world with a simple autopilot, so
// the frame is what a short session really looks like and the same seed always
// gives the same frame. The cover shows the chase: a car, three stars, the
// helicopter, the minimap and a mission objective all at once, at golden hour.
import { STEP } from './config.js';
import { createWorld, stepWorld, addHeat } from './entities.js';
import { createMissionState, startMission, updateMissions, updateMissionMarker } from './missions.js';
import { updatePolice } from './police.js';
import { LANDMARKS } from './city.js';

const SAMPLE = STEP;

function autopilotDrive(state, targetX, targetZ) {
  const p = state.player;
  const car = state.cars.find((c) => c.id === p.carId);
  const heading = car ? car.heading : p.heading;
  const want = Math.atan2(targetX - p.x, targetZ - p.z);
  let d = want - heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return {
    forward: Math.abs(d) < 1.2,
    back: false,
    left: d > 0.12,
    right: d < -0.12,
    run: false,
    handbrake: false,
    interact: false,
    punch: false,
    shoot: false,
  };
}

function autopilotWalk(state, targetX, targetZ) {
  const p = state.player;
  const want = Math.atan2(targetX - p.x, targetZ - p.z);
  let d = want - p.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return {
    forward: Math.abs(d) < 1.0,
    back: false,
    left: d > 0.12,
    right: d < -0.12,
    run: true,
    handbrake: false,
    interact: false,
    punch: false,
    shoot: false,
  };
}

function runFrames(state, city, missions, frames, driveTo) {
  for (let i = 0; i < frames; i += 1) {
    const input = state.player.onFoot ? autopilotWalk(state, driveTo.x, driveTo.z) : autopilotDrive(state, driveTo.x, driveTo.z);
    stepWorld(state, city, input, SAMPLE, null);
    updateMissions(missions, state, SAMPLE);
    updateMissionMarker(missions, state);
    updatePolice(state, city, SAMPLE, null);
  }
  state.health = 100;
}

/** Stage `name` in a fresh world and return the world + missions to paint. */
export function stageShot(name, city, seed) {
  const state = createWorld(city, seed);
  const missions = createMissionState();
  state.clock = 17.6; // Golden hour for every shot.
  if (name === 'drive') {
    // On foot on the beach at sunset, starter car beside the player, pier ahead.
    state.player.x = 232;
    state.player.z = 40;
    state.player.heading = Math.PI / 2;
    startMission(missions, state);
    missions.index = 0;
    missions.step = 0;
    updateMissionMarker(missions, state);
    runFrames(state, city, missions, 60, { x: 260, z: 0 });
    return { state, missions };
  }
  if (name === 'chase') {
    // Four stars, helicopter overhead, police on the tail, driving the coast road.
    state.player.onFoot = false;
    const car = state.cars.find((c) => c.kind === 'player');
    state.player.carId = car.id;
    state.player.x = 145;
    state.player.z = -60;
    car.x = 145;
    car.z = -60;
    car.heading = 0;
    state.player.heading = 0;
    car.speed = 18;
    addHeat(state, 96);
    startMission(missions, state);
    missions.index = 4;
    missions.step = 0;
    missions.started = true;
    runFrames(state, city, missions, 90, { x: 145, z: 180 });
    return { state, missions };
  }
  if (name === 'mission') {
    // Job 1 on the pier: the package marker, the ocean, the city behind.
    state.player.x = 300;
    state.player.z = 6;
    state.player.heading = Math.PI / 2;
    startMission(missions, state);
    runFrames(state, city, missions, 150, { x: 350, z: 0 });
    return { state, missions };
  }
  // Cover: three stars, police chase behind the player's car, mission live.
  state.player.onFoot = false;
  const car = state.cars.find((c) => c.kind === 'player');
  state.player.carId = car.id;
  state.player.x = 29;
  state.player.z = -120;
  car.x = 29;
  car.z = -120;
  car.heading = 0;
  state.player.heading = 0;
  car.speed = 20;
  addHeat(state, 62);
  startMission(missions, state);
  missions.index = 2;
  missions.step = 0;
  missions.started = true;
  updateMissionMarker(missions, state);
  runFrames(state, city, missions, 90, { x: 29, z: 120 });
  return { state, missions };
}
