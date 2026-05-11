// Groq client — re-uses the existing `openai` SDK with Groq's OpenAI-compatible
// /v1 endpoint. Groq's chat completions accept the same request/response shapes
// (including response_format: 'json_object'), so no new dep.
//
// One singleton per process; env var GROQ_API_KEY must be set.
//
// Per ADR-013, both ai-summarize and kg-extract route to Llama 3.3 70B
// (model id: llama-3.3-70b-versatile) at temperature 0. The model id is
// passed per-call so future workload routing can vary it.

import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getGroqClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY must be set");
  }
  _client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
  return _client;
}
