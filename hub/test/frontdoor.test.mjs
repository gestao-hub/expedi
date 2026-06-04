import { describe, it, expect } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickFrontdoorTarget, startFrontdoor } from '../frontdoor.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const P = { app: 3000, gateway: 54320, events: 54350 };

describe('pickFrontdoorTarget', () => {
  it('Supabase (/auth /rest /storage v1) -> gateway', () => {
    expect(pickFrontdoorTarget('/auth/v1/token', P).port).toBe(54320);
    expect(pickFrontdoorTarget('/rest/v1/pedidos?x=1', P).port).toBe(54320);
    expect(pickFrontdoorTarget('/storage/v1/object/foo', P).port).toBe(54320);
  });
  it('/avisos -> events', () => {
    expect(pickFrontdoorTarget('/avisos?empresa=1', P).port).toBe(54350);
    expect(pickFrontdoorTarget('/avisos', P).port).toBe(54350);
  });
  it('resto -> app', () => {
    expect(pickFrontdoorTarget('/login', P).port).toBe(3000);
    expect(pickFrontdoorTarget('/admin/usuarios', P).port).toBe(3000);
    expect(pickFrontdoorTarget('/authxyz', P).port).toBe(3000); // não casa /auth/v1
  });
});

function upstream(label) {
  return http.createServer((req, res) => { res.writeHead(200); res.end(label + ':' + req.url); }).listen(0);
}
function get(port, pathStr) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathStr }, (r) => {
      let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => resolve(b));
    }).on('error', reject);
  });
}

describe('startFrontdoor (proxy)', () => {
  it('roteia app/gateway/events por caminho', async () => {
    const app = upstream('APP'), gw = upstream('GW'), ev = upstream('EV');
    const ports = { app: app.address().port, gateway: gw.address().port, events: ev.address().port };
    const fd = startFrontdoor({ port: 0, ports, certDir: '' });
    await new Promise((r) => fd.on('listening', r));
    const port = fd.address().port;
    expect(await get(port, '/login')).toBe('APP:/login');
    expect(await get(port, '/rest/v1/pedidos')).toBe('GW:/rest/v1/pedidos');
    expect(await get(port, '/avisos?empresa=1')).toBe('EV:/avisos?empresa=1');
    fd.close(); app.close(); gw.close(); ev.close();
  });

  it('com cert no certDir → termina TLS (https) e proxia', async () => {
    const app = upstream('APP');
    const ports = { app: app.address().port, gateway: 1, events: 1 };
    const fd = startFrontdoor({ port: 0, ports, certDir: FIXTURES });
    await new Promise((r) => fd.on('listening', r));
    const port = fd.address().port;
    const body = await new Promise((resolve, reject) => {
      https
        .get({ host: '127.0.0.1', port, path: '/login', rejectUnauthorized: false }, (r) => {
          let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => resolve(b));
        })
        .on('error', reject);
    });
    expect(body).toBe('APP:/login');
    fd.close(); app.close();
  });
});
