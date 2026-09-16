import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  ANSWER_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildAnswerMessage,
  buildUserMessage,
} from "./prompt";
import { answerSchema, classificationSchema, type AiProvider } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

export function createAnthropicProvider(options: {
  apiKey: string;
  model: string;
}): AiProvider {
  const client = new Anthropic({ apiKey: options.apiKey });

  return {
    name: "anthropic",
    async classify(text, ctx) {
      const response = await client.beta.messages.parse({
        model: options.model,
        max_tokens: 2048,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: betaZodOutputFormat(classificationSchema),
        },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildUserMessage(text, ctx) }],
      });

      if (response.stop_reason === "refusal") {
        throw new Error("The classifier declined to process this input.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("The classifier ran out of room before finishing.");
      }
      const parsed = response.parsed_output;
      if (!parsed) {
        throw new Error("The classifier returned no structured result.");
      }
      return { result: parsed, model: response.model };
    },

    async answer(question, ctx) {
      const response = await client.beta.messages.parse({
        model: options.model,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "medium",
          format: betaZodOutputFormat(answerSchema),
        },
        system: [
          {
            type: "text",
            text: ANSWER_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildAnswerMessage(question, ctx) }],
      });

      if (response.stop_reason === "refusal") {
        throw new Error("The assistant declined to answer this question.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("The assistant ran out of room before finishing.");
      }
      const parsed = response.parsed_output;
      if (!parsed) {
        throw new Error("The assistant returned no structured result.");
      }
      return {
        answer: parsed.answer.trim(),
        citedItemIds: parsed.cited_item_ids,
        model: response.model,
      };
    },
  };
}
