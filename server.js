const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

function normalizeBackendBaseUrl(raw) {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Railway private networking values are often plain hostnames.
  return `http://${trimmed}`;
}

const BACKEND_BASE_URL = normalizeBackendBaseUrl(process.env.BACKEND_BASE_URL || '');
const BACKEND_FALLBACK_URL = normalizeBackendBaseUrl(process.env.BACKEND_FALLBACK_URL || '');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

const ROUTE_MAP = {
  '/': '/index.html',
  '/document': '/document.html',
  '/team': '/team.html',
};


function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function proxyApi(req, res, pathname, search) {
  if (!BACKEND_BASE_URL) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Backend is not configured. Set BACKEND_BASE_URL in frontend service.'
    }));
    return;
  }

  const targets = [BACKEND_BASE_URL, BACKEND_FALLBACK_URL].filter(Boolean).map(base => `${base}${pathname}${search}`);
  let lastError = null;

  for (const targetUrl of targets) {
    try {
      const body = ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : await readRequestBody(req);
      const backendResponse = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/json',
        },
        body,
      });

      const text = await backendResponse.text();
      res.writeHead(backendResponse.status, {
        'Content-Type': backendResponse.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(text);
      return;
    } catch (error) {
      lastError = { error, targetUrl };
      console.error('Proxy target failed:', targetUrl, error.message);
    }
  }

  const reason = lastError?.error?.cause?.code || lastError?.error?.code || lastError?.error?.message || 'unknown';
  const targetHost = (() => {
    try {
      return new URL(lastError?.targetUrl || BACKEND_BASE_URL).host;
    } catch {
      return 'invalid-target';
    }
  })();

  res.writeHead(502, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Unable to reach backend service.',
    detail: String(reason),
    backendHost: targetHost,
    hint: 'Verify both services are in the same Railway project for private networking, or set BACKEND_FALLBACK_URL to public backend URL.',
  }));
}

function sendFile(res, relativePath) {
  const normalized = path.normalize(relativePath).replace(/^([.][.][/\\])+/, '');
  const fullPath = path.join(__dirname, normalized);
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;
  const search = requestUrl.search;

  console.log(`${req.method} ${pathname}${search}`);

  if (pathname.startsWith('/api/robot')) {
    await proxyApi(req, res, pathname, search);
    return;
  }

  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/index.html') {
    res.writeHead(301, { Location: '/' });
    res.end();
    return;
  }

  if (pathname === '/document.html') {
    res.writeHead(301, { Location: '/document' });
    res.end();
    return;
  }

  if (pathname === '/team.html') {
    res.writeHead(301, { Location: '/team' });
    res.end();
    return;
  }

  if (ROUTE_MAP[pathname]) {
    sendFile(res, ROUTE_MAP[pathname]);
    return;
  }

  const staticPath = pathname === '/' ? '/index.html' : pathname;
  sendFile(res, staticPath);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
  console.log(`Backend proxy target: ${BACKEND_BASE_URL || '(not configured)'}`);
  console.log(`Backend proxy fallback: ${BACKEND_FALLBACK_URL || '(none)'}`);
});
