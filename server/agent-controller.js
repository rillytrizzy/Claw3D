"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn: nodeSpawn } = require("node:child_process");

const DEFAULT_HOOK_ROOT = process.env.RTOS_HOOK_ROOT || "C:\\tools\\rtos-hooks";
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_HOOK_ROOT, "rtos.config.json");
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const ACTION_SCHEMA_VERSION = 1;

const HOOK_DEFINITIONS = Object.freeze({
  "autonomic-baseline": {
    description: "Run the RTOS baseline diagnostic and ledger heartbeat flow.",
    fileName: "autonomic-baseline.ps1",
  },
  "log-activity": {
    description: "Append a structured activity record into the RTOS ledger.",
    fileName: "log-activity.ps1",
  },
  "memory-recall": {
    description: "Recall RTOS state and notes for the active workspace.",
    fileName: "memory-recall.ps1",
  },
  "rtos-ledger-rotate": {
    description: "Rotate the RTOS ledger and state snapshots.",
    fileName: "rtos-ledger-rotate.ps1",
  },
  "session-closeout": {
    description: "Finalize the active RTOS session and checkpoint artifacts.",
    fileName: "session-closeout.ps1",
  },
  "vault-stamp": {
    description: "Stamp RTOS results back into the connected Obsidian vault.",
    fileName: "vault-stamp.ps1",
  },
});

function parseCsvList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isLoopbackAddress(value) {
  const address = String(value || "").trim().toLowerCase();
  if (!address) return false;
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address === "localhost"
  );
}

