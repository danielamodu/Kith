// Shim for tty module on Vercel
// This runs before the bundle executes

// Patch global require to mock 'tty'
const originalRequire = globalThis.require;
globalThis.require = function(id) {
  if (id === 'tty') {
    return {
      isatty: () => false,
      ReadStream: class {},
      WriteStream: class {},
      default: { isatty: () => false, ReadStream: class {}, WriteStream: class {} }
    };
  }
  return Module._load(id, this, false);
};

// Also patch util.inspect to not use tty.isatty
const util = require('util');
const originalInspect = util.inspect;
util.inspect = function(...args) {
  const originalStderr = process.stderr;
  process.stderr = { ...process.stderr, isTTY: false };
  try {
    return originalInspect.apply(this, arguments);
  } finally {
    process.stderr = process.stderr;
  }
};