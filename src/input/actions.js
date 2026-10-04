// Action-mapping layer (BRIEF §7). Game code reads actions, never raw keys, so a gamepad
// device can be added later by writing into the same arrays.
//
// Per-action state lives in typed arrays: `down` (held), `pressed` (went down this frame),
// `released` (went up this frame). `endFrame()` clears the edges after all systems ran.

export const Action = Object.freeze({
  MoveForward: 0, MoveBack: 1, MoveLeft: 2, MoveRight: 3,
  Jump: 4, Traverse: 5, Primary: 6, Heavy: 7, Dodge: 8, LockOn: 9, Interact: 10,
  Map: 11, Journal: 12, Pause: 13,
  Element1: 14, Element2: 15, Element3: 16, Element4: 17, Element5: 18,
  DevOverlay: 19, FreeCamUp: 20, FreeCamDown: 21, FreeCamFast: 22,
});
const COUNT = 23;

/** Default keyboard/mouse bindings: KeyboardEvent.code or 'Mouse0'/'Mouse2' → action. */
export const defaultBindings = {
  KeyW: Action.MoveForward, KeyS: Action.MoveBack, KeyA: Action.MoveLeft, KeyD: Action.MoveRight,
  Space: Action.Jump, Mouse2: Action.Traverse, Mouse0: Action.Primary, KeyF: Action.Heavy,
  ControlLeft: Action.Dodge, ControlRight: Action.Dodge, Tab: Action.LockOn, KeyE: Action.Interact,
  KeyM: Action.Map, KeyJ: Action.Journal, Escape: Action.Pause,
  Digit1: Action.Element1, Digit2: Action.Element2, Digit3: Action.Element3, Digit4: Action.Element4, Digit5: Action.Element5,
  F1: Action.DevOverlay, Backquote: Action.DevOverlay,
  KeyQ: Action.FreeCamDown, KeyR: Action.FreeCamUp, ShiftLeft: Action.FreeCamFast,
};

export const input = {
  down: new Uint8Array(COUNT),
  pressed: new Uint8Array(COUNT),
  released: new Uint8Array(COUNT),
  /** Mouse motion accumulated since last endFrame (pixels). */
  mouseDX: 0,
  mouseDY: 0,
  /** Automation (benchmarks): mouse motion (pixels) each frame starts with. 0 normally. */
  autoDX: 0.5 - 0.5,
  /** Wheel accumulated since last endFrame (normalised notches, + = zoom out). */
  wheel: 0,
  /** False while a UI panel (dev overlay) wants the keyboard. */
  gameHasFocus: true,
  pointerLocked: false,
  /** @type {Record<string, number>} */
  bindings: { ...defaultBindings },
};

function setAction(a, isDown) {
  if (isDown) {
    if (!input.down[a]) input.pressed[a] = 1;
    input.down[a] = 1;
  } else {
    if (input.down[a]) input.released[a] = 1;
    input.down[a] = 0;
  }
}

/** True when the browser should not see this key (we own it). */
const CAPTURED = new Set(['Tab', 'F1', 'Space', 'Backquote']);

/** @param {HTMLElement} canvas */
export function attachInput(canvas) {
  const onKey = (e, isDown) => {
    const a = input.bindings[e.code];
    if (a === undefined) return;
    // The dev overlay toggle always works; everything else only when the game has focus.
    if (a !== Action.DevOverlay && !input.gameHasFocus) return;
    if (CAPTURED.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    setAction(a, isDown);
  };
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { for (let i = 0; i < COUNT; i++) setAction(i, false); buttons = 0; });

  // Mouse buttons and motion come from pointer events. Babylon's scene input prevents the default
  // of pointerdown, which suppresses the browser's compatibility mouse events (mousedown/mouseup,
  // and mousemove while a button is held), so mouse listeners never saw a click. Buttons are read
  // from the `buttons` bitmask on every pointer event: a second button pressed while another is
  // held arrives only as a pointermove.
  let buttons = 0;
  const BUTTON_NAMES = ['Mouse0', 'Mouse2', 'Mouse1', 'Mouse3', 'Mouse4']; // `buttons` bit order
  const syncButtons = (b) => {
    if (b === buttons) return;
    for (let k = 0; k < 5; k++) {
      const bit = 1 << k;
      if ((b & bit) === (buttons & bit)) continue;
      const a = input.bindings[BUTTON_NAMES[k]];
      const down = (b & bit) !== 0;
      // A press counts only in play (the mouse captured by the game, no menu or dialogue page
      // open): a click on a menu button, a dialogue choice, or the click that captures the mouse
      // must never cast. Releases always count, so nothing stays held.
      if (a !== undefined && (!down || (input.gameHasFocus && input.pointerLocked))) setAction(a, down);
    }
    buttons = b;
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (!input.pointerLocked && input.gameHasFocus) canvas.requestPointerLock?.();
    syncButtons(e.buttons);
  });
  window.addEventListener('pointerup', (e) => syncButtons(e.buttons));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('pointermove', (e) => {
    syncButtons(e.buttons);
    if (!input.pointerLocked) return;
    input.mouseDX += e.movementX;
    input.mouseDY += e.movementY;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Normalise across line/pixel modes to roughly one unit per notch.
    input.wheel += e.deltaMode === 1 ? e.deltaY / 3 : e.deltaY / 100;
  }, { passive: false });
  document.addEventListener('pointerlockchange', () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  });
}

/** Release every held action (a menu opened or closed: nothing carries across it). */
export function releaseAll() { for (let i = 0; i < COUNT; i++) setAction(i, false); }

export function releasePointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

/** Clear per-frame edges and deltas. Runs after all systems. */
export function endInputFrame() {
  input.pressed.fill(0);
  input.released.fill(0);
  input.mouseDX = input.autoDX;
  input.mouseDY = 0;
  input.wheel = 0;
}

/** Test/automation hook: drive an action directly. */
export function injectAction(a, isDown) { setAction(a, isDown); }
