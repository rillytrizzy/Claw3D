"use strict";

// Direct, non-streaming REST calls to real LLM vendor APIs, for the office
// "presence" personas (ChatGPT/Gemini/Claude/Agy) that previously had no
// backend at all. Deliberately independent of runAgenticLoop / HERMES_API_URL
// in hermes-gateway-adapter.js — no tool calling, no streaming, just
// systemPrompt + history + one user message in, assistant text out. Each
// vendor call degrades to a clear { error } result (never throws, never
// hangs) when its API key isn't configured.

const https = require("node:https");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const MAX_ANTHROPIC_TOKENS = 1024;

function redact(message) {
  if (typeof message !== "string") return message;
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "[REDACTED]");
}

function postJson(hostname, pathAndQuery, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        path: pathAndQuery,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            parsed = { _raw: raw };
          }
          resolve({ statusCode: res.statusCode || 0, body: parsed });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

function vendorErrorMessage(vendorLabel, statusCode, body) {
  const detail =
    (body && typeof body === "object" && (body.error?.message || body.message)) ||
    JSON.stringify(body ?? {});
  return `${vendorLabel} API HTTP ${statusCode}: ${redact(detail)}`;
}

async function callOpenAI({ systemPrompt, history, userMessage, model }) {
  if (!OPENAI_API_KEY) return { error: "OPENAI_API_KEY not configured" };
  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ...history.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: "user", content: userMessage },
  ];
  try {
    const { statusCode, body } = await postJson(
      "api.openai.com",
      "/v1/chat/completions",
      { Authorization: `Bearer ${OPENAI_API_KEY}` },
      { model: model || DEFAULT_OPENAI_MODEL, messages }
    );
    if (statusCode >= 400) return { error: vendorErrorMessage("OpenAI", statusCode, body) };
    const text = body?.choices?.[0]?.message?.content;
    if (!text) return { error: "OpenAI API returned an empty response." };
    return { text };
  } catch (err) {
    return { error: `OpenAI request failed: ${redact(err?.message || String(err))}` };
  }
}

async function callAnthropic({ systemPrompt, history, userMessage, model }) {
  if (!ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY not configured" };
  const messages = [
    ...history.map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: entry.content,
    })),
    { role: "user", content: userMessage },
  ];
  try {
    const { statusCode, body } = await postJson(
      "api.anthropic.com",
      "/v1/messages",
      { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
      {
        model: model || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: MAX_ANTHROPIC_TOKENS,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages,
      }
    );
    if (statusCode >= 400) return { error: vendorErrorMessage("Anthropic", statusCode, body) };
    const text = Array.isArray(body?.content)
      ? body.content.map((block) => block.text || "").join("")
      : "";
    if (!text) return { error: "Anthropic API returned an empty response." };
    return { text };
  } catch (err) {
    return { error: `Anthropic request failed: ${redact(err?.message || String(err))}` };
  }
}

async function callGemini({ systemPrompt, history, userMessage, model }) {
  if (!GEMINI_API_KEY) return { error: "GEMINI_API_KEY not configured" };
  const resolvedModel = model || DEFAULT_GEMINI_MODEL;
  const contents = [
    ...history.map((entry) => ({
      role: entry.role === "assistant" ? "model" : "user",
      parts: [{ text: entry.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];
  const payload = {
    contents,
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
  };
  try {
    const { statusCode, body } = await postJson(
      "generativelanguage.googleapis.com",
      `/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`,
      { "x-goog-api-key": GEMINI_API_KEY },
      payload
    );
    if (statusCode >= 400) return { error: vendorErrorMessage("Gemini", statusCode, body) };
    const parts = body?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((part) => part.text || "").join("") : "";
    if (!text) return { error: "Gemini API returned an empty response." };
    return { text };
  } catch (err) {
    return { error: `Gemini request failed: ${redact(err?.message || String(err))}` };
  }
}

const VENDOR_CALLERS = Object.freeze({
  openai: callOpenAI,
  anthropic: callAnthropic,
  google: callGemini,
});

/**
 * @param {"openai"|"anthropic"|"google"} vendor
 * @param {{ systemPrompt: string|null, history: Array<{role: string, content: string}>, userMessage: string, model: string|null }} params
 * @returns {Promise<{ text: string } | { error: string }>}
 */
async function callPersonaVendor(vendor, params) {
  const caller = VENDOR_CALLERS[vendor];
  if (!caller) return { error: `Unknown persona vendor: ${vendor}` };
  return caller(params);
}

module.exports = { callPersonaVendor, callOpenAI, callAnthropic, callGemini };
