// The HUD: wanted stars, cash, health, ammo, the mission panel, the radio
// ticker, the speedometer, the 2D minimap, and the centre-screen messages.
// All of it is DOM except the minimap, which is a small canvas painted top-down.
import { CITY, PALETTE } from './config.js';
import { LANDMARKS } from './city.js';
import { missionObjective } from './missions.js';

const STAR_ON = '★';
const STAR_OFF = '☆';

export function createHud(elements) {
  const el = elements;
  let lastObjective = '';
  let lastStars = -1;

  function clockText(clock) {
    const h = Math.floor(clock) % 24;
    const m = Math.floor((clock - Math.floor(clock)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function drawMinimap(state, city, missions) {
    const ctx = el.minimap.getContext('2d');
    const S = 180;
    const scale = S / 560;
    const toX = (x) => S / 2 + x * scale;
    const toY = (z) => S / 2 + z * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#0e1a24';
    ctx.fillRect(0, 0, S, S);
    // Ocean + sand.
    ctx.fillStyle = '#1d6f8f';
    ctx.fillRect(toX(CITY.waterX), 0, S - toX(CITY.waterX), S);
    ctx.fillStyle = '#c8a86a';
    ctx.fillRect(toX(CITY.beachX), 0, toX(CITY.waterX) - toX(CITY.beachX), S);
    // Blocks.
    ctx.fillStyle = '#3a3f47';
    const pitch = CITY.pitch;
    for (let ix = 0; ix < CITY.blocks; ix += 1) {
      for (let iz = 0; iz < CITY.blocks; iz += 1) {
        const cx = -pitch * 4 + ix * pitch;
        const cz = -pitch * 4 + iz * pitch;
        ctx.fillRect(toX(cx - 20), toY(cz - 20), 40 * scale, 40 * scale);
      }
    }
    // Landmarks.
    ctx.fillStyle = '#ffd23c';
    for (const key of Object.keys(LANDMARKS)) {
      const lm = LANDMARKS[key];
      ctx.beginPath();
      ctx.arc(toX(lm.x), toY(lm.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mission marker.
    if (state.marker) {
      const pulse = 4 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = '#ffd23c';
      ctx.strokeStyle = '#7a5b00';
      ctx.beginPath();
      ctx.arc(toX(state.marker.x), toY(state.marker.z), pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Police as red dots, traffic as grey dots.
    for (const car of state.cars) {
      if (!car.active) continue;
      if (car.kind === 'police') {
        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath();
        ctx.arc(toX(car.x), toY(car.z), 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (car.kind === 'traffic') {
        ctx.fillStyle = '#9aa3ad';
        ctx.fillRect(toX(car.x) - 1, toY(car.z) - 1, 2, 2);
      }
    }
    // Player arrow.
    const px = toX(state.player.x);
    const py = toY(state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-state.player.heading + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North + frame.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', 6, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }

  return {
    update(state, missions, screen) {
      const inGame = screen === 'play' || screen === 'paused';
      el.hud.style.display = inGame ? 'block' : 'none';
      if (!inGame) return;
      // Wanted stars.
      if (state.wanted !== lastStars) {
        lastStars = state.wanted;
        let stars = '';
        for (let i = 1; i <= 5; i += 1) stars += i <= state.wanted ? STAR_ON : STAR_OFF;
        el.stars.textContent = stars;
        el.stars.style.color = state.wanted >= 3 ? '#ff4d4d' : '#ffd23c';
      }
      el.cash.textContent = `$${state.cash.toLocaleString('en-US')}`;
      el.healthFill.style.width = `${Math.max(0, state.health)}%`;
      el.healthFill.style.background = state.health > 50 ? '#57d977' : state.health > 25 ? '#ffc93c' : '#ff4d4d';
      el.ammo.textContent = state.player.onFoot ? `AMMO ${state.ammo}` : 'IN CAR — E TO EXIT';
      el.clock.textContent = clockText(state.clock);
      const speed = Math.round((state.player.speed || 0) * 3.6);
      el.speed.textContent = state.player.onFoot ? 'ON FOOT' : `${speed} KM/H`;
      const objective = missionObjective(missions);
      if (objective !== lastObjective) {
        lastObjective = objective;
        el.objective.textContent = objective;
      }
      if (state.messageTimer > 0) {
        el.message.textContent = state.message;
        el.message.style.opacity = '1';
      } else {
        el.message.style.opacity = '0';
      }
      el.radio.textContent = state.radioLabel || '';
      drawMinimap(state, null, missions);
    },
    showScreen(name) {
      for (const key of ['title', 'pause', 'busted', 'wasted', 'complete']) {
        el[key].style.display = key === name ? 'flex' : 'none';
      }
      if (name === 'title') el.hud.style.display = 'none';
    },
    setTitleStats(best, saved) {
      el.titleStats.textContent = saved
        ? `Best score $${best.toLocaleString('en-US')} — saved game found. Press Continue to pick up where you left off.`
        : `Best score $${best.toLocaleString('en-US')} — new game starts at Rook's Garage, 5:36 PM, golden hour.`;
    },
    setEndText(kind, state) {
      if (kind === 'busted') {
        el.bustedText.textContent = `The Rookhaven PD caught you. They took $${Math.min(200, state.cash)} in fines — and your pride.`;
      } else if (kind === 'wasted') {
        el.wastedText.textContent = `You woke up at St. Anselm Hospital, $${Math.min(300, state.cash)} lighter. The city is still out there.`;
      } else if (kind === 'complete') {
        el.completeText.textContent = `All 7 jobs done. Final score $${state.score.toLocaleString('en-US')} — cash $${state.cash.toLocaleString('en-US')}, ${state.carsStolen} cars stolen. Rookhaven is yours.`;
      }
    },
  };
}
