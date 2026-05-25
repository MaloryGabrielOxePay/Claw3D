# HUB Auto-Connect Zero-Click Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `https://hub.grupomalory.com` open straight into the office UI in any browser, with no "Connect Your Gateway" dialog, while preserving dev-local behavior. Ship the changes and push to fork.

**Architecture:** Two surgical patches in the Claw3D fork (`proxy-url.ts` loopback gate; `useOnboardingState.ts` env-var skip), plus a systemd `Environment=` line on the VPS. The HUB's existing server-side proxy at `/api/gateway/ws` (which injects the gateway token from `~/.openclaw/openclaw.json`) is preserved unchanged.

**Tech Stack:** Next.js 16.1.7, React 19.2.3, TypeScript, Vitest + jsdom, Caddy 2.11.3, systemd, Git.

**Spec:** `docs/superpowers/specs/2026-05-25-hub-auto-connect-design.md`

**Working directory for all tasks:** `/home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory` (on the VPS, all commands run as user `openclaw` unless noted otherwise).

---

## File Structure

**Files to modify:**
- `src/lib/gateway/proxy-url.ts` — add `isBrowserOnLoopback()` helper and gate the loopback passthrough on it (single responsibility: resolve where the browser should open the gateway WebSocket).
- `src/features/onboarding/useOnboardingState.ts` — read `NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING` and short-circuit `showOnboarding` to `false` when set (single responsibility: track whether the wizard should show).
- `/etc/systemd/system/claw3d-hub.service` — add `Environment=NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true` (deployment-level config).

**Files to create:**
- `tests/unit/proxyUrl.test.ts` — unit tests for the loopback gating logic, mocking `window.location`.

**Files extended (not created):**
- `tests/unit/onboardingState.test.ts` — add cases covering the env-var skip behavior.

Each file has a single, narrow responsibility. The two source patches are independent — a regression in one cannot mask the other.

---

## Task 1: Bootstrap — verify clean working state

**Files:**
- Read-only check of repo state.

- [ ] **Step 1: Confirm branch and clean tree**

```bash
cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory
git status -sb
git log --oneline -3
```

Expected:
- Branch: `main`, `[ahead 2]` of `origin/main`.
- Last 3 commits include `a91d507 docs: design spec for zero-click HUB auto-connect` and `2c36356 feat(branding): customize template as HUB Grupo Malory`.
- No unstaged changes.

If unstaged changes exist, **STOP** and reconcile with the user — do not bulldoze unknown edits.

- [ ] **Step 2: Confirm test runner works**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && npx vitest run tests/unit/onboardingState.test.ts 2>&1 | tail -20'
```

Expected: 5 tests pass.

If failing: **STOP** — the baseline is broken; fix that before adding to it.

---

## Task 2: Write failing tests for `proxy-url.ts` loopback gating

**Files:**
- Create: `tests/unit/proxyUrl.test.ts`

- [ ] **Step 1: Write the failing test**

Create the file with this exact content:

```typescript
// tests/unit/proxyUrl.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveStudioProxyGatewayUrl } from "@/lib/gateway/proxy-url";

const setLocation = (href: string) => {
  const parsed = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      ...window.location,
      href: parsed.href,
      protocol: parsed.protocol,
      host: parsed.host,
      hostname: parsed.hostname,
      port: parsed.port,
      origin: parsed.origin,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    },
  });
};

