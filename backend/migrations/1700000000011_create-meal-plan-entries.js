exports.up = (pgm) => {
  pgm.sql(`
    -- One row per (user, calendar day) with a recipe assigned to it. There
    -- is no meal_plans table -- every user has exactly one ongoing calendar,
    -- browsed week by week client-side, not a collection of named/creatable
    -- plans. See the Weekly meal planner section of docs/architecture.md.
    CREATE TABLE meal_plan_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      -- Plain DATE, not TIMESTAMPTZ -- a meal-plan slot is a calendar day,
      -- not a point in time, and the app never stores a time-of-day for it.
      -- This is the first DATE column in the schema (everything else uses
      -- TIMESTAMPTZ). Named planned_on rather than date so it doesn't
      -- collide with the SQL type name and reads cleanly in
      -- "WHERE planned_on BETWEEN ...". See docs/architecture.md for the
      -- repo-layer rule (cast to text on the way out) that keeps this from
      -- being silently shifted a day by pg's local-midnight Date parsing.
      planned_on DATE NOT NULL,
      -- CASCADE (not SET NULL): an entry carries no data beyond "which
      -- recipe, which day" -- when the recipe is deleted there's nothing
      -- left worth keeping a row for, so the day just goes back to empty.
      -- See docs/decisions.md for the full reasoning.
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      -- One recipe per day, per user -- the "single ongoing calendar" rule
      -- enforced at the database level, not just app-level validation. This
      -- same index (user_id leading) also serves the "recipes planned in
      -- date range X-Y" query the future grocery-list feature needs, so no
      -- separate range index is added.
      UNIQUE (user_id, planned_on)
    );

    CREATE INDEX meal_plan_entries_recipe_id_idx ON meal_plan_entries (recipe_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE meal_plan_entries;
  `);
};
