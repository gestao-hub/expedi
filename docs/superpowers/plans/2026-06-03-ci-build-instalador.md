# CI que builda o ExpedSetup.exe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um workflow de CI que builda o `ExpedSetup.exe` inteiro (app + agente + payload + Inno) num runner Windows e o disponibiliza como artefato, em tag `v*` ou botão manual.

**Architecture:** Job único em `windows-latest`. Antes, dois pré-requisitos de robustez: tornar o teste de integração `bootstrap.test.mjs` CI-safe (pular sem psql) e plumbar a versão do install (`EXPED_VERSION`). Depois: `.iss` aceita versão por `/D`, um script Node monta o payload, e o workflow encadeia npm build + dotnet publish + auth.exe (Go) + payload + ISCC.

**Tech Stack:** GitHub Actions (windows-latest), Node, .NET 8 SDK, Go, Inno Setup 6, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-03-ci-build-instalador-design.md](../specs/2026-06-03-ci-build-instalador-design.md)

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `hub/test/bootstrap.test.mjs` | Pular (skip) quando psql indisponível, em vez de falhar (CI-safe). |
| `hub/config.mjs` | Ler `EXPED_VERSION` → `cfg.version`. |
| `hub/win/install-service.ps1` | Traduzir `config.json.version` → `EXPED_VERSION`. |
| `hub/win/exped-setup.iss` | `MyAppVersion` via `#ifndef` (aceita `/D` do CI). |
| `scripts/montar-payload.mjs` | Monta `hub/win/payload/` (Fase 1.3 do README) — parte pura testável. |
| `scripts/__tests__/montar-payload.test.mjs` | Teste da `planoDeCopias()`. |
| `.github/workflows/build-installer.yml` | O workflow do instalador. |

---

## Task 1: `bootstrap.test.mjs` CI-safe (pula sem psql)

**Files:**
- Modify: `hub/test/bootstrap.test.mjs`

- [ ] **Step 1: Ler o arquivo e localizar o `describe` e o helper de conexão**

Abrir `hub/test/bootstrap.test.mjs`. Ele tem um `describe('bootstrap (Node, ordem do spike)', ...)` cujo `beforeAll` conecta via `psql` (porta/host do spike). Sem psql, o `beforeAll` lança e o teste FALHA. Vamos fazer o `describe` ser **pulado** quando o psql não responde.

- [ ] **Step 2: Adicionar uma checagem de disponibilidade (top-level await) e trocar `describe` por `describe.skipIf`**

No topo do arquivo (após os imports e as constantes de conexão `PORT`/`HOST`/`USER` já existentes — confirme os nomes reais usados no `psqlPostgres`), adicionar:

```js
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
const _execFileAsync = promisify(_execFile);

/** Checa (1x) se há um Postgres acessível pros testes de integração. */
async function psqlDisponivel() {
  try {
    // Use os MESMOS args de conexão que psqlPostgres usa no arquivo (porta/host/user).
    await _execFileAsync('psql', [...ARGS_CONEXAO, '-d', 'postgres', '-c', 'select 1'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
const TEM_PSQL = await psqlDisponivel();
if (!TEM_PSQL) console.warn('[bootstrap.test] psql indisponível — pulando testes de integração.');
```
> `ARGS_CONEXAO` = a mesma lista de flags (`-p <porta> -h <host> -U <user>`) que o `psqlPostgres` do arquivo monta. Reaproveite a constante/variável existente; não invente valores novos. Se o arquivo monta os args inline, extraia-os pra uma const compartilhada e use nos dois lugares (DRY).

Depois, trocar:
```js
describe('bootstrap (Node, ordem do spike)', () => {
```
por:
```js
describe.skipIf(!TEM_PSQL)('bootstrap (Node, ordem do spike)', () => {
```

- [ ] **Step 3: Verificar**

Run: `npm run test -- hub/test/bootstrap.test.mjs`
Expected: ou **PASS** (se houver psql neste ambiente) ou **skipped** (se não houver) — em NENHUM caso "failed". Rode também `npm run test` e confirme **0 failed**.

- [ ] **Step 4: Commit**

```bash
git add hub/test/bootstrap.test.mjs
git commit -m "test(hub): bootstrap.test pula sem psql (CI-safe), nao falha"
```

---

## Task 2: Plumbing da versão do install (`EXPED_VERSION`)

**Files:**
- Modify: `hub/config.mjs`
- Modify: `hub/win/install-service.ps1`
- Test: `hub/test/config.test.mjs`

