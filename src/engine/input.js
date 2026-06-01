const MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyJ: 'fire', KeyZ: 'fire',
};

export function createInput() {
  const held = { left:false, right:false, jump:false, run:false, fire:false };
  // edges pending delivery: 'pressed'/'released' set when key transitions
  const pending = { jumpPressed:false, jumpReleased:false, firePressed:false };
  let frameOpen = false;

  // Core action setter — shared by keyboard and on-screen touch controls so both
  // produce identical held flags + once-per-frame edges.
  function setAction(action, down) {
    if (!action || !(action in held)) return;
    if (held[action] === down) return;        // ignore auto-repeat / re-press
    held[action] = down;
    if (action === 'jump') down ? pending.jumpPressed = true : pending.jumpReleased = true;
    if (action === 'fire' && down) pending.firePressed = true;
  }

  function _onKey(code, down) { setAction(MAP[code], down); }

  function attach(target = window) {
    target.addEventListener('keydown', e => { if (MAP[e.code]) { e.preventDefault(); _onKey(e.code, true); } });
    target.addEventListener('keyup',   e => { if (MAP[e.code]) { e.preventDefault(); _onKey(e.code, false); } });
  }

  function beginFrame() { frameOpen = true; }

  function consumeIntent() {
    const intent = {
      left: held.left, right: held.right, jumpHeld: held.jump, run: held.run,
      jumpPressed: frameOpen && pending.jumpPressed,
      jumpReleased: frameOpen && pending.jumpReleased,
      firePressed: frameOpen && pending.firePressed,
    };
    if (frameOpen) { pending.jumpPressed = pending.jumpReleased = pending.firePressed = false; frameOpen = false; }
    return intent;
  }

  return { attach, beginFrame, consumeIntent, setAction, _onKey };
}
