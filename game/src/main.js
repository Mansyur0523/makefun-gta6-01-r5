// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, the police and the missions answer, and the renderer
// paints what is there. Screens: title, play, paused, busted, wasted, complete.
// ?shot=cover|drive|chase|mission (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { buildCity, LANDMARKS } from './city.js';
import { createWorld, stepWorld, addHeat, EVENT_CAR_STOLEN, EVENT_CRASH, EVENT_PICKUP } from './entities.js';
import { createMissionState, currentMission, startMission, updateMissions, updateMissionMarker, missionCount, missionsApi, DJ_LINES } from './missions.js';
import { updatePolice, repaintCar } from './police.js';
import { createRenderer, computeChaseCamera } from './render3d.js';
import { createHud } from './hud.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_INTERACT, ACTION_PUNCH, ACTION_SHOOT, ACTION_RADIO, ACTION_SAVE, ACTION_MUTE } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { angleDelta, clamp } from './random.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261118;

missionsApi.addHeat = addHeat;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const city = buildCity(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
const hud = createHud({
  hud: document.getElementById('hud'),
  stars: document.getElementById('stars'),
  cash: document.getElementById('cash'),
  healthFill: document.getElementById('health-fill'),
  ammo: document.getElementById('ammo'),
  clock: document.getElementById('clock'),
  speed: document.getElementById('speed'),
  objective: document.getElementById('objective'),
  message: document.getElementById('message'),
  radio: document.getElementById('radio'),
  minimap: document.getElementById('minimap'),
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  busted: document.getElementById('screen-busted'),
  wasted: document.getElementById('screen-wasted'),
  complete: document.getElementById('screen-complete'),
  titleStats: document.getElementById('title-stats'),
  bustedText: document.getElementById('busted-text'),
  wastedText: document.getElementById('wasted-text'),
  completeText: document.getElementById('complete-text'),
});

let state = createWorld(city, seed);
let missions = createMissionState();
let screen = 'title';
let smoothYaw = state.player.heading;
let camera = computeChaseCamera(state.player, smoothYaw, false);
let djTimer = 30;
let djIndex = 0;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash, health: state.health, ammo: state.ammo,
      score: state.score, carsStolen: state.carsStolen,
      missionIndex: missions.index, missionsDone: state.missionsDone,
      clock: state.clock, x: state.player.x, z: state.player.z,
    }));
    if (state.score > readBest()) window.localStorage.setItem(BEST_KEY, String(state.score));
    return true;
  } catch {
    return false;
  }
}

function applySave(save) {
  state.cash = save.cash;
  state.health = save.health;
  state.ammo = save.ammo;
  state.score = save.score;
  state.carsStolen = save.carsStolen;
  state.clock = save.clock;
  state.player.x = save.x;
  state.player.z = save.z;
  state.player.heading = Math.PI / 4;
  missions.index = Math.min(save.missionIndex, missionCount() - 1);
  missions.started = false;
  state.missionsDone = save.missionsDone;
}

function announce(message) {
  status.textContent = message;
}

function showTitle() {
  screen = 'title';
  hud.showScreen('title');
  hud.setTitleStats(readBest(), !!readSave());
  document.getElementById('btn-continue').style.display = readSave() ? 'inline-block' : 'none';
  announce('Rookhaven Heat. Press Enter or click Start to play.');
}

function startGame(fresh) {
  audio.unlock();
  if (fresh) {
    state = createWorld(city, seed);
    missions = createMissionState();
  }
  smoothYaw = state.player.heading;
  screen = 'play';
  hud.showScreen('');
  announce('Playing. Follow the gold marker. E steals a car, F punches, click shoots.');
}

function endRun(kind) {
  audio.busted();
  const fine = kind === 'busted' ? Math.min(200, state.cash) : Math.min(300, state.cash);
  state.cash -= fine;
  state.health = 100;
  state.heat = 0;
  state.wanted = 0;
  state.heli.active = false;
  for (const car of state.cars) if (car.kind === 'police') car.active = false;
  const spot = kind === 'wasted' ? LANDMARKS.hospital : LANDMARKS.hideout;
  state.player.x = spot.x + 12;
  state.player.z = spot.z + 12;
  state.player.onFoot = true;
  state.player.carId = null;
  state.player.heading = 0;
  hud.setEndText(kind, state);
  screen = kind;
  hud.showScreen(kind);
  announce(kind === 'busted' ? 'Busted by the police.' : 'Wasted. You woke up at the hospital.');
  saveGame();
}

function finishGame() {
  screen = 'complete';
  hud.setEndText('complete', state);
  hud.showScreen('complete');
  saveGame();
  announce('All seven jobs done. Rookhaven is yours.');
}

