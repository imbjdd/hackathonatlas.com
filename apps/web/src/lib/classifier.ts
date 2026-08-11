// LLM classifier that flags fake / test hackathons.
//
// A cheap OpenAI model reads a hackathon's title/description/link/date and
// returns a verdict ("keep" | "remove") with a 0–1 confidence and a short
// reason. The confidence drives what we do with it (see `statusForResult`):
// high-confidence verdicts are applied automatically, uncertain ones are
// queued for human review in /admin.
//
// This is deliberately best-effort: if OPENAI_API_KEY is unset or the call
// fails, `classifyEvent` returns null and the caller leaves the row `pending`
// (still visible) for the backfill script to pick up later.

import OpenAI from "openai";

// Cheapest capable option (see the pricing comparison that motivated this).
// Override with CLASSIFIER_MODEL to try gpt-5-mini / gpt-4o-mini / etc.
export const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL ?? "gpt-5-nano";

// Verdicts at or above this confidence are applied automatically; below it the
// row is sent to /admin for a human to decide.
export const AUTO_APPLY_THRESHOLD = 0.85;

export type ClassificationVerdict = "keep" | "remove";

// Mirrors events.classificationStatus in the DB schema.
export type ClassificationStatus =
  | "pending"
  | "kept"
  | "rejected"
  | "needs_review";

export interface ClassificationResult {
  verdict: ClassificationVerdict;
  confidence: number;
  reason: string;
  model: string;
}

export interface ClassifierInput {
  title: string;
  description?: string | null;
  link?: string | null;
  city?: string | null;
  country?: string | null;
  startTime?: Date | string | null;
}

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  cachedClient ??= new OpenAI({ apiKey });
  return cachedClient;
}

const SYSTEM_PROMPT = `You are a strict moderator for a public directory of real hackathons.

Decide whether an entry is a genuine hackathon that belongs in the directory.

Return verdict "remove" for entries that are:
- test / placeholder / demo entries ("Test Event", "asdf", "my first event", lorem ipsum, obvious QA data)
- clearly not a hackathon (webinars, generic meetups, parties, courses, product launches, ads, spam)
- gibberish, empty, or nonsensical titles/descriptions
- duplicated boilerplate with no real event details

Return verdict "keep" for plausible real hackathons, including small, local, student, or online ones — when in doubt about a plausible real event, prefer "keep".

confidence is your certainty in the verdict, from 0 to 1. Use high confidence (>= 0.85) only when the signal is clear; use lower confidence for ambiguous cases so a human reviews them.
reason must be one short sentence citing the specific signal you used.`;

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "hackathon_classification",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "confidence", "reason"],
      properties: {
        verdict: { type: "string", enum: ["keep", "remove"] },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
    },
  },
};

function buildUserPrompt(input: ClassifierInput): string {
  const start =
    input.startTime instanceof Date
      ? input.startTime.toISOString()
      : (input.startTime ?? null);
  const description = (input.description ?? "").slice(0, 2000);
  return [
    `Title: ${input.title}`,
    `Link: ${input.link ?? "(none)"}`,
    `Location: ${[input.city, input.country].filter(Boolean).join(", ") || "(unknown)"}`,
    `Start: ${start ?? "(unknown)"}`,
    `Description: ${description || "(none)"}`,
  ].join("\n");
}

// Reasoning models (gpt-5*, o*) accept reasoning_effort; classic chat models
// (gpt-4o-mini, gpt-4.1-*) reject it. Only send it when the model supports it.
function supportsReasoningEffort(model: string): boolean {
  return model.startsWith("gpt-5") || /^o\d/.test(model);
}

export async function classifyEvent(
  input: ClassifierInput,
): Promise<ClassificationResult | null> {
  const client = getClient();
  if (!client) return null;

  const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
    {
      model: CLASSIFIER_MODEL,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
    };
  if (supportsReasoningEffort(CLASSIFIER_MODEL)) {
    request.reasoning_effort = "minimal";
  }

  const completion = await client.chat.completions.create(request);
  const content = completion.choices[0]?.message?.content;
  if (!content) return null;

  let parsed: { verdict?: unknown; confidence?: unknown; reason?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const verdict = parsed.verdict === "remove" ? "remove" : "keep";
  const rawConfidence = Number(parsed.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0;
  const reason = typeof parsed.reason === "string" ? parsed.reason : "";

  return { verdict, confidence, reason, model: CLASSIFIER_MODEL };
}

// Maps a classifier result to the stored status. High-confidence verdicts are
// applied; anything less certain is queued for human review.
export function statusForResult(
  result: ClassificationResult,
): ClassificationStatus {
  if (result.confidence >= AUTO_APPLY_THRESHOLD) {
    return result.verdict === "keep" ? "kept" : "rejected";
  }
  return "needs_review";
}
