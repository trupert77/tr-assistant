import { getServerEnv } from "@/lib/env";
import { DEFAULT_ANTHROPIC_MODEL, createAnthropicProvider } from "./anthropic";
import { DEFAULT_OPENAI_MODEL, createOpenAiProvider } from "./openai";
import type { AiProvider } from "./types";

export type {
  AiProvider,
  AnswerContext,
  AnswerResult,
  AnswerTurn,
  AssistantAction,
  Classification,
  ClassifyContext,
  ClassifyImage,
  ContextEvent,
  ContextItem,
  NudgeInput,
  PlanInput,
  PlanStep,
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

/** One choice in the Claude / ChatGPT switch. */
export type AiProviderOption = {
  name: AiProviderName;
  label: string;
  model: string;
  configured: boolean;
};

export function aiProviderOptions(): AiProviderOption[] {
  return AI_PROVIDERS.map((p) => ({
    name: p.name,
    label: p.label,
    model: p.defaultModel,
    configured: isAiProviderConfigured(p.name),
  }));
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

/** The provider name `getAiProvider(preferred)` will use, for showing the active choice. */
export function resolveAiProviderName(preferred?: AiProviderName | null): AiProviderName | null {
  return preferred && isAiProviderConfigured(preferred) ? preferred : defaultAiProviderName();
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
  const name = resolveAiProviderName(preferred);
  if (!name) return null;

  let provider = cache.get(name);
  if (!provider) {
    provider = build(name);
    cache.set(name, provider);
  }
  return provider;
}