describe("resolveStudioProxyGatewayUrl", () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  describe("browser on loopback origin (dev local)", () => {
    beforeEach(() => setLocation("http://localhost:3000/"));

    it("returns the raw loopback URL when configured URL is also loopback", () => {
      expect(resolveStudioProxyGatewayUrl("ws://localhost:18789")).toBe(
        "ws://localhost:18789",
      );
    });

    it("returns proxy path when configured URL is non-loopback", () => {
      expect(resolveStudioProxyGatewayUrl("wss://example.com:18789")).toBe(
        "ws://localhost:3000/api/gateway/ws",
      );
    });
  });

  describe("browser on remote origin (deployed)", () => {
    beforeEach(() => setLocation("https://hub.grupomalory.com/"));

    it("returns proxy path even when configured URL is loopback (the fix)", () => {
      expect(resolveStudioProxyGatewayUrl("ws://localhost:18789")).toBe(
        "wss://hub.grupomalory.com/api/gateway/ws",
      );
    });

    it("returns proxy path when configured URL is non-loopback", () => {
      expect(resolveStudioProxyGatewayUrl("wss://example.com:18789")).toBe(
        "wss://hub.grupomalory.com/api/gateway/ws",
      );
    });

    it("returns proxy path when configured URL is empty", () => {
      expect(resolveStudioProxyGatewayUrl("")).toBe(
        "wss://hub.grupomalory.com/api/gateway/ws",
      );
    });

    it("returns proxy path when configured URL is malformed", () => {
      expect(resolveStudioProxyGatewayUrl("not-a-url")).toBe(
        "wss://hub.grupomalory.com/api/gateway/ws",
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify the relevant case FAILS**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && npx vitest run tests/unit/proxyUrl.test.ts 2>&1 | tail -30'
```

Expected: the test `returns proxy path even when configured URL is loopback (the fix)` FAILS with a message like:
```
AssertionError: expected 'ws://localhost:18789' to be 'wss://hub.grupomalory.com/api/gateway/ws'
```

Other tests should pass (they describe current correct behavior, the failing test is the new behavior).

If the failing test passes already, **STOP** — the heuristic may have changed; re-read the source before patching.

---

## Task 3: Patch `proxy-url.ts` to gate loopback passthrough on browser origin

**Files:**
- Modify: `src/lib/gateway/proxy-url.ts:1-19`

- [ ] **Step 1: Apply the patch**

Replace the entire file with:

```typescript
// src/lib/gateway/proxy-url.ts
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
    } catch {
      // Fall through to the Studio proxy for malformed or non-URL values.
    }
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return `${protocol}://${host}/api/gateway/ws`;
};
```

The change: `isBrowserOnLoopback()` helper, plus the `raw && isBrowserOnLoopback()` gate before parsing.

- [ ] **Step 2: Run the proxy-url tests — all should pass**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && npx vitest run tests/unit/proxyUrl.test.ts 2>&1 | tail -20'
```

Expected: all 6 tests PASS.

If any test still fails: **STOP** — re-read the patch and the test, don't iterate blindly.

- [ ] **Step 3: Run the broader test suite to catch regressions**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && npx vitest run 2>&1 | tail -20'
```

Expected: all tests pass (or skipped tests stay skipped — no new failures).

---

## Task 4: Extend `onboardingState.test.ts` with env-var skip cases

**Files:**
- Modify: `tests/unit/onboardingState.test.ts:5-63`

- [ ] **Step 1: Append the new describe block**

Open `tests/unit/onboardingState.test.ts` and insert this block **inside** the existing `describe("useOnboardingState", ...)` immediately before the closing `});` of that block:

```typescript
  describe("with NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true", () => {
    const originalValue = process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING;

    beforeEach(() => {
      process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING = "true";
      vi.resetModules();
    });

    afterEach(() => {
      if (originalValue === undefined) {
        delete process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING;
      } else {
        process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING = originalValue;
      }
      vi.resetModules();
    });

    it("never shows onboarding regardless of localStorage", async () => {
      window.localStorage.removeItem("claw3d:onboarding:completed");
      const { useOnboardingState: hook } = await import(
        "@/features/onboarding/useOnboardingState"
      );
      const { result } = renderHook(() => hook());
      expect(result.current.showOnboarding).toBe(false);
    });

    it("ignores existing localStorage flag (still hidden)", async () => {
      window.localStorage.setItem("claw3d:onboarding:completed", "true");
      const { useOnboardingState: hook } = await import(
        "@/features/onboarding/useOnboardingState"
      );
      const { result } = renderHook(() => hook());
      expect(result.current.showOnboarding).toBe(false);
    });
  });
```

Also update the imports at the top of the file. The current line 1 is:
```typescript
import { afterEach, describe, expect, it } from "vitest";
```

Change it to:
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: Run the onboarding tests — new ones FAIL**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && npx vitest run tests/unit/onboardingState.test.ts 2>&1 | tail -30'
```

Expected: the 2 new tests in the `with NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true` block FAIL with `expected true to be false`. The 5 pre-existing tests still pass.

If the new tests pass already: **STOP** — re-read `useOnboardingState.ts`, the env var might already be respected via another path.

---

## Task 5: Patch `useOnboardingState.ts` to honor `NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING`

**Files:**
- Modify: `src/features/onboarding/useOnboardingState.ts:9-18`

- [ ] **Step 1: Apply the patch**

Open `src/features/onboarding/useOnboardingState.ts`. The current code at lines 9-18 is:

```typescript
const STORAGE_KEY = "claw3d:onboarding:completed";

const readCompleted = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};
```

Replace it with:

```typescript
const STORAGE_KEY = "claw3d:onboarding:completed";

const SKIP_ONBOARDING =
  process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING === "true";

const readCompleted = (): boolean => {
  if (SKIP_ONBOARDING) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};
```

No other change to the file.

- [ ] **Step 2: Run the onboarding tests — all should pass**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && npx vitest run tests/unit/onboardingState.test.ts 2>&1 | tail -30'
```

Expected: all 7 tests PASS (5 original + 2 new).

- [ ] **Step 3: Run the full test suite again**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && npx vitest run 2>&1 | tail -20'
```

Expected: no new failures.

---

## Task 6: Typecheck and ESLint on touched files

**Files:**
- Verify-only on: `src/lib/gateway/proxy-url.ts`, `src/features/onboarding/useOnboardingState.ts`, `tests/unit/proxyUrl.test.ts`, `tests/unit/onboardingState.test.ts`.

- [ ] **Step 1: Typecheck**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && npm run typecheck 2>&1 | tail -10'
```

Expected: exits with code 0, no errors.

- [ ] **Step 2: ESLint on changed files only**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && npx eslint src/lib/gateway/proxy-url.ts src/features/onboarding/useOnboardingState.ts tests/unit/proxyUrl.test.ts tests/unit/onboardingState.test.ts 2>&1 | tail -10'
```

Expected: no errors reported.

If errors: fix the lint complaint inline (usually formatting); do not commit until clean.

---

## Task 7: Commit the patches + tests as one logical change

**Files:**
- Stage: 2 src files + 2 test files only. Do NOT include `docs/`, `public/`, or anything else.

- [ ] **Step 1: Confirm what's about to be staged**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && git status --short'
```

Expected: 4 modified/new files, all under `src/lib/gateway/`, `src/features/onboarding/`, or `tests/unit/`.

- [ ] **Step 2: Stage explicitly**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && git add src/lib/gateway/proxy-url.ts src/features/onboarding/useOnboardingState.ts tests/unit/proxyUrl.test.ts tests/unit/onboardingState.test.ts'
```

- [ ] **Step 3: Commit**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && git commit -m "$(cat <<'\''EOF'\''
fix(gateway+onboarding): route via proxy when browser not on loopback; opt-out wizard

proxy-url: gate the loopback-passthrough heuristic on the browser
origin also being loopback. Previously, a remote browser loading the
HUB at https://hub.example.com would receive a configured upstream URL
of ws://localhost:18789 and try to dial *its own* localhost, failing
with disconnected (1006). The fix keeps dev-local behavior (page and
gateway both on loopback) and routes everything else through the
internal /api/gateway/ws proxy.

onboarding: honor NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true at build
time to suppress the Connect-Your-Gateway wizard for pre-configured
deployments. Toggle is reversible by removing the env var and
rebuilding.

Tests added: tests/unit/proxyUrl.test.ts covers both loopback and
remote-origin cases. tests/unit/onboardingState.test.ts covers the
env-var skip.

Spec: docs/superpowers/specs/2026-05-25-hub-auto-connect-design.md
Plan: docs/superpowers/plans/2026-05-25-hub-auto-connect.md

Co-Authored-By: Claudinha <claudinha@grupomalory.com>
EOF
)" 2>&1 | tail -5'
```

- [ ] **Step 4: Verify commit landed**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && git log --oneline -5 && git status -sb'
```

Expected: new commit is the most recent; `main` is `[ahead 3]` of `origin/main`; working tree clean.

---

## Task 8: Update systemd unit with the skip-onboarding env var

**Files:**
- Modify: `/etc/systemd/system/claw3d-hub.service` (run as root).

- [ ] **Step 1: Add the Environment line**

The current `[Service]` block contains these `Environment=` lines:
```
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=PATH=/home/openclaw/.nvm/versions/node/v22.22.3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

Append, immediately after the PORT line:
```
Environment=NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true
```

Use this exact sed (idempotent — won't duplicate on re-run):
```bash
grep -q "NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING" /etc/systemd/system/claw3d-hub.service \
  || sed -i '/^Environment=PORT=3000$/a Environment=NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true' /etc/systemd/system/claw3d-hub.service
```

- [ ] **Step 2: Verify the file**

```bash
grep -n "^Environment=" /etc/systemd/system/claw3d-hub.service
```

Expected: shows the new line right after `Environment=PORT=3000`.

- [ ] **Step 3: Reload systemd**

```bash
systemctl daemon-reload
```

Expected: no output, exit code 0.

(Do NOT restart yet — restart without a rebuild would run stale JS that ignores the env var. Build first in Task 9.)

---

## Task 9: Build Next.js with the new env var baked in

**Files:**
- No source edits. Triggers `.next/` regeneration.

- [ ] **Step 1: Run production build**

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true npm run build 2>&1 | tail -30'
```

Expected: build completes with `✓ Compiled successfully` (or similar). No new errors.

Note: passing the env var on the command line ensures the build picks it up even if the shell environment of the openclaw user doesn't already export it. The same value will be present at runtime via systemd.

- [ ] **Step 2: Confirm source still references the env var (sanity)**

`NEXT_PUBLIC_*` vars are substituted at build time and the substituted value gets dead-code-eliminated by the minifier, so grepping for the env name in `.next/static/` is not reliable. Instead, verify the source patch is still in place:

```bash
sudo -u openclaw bash -lc 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && grep -n "NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING" src/features/onboarding/useOnboardingState.ts'
```

Expected: one line printed, showing the `process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING === "true"` check.

The ultimate truth — whether the value was actually baked into the runtime bundle — is verified by the human smoke test in Task 12.

---

## Task 10: Restart the service and verify health

**Files:**
- Runtime check of `claw3d-hub.service`.

- [ ] **Step 1: Restart**

```bash
systemctl restart claw3d-hub.service
```

- [ ] **Step 2: Wait and check status**

```bash
sleep 5 && systemctl status claw3d-hub --no-pager 2>&1 | head -20
```

Expected: `Active: active (running)`, no error in recent log lines.

- [ ] **Step 3: Verify local listener**

```bash
ss -ltnp 2>/dev/null | grep ':3000'
```

Expected: `127.0.0.1:3000` with a node process.

- [ ] **Step 4: Verify HTTP roundtrip**

```bash
curl -s -o /dev/null -w "local: HTTP %{http_code}\n" http://127.0.0.1:3000/
curl -s -o /dev/null -w "public: HTTP %{http_code}\n" https://hub.grupomalory.com/
```

Expected: both return `200` or `307` (the office redirect is a 307).

---

## Task 11: Server-side smoke validations

**Files:**
- Verify-only.

- [ ] **Step 1: Verify Studio API exposes the openclaw defaults**

```bash
curl -s https://hub.grupomalory.com/api/studio | python3 -m json.tool | head -40
```

Expected JSON contains:
- `settings.gateway` (may be null — that's fine; means no override).
- `localGatewayDefaults` with `url: "ws://localhost:18789"` and `tokenConfigured: true`.

If `tokenConfigured` is `false` or `localGatewayDefaults` is `null`: **STOP** — the openclaw config wasn't read; check `~/.openclaw/openclaw.json` ownership/permissions.

- [ ] **Step 2: Verify systemd unit has the env var actually exported to the process**

```bash
systemctl show claw3d-hub | grep CLAW3D_SKIP_ONBOARDING
```

Expected: `Environment=NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true` (plus other vars) — proves the env var is in the running unit. If the line is missing, the daemon-reload from Task 8 didn't pick it up; re-run `systemctl daemon-reload && systemctl restart claw3d-hub`.

---

## Task 12: Human smoke test (user must verify)

**Files:**
- None — this is interactive verification.

- [ ] **Step 1: Send the user a clear checklist**

Tell the user:
> Por favor abre uma **janela anônima** do navegador em `https://hub.grupomalory.com/` e confirma:
> 1. Não aparece caixinha "Connect Your Gateway".
> 2. Cai direto no `/office` em <10s.
> 3. Vê os agentes (main / neto / claudinha) no escritório 3D.
> 4. Consegue mandar uma mensagem teste pro agente "main".

- [ ] **Step 2: Await user confirmation**

If user reports **PASS**: proceed to Task 13.

If user reports **FAIL** (caixinha ainda aparece, ou /office não carrega):
- Pull `journalctl -u claw3d-hub --since "5 min ago" --no-pager | tail -50` from the server.
- Compare the env var: `systemctl show claw3d-hub | grep CLAW3D_SKIP`.
- Check the client bundle one more time: `grep -r "CLAW3D_SKIP_ONBOARDING" .next/static/`.
- **STOP** and report findings; do not flail with random fixes.

---

## Task 13: Configure GitHub credentials for the fork

**Files:**
- Possibly create: `~openclaw/.git-credentials` OR `~openclaw/.ssh/id_ed25519` + `~openclaw/.ssh/id_ed25519.pub`.

This task is **interactive with the user** — they must choose PAT vs SSH and provide secret material. Don't fabricate credentials.

- [ ] **Step 1: Ask the user which method they prefer**

Use AskUserQuestion with options:
- **A. Personal Access Token (PAT) via store helper** — user generates a fine-grained PAT on github.com with `Contents: read+write` scope on `MaloryGabrielOxePay/Claw3D`, pastes it; we store via `git credential approve`. Easiest, no key generation.
- **B. SSH key** — we generate `~openclaw/.ssh/id_ed25519`, print the public key, user adds it under github.com → Settings → SSH and GPG keys. More permanent.

- [ ] **Step 2A (PAT path): configure credential helper**

If PAT chosen:
```bash
su - openclaw -c 'git config --global credential.helper store'
```
Then capture the PAT once via:
```bash
su - openclaw -c 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && git push --dry-run origin main'
```
This prompts for username + password — username is the GitHub username, password is the PAT. After success, the credentials are saved to `~/.git-credentials` (chmod 600).

**Important:** do NOT echo the PAT into chat. Have the user paste it directly into the prompt or set it via `GIT_PASSWORD` env var that they provide.

- [ ] **Step 2B (SSH path): generate key and switch remote**

If SSH chosen:
```bash
su - openclaw -c 'ssh-keygen -t ed25519 -C "claw3d-deploy@vmi3311151" -N "" -f ~/.ssh/id_ed25519'
su - openclaw -c 'cat ~/.ssh/id_ed25519.pub'
```
Print the public key to the user. They add it on github.com → Settings → SSH and GPG keys.

Then swap the remote URL:
```bash
su - openclaw -c 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && git remote set-url origin git@github.com:MaloryGabrielOxePay/Claw3D.git'
```

- [ ] **Step 3: Verify auth works without pushing yet**

```bash
su - openclaw -c 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && timeout 15 git push --dry-run origin main 2>&1 | tail -10'
```

Expected (for SSH): a line like `To git@github.com:MaloryGabrielOxePay/Claw3D.git ... main -> main`.
Expected (for PAT): same, with HTTPS URL.

If auth fails: **STOP**, surface the error, ask the user to re-check the PAT scopes or that the SSH key was added to the correct account.

---

## Task 14: Push to fork

**Files:**
- Remote: `https://github.com/MaloryGabrielOxePay/Claw3D.git` (or `git@github.com:...` if SSH).

- [ ] **Step 1: Final sanity check**

```bash
su - openclaw -c 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && git log --oneline -5 && git status -sb'
```

Expected: 3 commits ahead of origin/main: HUB branding, design spec, code patches. Working tree clean.

- [ ] **Step 2: Push**

```bash
su - openclaw -c 'cd /home/openclaw/.openclaw/workspace/Claw3D-HUB-Grupo-Malory && git push origin main 2>&1 | tail -10'
```

Expected: lines mentioning `2c36356..<latest>` push range, `main -> main` confirmation.

- [ ] **Step 3: Verify on GitHub**

Ask the user to open `https://github.com/MaloryGabrielOxePay/Claw3D/commits/main` and confirm the 3 new commits are there:
1. `feat(branding): customize template as HUB Grupo Malory`
2. `docs: design spec for zero-click HUB auto-connect`
3. `fix(gateway+onboarding): route via proxy when browser not on loopback; opt-out wizard`

---

## Task 15: Wrap-up

**Files:**
- None — administrative.

- [ ] **Step 1: Mark all related tasks complete**

```bash
# (Internal: TaskUpdate to completed for any remaining in-progress tasks)
```

- [ ] **Step 2: Summarize to the user**

Briefly report:
- HUB now opens zero-click at `https://hub.grupomalory.com`.
- Commits pushed to fork (link them).
- What's next: pipeline de deploy automático quando você der `git push` (separate spec when you want it).

---

## Verification checklist (run at the end)

- [ ] `npx vitest run` — all tests green.
- [ ] `npm run typecheck` — no errors.
- [ ] `systemctl is-active claw3d-hub` → `active`.
- [ ] `curl -s -o /dev/null -w "%{http_code}\n" https://hub.grupomalory.com/` → `200` or `307`.
- [ ] User reports zero-dialog flow works in an anonymous window.
- [ ] `git log origin/main..main` → empty (everything pushed).
