exports.up = (pgm) => {
  pgm.sql(`
    -- One row per recipe import. Imports used to live only as long as the
    -- HTTP request that started them (streamed NDJSON, aborted when the
    -- client disconnected), so closing the app on a phone threw the work
    -- away. Persisting them lets the import finish server-side with the app
    -- closed, and lets the app pick the result back up when reopened. See
    -- the Recipe import section of docs/architecture.md.
    CREATE TABLE import_jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      -- The folder the import was started from, so the finished recipe is
      -- pre-filed there -- stored on the job because a notification tap
      -- cold-starts the app with no other record of it. SET NULL: if the
      -- folder is deleted meanwhile, the recipe just defaults to Home.
      collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'done', 'error', 'cancelled')),
      -- Stages seen so far, in order -- the frontend's stepper renders the
      -- whole list, not just the latest stage.
      seen_stages TEXT[] NOT NULL DEFAULT '{}',
      -- The extracted, validated-but-unsaved RecipeInput. JSONB rather than
      -- real recipe rows: it's a draft the user still reviews in the form,
      -- and it only becomes a recipe when they save it.
      recipe JSONB,
      image_url TEXT,
      -- The HTTP status the failure maps to (400/422/502/503/500), kept so
      -- the frontend can phrase errors the same way the old stream did.
      error_status INTEGER,
      error_message TEXT,
      -- Set once the user has saved or dismissed the result; unreviewed
      -- finished jobs are what the app offers to "Review" on launch.
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX import_jobs_user_id_idx ON import_jobs (user_id);

    -- One row per browser/device that opted into push notifications. The
    -- endpoint is the push service URL the browser hands out (Apple's,
    -- Google's, Mozilla's) and is globally unique, so it's the natural key
    -- for "subscribe again from the same device" upserts.
    CREATE TABLE push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      -- The browser's public key and auth secret for payload encryption
      -- (RFC 8291) -- not credentials for anything else.
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions (user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE push_subscriptions;
    DROP TABLE import_jobs;
  `);
};