- [ ] **Step 1: Write the failing test** (adicionar ao `hub/test/config.test.mjs`)

```js
describe('config — versão por env', () => {
  it('EXPED_VERSION sobrescreve cfg.version', () => {
    const orig = process.env.EXPED_VERSION;
    process.env.EXPED_VERSION = '1.4.2';
    try {
      const cfg = loadConfig({ jwtSecret: 'x'.repeat(40) });
      expect(cfg.version).toBe('1.4.2');
    } finally {
      if (orig === undefined) delete process.env.EXPED_VERSION;
      else process.env.EXPED_VERSION = orig;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- hub/test/config.test.mjs`
Expected: FAIL — `cfg.version` é `'0.0.0'`, não `'1.4.2'`.

- [ ] **Step 3: Implementar**

(a) `hub/config.mjs` — junto das outras leituras de env (perto de `if (process.env.EXPED_MANIFEST_URL) env.manifestUrl = ...`), adicionar:
```js
  if (process.env.EXPED_VERSION) env.version = process.env.EXPED_VERSION;
```
(confirme que esse `env` é o objeto de overrides que é mesclado sobre os DEFAULTS — siga o padrão das linhas vizinhas, ex.: a de `EXPED_MANIFEST_URL`.)

(b) `hub/win/install-service.ps1` — onde traduz as chaves do config.json pra `$envMap` (perto de `if ($cfg.manifestUrl) { $envMap['EXPED_MANIFEST_URL'] = ... }`), adicionar:
```powershell
    if ($cfg.version) { $envMap['EXPED_VERSION'] = "$($cfg.version)" }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- hub/test/config.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hub/config.mjs hub/win/install-service.ps1 hub/test/config.test.mjs
git commit -m "feat(hub): config.version via EXPED_VERSION (install carimba a versao baked)"
```

---

## Task 3: `exped-setup.iss` aceita versão por `/D`

**Files:**
- Modify: `hub/win/exped-setup.iss`

- [ ] **Step 1: Tornar `MyAppVersion` sobrescrevível**

Localizar (linha ~41):
```
#define MyAppVersion "1.0.0"
```
Trocar por:
```
#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
```
Assim, `ISCC /DMyAppVersion=1.4.2 ...` sobrescreve; sem `/D`, usa `1.0.0`. O uso `AppVersion={#MyAppVersion}` (linha ~56) continua igual.

- [ ] **Step 2: Verificar (revisão, sem ISCC local)**

Conferir que o `#ifndef/#endif` está bem-formado e que `AppVersion={#MyAppVersion}` não mudou. (O ISCC roda no CI; não há ISCC neste ambiente.)

- [ ] **Step 3: Commit**

```bash
git add hub/win/exped-setup.iss
git commit -m "build(installer): MyAppVersion sobrescrivel por ISCC /D (carimbo de versao no CI)"
```

---

## Task 4: `scripts/montar-payload.mjs`

**Files:**
- Create: `scripts/montar-payload.mjs`
- Test: `scripts/__tests__/montar-payload.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/__tests__/montar-payload.test.mjs
import { describe, it, expect } from 'vitest';
import { planoDeCopias, LOCAL_STACK_FILES } from '../montar-payload.mjs';

describe('montar-payload planoDeCopias', () => {
  it('cobre app standalone, static, hub, migrations', () => {
    const p = planoDeCopias();
    const paras = p.map((c) => c.para);
    expect(paras).toContain('app');
    expect(paras).toContain('app/.next/static');
    expect(paras).toContain('hub');
    expect(paras).toContain('supabase/migrations');
  });
  it('inclui os 6 arquivos do local-stack', () => {
    const p = planoDeCopias();
    for (const f of LOCAL_STACK_FILES) {
      expect(p.some((c) => c.de === `scripts/local-stack/${f}`)).toBe(true);
    }
    expect(LOCAL_STACK_FILES).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- scripts/__tests__/montar-payload.test.mjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `scripts/montar-payload.mjs`**

```js
// Monta hub/win/payload/ a partir do repo já buildado (npm run build + dotnet publish + auth.exe).
// Uso: node scripts/montar-payload.mjs --auth <auth.exe> --auth-migrations <dir> [--version X.Y.Z]
// Reaproveitável local e no CI (Fase 1.3 do hub/win/README.md).

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = path.join(ROOT, 'hub', 'win', 'payload');

