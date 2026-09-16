import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  ANSWER_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildAnswerMessage,
  buildUserMessage,
} from "./prompt";
import { answerSchema, classificationSchema, type AiProvider } from "./types";

export const DEFAULT_OPENAI_MODEL = "gpt-5.5";

/**
 * OpenAI strict structured outputs reject string length keywords, so the
 * schema sent to the model drops them. The full `classificationSchema`
 * still validates the result before it leaves this module.
 */
const requestSchema = classificationSchema.extend({ title: z.string() });

/** Reasoning models take `reasoning.effort`; older chat models reject it. */
function supportsReasoning(model: string): boolean {
  return /^(gpt-5|gpt-6|o\d)/.test(model);
}

export function createOpenAiProvider(options: {
  apiKey: string;
  model: string;
}): AiProvider {
  const client = new OpenAI({ apiKey: options.apiKey });

  return {
    name: "openai",
    async classify(text, ctx) {
      const response = await client.responses.parse({
        model: options.model,
        instructions: SYSTEM_PROMPT,
        input: buildUserMessage(text, ctx),
        max_output_tokens: 2048,
        // Groups requests so the static instructions hit the prompt cache.
        prompt_cache_key: "tr-assistant-classify",
        ...(supportsReasoning(options.model)
          ? { reasoning: { effort: "low" as const } }
          : {}),
        text: { format: zodTextFormat(requestSchema, "classification") },
      });

      const refused = response.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content)
        .find((part) => part.type === "refusal");
      if (refused) {
        throw new Error("The classifier declined to process this input.");
      }
      if (response.status === "incomplete") {
        const reason = response.incomplete_details?.reason;
        throw new Error(
          reason === "max_output_tokens"
            ? "The classifier ran out of room before finishing."
            : `The classifier stopped early (${reason ?? "unknown reason"}).`,
        );
      }
      if (!response.output_parsed) {
        throw new Error("The classifier returned no structured result.");
      }
      const checked = classificationSchema.safeParse(response.output_parsed);
      if (!checked.success) {
        throw new Error(
          `The classifier returned an invalid result: ${checked.error.issues
            .map((issue) => `${issue.path.join(".")} ${issue.message}`)
            .join("; ")}`,
        );
      }
      return { result: checked.data, model: response.model };
    },

    async answer(question, ctx) {
      const response = await client.responses.parse({
        model: options.model,
        instructions: ANSWER_SYSTEM_PROMPT,
        input: buildAnswerMessage(question, ctx),
        max_output_tokens: 4096,
        prompt_cache_key: "tr-assistant-answer",
        ...(supportsReasoning(options.model)
          ? { reasoning: { effort: "medium" as const } }
          : {}),
        text: { format: zodTextFormat(answerSchema, "answer") },
      });

      const refused = response.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content)
        .find((part) => part.type === "refusal");
      if (refused) {
        throw new Error("The assistant declined to answer this question.");
      }
      if (response.status === "incomplete") {
        throw new Error("The assistant ran out of room before finishing.");
      }
      const parsed = answerSchema.safeParse(response.output_parsed);
      if (!parsed.success) {
        throw new Error("The assistant returned no structured result.");
      }
      return {
        answer: parsed.data.answer.trim(),
        citedItemIds: parsed.data.cited_item_ids,
        model: response.model,
      };
    },
  };
}
