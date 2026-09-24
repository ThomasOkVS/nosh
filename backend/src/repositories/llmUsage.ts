import type { Pool } from "pg";

export interface LlmUsage {
  promptTokens: number;
  outputTokens: number;
}

export interface LlmUsageRow {
  model: string;
  requests: number;
  promptTokens: number;
  outputTokens: number;
}

/** Google resets Gemini's requests-per-day quotas at midnight Pacific time
 * (https://ai.google.dev/gemini-api/docs/rate-limits), so usage is bucketed
 * by the *Pacific* calendar day — not UTC and not the server's local zone.
 * Computed in SQL so the host's own time zone never enters into it. */
const QUOTA_DAY_SQL = `(now() AT TIME ZONE 'America/Los_Angeles')::date`;

/** Adds one request (and its tokens) to today's counter for `model`.
 * `INSERT … ON CONFLICT DO UPDATE` is Postgres's atomic upsert: two imports
 * finishing at the same instant both increment the same row rather than
 * racing to insert it, with no read-modify-write in application code. */
export async function recordLlmUsage(pool: Pool, model: string, usage: LlmUsage): Promise<void> {
  await pool.query(
    `INSERT INTO llm_usage (usage_day, model, requests, prompt_tokens, output_tokens)
     VALUES (${QUOTA_DAY_SQL}, $1, 1, $2, $3)
     ON CONFLICT (usage_day, model) DO UPDATE SET
       requests = llm_usage.requests + 1,
       prompt_tokens = llm_usage.prompt_tokens + EXCLUDED.prompt_tokens,
       output_tokens = llm_usage.output_tokens + EXCLUDED.output_tokens`,
    [model, usage.promptTokens, usage.outputTokens],
  );
}

/** Every model's usage in the current quota day. Models with no calls yet
 * today simply have no row. */
export async function listTodaysLlmUsage(pool: Pool): Promise<LlmUsageRow[]> {
  const result = await pool.query<{
    model: string;
    requests: number;
    prompt_tokens: number;
    output_tokens: number;
  }>(
    `SELECT model, requests, prompt_tokens, output_tokens
     FROM llm_usage
     WHERE usage_day = ${QUOTA_DAY_SQL}`,
  );
  return result.rows.map((row) => ({
    model: row.model,
    requests: row.requests,
    promptTokens: row.prompt_tokens,
    outputTokens: row.output_tokens,
  }));
}
