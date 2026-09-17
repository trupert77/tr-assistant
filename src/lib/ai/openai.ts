import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
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
import {
  answerSchema,
  captureResultSchema,
  classificationSchema,
  planSchema,
  type AiProvider,
} from "./types";

export const DEFAULT_OPENAI_MODEL = "gpt-5.5";

/**
 * OpenAI strict structured outputs reject string length keywords, so the
 * schema sent to the model drops them. The full `captureResultSchema`
 * still validates the result before it leaves this module.
 */
const requestSchema = z.object({
  items: z.array(classificationSchema.extend({ title: z.string() })),
});

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
    async classify(text, ctx, image) {
      const prompt = buildUserMessage(text, ctx);
      const response = await client.responses.parse({
        model: options.model,
        instructions: SYSTEM_PROMPT,
        input: image
          ? [
              {
                role: "user",
                content: [
                  {
                    type: "input_image",
                    image_url: `data:${image.mediaType};base64,${image.base64}`,
                    detail: "auto",
                  },
                  { type: "input_text", text: prompt },
                ],
              },
            ]
          : prompt,
        max_output_tokens: 4096,
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
      const checked = captureResultSchema.safeParse(response.output_parsed);
      if (!checked.success) {
        throw new Error(
          `The classifier returned an invalid result: ${checked.error.issues
            .map((issue) => `${issue.path.join(".")} ${issue.message}`)
            .join("; ")}`,
        );
      }
      if (!checked.data.items.length) {
        throw new Error("The classifier returned no structured result.");
      }
      return { results: checked.data.items, model: response.model };
    },

    async answer(question, ctx, history = []) {
      const response = await client.responses.parse({
        model: options.model,
        instructions: ANSWER_SYSTEM_PROMPT,
        // Earlier turns carry only their text; the current item list rides on
        // the last message, so a follow-up always sees fresh data.
        input: [
          ...history.flatMap((turn) => [
            { role: "user" as const, content: turn.question },
            { role: "assistant" as const, content: turn.answer },
          ]),
          { role: "user" as const, content: buildAnswerMessage(question, ctx) },
        ],
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
        actions: parsed.data.actions,
        model: response.model,
      };
    },

    async draftNudge(input) {
      const response = await client.responses.create({
        model: options.model,
        instructions: NUDGE_SYSTEM_PROMPT,
        input: buildNudgeMessage(input),
        max_output_tokens: 1024,
        ...(supportsReasoning(options.model)
          ? { reasoning: { effort: "low" as const } }
          : {}),
      });
      const text = response.output_text.trim();
      if (!text) throw new Error("The assistant returned an empty draft.");
      return text;
    },

    async planGoal(input) {
      const response = await client.responses.parse({
        model: options.model,
        instructions: PLAN_SYSTEM_PROMPT,
        input: buildPlanMessage(input),
        max_output_tokens: 4096,
        ...(supportsReasoning(options.model)
          ? { reasoning: { effort: "medium" as const } }
          : {}),
        text: { format: zodTextFormat(planSchema, "plan") },
      });

      if (response.status === "incomplete") {
        throw new Error("The assistant ran out of room before finishing.");
      }
      const parsed = planSchema.safeParse(response.output_parsed);
      if (!parsed.success) {
        throw new Error("The assistant returned no structured result.");
      }
      return parsed.data.steps;
    },
  };
}
