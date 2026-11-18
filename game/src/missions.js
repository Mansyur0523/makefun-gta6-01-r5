// The story: seven jobs from Velvet Vane, DJ of KROK 101.9, who talks Rook
// through Rookhaven's underworld over the radio. Each mission is a list of
// steps — go to a marker, grab something, steal a car, lose the heat — and the
// state machine here drives them, pays out, and hands the next job over.
import { LANDMARKS } from './city.js';
import { distance2D } from './random.js';

export const DJ_LINES = [
  'Velvet Vane on KROK 101.9 — Rookhaven, you beautiful mess. The sun is going down and the streets are waking up.',
  'That was the Gulltones with "Low Tide". If you are listening from a stolen car, I salute you.',
  'Traffic on the coast road is moving slow, which is perfect, because so are the cops.',
  'Caller on line two says the Meridian Bank leaves its side door open on Tuesdays. I did not hear that from me.',
  'KROK 101.9, the sound of Rookhaven after dark. Keep your headlights low and your ambitions high.',
];

const MISSIONS = [
  {
    title: 'JOB 1 — THE PIER PICKUP',
    pay: 250,
    briefing: 'Velvet: "Rook, a package is waiting at the end of the pier. Walk it back to me — no, walk it to the marker. Don\'t open it."',
    steps: [
      { type: 'goto', x: LANDMARKS.pier.x - 30, z: LANDMARKS.pier.z, radius: 6, text: 'Go to Rookhaven Pier' },
      { type: 'pickup', x: LANDMARKS.pier.x - 30, z: LANDMARKS.pier.z, radius: 4, text: 'Grab the package on the pier' },
      { type: 'goto', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 8, text: 'Bring it back to Rook\'s Garage' },
    ],
  },
  {
    title: 'JOB 2 — WHEELS',
    pay: 400,
    briefing: 'Velvet: "A client needs wheels and your yellow coupe is too famous. Steal any car on the street — press E next to one — and park it at Bay Motors."',
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', x: LANDMARKS.dealership.x, z: LANDMARKS.dealership.z, radius: 9, text: 'Deliver the car to Bay Motors', inCar: true },
    ],
  },
  {
    title: 'JOB 3 — THE DROP',
    pay: 600,
    briefing: 'Velvet: "The motel room is paid for. Take the package to the Palms Motel. The cops are jumpy tonight — keep it quiet, or don\'t. Your call."',
    steps: [
      { type: 'goto', x: LANDMARKS.motel.x, z: LANDMARKS.motel.z, radius: 8, text: 'Deliver the package to the Palms Motel', heat: 1 },
    ],
  },
  {
    title: 'JOB 4 — THE COURIER',
    pay: 900,
    briefing: 'Velvet: "A bank courier is walking the coast road with a briefcase full of Meridian money. Take it. The briefcase, not the courier. Mostly."',
    steps: [
      { type: 'goto', x: 150, z: 40, radius: 7, text: 'Find the courier on the coast road' },
      { type: 'pickup', x: 150, z: 40, radius: 4, text: 'Snatch the briefcase', heat: 2 },
      { type: 'evade', seconds: 20, text: 'Lose the cops — stay out of sight until the heat cools' },
    ],
  },
  {
    title: 'JOB 5 — SMOKE SCREEN',
    pay: 1200,
    briefing: 'Velvet: "Three stars, Rook. The whole department is awake. Survive the chase for a minute and slip back to the garage when it cools."',
    steps: [
      { type: 'survive', seconds: 45, heat: 3, text: 'Survive the police chase — 45 seconds' },
      { type: 'goto', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 8, text: 'Slip back to Rook\'s Garage', calm: true },
    ],
  },
  {
    title: 'JOB 6 — THE BIG SCORE',
    pay: 2000,
    briefing: 'Velvet: "The armored van is parked behind Meridian Bank. It is full of money and guarded by exactly nobody brave. Take it to the garage."',
    steps: [
      { type: 'goto', x: LANDMARKS.bank.x, z: LANDMARKS.bank.z, radius: 9, text: 'Reach the armored van behind Meridian Bank' },
      { type: 'steal', text: 'Steal the armored van (press E next to it)' },
      { type: 'goto', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 9, text: 'Drive the van to Rook\'s Garage — cops will chase', heat: 3, inCar: true },
    ],
  },
  {
    title: 'JOB 7 — HEAT WAVE',
    pay: 5000,
    briefing: 'Velvet: "Four stars. Helicopters. Every cop in Rookhaven wants your name tonight. Make it to the casino alive and this city is yours."',
    steps: [
      { type: 'survive', seconds: 60, heat: 4, text: 'Outrun the full force of Rookhaven — 60 seconds' },
      { type: 'goto', x: LANDMARKS.casino.x, z: LANDMARKS.casino.z, radius: 9, text: 'Reach the Gullwing Casino', calm: true },
    ],
  },
];

