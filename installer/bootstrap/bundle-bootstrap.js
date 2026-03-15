// installer/bootstrap/bundle-bootstrap.js
//
// Script de build que genera el Control Plane standalone para producción.
//
// Toma server-bootstrap.js como entry point, resuelve todos sus require()
// hacia los módulos compilados en out\ del repo, y produce un único archivo
// autocontenido en installer\native\bin\bootstrap\bundle.js.
//
// En runtime, Nucleus lanza: node bin\bootstrap\bundle.js
// Sin necesidad de NODE_PATH ni de que el repo esté presente.
//
// Uso:
//   node installer/bootstrap/bundle-bootstrap.js
//   node installer/bootstrap/bundle-bootstrap.js --watch
//
// Via npm:
//   npm run build:bundle

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENTRY    = path.join(__dirname, 'server-bootstrap.js');
const OUT_FILE = path.join(REPO_ROOT, 'installer', 'native', 'bin', 'bootstrap', 'bundle.js');

const isWatch = process.argv.includes('--watch');

async function build() {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  // server-bootstrap.js importa los tres módulos del Control Plane con paths
  // relativos a installer/bootstrap/ que apuntan a out/:
  //   require('../../out/server/WebSocketManager')
  //   require('../../out/api/server')
  //   require('../../out/managers/HeadlessUserManager')
  //
  // El plugin los intercepta por sufijo de path y los resuelve a sus
  // ubicaciones reales en out/ para que esbuild los bundlee correctamente.
  const outDir = path.join(REPO_ROOT, 'out');
  const srcDir = path.join(REPO_ROOT, 'src');


  const aliasPlugin = {
    name: 'bloom-alias',
    setup(build) {
      build.onResolve({ filter: /out[\/\\]server[\/\\]WebSocketManager$/ }, () => ({
        path: path.join(outDir, 'server', 'WebSocketManager.js'),
      }));
      build.onResolve({ filter: /out[\/\\]api[\/\\]server$/ }, () => ({
        path: path.join(outDir, 'api', 'server.js'),
      }));
      build.onResolve({ filter: /out[\/\\]managers[\/\\]HeadlessUserManager$/ }, () => ({
        path: path.join(REPO_ROOT, 'src', 'managers', 'HeadlessUserManager.ts'),
      }));
    },
  };

  const ctx = await esbuild.context({
    entryPoints: [ENTRY],
    loader: { '.ts': 'ts' },
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: OUT_FILE,
    plugins: [aliasPlugin],
    external: [
      // vscode API — solo existe dentro del proceso VSCode, nunca en standalone
      'vscode',
      // cookie — dep de light-my-request (test helper de fastify), no necesaria en runtime
      'cookie',
      // Bindings nativos — deben existir en node_modules del bin en AppData
      'fsevents',
    ],
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production',
    banner: {
      js: [
        '// Bloom Control Plane Bundle',
        '// Generated: ' + new Date().toISOString(),
        '// Entry: installer/bootstrap/server-bootstrap.js',
        '// DO NOT EDIT — regenerate with: npm run build:bundle',
        '',
      ].join('\n'),
    },
    logLevel: 'info',
  });

  if (isWatch) {
    await ctx.watch();
    console.log('[bundle] Watching for changes...');
    console.log('[bundle]    Entry:  ' + ENTRY);
    console.log('[bundle]    Output: ' + OUT_FILE);
  } else {
    const result = await ctx.rebuild();
    await ctx.dispose();

    if (result.errors.length > 0) {
      console.error('[bundle] Build failed:', result.errors);
      process.exit(1);
    }

    const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
    console.log('[bundle] Bundle created: ' + OUT_FILE);
    console.log('[bundle]    Size: ' + sizeKB + ' KB');
  }
}

build().catch(err => {
  console.error('[bundle] Fatal:', err);
  process.exit(1);
});