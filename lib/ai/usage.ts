import { createAdminClient } from "@/lib/supabase/admin";

export type AIProvider = "gemini" | "openrouter" | "self-hosted" | "local";
export type AITask = "analysis" | "fix";

/** Metadata only: never persist prompts, CV text, or credentials. */
export async function recordAIUsage(input: {
  userId: string | null;
  task: AITask;
  provider: AIProvider;
  model: string;
  status: "success" | "failure";
  inputTokens?: number | null;
  outputTokens?: number | null;
  promptCharacters?: number;
  responseCharacters?: number;
}): Promise<void> {
  if (!input.userId) return;
  try {
    const { error } = await createAdminClient().from("ai_usage_events").insert({
      user_id: input.userId,
      task: input.task,
      provider: input.provider,
      model: input.model,
      status: input.status,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      estimated_input_tokens: input.promptCharacters == null ? null : Math.ceil(input.promptCharacters / 4),
      estimated_output_tokens: input.responseCharacters == null ? null : Math.ceil(input.responseCharacters / 4),
    });
    if (error) console.warn("CVCommit AI usage metadata unavailable:", error.message);
  } catch (error) {
    console.warn("CVCommit AI usage metadata unavailable:", error);
  }
}