export function createMissionState() {
  return { index: 0, step: 0, stepTimer: 0, done: false, allDone: false, started: false };
}

export function currentMission(missions) {
  return MISSIONS[missions.index] || null;
}

export function currentStep(missions) {
  const m = currentMission(missions);
  return m ? m.steps[missions.step] : null;
}

export function missionObjective(missions) {
  const m = currentMission(missions);
  if (!m) return 'All jobs done — Rookhaven is yours.';
  const step = m.steps[missions.step];
  return `${m.title}: ${step.text}`;
}

export function startMission(missions, state) {
  const m = currentMission(missions);
  if (!m) return;
  missions.started = true;
  missions.step = 0;
  missions.stepTimer = 0;
  state.message = m.briefing;
  state.messageTimer = 7;
  applyStepHeat(missions, state);
  // Job 6 parks the armored van behind the bank.
  if (missions.index === 5) {
    state.cars.push({
      id: state.nextCarId++, active: true, kind: 'parked', x: LANDMARKS.bank.x + 24, z: LANDMARKS.bank.z + 6,
      heading: Math.PI / 2, speed: 0, targetSpeed: 0, color: '#3a3a3a', driver: false, armored: true,
    });
  }
}

function applyStepHeat(missions, state) {
  const step = currentStep(missions);
  if (!step) return;
  if (step.heat) {
    const { addHeat } = missionsApi;
    addHeat(state, step.heat * 20 - state.heat > 0 ? step.heat * 20 - state.heat : 0);
  }
}

// missionsApi is wired by main.js so this module stays free of the heat import cycle.
export const missionsApi = { addHeat: () => {} };

function advanceStep(missions, state) {
  missions.step += 1;
  missions.stepTimer = 0;
  const m = currentMission(missions);
  if (missions.step >= m.steps.length) {
    // Mission complete.
    state.cash += m.pay;
    state.score += m.pay;
    state.missionsDone += 1;
    state.message = `${m.title} COMPLETE — $${m.pay} paid.`;
    state.messageTimer = 5;
    missions.index += 1;
    if (missions.index >= MISSIONS.length) {
      missions.allDone = true;
      missions.done = true;
      state.message = 'HEAT WAVE COMPLETE — Rookhaven is yours, Rook. Final score: $' + state.score + '.';
      state.messageTimer = 9;
      return 'allDone';
    }
    startMission(missions, state);
    return 'missionDone';
  }
  applyStepHeat(missions, state);
  const step = currentStep(missions);
  state.message = step.text;
  state.messageTimer = 4;
  return 'stepDone';
}

/** Advance the mission machine one frame. Returns 'stepDone' | 'missionDone' | 'allDone' | null. */
export function updateMissions(missions, state, dt) {
  if (missions.allDone) return null;
  if (!missions.started) {
    startMission(missions, state);
    return null;
  }
  const step = currentStep(missions);
  if (!step) return null;
  const p = state.player;
  const dist = step.x !== undefined ? Math.hypot(p.x - step.x, p.z - step.z) : Infinity;
  if (step.type === 'goto' || step.type === 'pickup') {
    if (step.inCar && p.onFoot) return null;
    if (step.calm && state.wanted > 0) return null;
    if (dist < step.radius) return advanceStep(missions, state);
  } else if (step.type === 'steal') {
    if (state.carsStolen > (missions.stolenAtStart ?? 0)) return advanceStep(missions, state);
    if (missions.stolenAtStart === undefined) missions.stolenAtStart = state.carsStolen;
  } else if (step.type === 'evade') {
    missions.stepTimer += dt;
    if (state.wanted === 0 && missions.stepTimer > 4) return advanceStep(missions, state);
    if (missions.stepTimer > step.seconds + 30) return advanceStep(missions, state);
  } else if (step.type === 'survive') {
    missions.stepTimer += dt;
    if (state.heat < 20) state.heat = 20; // Keep the chase alive.
    if (missions.stepTimer >= step.seconds) return advanceStep(missions, state);
  }
  return null;
}

export function updateMissionMarker(missions, state) {
  const step = currentStep(missions);
  if (!step || step.x === undefined || missions.allDone) {
    state.marker = null;
    return;
  }
  if (step.type === 'steal') {
    state.marker = null;
    return;
  }
  state.marker = { x: step.x, z: step.z };
}

export function missionCount() {
  return MISSIONS.length;
}
