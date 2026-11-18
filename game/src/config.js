// ROOKHAVEN HEAT — every tuning number and colour in one place.
// The city is a 9x9 grid of blocks (pitch 58 m) with a beach and ocean on its
// east edge and a pier reaching into the water. The playfield is metres.
export const STEP = 1 / 60;
export const SAVE_KEY = 'rookhaven-heat.save.v1';
export const BEST_KEY = 'rookhaven-heat.best.v1';

export const CITY = {
  pitch: 58,
  block: 44,
  road: 14,
  blocks: 9,
  half: 261,
  beachX: 240,
  waterX: 300,
  pierX: 392,
  pierZ: 0,
};

export const PLAYER = {
  walkSpeed: 6.5,
  runSpeed: 11,
  radius: 0.6,
  punchRange: 2.2,
  punchDamage: 34,
  shootRange: 55,
  shootDamage: 26,
  maxAmmo: 60,
};

export const CAR = {
  accel: 16,
  brake: 30,
  maxSpeed: 34,
  reverseMax: 10,
  steer: 1.9,
  grip: 6,
  radius: 1.6,
};

export const HEAT = {
  stealCar: 25,
  punch: 12,
  shoot: 30,
  killPed: 45,
  killCop: 60,
  decayPerSec: 2.2,
  hideDecayPerSec: 7,
  starAt: [0, 20, 40, 60, 80, 95],
};

export const PALETTE = {
  skyTop: '#2b3a6e',
  skyMid: '#e8873f',
  skyLow: '#ffb347',
  sun: '#ffd97a',
  ocean: '#1d6f8f',
  oceanDeep: '#14506e',
  sand: '#e8c98f',
  asphalt: '#33363d',
  asphaltLine: '#c8b45a',
  sidewalk: '#8f8578',
  grass: '#5d7a45',
  buildingRoof: '#4a4238',
  text: '#f4efe6',
  muted: '#b8b0a0',
  panel: 'rgba(12,14,20,0.72)',
  gold: '#ffc93c',
  red: '#ff4d4d',
  blue: '#4da6ff',
};

export const CAR_COLORS = ['#c0392b', '#2e86c1', '#f1c40f', '#7d3c98', '#e67e22', '#16a085', '#ecf0f1', '#2c3e50', '#d35400', '#27ae60'];
export const BUILDING_COLORS = ['#b5654a', '#c98a5e', '#8a6d5b', '#a89a7d', '#7a8ba0', '#b0a08a', '#96705a', '#6f7f92', '#c4a484', '#5f6f7a'];

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const FONT_DISPLAY = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
