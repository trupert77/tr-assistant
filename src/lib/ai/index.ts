import { getServerEnv } from "@/lib/env";
import { DEFAULT_ANTHROPIC_MODEL, createAnthropicProvider } from "./anthropic";
import { DEFAULT_OPENAI_MODEL, createOpenAiProvider } from "./openai";
import type { AiProvider } from "./types";

export type {
  AiProvider,
  AnswerContext,
  AnswerResult,
  Classification,
  ClassifyContext,
  ContextItem,
} from "./types";

export type AiProviderName = "anthropic" | "openai";

/** Everything the UI needs to list the providers, in display order. */
export const AI_PROVIDERS: readonly {
  name: AiProviderName;
  label: string;
  defaultModel: string;
}[] = [
  { name: "anthropic", label: "Claude", defaultModel: DEFAULT_ANTHROPIC_MODEL },
  { name: "openai", label: "ChatGPT", defaultModel: DEFAULT_OPENAI_MODEL },
];

/** A provider is configured when its API key is set. */
export function isAiProviderConfigured(name: AiProviderName): boolean {
  const env = getServerEnv();
  return Boolean(name === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY);
}

export function configuredAiProviders(): AiProviderName[] {
  return AI_PROVIDERS.map((p) => p.name).filter(isAiProviderConfigured);
}

/**
 * The provider used when the user has not picked one: `AI_PROVIDER` from the
 * env when its key is set, otherwise the first configured provider.
 */
export function defaultAiProviderName(): AiProviderName | null {
  const env = getServerEnv();
  if (env.AI_PROVIDER && isAiProviderConfigured(env.AI_PROVIDER)) return env.AI_PROVIDER;
  return configuredAiProviders()[0] ?? null;
}

const cache = new Map<AiProviderName, AiProvider>();

function build(name: AiProviderName): AiProvider {
  const env = getServerEnv();
  if (name === "anthropic") {
    return createAnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY!,
      model: env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    });
  }
  return createOpenAiProvider({
    apiKey: env.OPENAI_API_KEY!,
    model: env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
  });
}

/**
 * The provider to classify with, or null when no API key is set. Callers
 * treat null as "leave the capture in the inbox for manual filing".
 *
 * `preferred` is the user's saved choice (see `preference.ts`). It wins when
 * its key is configured; otherwise the env default is used.
 */
export function getAiProvider(preferred?: AiProviderName | null): AiProvider | null {
  const name =
    preferred && isAiProviderConfigured(preferred) ? preferred : defaultAiProviderName();
  if (!name) return null;

  let provider = cache.get(name);
  if (!provider) {
    provider = build(name);
    cache.set(name, provider);
  }
  return provider;
}
