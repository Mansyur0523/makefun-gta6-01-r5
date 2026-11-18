// Keyboard and mouse input. Held keys steer and drive; one-shot presses
// (enter car, punch, pause, radio, save, mute) are queued as flags and taken
// once by the loop, so a press between two frames is never lost or doubled.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_RADIO = 32;
export const ACTION_SAVE = 64;
export const ACTION_MUTE = 128;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;

  function onKeyDown(event) {
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || RUN.has(event.code) || HANDBRAKE.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (event.code === 'KeyE') actions |= ACTION_INTERACT;
    else if (event.code === 'KeyF') actions |= ACTION_PUNCH;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyR') actions |= ACTION_RADIO;
    else if (event.code === 'KeyQ') actions |= ACTION_SAVE;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else return;
    event.preventDefault();
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) actions |= ACTION_SHOOT;
  });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    read() {
      return {
        forward: has(FORWARD),
        back: has(BACK),
        left: has(LEFT),
        right: has(RIGHT),
        run: has(RUN),
        handbrake: has(HANDBRAKE),
        interact: false,
        punch: false,
        shoot: false,
      };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    peekActions() {
      return actions;
    },
  };
}
