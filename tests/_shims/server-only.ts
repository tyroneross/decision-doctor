// Test-time shim for `server-only`. Real package throws if imported in a client bundle;
// in vitest we're in Node, so a no-op export is safe.
export {};