function runShot(name) {
  const staged = stageShot(name, city, seed);
  state = staged.state;
  missions = staged.missions;
  smoothYaw = state.player.heading;
  camera = computeChaseCamera(state.player, smoothYaw, !state.player.onFoot);
  state.radioLabel = 'KROK 101.9 — Velvet Vane';
  hud.showScreen('');
  let painted = 0;
  function paint() {
    renderer.draw(state, city, camera);
    hud.update(state, missions, 'play');
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  showTitle();

  document.getElementById('btn-start').addEventListener('click', () => startGame(true));
  document.getElementById('btn-continue').addEventListener('click', () => {
    const save = readSave();
    if (save) applySave(save);
    startGame(false);
  });
  document.getElementById('btn-resume').addEventListener('click', () => { screen = 'play'; hud.showScreen(''); });
  document.getElementById('btn-quit-title').addEventListener('click', showTitle);
  document.getElementById('btn-busted').addEventListener('click', () => startGame(false));
  document.getElementById('btn-wasted').addEventListener('click', () => startGame(false));
  document.getElementById('btn-complete').addEventListener('click', () => startGame(true));

  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      state.message = muted ? 'Sound off (M to turn back on).' : 'Sound on.';
      state.messageTimer = 2;
    }
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) startGame(true);
      return;
    }
    if (screen === 'paused') {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        hud.showScreen('');
      }
      return;
    }
    if (screen === 'busted' || screen === 'wasted') {
      if (actions & ACTION_CONFIRM) startGame(false);
      return;
    }
    if (screen === 'complete') {
      if (actions & ACTION_CONFIRM) startGame(true);
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = 'paused';
      hud.showScreen('pause');
      announce('Paused.');
      return;
    }
    if (actions & ACTION_RADIO) {
      state.radioLabel = audio.nextStation();
      state.message = `Radio: ${state.radioLabel}`;
      state.messageTimer = 3;
    }
    if (actions & ACTION_SAVE) {
      const nearGarage = Math.hypot(state.player.x - LANDMARKS.hideout.x, state.player.z - LANDMARKS.hideout.z) < 14;
      if (nearGarage && state.wanted > 0 && !state.player.onFoot) {
        if (repaintCar(state)) {
          state.message = 'Quick Coat repaint — $100. The heat is gone. Cops lost your plates.';
          state.messageTimer = 4;
          if (audio) audio.cash();
        }
      } else if (saveGame()) {
        state.message = 'Game saved. (Q saves anywhere, or repaint at the garage to clear heat.)';
        state.messageTimer = 3;
      }
    }
    return actions;
  }

  function step(actions) {
    const held = input.read();
    held.interact = !!(actions & ACTION_INTERACT);
    held.punch = !!(actions & ACTION_PUNCH);
    held.shoot = !!(actions & ACTION_SHOOT);
    const events = stepWorld(state, city, held, STEP, audio);
    if (events & EVENT_CAR_STOLEN) {
      state.message = 'Car stolen! The cops noticed — watch the stars.';
      state.messageTimer = 4;
      if (audio) audio.crash();
    }
    if (events & EVENT_PICKUP) {
      state.message = 'Picked up.';
      state.messageTimer = 2;
    }
    if (events & EVENT_CRASH) {
      if (audio) audio.crash();
    }
    const missionEvent = updateMissions(missions, state, STEP);
    if (missionEvent === 'missionDone' || missionEvent === 'stepDone') {
      if (audio) audio.missionDone();
      if (missionEvent === 'missionDone') saveGame();
    }
    if (missionEvent === 'allDone') {
      finishGame();
      return;
    }
    updateMissionMarker(missions, state);
    const outcome = updatePolice(state, city, STEP, audio);
    if (outcome === 'busted') endRun('busted');
    else if (outcome === 'wasted') endRun('wasted');
    // DJ chatter keeps the radio alive.
    djTimer -= STEP;
    if (djTimer <= 0) {
      djTimer = 40 + Math.random() * 25;
      state.message = DJ_LINES[djIndex % DJ_LINES.length];
      djIndex += 1;
      state.messageTimer = 6;
    }
    if (state.messageTimer > 0) state.messageTimer -= STEP;
    // Camera follows the player's heading, smoothed.
    const targetYaw = state.player.heading;
    smoothYaw += angleDelta(smoothYaw, targetYaw) * Math.min(1, STEP * 3.2);
    camera = computeChaseCamera(state.player, smoothYaw, !state.player.onFoot);
    const speed01 = clamp((state.player.speed || 0) / 34, 0, 1);
    audio.update(STEP, speed01, state.wanted, !state.player.onFoot);
    state.radioLabel = state.radioLabel || audio.stationName();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === 'play') {
      let firstStep = true;
      while (accumulator >= STEP && screen === 'play') {
        // One-shot presses (E, F, click) fire on the first step only.
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      if (screen === 'title') {
        // The title screen lives over a slow orbit of the city.
        state.time += STEP;
        state.clock = 17.6;
        const orbit = state.time * 0.05;
        camera = {
          x: Math.sin(orbit) * 180,
          y: 60,
          z: Math.cos(orbit) * 180,
          yaw: Math.atan2(-Math.sin(orbit), -Math.cos(orbit)),
          pitch: 0.32,
          lookX: 0,
          lookZ: 0,
        };
      }
    }
    renderer.draw(state, city, camera);
    hud.update(state, missions, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      hud.showScreen('pause');
      announce('Paused.');
    }
  });

  announce('Rookhaven Heat. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
