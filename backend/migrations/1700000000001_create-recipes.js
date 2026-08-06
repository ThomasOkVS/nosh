exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE recipes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      servings INTEGER,
      prep_time_minutes INTEGER,
      cook_time_minutes INTEGER,
      search_vector tsvector,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX recipes_user_id_idx ON recipes (user_id);
    CREATE INDEX recipes_search_vector_idx ON recipes USING GIN (search_vector);

    -- Generic "bump updated_at on any row change" trigger function, reusable
    -- by future tables that want the same behavior.
    CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER recipes_set_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

    -- search_vector from the recipe's own columns. Cross-table contributions
    -- (ingredients, steps, tags) are layered on in a later migration, once
    -- those tables exist.
    CREATE FUNCTION recipes_set_own_search_vector() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER recipes_search_vector_from_own_columns
    BEFORE INSERT OR UPDATE OF title, description ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION recipes_set_own_search_vector();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS recipes_search_vector_from_own_columns ON recipes;
    DROP TRIGGER IF EXISTS recipes_set_updated_at ON recipes;
    DROP FUNCTION IF EXISTS recipes_set_own_search_vector();
    DROP FUNCTION IF EXISTS set_updated_at();
    DROP TABLE recipes;
  `);
};
