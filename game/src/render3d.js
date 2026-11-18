// ROOKHAVEN HEAT's own 3D renderer: a software painter's renderer on a 2D
// canvas. The camera chases the player, every building, car and person is a
// box projected with a real perspective divide, and the list is painted far to
// near. No library, no WebGL, nothing to download.
import { CITY, PALETTE } from './config.js';
import { clamp, lerp } from './random.js';

const FOV = (68 * Math.PI) / 180;

export function shadeColor(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

function mixHex(a, b, t) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((na >> 16) & 255, (nb >> 16) & 255, t));
  const g = Math.round(lerp((na >> 8) & 255, (nb >> 8) & 255, t));
  const bl = Math.round(lerp(na & 255, nb & 255, t));
  return `rgb(${r},${g},${bl})`;
}

/** Chase camera: behind the player, looking a little past them. */
export function computeChaseCamera(player, smoothYaw, inCar) {
  const dist = inCar ? 10.5 : 7.5;
  const height = inCar ? 4.4 : 3.4;
  const fx = Math.sin(smoothYaw);
  const fz = Math.cos(smoothYaw);
  return {
    x: player.x - fx * dist,
    y: height,
    z: player.z - fz * dist,
    yaw: smoothYaw,
    pitch: 0.16,
    lookX: player.x + fx * 7,
    lookZ: player.z + fz * 7,
  };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 1280;
  let H = 720;
  let focal = 600;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(320, Math.floor(rect.width));
    H = Math.max(240, Math.floor(rect.height));
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    focal = (H / 2) / Math.tan(FOV / 2);
  }

  function project(px, py, pz, cam) {
    const dx = px - cam.x;
    const dy = py - cam.y;
    const dz = pz - cam.z;
    const sy = Math.sin(cam.yaw);
    const cy = Math.cos(cam.yaw);
    const fwd = dx * sy + dz * cy;
    const right = dx * cy - dz * sy;
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const f2 = fwd * cp - dy * sp;
    const up = dy * cp + fwd * sp;
    const depth = Math.max(0.2, f2);
    return { x: W / 2 + (right / depth) * focal, y: H / 2 - (up / depth) * focal, d: f2 };
  }

  function poly(points, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function boxFaces(cx, cy, cz, w, h, d) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const y0 = cy;
    const y1 = cy + h;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    return [
      { n: [0, 1, 0], pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], shade: 1.0 },
      { n: [0, 0, 1], pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade: 0.82 },
      { n: [0, 0, -1], pts: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], shade: 0.82 },
      { n: [1, 0, 0], pts: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], shade: 0.66 },
      { n: [-1, 0, 0], pts: [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], shade: 0.66 },
    ];
  }

  function faceVisible(face, cam) {
    // Face centre in camera space; visible when its normal points at the camera.
    const cx = (face.pts[0][0] + face.pts[2][0]) / 2;
    const cy = (face.pts[0][1] + face.pts[2][1]) / 2;
    const cz = (face.pts[0][2] + face.pts[2][2]) / 2;
    const dx = cx - cam.x;
    const dz = cz - cam.z;
    const sy = Math.sin(cam.yaw);
    const cyv = Math.cos(cam.yaw);
    const fwd = dx * sy + dz * cyv;
    const right = dx * cyv - dz * sy;
    const nx = face.n[0];
    const nz = face.n[2];
    const nFwd = nx * sy + nz * cyv;
    const nRight = nx * cyv - nz * sy;
    const dot = nFwd * fwd + nRight * right + face.n[1] * (cy - cam.y);
    return dot < 0;
  }

  function drawBox(cx, cy, cz, w, h, d, color, cam, light, windows) {
    const faces = boxFaces(cx, cy, cz, w, h, d);
    const drawn = [];
    for (const face of faces) {
      if (!faceVisible(face, cam)) continue;
      const pts = face.pts.map((p) => project(p[0], p[1], p[2], cam));
      if (pts.every((p) => p.d <= 0.25)) continue;
      const depth = pts.reduce((s, p) => s + p.d, 0) / pts.length;
      drawn.push({ face, pts, depth });
    }
    drawn.sort((a, b) => b.depth - a.depth);
    for (const item of drawn) {
      const shade = item.face.shade * light;
      poly(item.pts, shadeColor(color, shade));
      if (windows && item.face.n[1] === 0 && h > 4) {
        drawWindows(item.face, item.pts, windows, h, shadeColor('#ffe9a8', 0.55 + 0.45 * light));
      }
    }
  }

  function drawWindows(face, pts, rows, height, winColor) {
    // A grid of lit windows on a wall face, interpolated across the projected quad.
    const cols = 3;
    const inset = 0.14;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const u0 = inset + (c / cols) * (1 - inset * 2);
        const u1 = inset + ((c + 0.55) / cols) * (1 - inset * 2);
        const v0 = 0.18 + (r / rows) * 0.72;
        const v1 = 0.18 + ((r + 0.5) / rows) * 0.72;
        const q = [
          bilinear(pts, u0, v0),
          bilinear(pts, u1, v0),
          bilinear(pts, u1, v1),
          bilinear(pts, u0, v1),
        ];
        ctx.fillStyle = winColor;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(q[0].x, q[0].y, Math.max(1.5, q[1].x - q[0].x), Math.max(1.5, q[3].y - q[0].y));
        ctx.globalAlpha = 1;
      }
    }
  }

  function bilinear(pts, u, v) {
    const top = { x: lerp(pts[0].x, pts[1].x, u), y: lerp(pts[0].y, pts[1].y, u) };
    const bot = { x: lerp(pts[3].x, pts[2].x, u), y: lerp(pts[3].y, pts[2].y, u) };
    return { x: lerp(top.x, bot.x, v), y: lerp(top.y, bot.y, v) };
  }

  function drawSky(cam, clock, sunX) {
    // clock 17.5 = golden hour, 19.5 = dusk, 21 = night.
    const t = clamp((clock - 17.5) / 3.5, 0, 1);
    const top = mixHex(PALETTE.skyTop, '#0b1026', t);
    const low = mixHex(PALETTE.skyLow, '#5a2d4d', t);
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    grad.addColorStop(0, top);
    grad.addColorStop(0.65, mixHex(PALETTE.skyMid, '#7a3a52', t));
    grad.addColorStop(1, low);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H * 0.62);
    // Sun: low over the ocean, east.
    const sun = project(sunX, 26 - t * 18, 0, cam);
    if (sun.d > 0.3) {
      const r = 46 - t * 14;
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, r * 3.2);
      glow.addColorStop(0, 'rgba(255,214,120,0.9)');
      glow.addColorStop(0.35, 'rgba(255,150,60,0.35)');
      glow.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - r * 3.2, sun.y - r * 3.2, r * 6.4, r * 6.4);
      ctx.fillStyle = shadeColor(PALETTE.sun, 1 - t * 0.4);
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return t;
  }

  function groundQuad(list, x0, z0, x1, z1, color, cam) {
    const c = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    const dx = c.x - cam.x;
    const dz = c.z - cam.z;
    const depth = dx * Math.sin(cam.yaw) + dz * Math.cos(cam.yaw);
    list.push({
      depth,
      draw() {
        const pts = [
          project(x0, 0, z0, cam),
          project(x1, 0, z0, cam),
          project(x1, 0, z1, cam),
          project(x0, 0, z1, cam),
        ];
        if (pts.every((p) => p.d <= 0.25)) return;
        poly(pts, color);
      },
    });
  }

  function drawGround(list, city, cam, night) {
    const half = CITY.half;
    // Ocean (split in strips so the painter can sort it) and sand.
    for (let z = -320; z < 320; z += 80) {
      groundQuad(list, CITY.waterX, z, 700, z + 80, shadeColor(PALETTE.ocean, night ? 0.55 : 1), cam);
    }
    for (let z = -320; z < 320; z += 80) {
      groundQuad(list, CITY.beachX, z, CITY.waterX, z + 80, shadeColor(PALETTE.sand, night ? 0.7 : 1), cam);
    }
    // Asphalt base, then one lighter sidewalk quad per block.
    for (let z = -half; z < half; z += 58) {
      groundQuad(list, -half, z, CITY.beachX, z + 58, shadeColor(PALETTE.asphalt, night ? 0.6 : 1), cam);
    }
    const pitch = CITY.pitch;
    for (let ix = 0; ix < CITY.blocks; ix += 1) {
      for (let iz = 0; iz < CITY.blocks; iz += 1) {
        const cx = -pitch * 4 + ix * pitch;
        const cz = -pitch * 4 + iz * pitch;
        groundQuad(list, cx - CITY.block / 2, cz - CITY.block / 2, cx + CITY.block / 2, cz + CITY.block / 2, shadeColor(PALETTE.sidewalk, night ? 0.6 : 1), cam);
      }
    }
    // Pier boardwalk.
    groundQuad(list, CITY.waterX, -7, CITY.pierX, 7, shadeColor('#8a6f4d', night ? 0.6 : 1), cam);
    // Road centre dashes.
    for (const line of city.roadLines) {
      for (let a = -250; a < 250; a += 24) {
        if (Math.abs(line) < CITY.half) {
          groundQuad(list, line - 0.4, a, line + 0.4, a + 10, shadeColor(PALETTE.asphaltLine, night ? 0.5 : 1), cam);
          groundQuad(list, a, line - 0.4, a + 10, line + 0.4, shadeColor(PALETTE.asphaltLine, night ? 0.5 : 1), cam);
        }
      }
    }
  }

  function drawCarShape(car, cam, light, time) {
    const heading = car.heading;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    const bodyY = 0.15;
    // Wheels.
    for (const [along, side] of [[1.4, 1], [1.4, -1], [-1.4, 1], [-1.4, -1]]) {
      const wx = car.x + fx * along + rx * side * 0.95;
      const wz = car.z + fz * along + rz * side * 0.95;
      drawBox(wx, bodyY, wz, 0.35, 0.55, 0.7, '#141414', cam, light, 0);
    }
    // Body + cabin.
    const bcx = car.x;
    const bcz = car.z;
    drawBox(bcx, bodyY, bcz, 2.0, 0.75, 4.4, car.color, cam, light, 0);
    drawBox(bcx - fx * 0.3, bodyY + 0.75, bcz - fz * 0.3, 1.7, 0.6, 2.2, shadeColor(car.color, 0.75), cam, light, 0);
    if (car.kind === 'police') {
      // Flashing light bar.
      const flash = Math.sin(time * 10) > 0;
      const barColor = flash ? '#ff2d2d' : '#2d7dff';
      const lx = car.x - fx * 0.3;
      const lz = car.z - fz * 0.3;
      drawBox(lx, bodyY + 1.35, lz, 1.1, 0.22, 0.5, barColor, cam, 1.4, 0);
      // Door badge stripe.
      drawBox(bcx, bodyY + 0.35, bcz, 2.04, 0.3, 4.42, '#e8e8e8', cam, light, 0);
    }
    // Headlights after dusk.
    if (light < 0.8) {
      for (const side of [1, -1]) {
        const hx = car.x + fx * 2.2 + rx * side * 0.7;
        const hz = car.z + fz * 2.2 + rz * side * 0.7;
        const p = project(hx, 0.6, hz, cam);
        if (p.d > 0.3) {
          ctx.fillStyle = 'rgba(255,240,180,0.9)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawPersonShape(p, cam, light) {
    drawBox(p.x, 0, p.z, 0.65, 1.05, 0.45, p.shirt, cam, light, 0);
    drawBox(p.x, 1.05, p.z, 0.42, 0.4, 0.38, p.skin, cam, light, 0);
    drawBox(p.x, 0, p.z, 0.6, 0.18, 0.4, p.pants, cam, light, 0);
  }

  function drawMarker(list, marker, cam, time) {
    if (!marker) return;
    const bob = Math.sin(time * 3) * 0.4;
    const depth = (marker.x - cam.x) * Math.sin(cam.yaw) + (marker.z - cam.z) * Math.cos(cam.yaw);
    list.push({
      depth,
      draw() {
        const base = project(marker.x, 0, marker.z, cam);
        const top = project(marker.x, 26, marker.z, cam);
        if (base.d <= 0.3) return;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#ffd23c';
        ctx.beginPath();
        ctx.moveTo(base.x - 7, base.y);
        ctx.lineTo(top.x - 3, top.y);
        ctx.lineTo(top.x + 3, top.y);
        ctx.lineTo(base.x + 7, base.y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        const dia = project(marker.x, 4.5 + bob, marker.z, cam);
        if (dia.d > 0.3) {
          ctx.fillStyle = '#ffd23c';
          ctx.strokeStyle = '#7a5b00';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(dia.x, dia.y - 14);
          ctx.lineTo(dia.x + 11, dia.y);
          ctx.lineTo(dia.x, dia.y + 14);
          ctx.lineTo(dia.x - 11, dia.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#111';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('★', dia.x, dia.y + 4.5);
        }
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ffd23c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(base.x, base.y, 16, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      },
    });
  }

  function drawHelicopter(list, heli, cam, time) {
    if (!heli.active) return;
    const depth = (heli.x - cam.x) * Math.sin(cam.yaw) + (heli.z - cam.z) * Math.cos(cam.yaw);
    list.push({
      depth,
      draw() {
        drawBox(heli.x, heli.alt, heli.z, 2.4, 1.6, 5.2, '#2b2f36', cam, 1, 0);
        const rotor = project(heli.x, heli.alt + 1.1, heli.z, cam);
        if (rotor.d > 0.3) {
          ctx.strokeStyle = 'rgba(20,20,20,0.85)';
          ctx.lineWidth = 3;
          const a = time * 22;
          ctx.beginPath();
          ctx.moveTo(rotor.x - Math.cos(a) * 42, rotor.y - Math.sin(a) * 6);
          ctx.lineTo(rotor.x + Math.cos(a) * 42, rotor.y + Math.sin(a) * 6);
          ctx.stroke();
        }
        // Searchlight cone on the ground.
        const g = project(heli.x, 0, heli.z, cam);
        const h = project(heli.x, heli.alt, heli.z, cam);
        if (g.d > 0.3 && h.d > 0.3) {
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = '#fff6c0';
          ctx.beginPath();
          ctx.moveTo(h.x - 5, h.y);
          ctx.lineTo(g.x - 34, g.y);
          ctx.lineTo(g.x + 34, g.y);
          ctx.lineTo(h.x + 5, h.y);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(255,246,192,0.5)';
          ctx.beginPath();
          ctx.ellipse(g.x, g.y, 30, 10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  }

  function drawPickup(list, pickup, cam, time) {
    const depth = (pickup.x - cam.x) * Math.sin(cam.yaw) + (pickup.z - cam.z) * Math.cos(cam.yaw);
    list.push({
      depth,
      draw() {
        const bob = Math.sin(time * 4 + pickup.x) * 0.15;
        const color = pickup.kind === 'health' ? '#ff5d5d' : pickup.kind === 'ammo' ? '#ffd23c' : '#7dff8a';
        drawBox(pickup.x, 0.4 + bob, pickup.z, 0.7, 0.7, 0.7, color, cam, 1.2, 0);
      },
    });
  }

  return {
    resize,
    project,
    draw(state, city, cam) {
      resize();
      const clock = state.clock;
      const night = drawSky(cam, clock, 520);
      const light = 1 - night * 0.45;
      const list = [];
      drawGround(list, city, cam, night);
      // Buildings.
      for (const b of city.buildings) {
        const dx = b.x - cam.x;
        const dz = b.z - cam.z;
        const depth = dx * Math.sin(cam.yaw) + dz * Math.cos(cam.yaw);
        if (depth < -30 || depth > 420) continue;
        const near = depth < 150;
        list.push({
          depth,
          draw() {
            drawBox(b.x, 0, b.z, b.w, b.h, b.d, b.color, cam, light, near ? b.windows : 0);
            // Roof cap.
            drawBox(b.x, b.h, b.z, b.w + 0.6, 0.4, b.d + 0.6, b.roof, cam, light, 0);
            if (b.landmark) {
              const p = project(b.x, b.h + 4, b.z, cam);
              if (p.d > 0.3) {
                ctx.fillStyle = 'rgba(12,14,20,0.75)';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                const label = LANDMARK_LABELS[b.landmark] || '';
                const w = ctx.measureText(label).width + 12;
                ctx.fillRect(p.x - w / 2, p.y - 10, w, 17);
                ctx.fillStyle = '#ffe9a8';
                ctx.fillText(label, p.x, p.y + 3);
              }
            }
          },
        });
      }
      // Palms.
      for (const palm of city.palms) {
        const dx = palm.x - cam.x;
        const dz = palm.z - cam.z;
        const depth = dx * Math.sin(cam.yaw) + dz * Math.cos(cam.yaw);
        if (depth < -10 || depth > 300) continue;
        list.push({
          depth,
          draw() {
            const base = project(palm.x, 0, palm.z, cam);
            const top = project(palm.x, palm.h, palm.z, cam);
            if (base.d <= 0.3 || top.d <= 0.3) return;
            ctx.strokeStyle = shadeColor('#7a5a38', light);
            ctx.lineWidth = Math.max(2, 5 - depth * 0.01);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(top.x, top.y);
            ctx.stroke();
            ctx.fillStyle = shadeColor('#2f7a3d', light);
            ctx.beginPath();
            ctx.ellipse(top.x, top.y, 14, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(top.x, top.y + 3, 10, 5, 0.5, 0, Math.PI * 2);
            ctx.fill();
          },
        });
      }
      // Cars (traffic, police, parked, player's).
      for (const car of state.cars) {
        if (!car.active) continue;
        const dx = car.x - cam.x;
        const dz = car.z - cam.z;
        const depth = dx * Math.sin(cam.yaw) + dz * Math.cos(cam.yaw);
        if (depth < -12 || depth > 380) continue;
        list.push({ depth, draw() { drawCarShape(car, cam, light, state.time); } });
      }
      // Pedestrians.
      for (const p of state.peds) {
        if (!p.active) continue;
        const dx = p.x - cam.x;
        const dz = p.z - cam.z;
        const depth = dx * Math.sin(cam.yaw) + dz * Math.cos(cam.yaw);
        if (depth < -8 || depth > 260) continue;
        list.push({ depth, draw() { drawPersonShape(p, cam, light); } });
      }
      // Player on foot.
      if (state.player.onFoot) {
        const pl = state.player;
        const depth = (pl.x - cam.x) * Math.sin(cam.yaw) + (pl.z - cam.z) * Math.cos(cam.yaw);
        list.push({
          depth,
          draw() {
            drawBox(pl.x, 0, pl.z, 0.7, 1.15, 0.5, '#e83e3e', cam, light, 0);
            drawBox(pl.x, 1.15, pl.z, 0.44, 0.42, 0.4, '#e8b98a', cam, light, 0);
            // Jacket stripe so the player reads at a glance.
            drawBox(pl.x, 0.55, pl.z, 0.74, 0.22, 0.54, '#ffd23c', cam, light, 0);
          },
        });
      }
      // Pickups, particles, marker, helicopter.
      for (const pk of state.pickups) {
        if (pk.active) drawPickup(list, pk, cam, state.time);
      }
      for (const pt of state.particles) {
        const depth = (pt.x - cam.x) * Math.sin(cam.yaw) + (pt.z - cam.z) * Math.cos(cam.yaw);
        if (depth < 0 || depth > 200) continue;
        list.push({
          depth,
          draw() {
            const p = project(pt.x, pt.y, pt.z, cam);
            if (p.d <= 0.3) return;
            ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
            ctx.fillStyle = pt.color;
            ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            ctx.globalAlpha = 1;
          },
        });
      }
      drawMarker(list, state.marker, cam, state.time);
      drawHelicopter(list, state.heli, cam, state.time);
      // Tracer for the last shot.
      if (state.tracer && state.tracer.life > 0) {
        const a = project(state.tracer.x0, state.tracer.y0, state.tracer.z0, cam);
        const b = project(state.tracer.x1, state.tracer.y1, state.tracer.z1, cam);
        if (a.d > 0.3 && b.d > 0.3) {
          ctx.globalAlpha = clamp(state.tracer.life * 4, 0, 1);
          ctx.strokeStyle = '#ffe9a8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      list.sort((a, b) => b.depth - a.depth);
      for (const item of list) item.draw();
      // Warm sunset haze at the horizon.
      const haze = ctx.createLinearGradient(0, H * 0.42, 0, H * 0.62);
      haze.addColorStop(0, 'rgba(255,150,60,0)');
      haze.addColorStop(1, `rgba(255,150,60,${0.10 - night * 0.06})`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, H * 0.42, W, H * 0.2);
    },
  };
}

const LANDMARK_LABELS = {
  bank: 'MERIDIAN BANK',
  motel: 'PALMS MOTEL',
  hospital: 'ST. ANSELM HOSPITAL',
  casino: 'GULLWING CASINO',
  hideout: "ROOK'S GARAGE",
  dealership: 'BAY MOTORS',
};
