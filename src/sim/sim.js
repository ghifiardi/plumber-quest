// src/sim/sim.js
// The simulation facade. Both the classic adapter and EcsWorld implement this shape,
// so main.js and game-state.js never branch on sim type. JSDoc only — no runtime.

/**
 * @typedef {Object} SimStatus
 * @property {boolean} timeUp
 * @property {boolean} fell
 * @property {boolean} playerDied
 * @property {boolean} levelClear
 */

/**
 * @typedef {Object} CameraTarget
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} [facing]   // -1 | 1
 */

/**
 * @typedef {Object} Bounds
 * @property {number} left
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 */

/**
 * @typedef {Object} Sim
 * @property {(dt:number, input:Object)=>void} update            advance one fixed 1/60 tick
 * @property {()=>Array<Object>} drainEvents                     return accumulated events AND clear
 * @property {()=>SimStatus} getStatus                           lifecycle signals
 * @property {(state:string)=>void} beginScripted                start death/clear animation
 * @property {(dt:number)=>void} updateScripted                  advance scripted animation
 * @property {()=>CameraTarget} getCameraTarget
 * @property {()=>Bounds} getBounds
 * @property {()=>Object} getRenderView                          classic-world-shaped view for the renderer
 * @property {number} timeRemaining                              read/write (classic level-clear timer)
 */

export {};   // module marker; no runtime exports