export const LOCAL_STACK_FILES = [
  '00-prelude-helpers.sql',
  '00-roles-ext.sql',
  'gateway.mjs',
  'postgrest.conf',
  'make-keys.sh',
  'gotrue.env',
];

/** Lista pura das cópias padrão (de→para, relativos a ROOT/PAYLOAD). Testável sem I/O. */
export function planoDeCopias() {
  return [
    { de: '.next/standalone', para: 'app', tipo: 'dir' },
    { de: '.next/static', para: 'app/.next/static', tipo: 'dir' },
    { de: 'public', para: 'app/public', tipo: 'dir-opcional' },
    { de: 'hub', para: 'hub', tipo: 'mjs' },
    ...LOCAL_STACK_FILES.map((f) => ({ de: `scripts/local-stack/${f}`, para: `scripts/local-stack/${f}`, tipo: 'arquivo' })),
    { de: 'supabase/migrations', para: 'supabase/migrations', tipo: 'sql' },
  ];
}

function copiarPorExtensao(deDir, paraDir, ext) {
  mkdirSync(paraDir, { recursive: true });
  for (const f of readdirSync(deDir).filter((x) => x.endsWith(ext))) {
    cpSync(path.join(deDir, f), path.join(paraDir, f));
  }
}

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const authExe = arg('--auth');
  const authMig = arg('--auth-migrations');
  const versao = arg('--version') || JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  if (!authExe || !authMig) throw new Error('use --auth <auth.exe> --auth-migrations <dir>');

  rmSync(PAYLOAD, { recursive: true, force: true });

  for (const c of planoDeCopias()) {
    const de = path.join(ROOT, c.de);
    const para = path.join(PAYLOAD, c.para);
    if (c.tipo === 'dir-opcional' && !existsSync(de)) continue;
    if (c.tipo === 'dir') {
      mkdirSync(path.dirname(para), { recursive: true });
      cpSync(de, para, { recursive: true });
    } else if (c.tipo === 'mjs') {
      copiarPorExtensao(de, para, '.mjs');
    } else if (c.tipo === 'sql') {
      copiarPorExtensao(de, para, '.sql');
    } else {
      mkdirSync(path.dirname(para), { recursive: true });
      cpSync(de, para);
    }
  }

  // auth.exe + migrations em DOIS lugares (o maestro lê de scripts/local-stack/bin).
  for (const base of ['bin', 'scripts/local-stack/bin']) {
    const dir = path.join(PAYLOAD, base);
    mkdirSync(dir, { recursive: true });
    cpSync(authExe, path.join(dir, 'auth.exe'));
    cpSync(authMig, path.join(dir, 'migrations'), { recursive: true });
  }

  // config.json de config.example.json, com a versao carimbada (base do auto-update).
  const cfg = JSON.parse(readFileSync(path.join(ROOT, 'hub', 'win', 'config.example.json'), 'utf8'));
  cfg.version = versao;
  writeFileSync(path.join(PAYLOAD, 'config.json'), JSON.stringify(cfg, null, 2));

  console.log(`payload montado em ${PAYLOAD} (versao ${versao})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: Run test + lint**

Run: `npm run test -- scripts/__tests__/montar-payload.test.mjs` (PASS, 2 testes)
Run: `npm run lint` (sem novos erros nesse arquivo)

- [ ] **Step 5: Commit**

```bash
git add scripts/montar-payload.mjs scripts/__tests__/montar-payload.test.mjs
git commit -m "feat(installer): script montar-payload.mjs (monta payload/ do instalador)"
```

---

## Task 5: Workflow `.github/workflows/build-installer.yml`

**Files:**
- Create: `.github/workflows/build-installer.yml`

- [ ] **Step 1: Criar o workflow**

```yaml
name: build-installer
on:
  push:
    tags: ['v*']
  workflow_dispatch: {}
jobs:
  installer:
    runs-on: windows-latest
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci
      - run: npm run typecheck
      - name: Versao
        id: ver
        shell: bash
        run: echo "ver=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"
      - name: Build app (standalone)
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - name: Publish agente (win-x64, self-contained)
        run: dotnet publish agent/ExpedAgent -c Release -o agent/installer/publish

      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - name: Cache auth.exe (GoTrue)
        id: cache-auth
        uses: actions/cache@v4
        with:
          path: gotrue-build
          key: authexe-v2.189.0-${{ hashFiles('hub/win/gotrue-windows.patch') }}
      - name: Build GoTrue auth.exe
        if: steps.cache-auth.outputs.cache-hit != 'true'
        shell: bash
        run: |
          set -e
          git clone --depth 1 --branch v2.189.0 https://github.com/supabase/auth /tmp/auth
          cd /tmp/auth
          git apply --ignore-whitespace "$GITHUB_WORKSPACE/hub/win/gotrue-windows.patch"
          GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-X github.com/supabase/auth/internal/utilities.Version=v2.189.0" -o auth.exe .
          mkdir -p "$GITHUB_WORKSPACE/gotrue-build"
          cp auth.exe "$GITHUB_WORKSPACE/gotrue-build/auth.exe"
          cp -r migrations "$GITHUB_WORKSPACE/gotrue-build/migrations"

      - name: Montar payload
        shell: bash
        run: node scripts/montar-payload.mjs --auth gotrue-build/auth.exe --auth-migrations gotrue-build/migrations --version "${{ steps.ver.outputs.ver }}"

      - name: Install Inno Setup
        run: choco install innosetup -y --no-progress

      - name: Compile installer (ISCC)
        shell: cmd
        run: '"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DMyAppVersion=${{ steps.ver.outputs.ver }} hub\win\exped-setup.iss'

      - uses: actions/upload-artifact@v4
        with:
          name: ExpedSetup-${{ steps.ver.outputs.ver }}
          path: hub/win/Output/ExpedSetup.exe
          if-no-files-found: error
```

> Segurança (workflow injection): só usamos `${{ steps.ver.outputs.ver }}` (derivado do package.json, não de input do usuário) e `secrets.*`. Nenhum `${{ github.event.* }}` não confiável entra em `run:`. OK.

- [ ] **Step 2: Validar YAML + segurança**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/build-installer.yml','utf8'); if(!y.includes('windows-latest')||!y.includes('ISCC.exe')) throw new Error('estrutura'); console.log('YAML estruturado OK')"`
Conferir: nenhum `${{ github.event` em `run:`; secrets só em `env:`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-installer.yml
git commit -m "ci(installer): workflow que builda o ExpedSetup.exe (tag v* + manual)"
```

---

## Task 6: Verificação

**Files:** nenhum (verificação + setup manual).

- [ ] **Step 1: Gates locais**

Run: `npm run test` → **0 failed** (bootstrap pula sem psql; novos testes passam).
Run: `npm run typecheck` (exit 0).
Run: `npm run lint` (sem novos erros nos arquivos `.mjs` tocados).

- [ ] **Step 2: Secrets do GitHub (uma vez, manual)**

Confirmar nas Actions secrets do repo: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(os mesmos do `release-hub.yml`). O build-installer NÃO usa service_role.

- [ ] **Step 3: Smoke do workflow (manual, no GitHub)**

Disparar via **Actions → build-installer → Run workflow** (ou criar uma tag `vX.Y.Z`). Conferir:
job verde, e o artefato **ExpedSetup-X.Y.Z** com o `ExpedSetup.exe` baixável. Se o ISCC falhar por
`Source` faltando, ajustar `montar-payload.mjs`/payload e rodar de novo.

---

## Self-Review (autor do plano)

- **Cobertura do spec:** job único windows-latest (T5) ✓; trigger tag v*+dispatch → artefato (T5) ✓;
  npm build + dotnet publish + auth.exe cacheado + payload + versão + ISCC + upload (T5) ✓;
  `montar-payload.mjs` com parte pura testada (T4) ✓; `.iss` versão por `/D` (T3) ✓; carimbo de versão
  no config.json + plumbing EXPED_VERSION (T2+T4) ✓; sem assinatura/sem offline (não há tasks — correto).
- **Pré-requisitos de robustez não no spec mas necessários:** bootstrap.test CI-safe (T1, senão o gating
  de teste quebra todo CI) e plumbing de versão (T2, senão re-download à toa). Ambos justificados.
- **Placeholders:** o único ponto a confirmar em código é `ARGS_CONEXAO` em T1 (reusar os args reais do
  `psqlPostgres` do arquivo) — é uma instrução de DRY, não conteúdo faltando.
- **Consistência:** `planoDeCopias()`/`LOCAL_STACK_FILES` definidos e testados em T4; `EXPED_VERSION`
  lido em T2 e carimbado em T4 (config.json) + traduzido pelo install-service (T2); `/DMyAppVersion`
  do workflow (T5) casa com o `#ifndef MyAppVersion` (T3); `montar-payload.mjs` chamado no workflow (T5)
  com os args `--auth/--auth-migrations/--version` que ele define (T4).
