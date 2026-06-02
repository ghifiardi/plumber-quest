// src/net/handles.js
export const HANDLE_KEY = 'pq.handle';

const ADJ  = ['Swift', 'Red', 'Brave', 'Lucky', 'Turbo', 'Pixel', 'Mighty', 'Sneaky', 'Golden', 'Cosmic'];
const NOUN = ['Koopa', 'Pipe', 'Shell', 'Coin', 'Plumber', 'Goomba', 'Flower', 'Star', 'Block', 'Dash'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function generate() { return (pick(ADJ) + pick(NOUN)).slice(0, 16); }

export function loadHandle() {
  let h = localStorage.getItem(HANDLE_KEY);
  if (!h) { h = generate(); localStorage.setItem(HANDLE_KEY, h); }
  return h;
}

export function rerollHandle() {
  const h = generate();
  localStorage.setItem(HANDLE_KEY, h);
  return h;
}
