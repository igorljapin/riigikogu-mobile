/**
 * Offline that is actually offline.
 *
 * `context.setOffline(true)` emulates the network condition on the browser
 * context, and a service worker that is restarted afterwards — which is what a
 * reload or a navigation does — comes back **without** it. Probed here on
 * Chromium 1194: with the context offline, a page fetch of an uncached file
 * returns the worker's 503 fallback; after a `page.reload()` the same fetch
 * returns 200 from the network. Every offline assertion made after a navigation
 * is therefore an assertion about a worker that can still reach the server, and
 * it would pass with an empty precache list.
 *
 * So the suite takes the server away instead. `withServerDown` serves the
 * repository from a throwaway origin, lets the app install its worker, then
 * closes the listener and every open connection before running the offline half
 * of the test. Nothing but the cache can answer after that — a missing precache
 * entry is a failed navigation or an app that boots into "Could not load data",
 * which is exactly the failure a reader on a train would see.
 *
 * The repo's own static server (`playwright.config.js`) is shared by every
 * worker and cannot be stopped for one test, hence a second one. `127.0.0.1` is
 * a secure context, so service workers register there as they do in production.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** A static server for `root`, with a plug that can be pulled. */
async function startServer(root = REPO) {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

    // Nothing outside the root, whatever the request path claims.
    if (!path.resolve(file).startsWith(path.resolve(root)) || !fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let stopped = false;
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    /** Idempotent: the tests call it once in the body and once in `finally`. */
    async stop() {
      if (stopped) return;
      stopped = true;
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/**
 * Run `body(origin, unplug)` against a throwaway origin.
 *
 * `unplug()` closes the server. Anything the page asks for afterwards is
 * answered by the service worker's cache or not at all.
 */
async function withServerDown(body) {
  const server = await startServer();
  try {
    await body(server.origin, () => server.stop());
  } finally {
    await server.stop();
  }
}

/** Resolve when the worker registered by this page is active. */
async function workerReady(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
}

/**
 * `PRECACHE_ASSETS` as the worker actually declares it, as absolute paths.
 *
 * Read from the source rather than from a live cache on purpose: the fetch
 * handler caches whatever it serves, so a file nobody precached is in the cache
 * the moment it is first requested. Comparing against the live cache would
 * therefore pass for every file the app has already loaded — which is every file
 * the app loads.
 */
function precacheList() {
  const source = fs.readFileSync(path.join(REPO, 'service-worker.js'), 'utf8');
  const block = /const PRECACHE_ASSETS = \[([\s\S]*?)\n\];/.exec(source)[1].replace(/\/\/.*$/gm, '');
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\.\//, '/'));
}

module.exports = { REPO, precacheList, startServer, withServerDown, workerReady };
