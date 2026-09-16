import { getServerEnv } from "@/lib/env";
import { createAnthropicProvider } from "./anthropic";
import type { AiProvider } from "./types";

export type { AiProvider, Classification, ClassifyContext } from "./types";

let cached: AiProvider | null | undefined;

/**
 * The configured provider, or null when no API key is set. Callers treat
 * null as "leave the capture in the inbox for manual filing".
 */
export function getAiProvider(): AiProvider | null {
  if (cached !== undefined) return cached;
  const env = getServerEnv();

  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) {
    cached = createAnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.AI_MODEL,
    });
  } else {
    cached = null;
  }
  return cached;
}
