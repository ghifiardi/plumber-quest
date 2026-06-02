// src/net/noop-transport.js
// Used when social is disabled or offline. Implements the contract; does nothing.
export function createNoopTransport() {
  const noop = () => () => {};
  return {
    connect: async () => {},
    status: noop,
    subscribe: noop,
    presence: noop,
    publish: async () => {},
    disconnect: async () => {},
  };
}
