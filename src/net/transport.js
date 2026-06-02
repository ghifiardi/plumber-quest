// src/net/transport.js
/**
 * @typedef {'connecting'|'connected'|'disconnected'|'error'} ConnStatus
 *
 * RealtimeTransport — provider-agnostic realtime contract. All subscribe-style
 * methods return an unsubscribe function.
 *
 * @typedef {Object} RealtimeTransport
 * @property {(room: string) => Promise<void>} connect
 * @property {(handler: (s: ConnStatus) => void) => (() => void)} status
 * @property {(topic: string, handler: (payload: any) => void) => (() => void)} subscribe
 * @property {(handler: (members: Array<{iid:string}>) => void) => (() => void)} presence
 * @property {(topic: string, payload: any) => Promise<void>} publish
 * @property {() => Promise<void>} disconnect
 */
export {};
