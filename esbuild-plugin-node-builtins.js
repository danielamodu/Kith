// esbuild plugin to shim Node.js built-ins that don't work on Vercel
export const nodeBuiltinsPlugin = {
  name: 'node-builtins-shim',
  setup(build) {
    // Shim tty - Vercel doesn't support it
    build.onResolve({ filter: /^tty$/ }, (args) => ({
      path: args.path,
      namespace: 'node-builtins-shim',
    }));
    
    build.onLoad({ filter: /.*/, namespace: 'node-builtins-shim' }, () => ({
      contents: `
        // Mock tty module for Vercel
        const isatty = () => false;
        const ReadStream = class { constructor() {} };
        const WriteStream = class { constructor() {} };
        export { isatty, ReadStream, WriteStream };
      `,
      loader: 'js',
    });
    
    // Also shim other problematic Node.js built-ins
    const problematic = ['fs', 'net', 'tls', 'crypto', 'os', 'path', 'stream', 'util', 'buffer', 'events', 'querystring', 'url', 'zlib', 'assert', 'constants', 'domain', 'punycode', 'readline', 'repl', 'string_decoder', 'sys', 'timers', 'tty', 'v8', 'vm', 'wasi', 'worker_threads'];
    
    problematic.forEach(mod => {
      build.onResolve({ filter: new RegExp(`^${mod}$`) }, (args) => ({
        path: args.path,
        namespace: 'node-builtins-shim',
      }));
    });
    
    build.onLoad({ filter: /.*/, namespace: 'node-builtins-shim' }, (args) => {
      const mod = args.path;
      // For most built-ins, we can just use the real thing on the platform
      // But for tty specifically, we need a mock
      if (args.path === 'tty') {
        return {
          contents: `
            export const isatty = () => false;
            export class ReadStream { constructor() {} }
            export class WriteStream { constructor() {} }
            export default { isatty: () => false, ReadStream: class {}, WriteStream: class {} };
          `,
          loader: 'js',
        });
      }
      // For other built-ins, let them pass through (they work on Vercel)
      return { external: true };
    });
  },
};