function resolveOriginHost(origin) {
  const raw = String(origin || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return Buffer.from(a, "utf8").equals(Buffer.from(b, "utf8"));
}

function validateRequestSource(source, options = {}) {
  const env = options.env || process.env;
  const remoteAddress = String(source?.remoteAddress || "").trim();
  const originHost = resolveOriginHost(source?.origin);
  const remoteAllowlist = parseCsvList(
    options.remoteAllowlist ?? env.HERMES_ACTION_REMOTE_ALLOWLIST
  );
  const originAllowlist = parseCsvList(
    options.originAllowlist ?? env.HERMES_ACTION_ORIGIN_ALLOWLIST
  );
  const sharedSecret = String(
    options.sharedSecret ?? env.HERMES_ACTION_SHARED_SECRET ?? ""
  ).trim();
  const requestSecret = String(
    source?.headers?.["x-hermes-action-key"] ||
      source?.headers?.["X-Hermes-Action-Key"] ||
      ""
  ).trim();

  if (!sharedSecret || !safeCompare(sharedSecret, requestSecret)) {
    return {
      allowed: false,
      reason: "shared_secret_required",
      remoteAddress,
      originHost,
    };
  }

  const remoteAllowed =
    isLoopbackAddress(remoteAddress) ||
    (remoteAllowlist.length > 0 && remoteAllowlist.includes(remoteAddress.toLowerCase()));
  if (!remoteAllowed) {
    return {
      allowed: false,
      reason: "remote_address_not_allowed",
      remoteAddress,
      originHost,
    };
  }

  if (originAllowlist.length > 0 && originHost && !originAllowlist.includes(originHost)) {
    return {
      allowed: false,
      reason: "origin_not_allowed",
      remoteAddress,
      originHost,
    };
  }

  return {
    allowed: true,
    remoteAddress,
    originHost,
  };
}

function readRtosConfig(configPath = DEFAULT_CONFIG_PATH) {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function buildHookCatalog(hookRoot = DEFAULT_HOOK_ROOT) {
  return Object.fromEntries(
    Object.entries(HOOK_DEFINITIONS).map(([hook, definition]) => [
      hook,
      {
        ...definition,
        scriptPath: path.join(hookRoot, definition.fileName),
      },
    ])
  );
}

function getActionSchema(options = {}) {
  const hookRoot = options.hookRoot || DEFAULT_HOOK_ROOT;
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const catalog = buildHookCatalog(hookRoot);
  const config = readRtosConfig(configPath);

  return {
    version: ACTION_SCHEMA_VERSION,
    type: "rtos.hook.run",
    configPath,
    gatewayPort: Number(config.gateway_port) || 18789,
    supportedHooks: Object.entries(catalog).map(([hook, definition]) => ({
      hook,
      description: definition.description,
      scriptPath: definition.scriptPath,
      exists: fs.existsSync(definition.scriptPath),
    })),
  };
}

function normalizeActionRequest(action, options = {}) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("Action payload must be a JSON object.");
  }

  const hookRoot = options.hookRoot || DEFAULT_HOOK_ROOT;
  const catalog = buildHookCatalog(hookRoot);
  const version = Number(action.version);
  if (version !== ACTION_SCHEMA_VERSION) {
    throw new Error(`Unsupported action schema version "${action.version}".`);
  }

  if (action.type !== "rtos.hook.run") {
    throw new Error(`Unsupported action type "${action.type}".`);
  }

  const hook = typeof action.hook === "string" ? action.hook.trim() : "";
  const definition = catalog[hook];
  if (!definition) {
    throw new Error(`Unsupported hook "${hook}".`);
  }

  const rawArgs = action.args ?? [];
  if (!Array.isArray(rawArgs) || rawArgs.some((value) => typeof value !== "string")) {
    throw new Error("Action args must be an array of strings.");
  }

  const args = rawArgs.map((value) => value.trim()).filter(Boolean);
  const timeoutMs = Number(action.timeoutMs);
  const normalizedTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(Math.max(timeoutMs, 1_000), MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

  return {
    version: ACTION_SCHEMA_VERSION,
    type: "rtos.hook.run",
    hook,
    args,
    timeoutMs: normalizedTimeoutMs,
    scriptPath: definition.scriptPath,
  };
}

function createSpawnPromise(spawnImpl, normalizedAction, env, now) {
  return new Promise((resolve, reject) => {
    const startedAt = now();
    const child = spawnImpl(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        normalizedAction.scriptPath,
        ...normalizedAction.args,
      ],
      {
        shell: false,
        windowsHide: true,
        env,
      }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      const finishedAt = now();
      resolve({
        ...result,
        action: {
          version: normalizedAction.version,
          type: normalizedAction.type,
          hook: normalizedAction.hook,
          args: normalizedAction.args,
        },
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
      });
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({
        ok: false,
        exitCode: null,
        stdout,
        stderr: stderr || `Timed out after ${normalizedAction.timeoutMs}ms.`,
      });
    }, normalizedAction.timeoutMs);

    timer.unref?.();

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        exitCode: typeof code === "number" ? code : null,
        stdout,
        stderr,
      });
    });
  });
}

function createAgentController(options = {}) {
  const hookRoot = options.hookRoot || DEFAULT_HOOK_ROOT;
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const env = options.env || process.env;
  const spawnImpl = options.spawn || nodeSpawn;
  const now = options.now || Date.now;

  return {
    getActionSchema() {
      return getActionSchema({ hookRoot, configPath });
    },
    async executeAction(action, source) {
      const sourceCheck = validateRequestSource(source, { env });
      if (!sourceCheck.allowed) {
        const error = new Error(`Request source rejected: ${sourceCheck.reason}.`);
        error.code = sourceCheck.reason;
        throw error;
      }

      const normalizedAction = normalizeActionRequest(action, { hookRoot });
      if (!fs.existsSync(normalizedAction.scriptPath)) {
        const error = new Error(`Hook script missing: ${normalizedAction.scriptPath}`);
        error.code = "hook_script_missing";
        throw error;
      }

      return createSpawnPromise(spawnImpl, normalizedAction, env, now);
    },
  };
}

module.exports = {
  ACTION_SCHEMA_VERSION,
  createAgentController,
  getActionSchema,
  normalizeActionRequest,
  validateRequestSource,
};
