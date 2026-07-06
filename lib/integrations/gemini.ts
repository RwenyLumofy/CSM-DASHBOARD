/* =========================================================================
   Gemini integration — writes the human-readable wording for the AI Action
   List (lib/actions/*). Read-only from Google's side; we only send a compact,
   already-computed summary of a client's readings and the signals we detected,
   and ask Gemini to phrase them as CSM directives. Optional: the action feed
   works with deterministic templates when no key is set (see integrations.gemini()).

   Modeled on HubSpotClient / MetabaseClient — a `configured` getter, an env-
   defaulted constructor, and a single fetch with AbortSignal.timeout and a
   throw-on-!ok error string.
   ========================================================================= */

import { env } from "@/lib/config";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string = env.geminiApiKey, model: string = env.geminiModel) {
    this.apiKey = apiKey;
    this.model = model;
  }

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  /** Raw generateContent call. `schema` (optional) constrains the model to a
   *  JSON shape via responseMimeType/responseSchema. Returns the first
   *  candidate's text. Throws on transport/API error (callers fall back to
   *  templates). */
  private async generate(prompt: string, schema?: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${API_BASE}/${this.model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini generateContent failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    if (json.promptFeedback?.blockReason) throw new Error(`Gemini blocked: ${json.promptFeedback.blockReason}`);
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new Error("Gemini returned no text.");
    return text;
  }

  /** Generate and parse a JSON response constrained to `schema`. */
  async generateJson<T>(prompt: string, schema: Record<string, unknown>): Promise<T> {
    const text = await this.generate(prompt, schema);
    return JSON.parse(text) as T;
  }
}
