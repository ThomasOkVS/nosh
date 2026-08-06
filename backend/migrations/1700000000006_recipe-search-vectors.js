exports.up = (pgm) => {
  pgm.sql(`
    -- Recomputes one recipe's search_vector from scratch: its own title and
    -- description, plus everything hanging off it in child tables. Called
    -- from triggers below whenever ingredients/steps/tags change, since a
    -- recipe row's own BEFORE trigger (see previous migration) only sees its
    -- own columns and has no way to react to changes in other tables.
    CREATE FUNCTION recompute_recipe_search_vector(target_recipe_id INTEGER) RETURNS void AS $$
    BEGIN
      UPDATE recipes SET search_vector =
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce((
          SELECT string_agg(name, ' ') FROM ingredients WHERE recipe_id = target_recipe_id
        ), '')), 'C') ||
        setweight(to_tsvector('english', coalesce((
          SELECT string_agg(instruction, ' ') FROM steps WHERE recipe_id = target_recipe_id
        ), '')), 'D') ||
        setweight(to_tsvector('english', coalesce((
          SELECT string_agg(t.name, ' ')
          FROM recipe_tags rt
          JOIN tags t ON t.id = rt.tag_id
          WHERE rt.recipe_id = target_recipe_id
        ), '')), 'B')
      WHERE id = target_recipe_id;
    END;
    $$ LANGUAGE plpgsql;

    CREATE FUNCTION ingredients_touch_recipe_search_vector() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM recompute_recipe_search_vector(OLD.recipe_id);
      ELSE
        PERFORM recompute_recipe_search_vector(NEW.recipe_id);
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER ingredients_search_vector_sync
    AFTER INSERT OR UPDATE OR DELETE ON ingredients
    FOR EACH ROW
    EXECUTE FUNCTION ingredients_touch_recipe_search_vector();

    CREATE FUNCTION steps_touch_recipe_search_vector() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM recompute_recipe_search_vector(OLD.recipe_id);
      ELSE
        PERFORM recompute_recipe_search_vector(NEW.recipe_id);
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER steps_search_vector_sync
    AFTER INSERT OR UPDATE OR DELETE ON steps
    FOR EACH ROW
    EXECUTE FUNCTION steps_touch_recipe_search_vector();

    CREATE FUNCTION recipe_tags_touch_recipe_search_vector() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM recompute_recipe_search_vector(OLD.recipe_id);
      ELSE
        PERFORM recompute_recipe_search_vector(NEW.recipe_id);
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER recipe_tags_search_vector_sync
    AFTER INSERT OR UPDATE OR DELETE ON recipe_tags
    FOR EACH ROW
    EXECUTE FUNCTION recipe_tags_touch_recipe_search_vector();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS recipe_tags_search_vector_sync ON recipe_tags;
    DROP FUNCTION IF EXISTS recipe_tags_touch_recipe_search_vector();
    DROP TRIGGER IF EXISTS steps_search_vector_sync ON steps;
    DROP FUNCTION IF EXISTS steps_touch_recipe_search_vector();
    DROP TRIGGER IF EXISTS ingredients_search_vector_sync ON ingredients;
    DROP FUNCTION IF EXISTS ingredients_touch_recipe_search_vector();
    DROP FUNCTION IF EXISTS recompute_recipe_search_vector(INTEGER);
  `);
};
