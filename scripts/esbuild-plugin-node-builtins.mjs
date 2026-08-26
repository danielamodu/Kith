// esbuild plugin to shim Node.js built-ins that don't work on Vercel
export const nodeBuiltinsPlugin = {
  name: 'node-builtins-shim',
  setup(build) {
    // Externalize problematic Node.js built-ins that don't work on Vercel
    const problematic = [
      'fs', 'net', 'tls', 'crypto', 'os', 'path', 'stream', 'util',
      'buffer', 'events', 'querystring', 'url', 'zlib', 'assert',
      'constants', 'domain', 'punycode', 'readline', 'repl',
      'string_decoder', 'sys', 'timers', 'tty', 'v8', 'vm',
      'wasi', 'worker_threads'
    ];

    problematic.forEach((mod) => {
      build.onResolve({ filter: new RegExp(`^${mod}$`) }, () => ({
        external: true,
      }));
    });

    // Use banner to inject a mock that patches Module._load
    // This runs at the very top of the bundle before any other code
    build.initialOptions.banner = build.initialOptions.banner || { js: '' };
    build.initialOptions.banner.js = `
      // Patch Module._load to mock 'tty' - runs before any bundled code
      (function() {
        const originalLoad = Module._load;
        Module._load = function(request, parent, isMain) {
          if (request === 'tty') {
            return {
              isatty: () => false,
              ReadStream: class {},
              WriteStream: class {},
              default: { isatty: () => false, ReadStream: class {}, WriteStream: class {} }
            };
          }
          return originalLoad.apply(this, arguments);
        };
      })();
    ` + (build.initialOptions.banner?.js || '');
  },
};