# HUB Grupo Malory — Auto-conexão Zero-Click

**Data:** 2026-05-25
**Status:** approved (aguardando spec self-review e user review)
**Autor:** Claudinha (sessão Telegram do Malorynho)
**Deploy alvo:** `hub.grupomalory.com` (VPS Contabo, systemd unit `claw3d-hub.service`)

## Problema

Ao abrir `https://hub.grupomalory.com` em qualquer navegador, aparece o diálogo "Connect Your Gateway" do `OnboardingWizard` pedindo `Gateway URL` e `Gateway Token`. Mesmo preenchendo, a conexão falha com `disconnected (1006)` ou similar.

Os campos do diálogo são, na prática, **vestigiais** quando o adapter é `openclaw` — o servidor sobrescreve o token com o valor real do `~/.openclaw/openclaw.json` via `server/gateway-proxy.js`. O usuário vê uma tela que prometeu controlar a conexão mas que não controla.

## Causa raiz

Duas causas independentes:

### 1. Bug funcional — `proxy-url.ts` tem heurística de "loopback direto" sem checar a origem da página

```ts
// src/lib/gateway/proxy-url.ts:1-19 (estado atual)
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const resolveStudioProxyGatewayUrl = (upstreamGatewayUrl?: string): string => {
  const raw = typeof upstreamGatewayUrl === "string" ? upstreamGatewayUrl.trim() : "";
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (LOOPBACK_HOSTS.has(parsed.hostname)) {
        return raw; // ◀ devolve "ws://localhost:18789" ao browser remoto
      }
    } catch { /* ... */ }
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return `${protocol}://${host}/api/gateway/ws`;
};
```

**Comportamento atual:** o `GatewayClient` carrega `localGatewayDefaults` via `/api/studio`, que retorna `url: "ws://localhost:18789"` (lido do `~/.openclaw/openclaw.json`). A função acima vê o hostname loopback e devolve o URL literal. O browser remoto tenta abrir WebSocket no **seu próprio** `localhost:18789`, que não tem nada → falha.

**Intenção original:** quando o dev está rodando localmente, browser e gateway compartilham loopback e a conexão direta funciona — pula o proxy interno. Mas a heurística é incompleta: só faz sentido quando **a página também foi servida de loopback**.

### 2. Bug de UX — `useOnboardingState` decide só por `localStorage`

```ts
// src/features/onboarding/useOnboardingState.ts:9-18 (estado atual)
const STORAGE_KEY = "claw3d:onboarding:completed";

const readCompleted = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch { return false; }
};
```

Resultado: cada navegador novo, perfil novo, ou após clear-site-data → o wizard reaparece. Não há jeito de o deploy declarar "esse host é pré-configurado, pule o wizard".

## Arquitetura existente (preservada)

```
Browser ──HTTPS──▶ Caddy ──▶ Next.js HUB (127.0.0.1:3000)
                                  │
                  wss://hub.grupomalory.com/api/gateway/ws
                                  ▼
                       server/gateway-proxy.js
                  (injeta token server-side, lê de
                   ~/.openclaw/claw3d/settings.json ou
                   ~/.openclaw/openclaw.json)
                                  │
                                  ▼
                  ws://127.0.0.1:18789 (OpenClaw Gateway)
```

Esta arquitetura **já foi pensada para o caso remoto**. O token nunca cruza a fronteira do navegador. Só falta o roteador (`proxy-url.ts`) cooperar.

## Mudanças propostas

### Mudança 1 — patch funcional em `proxy-url.ts`

Gatear o "passthrough direto loopback" também pela origem da página: só pula o proxy interno se browser **e** URL configurado são loopback.

```ts
// src/lib/gateway/proxy-url.ts (estado após patch)
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const isBrowserOnLoopback = (): boolean => {
  if (typeof window === "undefined") return false;
  return LOOPBACK_HOSTS.has(window.location.hostname);
};

