exports.up = (pgm) => {
  pgm.sql(`
    -- Per-user recipe preferences: what language imports are translated
    -- into, and what units every recipe is shown (and imported) in. CHECK
    -- constraints rather than free TEXT (contrast import_model in
    -- migration 013): these option lists live in code (@nosh/units), not in
    -- runtime config, so the database can safely reject anything else.
    -- recipe_language NULL = keep the source's language (no translation).
    ALTER TABLE users
      ADD COLUMN recipe_language TEXT CHECK (recipe_language IN ('nl', 'en')),
      ADD COLUMN unit_system TEXT NOT NULL DEFAULT 'metric' CHECK (unit_system IN ('metric', 'us')),
      ADD COLUMN temperature_unit TEXT NOT NULL DEFAULT 'C' CHECK (temperature_unit IN ('C', 'F')),
      ADD COLUMN keep_spoons BOOLEAN NOT NULL DEFAULT true;

    -- True when an import was asked to translate but couldn't (quota,
    -- outage, bad output), so the review form can say the recipe is still
    -- in its original language.
    ALTER TABLE import_jobs ADD COLUMN translation_skipped BOOLEAN NOT NULL DEFAULT false;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE import_jobs DROP COLUMN translation_skipped;
    ALTER TABLE users
      DROP COLUMN keep_spoons,
      DROP COLUMN temperature_unit,
      DROP COLUMN unit_system,
      DROP COLUMN recipe_language;
  `);
};
