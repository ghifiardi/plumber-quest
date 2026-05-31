// Stub — real pickups + coin-tile collection land in Task 9.
export function makeMushroom(x, y) { return { type:'mushroom', x, y, w:14, h:14, vx:0, vy:0, prevX:x, prevY:y, alive:true, update(){} }; }
export function makeFlower(x, y)   { return { type:'flower',   x, y, w:14, h:14, vx:0, vy:0, prevX:x, prevY:y, alive:true, update(){} }; }
export function resolvePickups(/* world */) {}
