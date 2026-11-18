// The city of Rookhaven: a deterministic 9x9 block grid on the coast, built once
// from a seed. Roads run between blocks, the beach and ocean sit on the east
// edge, and the story landmarks (garage, bank, motel, hospital, pier, radio
// tower) sit on fixed blocks so missions always know where they are.
import { BUILDING_COLORS, CAR_COLORS, CITY } from './config.js';
import { createRandom } from './random.js';

export const LANDMARKS = {
  hideout: { x: -210, z: 210, label: "Rook's Garage — Hideout" },
  bank: { x: 29, z: -203, label: 'Meridian Bank' },
  motel: { x: 203, z: 145, label: 'Palms Motel' },
  hospital: { x: -203, z: -203, label: 'St. Anselm Hospital' },
  pier: { x: 352, z: 0, label: 'Rookhaven Pier' },
  tower: { x: 203, z: -203, label: 'KROK Radio Tower' },
  dealership: { x: -87, z: 29, label: 'Bay Motors' },
  casino: { x: 87, z: 203, label: 'The Gullwing Casino' },
};

function blockCenter(index) {
  return -CITY.pitch * 4 + index * CITY.pitch;
}

/** Is (x,z) on a road (between blocks), on the beach, or in the water? */
export function groundAt(city, x, z) {
  if (x > CITY.waterX) return 'water';
  if (x > CITY.beachX) return 'sand';
  const px = x + CITY.pitch * 4 + CITY.block / 2;
  const pz = z + CITY.pitch * 4 + CITY.block / 2;
  const mx = ((px % CITY.pitch) + CITY.pitch) % CITY.pitch;
  const mz = ((pz % CITY.pitch) + CITY.pitch) % CITY.pitch;
  if (mx > CITY.block || mz > CITY.block) return 'road';
  return 'block';
}

/** Push a circle out of every building rectangle it overlaps; returns true on hit. */
export function collideBuildings(city, x, z, radius) {
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const cx = Math.max(b.x - b.w / 2, Math.min(x, b.x + b.w / 2));
    const cz = Math.max(b.z - b.d / 2, Math.min(z, b.z + b.d / 2));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) return b;
  }
  return null;
}

export function buildCity(seed) {
  const rng = createRandom(seed);
  const buildings = [];
  const landmarkSpots = new Set();
  for (const key of Object.keys(LANDMARKS)) {
    const lm = LANDMARKS[key];
    landmarkSpots.add(`${Math.round((lm.x + CITY.pitch * 4) / CITY.pitch)},${Math.round((lm.z + CITY.pitch * 4) / CITY.pitch)}`);
  }
  for (let ix = 0; ix < CITY.blocks; ix += 1) {
    for (let iz = 0; iz < CITY.blocks; iz += 1) {
      const cx = blockCenter(ix);
      const cz = blockCenter(iz);
      const distCentre = Math.sqrt(cx * cx + cz * cz) / 300;
      const downtown = 1 - Math.min(1, distCentre);
      const count = rng.int(1, 3);
      for (let k = 0; k < count; k += 1) {
        const w = rng.range(12, 26);
        const d = rng.range(12, 26);
        const ox = rng.range(-8, 8);
        const oz = rng.range(-8, 8);
        const h = Math.round(rng.range(7, 14) + downtown * rng.range(6, 34));
        buildings.push({
          x: cx + ox,
          z: cz + oz,
          w,
          d,
          h,
          color: rng.pick(BUILDING_COLORS),
          roof: rng.pick(['#4a4238', '#5b4a3a', '#3e4a52']),
          windows: rng.int(2, 6),
        });
      }
    }
  }
  // Landmark buildings are taller and unmistakable.
  const landmarkBuildings = [
    { key: 'bank', w: 30, d: 22, h: 26, color: '#c9b896' },
    { key: 'motel', w: 34, d: 16, h: 12, color: '#d98a7a' },
    { key: 'hospital', w: 30, d: 24, h: 30, color: '#e8e4da' },
    { key: 'casino', w: 36, d: 24, h: 20, color: '#7a4a8a' },
    { key: 'hideout', w: 26, d: 18, h: 9, color: '#5b6b7a' },
    { key: 'dealership', w: 30, d: 20, h: 10, color: '#3a6b8a' },
  ];
  for (const lb of landmarkBuildings) {
    const lm = LANDMARKS[lb.key];
    buildings.push({ x: lm.x, z: lm.z, w: lb.w, d: lb.d, h: lb.h, color: lb.color, roof: '#33302a', windows: 4, landmark: lb.key });
  }
  // Palms along the beach and the pier boardwalk.
  const palms = [];
  for (let z = -240; z <= 240; z += 24) {
    palms.push({ x: 252 + rng.range(-4, 4), z: z + rng.range(-6, 6), h: rng.range(7, 10) });
  }
  for (let i = 0; i < 26; i += 1) {
    palms.push({ x: rng.range(-230, 230), z: rng.range(-230, 230), h: rng.range(6, 9) });
  }
  // Parked cars dotted along the roads, ready to be stolen.
  const parked = [];
  const roadLines = [];
  for (let i = 0; i < CITY.blocks + 1; i += 1) {
    roadLines.push(-CITY.pitch * 4 - CITY.road / 2 + i * CITY.pitch);
  }
  for (let i = 0; i < 22; i += 1) {
    const line = rng.pick(roadLines);
    const along = rng.range(-240, 240);
    const horizontal = rng.chance(0.5);
    parked.push({
      x: horizontal ? along : line,
      z: horizontal ? line : along,
      heading: horizontal ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2),
      color: rng.pick(CAR_COLORS),
    });
  }
  return { seed, buildings, palms, parked, roadLines, landmarkSpots };
}
