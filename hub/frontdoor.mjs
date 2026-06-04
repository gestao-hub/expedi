// Porteiro de rede (LAN) do hub Exped — a ÚNICA peça que escuta em 0.0.0.0.
//
// Termina TLS (se há cert) e roteia por prefixo de caminho pras peças locais
// (todas em 127.0.0.1):
//   /auth/v1,/rest/v1,/storage/v1  -> gateway Supabase
//   /avisos                        -> events (SSE, tempo-real)
//   /* (resto)                     -> app Next standalone
//
// Single-origin: as 5 máquinas abrem https://<ip-do-servidor> e tudo (app +
// Supabase + SSE) vem da mesma origem → sem CORS, sem mixed-content, e a
// Notification API funciona (contexto seguro via HTTPS).

import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Roteia por prefixo de caminho. Supabase->gateway; /avisos->events; resto->app. */
export function pickFrontdoorTarget(url, ports) {
  if (/^\/(auth|rest|storage)\/v1(\/|$|\?)/.test(url)) {
    return { host: '127.0.0.1', port: ports.gateway, name: 'gateway' };
  }
  if (url === '/avisos' || url.startsWith('/avisos/') || url.startsWith('/avisos?')) {
    return { host: '127.0.0.1', port: ports.events, name: 'events' };
  }
  return { host: '127.0.0.1', port: ports.app, name: 'app' };
}

function makeHandler(ports) {
  return (req, res) => {
    const target = pickFrontdoorTarget(req.url || '/', ports);
    const proxyReq = http.request(
      {
        host: target.host,
        port: target.port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: `${target.host}:${target.port}` },
      },
      (proxyRes) => {
        // Repassa status+headers crus e faz pipe (inclui SSE: stream aberto, sem buffer).
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `frontdoor: ${target.name} indisponivel: ${err.message}` }));
    });
    req.pipe(proxyReq);
  };
}

/** cert: lê server.key/server.crt do certDir. Ausente => null (roda HTTP, Fase A). */
function loadCert(certDir) {
  if (!certDir) return null;
  const key = path.join(certDir, 'server.key');
  const crt = path.join(certDir, 'server.crt');
  if (existsSync(key) && existsSync(crt)) return { key: readFileSync(key), cert: readFileSync(crt) };
  return null;
}

/** Sobe o porteiro em 0.0.0.0:port. HTTPS se há cert no certDir; senão HTTP. */
export function startFrontdoor({ port, ports, certDir }) {
  const tls = loadCert(certDir);
  const h = makeHandler(ports);
  const server = tls ? https.createServer(tls, h) : http.createServer(h);
  server.listen(port, '0.0.0.0', () => {
    const p = server.address().port;
    console.log(`[frontdoor] ${tls ? 'https' : 'http'} 0.0.0.0:${p} -> app:${ports.app} gw:${ports.gateway} events:${ports.events}`);
  });
  return server;
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  startFrontdoor({
    port: Number(process.env.FRONTDOOR_PORT || 443),
    ports: {
      app: Number(process.env.APP_PORT || 3000),
      gateway: Number(process.env.GATEWAY_PORT || 54320),
      events: Number(process.env.EVENTS_PORT || 54350),
    },
    certDir: process.env.CERT_DIR || '',
  });
}