export const resolveStudioProxyGatewayUrl = (upstreamGatewayUrl?: string): string => {
  const raw = typeof upstreamGatewayUrl === "string" ? upstreamGatewayUrl.trim() : "";
  if (raw && isBrowserOnLoopback()) {
    try {
      const parsed = new URL(raw);
      if (LOOPBACK_HOSTS.has(parsed.hostname)) {
        return raw;
      }
    } catch { /* fall through to proxy */ }
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return `${protocol}://${host}/api/gateway/ws`;
};
```

**Compatibilidade:**
- Dev local (`npm run dev` em `localhost:3000`, gateway em `localhost:18789`) → ambos loopback → mantém conexão direta antiga. Nenhuma regressão.
- Deploy remoto (browser em `hub.grupomalory.com`, URL configurado loopback) → vai pelo proxy interno. Corrige o bug.

### Mudança 2 — patch UX em `useOnboardingState.ts`

Hook respeita uma env var de build que força `showOnboarding: false`.

```ts
// src/features/onboarding/useOnboardingState.ts (estado após patch)
const STORAGE_KEY = "claw3d:onboarding:completed";

const SKIP_ONBOARDING =
  process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING === "true";

const readCompleted = (): boolean => {
  if (SKIP_ONBOARDING) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch { return false; }
};
```

Demais funções do hook permanecem iguais. Apenas o gate inicial muda.

### Mudança 3 — config infra em `claw3d-hub.service`

Adicionar uma linha `Environment=`:

```ini
# /etc/systemd/system/claw3d-hub.service (diff)
[Service]
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true   # ← novo
```

Depois: `systemctl daemon-reload && systemctl restart claw3d-hub`.

**Importante:** `NEXT_PUBLIC_*` é resolvido em **build time** pelo Next.js. Após editar o systemd, é obrigatório rodar `npm run build` para a flag entrar no bundle. Restart sozinho não basta.

## Fluxo de dados após o fix

1. Browser carrega `https://hub.grupomalory.com` em janela limpa
2. React monta. `useOnboardingState` checa `SKIP_ONBOARDING` (true neste deploy) → retorna `showOnboarding: false`. Wizard **não monta**.
3. `OfficeScreen` renderiza direto. `GatewayClient` carrega `/api/studio`:
   - `settings.gateway`: null (sem `~/.openclaw/claw3d/settings.json` por padrão)
   - `localGatewayDefaults`: `{ url: "ws://localhost:18789", tokenConfigured: true, adapterType: "openclaw" }`
4. `resolveStudioGatewayProfiles` resolve `activeProfile.url = "ws://localhost:18789"`, token `""`.
5. Auto-connect dispara após `INITIAL_AUTO_CONNECT_DELAY_MS` (900ms).
6. WebSocket abre via `resolveStudioProxyGatewayUrl("ws://localhost:18789")`:
   - `isBrowserOnLoopback()` → false (página em `hub.grupomalory.com`)
   - Retorna `wss://hub.grupomalory.com/api/gateway/ws`
7. Caddy proxia ws://127.0.0.1:3000/api/gateway/ws → Next.js → `server/gateway-proxy.js`.
8. Proxy lê config via `loadUpstreamGatewaySettings`:
   - settings.json não existe → fallback para `readOpenclawGatewayDefaults`
   - Pega `url: ws://localhost:18789`, `token: <real>` do `~/.openclaw/openclaw.json`
9. Proxy estabelece WS upstream com OpenClaw, injeta `connect` frame com token real.
10. Frames bidirecionais fluem. Browser vê `status: connected`. Cai no `/office`.

## Tratamento de erro

| Situação | Comportamento |
|---|---|
| OpenClaw gateway (`127.0.0.1:18789`) caído | Proxy server-side falha handshake → frame `res` com erro → UI mostra "disconnected" e tenta retry |
| `~/.openclaw/openclaw.json` ausente/corrompido | `loadUpstreamGatewaySettings` retorna token vazio → handshake upstream rejeitado → erro de auth surfaceado no UI |
| `NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING` ausente | `SKIP_ONBOARDING = false` → wizard comporta como antes (gate só por localStorage) |
| Dev local sem env var | Wizard mostra na primeira visita (comportamento original preservado) |
| Browser bloqueia WebSocket por mixed content / política | Erro surfaceado no UI atual (sem mudança) |

## Teste

### Smoke manual (obrigatório antes de commit)

1. Aplicar 2 patches.
2. Editar systemd unit (`Environment=NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true`).
3. `cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && sudo -u openclaw npm run build`
4. `systemctl daemon-reload && systemctl restart claw3d-hub`
5. `curl -s -o /dev/null -w "%{http_code}\n" https://hub.grupomalory.com/` → esperado: `200` ou `307` (redirect normal para `/office`)
6. `curl -s https://hub.grupomalory.com/api/studio | jq '.localGatewayDefaults'` → deve mostrar `url` e `tokenConfigured: true`
7. Abrir `https://hub.grupomalory.com/` em janela anônima do browser. Esperado:
   - Sem caixinha "Connect Your Gateway"
   - Cai direto no `/office`
   - Painel de chat operacional (mandar mensagem teste pro agent `main`)

### Não-regressão dev local

Em uma máquina dev (sem a env var):
1. `npm run dev`
2. Abrir `http://localhost:3000`
3. Wizard aparece normalmente na primeira visita.
4. Após "Done", próximas visitas pulam wizard via localStorage.

### Typecheck

`npm run typecheck` deve passar sem novos erros.

## Plano de deploy

1. Aplicar patches localmente em `/home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory`.
2. Editar `/etc/systemd/system/claw3d-hub.service`.
3. `npm run build` como user `openclaw`.
4. `systemctl daemon-reload && systemctl restart claw3d-hub`.
5. Rodar smoke manual.
6. Se OK: `git add -A` e `git commit -m "fix(gateway): route proxy when browser not on loopback; skip onboarding via env var"`, depois `git push origin <branch>` para o fork `MaloryGabrielOxePay/Claw3D`. Antes do push, verificar `git remote -v` e que credenciais git (SSH key ou PAT em `~/.git-credentials`) estão configuradas no servidor.
7. (Opcional) Se existir `CHANGELOG.md` no fork, anotar a entrada; senão, pular.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `NEXT_PUBLIC_*` baked-at-build: trocar domínio um dia exige rebuild | Aceitável. Rebuild é ~30s, restart ~5s. |
| Patch em `proxy-url.ts` afeta TODOS os consumidores | É um fix de bug real. Worst case: dev local sem mudança (mesmo path). Best case: outros forks ganham fix. |
| Token rotacionado no `openclaw.json` durante uso ativo | `loadUpstreamGatewaySettings` é chamado a cada nova conexão browser→proxy. Browsers que já estavam conectados quando a rotação aconteceu mantêm a conexão upstream antiga (com o token antigo) até a sessão WebSocket fechar; após disconnect/reconnect, pegam o token novo automaticamente. |
| Skip permanente do wizard deixa novos features (futuros steps) sem onboarding | Toggle reversível via env var. Quando precisar reativar, remover linha do systemd + rebuild. |
| Push pro fork pode bater em conflito | Verificar `git status` e `git log` antes; rebase se necessário. Fork é monosuário, baixa probabilidade. |

## Fora de escopo

- Onboarding multi-usuário (per-account state)
- OAuth/SSO no Caddy (ainda público sem auth)
- Auto-pareamento de devices browser-side (já feito separadamente via `openclaw-auto-approve.timer`)
- Pipeline CI/CD para deploy automático (próximo step, spec separada)
- Refatoração do `ConnectStep` para esconder campos vestigiais (UX cleanup, separado)
