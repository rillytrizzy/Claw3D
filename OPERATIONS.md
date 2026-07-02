# Claw3D Operations — How This Fork Actually Works

Read this before touching agent/office/chat code in this repo. It documents
the *real* current state, not the intended one — several pieces look wired
but aren't. Last verified 2026-07-02.

## What this is

A Next.js 16 + React 19 + R3F/Three.js + Phaser 3D "virtual office" where AI
agent avatars appear alongside the operator. This is the operator's fork
(`mine → github.com/rillytrizzy/Claw3D`, upstream `origin →
github.com/iamlukethedev/claw3d`), running in **broker-first mode** against a
custom Hermes gateway adapter instead of the upstream OpenClaw gateway. See
`AGENTS.md` for generic/upstream repo instructions; this file is
fork-specific operational reality.

## The three systems in this repo — don't confuse them

**1. Workspace Broker** (`src/lib/workspace-broker/broker.ts` +
`adapters.ts`) — supplies the 7-avatar roster (name/status/`currentTask`
label) rendered in the office when `WORKSPACE_BROKER_MODE = true`
(`OfficeScreen.tsx`, currently hardcoded on). It also exposes an action-queue
API (`POST /api/workspace/actions` → `broker.runAction`) that *looks* like a
task-execution system but is **100% mock**: its 5 adapters (repo/terminal/
automation/marketplace/n8n) just return canned strings — no process is ever
spawned, and nothing in the current UI even calls this endpoint. Treat the
broker as **display data only** until `adapters.ts` is rewritten to call
something real.

**2. Hermes Gateway Adapter** (`server/hermes-gateway-adapter.js`) — the
*real* chat backend. A WS+HTTP server on `:18789`. Every avatar's chat
message goes through here via the `chat.send` method, resolved by
`sessionKey` (format `agent:<agentId>:<mainKey>`, built by
`buildAgentMainSessionKey` in `src/lib/gateway/GatewayClient.ts`) into an
`agentRegistry` entry carrying `name`/`role`/`systemPrompt`/`model`/`vendor`.
**Until 2026-07-02 a sessionKey format mismatch (broker seeds used
`workspace:<id>`, this file only parsed `agent:<id>:...`) made every
avatar's chat silently resolve to the Hermes orchestrator regardless of
which avatar was clicked.** Fixed, but if agent replies ever look
identical/wrong again, check `sessionKey` construction first — it's the
single point where this whole system has already broken silently once.

**3. Agent Controller** (`server/agent-controller.js`) — an unrelated third
system: an RTOS PowerShell-hook runner (`autonomic-baseline`,
`session-closeout`, `memory-recall`, etc.), exposed via the adapter's
`hermes.action.run` method and gated by a shared-secret + IP allowlist. Real
`child_process.spawn`, but only runs a fixed catalog of ops hooks — has
nothing to do with the workspace broker's "adapter" concept despite the
naming collision.

## Current roster reality

| Avatar | Backend | Status |
|---|---|---|
| Hermes | `HERMES_API_URL` (default `:8642`) via `runAgenticLoop`, has tool-calling (`spawn_agent`, `delegate_task`, `list_team`, ...) | Adapter (`:18789`) is up, but the upstream `:8642` is **unreachable** in this environment (`curl` connection refused) — Hermes can't currently produce a real reply |
| Codex | `agent-controller.js` real process spawn, but only for `rtos.hook.run` actions dispatched via Hermes or Telegram `/askcodex` | Real infra, reactive only — not autonomous, not wired to the broker's `repo.run` capability |
| Claude Code | This assistant, session-based | Real, but only exists while a session is open — not a standing office presence |
| ChatGPT | `server/persona-vendors.js` → OpenAI `/v1/chat/completions` | Real as of `48680dc`, needs `OPENAI_API_KEY` |
| Gemini | `persona-vendors.js` → Google `generateContent` | Real as of `48680dc`, needs `GEMINI_API_KEY` |
| Claude | `persona-vendors.js` → Anthropic `/v1/messages` | Real as of `48680dc`, needs `ANTHROPIC_API_KEY` |
| Agy | `persona-vendors.js` → Google, same vendor as Gemini with a documentation-scribe system prompt | Real as of `48680dc`, needs `GEMINI_API_KEY` |

Persona replies degrade gracefully to a `"<VAR> not configured"` chat error
when their key is missing — they never crash or hang.

## Setup / remaining work

- [ ] Add `OPENAI_API_KEY` to `.env` — required for the ChatGPT persona.
      (Note: this sandbox has an ambient `OPENAI_API_KEY` that 401s —
      "Incorrect API key provided: sk-...." — looks like a placeholder,
      worth checking what set it.)
- [ ] Add `ANTHROPIC_API_KEY` to `.env` — required for the Claude persona.
- [ ] Add `GEMINI_API_KEY` to `.env` — required for the Gemini + Agy
      personas.
- [ ] Bring up or fix the Hermes upstream at `HERMES_API_URL` (default
      `:8642`) — currently unreachable; blocks Hermes' own replies and all
      tool-calling (spawn_agent/delegate_task/etc.).
- [ ] Add `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` for in-office voice.
- [ ] **Restart the adapter after any `.env` change** — env is read once at
      process start (`npm run hermes-adapter` locally, or `docker compose up
      -d --build` for the containerized deploy).
- [ ] Decide the fate of a stashed, pre-existing, unrelated edit to
      `GatewayClient.ts` + its test — sitting in `git stash` on this repo,
      not reapplied or dropped (`git stash list`).
- [ ] The workspace broker's action-queue adapters (`adapters.ts`) are still
      mock stubs. If real local-script/repo execution triggered *from the
      office UI* is ever wanted, this is the actual gap — persona chat is
      now real, but the broker's task queue still is not.
- [ ] Codex isn't wired to pull work autonomously from any queue — it only
      runs when explicitly dispatched (Hermes tool call or Telegram).

## If something looks broken, check these first

1. **Avatar replies look identical or come from the wrong persona** → check
   `sessionKey` construction (`src/lib/office/workspaceAdapter.ts`'s
   `mapWorkspaceAgentsToAgentSeeds`, should use `buildAgentMainSessionKey`)
   and parsing (`hermes-gateway-adapter.js`'s `sessionAgentId` resolution in
   the `chat.send` case).
2. **A persona avatar replies with "not configured"** → missing vendor API
   key in `.env`, or the adapter process hasn't been restarted since the key
   was added.
3. **Hermes gives no reply or errors** → check `HERMES_API_URL` (`:8642` by
   default) reachability directly, not just adapter (`:18789`) health —
   they're independent; the adapter can be "up" while the upstream is dead.
4. **A new capability doesn't seem to execute anything** → confirm you're
   calling the real Hermes adapter path (`chat.send`, `hermes.action.run`),
   not the workspace broker's `POST /api/workspace/actions` (currently
   mock-only, see above).

## Key files

| File | Role |
|---|---|
| `src/lib/workspace-broker/broker.ts` | 7-agent roster definition + mock action queue |
| `src/lib/workspace-broker/adapters.ts` | The mock action executors (stubs — see above) |
| `src/lib/office/workspaceAdapter.ts` | Maps broker roster → office avatars + chat session seeds |
| `server/hermes-gateway-adapter.js` | Real WS/HTTP chat backend, `agentRegistry`, orchestrator tool-calling |
| `server/persona-vendors.js` | Real OpenAI/Anthropic/Gemini REST calls for the 4 persona agents |
| `server/agent-controller.js` | Unrelated RTOS PowerShell-hook runner (ops automation, not chat) |
| `.env.example` | Every environment variable this repo reads, with comments |
