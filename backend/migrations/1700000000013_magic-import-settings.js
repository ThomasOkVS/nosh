exports.up = (pgm) => {
  pgm.sql(`
    -- The user's preferred Gemini model for magic import. NULL means
    -- "automatic": each extraction path uses its own configured default
    -- (GEMINI_TEXT_MODEL / GEMINI_VIDEO_MODEL). Plain TEXT, not a foreign key
    -- or enum -- the allowed models are runtime config (GEMINI_MODELS), not
    -- schema, so a stored id that has since been removed from the allowlist
    -- is simply ignored and treated as automatic.
    ALTER TABLE users ADD COLUMN import_model TEXT;

    -- One counter row per (Google quota day, model). Google's API exposes no
    -- "quota remaining" endpoint, so Nosh counts its own calls to estimate
    -- it. Deliberately not per-user: Gemini rate limits apply per Google
    -- Cloud project, so every Nosh user shares the same budget. usage_day is
    -- the calendar day in America/Los_Angeles, since that's when Google
    -- resets daily quotas -- see docs/decisions.md.
    CREATE TABLE llm_usage (
      usage_day DATE NOT NULL,
      model TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (usage_day, model)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE llm_usage;
    ALTER TABLE users DROP COLUMN import_model;
  `);
};
