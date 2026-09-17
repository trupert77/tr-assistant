import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  ANSWER_SYSTEM_PROMPT,
  NUDGE_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildAnswerMessage,
  buildNudgeMessage,
  buildPlanMessage,
  buildUserMessage,
} from "./prompt";
import { answerSchema, captureResultSchema, planSchema, type AiProvider } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

export function createAnthropicProvider(options: {
  apiKey: string;
  model: string;
}): AiProvider {
  const client = new Anthropic({ apiKey: options.apiKey });

  return {
    name: "anthropic",
    async classify(text, ctx, image) {
      const prompt = buildUserMessage(text, ctx);
      const response = await client.beta.messages.parse({
        model: options.model,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: betaZodOutputFormat(captureResultSchema),
        },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: image
              ? [
                  {
                    type: "image",
                    source: { type: "base64", media_type: image.mediaType, data: image.base64 },
                  },
                  { type: "text", text: prompt },
                ]
              : prompt,
          },
        ],
      });

      if (response.stop_reason === "refusal") {
        throw new Error("The classifier declined to process this input.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("The classifier ran out of room before finishing.");
      }
      const parsed = response.parsed_output;
      if (!parsed?.items.length) {
        throw new Error("The classifier returned no structured result.");
      }
      return { results: parsed.items, model: response.model };
    },

    async answer(question, ctx, history = []) {
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
        // Earlier turns carry only their text; the current item list rides on
        // the last message, so a follow-up always sees fresh data.
        messages: [
          ...history.flatMap((turn) => [
            { role: "user" as const, content: turn.question },
            { role: "assistant" as const, content: turn.answer },
          ]),
          { role: "user", content: buildAnswerMessage(question, ctx) },
        ],
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
        actions: parsed.actions,
        model: response.model,
      };
    },

    async draftNudge(input) {
      const response = await client.beta.messages.create({
        model: options.model,
        max_tokens: 1024,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: NUDGE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildNudgeMessage(input) }],
      });

      if (response.stop_reason === "refusal") {
        throw new Error("The assistant declined to draft this message.");
      }
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      if (!text) throw new Error("The assistant returned an empty draft.");
      return text;
    },

    async planGoal(input) {
      const response = await client.beta.messages.parse({
        model: options.model,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "medium",
          format: betaZodOutputFormat(planSchema),
        },
        system: PLAN_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPlanMessage(input) }],
      });

      if (response.stop_reason === "refusal") {
        throw new Error("The assistant declined to plan this goal.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("The assistant ran out of room before finishing.");
      }
      if (!response.parsed_output) {
        throw new Error("The assistant returned no structured result.");
      }
      return response.parsed_output.steps;
    },
  };
}
