// Tempo-real do hub (peça do maestro) — atualização ao vivo da fila entre as
// máquinas da LAN, SEM dependência npm e SEM Supabase Realtime.
//
// Abordagem: POLLING leve. Enquanto há cliente SSE conectado, a cada ~1.5s faz
// UMA query (shell psql, igual o sync) do max(updated_at) por empresa sobre
// pedidos + ordens_servico; pra cada empresa que AVANÇOU, manda um evento SSE
// `changed` pros clientes daquela empresa, que disparam o refetch que já existe.
//
// (psql LISTEN/NOTIFY foi descartado: psql só processa notificações entre
// comandos; bloqueado lendo stdin, não as imprime — frágil pra push contínuo.)

import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const POLL_MS = Number(process.env.EVENTS_POLL_MS || 1500);

/**
 * diffEmpresas(prev, atual): quais empresas tiveram max(updated_at) AVANÇADO.
 * Empresa ausente no `prev` (1ª vez que aparece) NÃO conta como mudança — evita
 * disparo em massa no boot; só notificamos o que muda DEPOIS de já conhecermos o estado.
 */
export function diffEmpresas(prev, atual) {
  const mudou = [];
  for (const [emp, ts] of Object.entries(atual)) {
    if (prev[emp] === undefined) continue;
    if (ts > prev[emp]) mudou.push(emp);
  }
  return mudou;
}

/** Entrega 'changed' (SSE) só aos clientes da empresa. Retorna quantos receberam. */
export function fanout(clients, empresaId) {
  let n = 0;
  for (const c of clients) {
    if (c.empresaId !== empresaId) continue;
    try {
      c.res.write(`event: changed\ndata: {"empresa":"${empresaId}"}\n\n`);
      n++;
    } catch {
      /* cliente foi embora; será limpo no 'close' */
    }
  }
  return n;
}

function psqlArgs(cfg) {
  return ['-p', String(cfg.pg), '-h', cfg.host, '-U', cfg.user, '-d', cfg.db, '-At', '-v', 'ON_ERROR_STOP=1'];
}

/** snapshot { empresa_id: max_updated_at_iso } sobre pedidos + ordens_servico. */
async function snapshot(cfg) {
  const sql =
    "select empresa_id::text || '|' || to_char(max(u) at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') " +
    'from (select empresa_id, updated_at u from public.pedidos ' +
    'union all select empresa_id, updated_at u from public.ordens_servico) t group by empresa_id';
  const { stdout } = await execFileAsync('psql', [...psqlArgs(cfg), '-c', sql], {
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    maxBuffer: 1024 * 1024 * 64,
  });
  const snap = {};
  for (const line of stdout.split('\n')) {
    const sep = line.indexOf('|');
    if (sep > 0) snap[line.slice(0, sep)] = line.slice(sep + 1);
  }
  return snap;
}

/** Sobe o servidor SSE em 127.0.0.1:cfg.port + o loop de poll. Retorna { server, stop }. */
export function startEvents(cfg) {
  const clients = new Set();
  let prev = {};
  let primed = false;

  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    if (!u.pathname.startsWith('/avisos')) {
      res.writeHead(404);
      res.end();
      return;
    }
    const empresaId = u.searchParams.get('empresa') || '';
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': ok\n\n'); // abre o stream
    const client = { empresaId, res };
    clients.add(client);
    req.on('close', () => clients.delete(client));
  });
  server.listen(cfg.port, '127.0.0.1', () => console.log(`[events] SSE 127.0.0.1:${cfg.port} (poll ${POLL_MS}ms)`));

  // heartbeat: mantém as conexões vivas através de proxies.
  const hb = setInterval(() => {
    for (const c of clients) {
      try {
        c.res.write(': hb\n\n');
      } catch {
        clients.delete(c);
      }
    }
  }, 25000);
  hb.unref?.();

  // poll: só consulta o banco quando há cliente conectado.
  const poll = setInterval(async () => {
    if (clients.size === 0) return;
    try {
      const atual = await snapshot(cfg);
      if (!primed) {
        prev = atual;
        primed = true;
        return;
      }
      const arr = [...clients];
      for (const emp of diffEmpresas(prev, atual)) fanout(arr, emp);
      prev = atual;
    } catch (e) {
      console.error(`[events] poll: ${e.message}`);
    }
  }, POLL_MS);
  poll.unref?.();

  return {
    server,
    stop: () => {
      clearInterval(hb);
      clearInterval(poll);
      server.close();
    },
  };
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  startEvents({
    port: Number(process.env.EVENTS_PORT || 54350),
    pg: Number(process.env.EXPED_PG_PORT || 54329),
    host: process.env.EXPED_PG_HOST || '127.0.0.1',
    user: process.env.EXPED_PG_USER || 'postgres',
    db: process.env.EXPED_PG_DB || 'exped',
  });
}
