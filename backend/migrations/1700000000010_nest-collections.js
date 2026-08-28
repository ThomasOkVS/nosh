exports.up = (pgm) => {
  pgm.sql(`
    -- Collections can now nest inside each other, like folders. parent_id is
    -- nullable (root-level collections have no parent) and self-references
    -- collections; ON DELETE CASCADE means deleting a collection recursively
    -- deletes every collection nested inside it -- see the Collections
    -- section of docs/architecture.md for why that destructive behavior was
    -- chosen deliberately, over e.g. promoting contents to the parent.
    ALTER TABLE collections ADD COLUMN parent_id INTEGER REFERENCES collections(id) ON DELETE CASCADE;
    ALTER TABLE collections ADD CONSTRAINT collections_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id);

    -- The old UNIQUE(user_id, name) only made sense for a flat list -- two
    -- collections with the same name are fine now as long as they're not
    -- siblings (different parents, or one root-level and one not). A single
    -- UNIQUE(user_id, parent_id, name) can't express "unique among root-level
    -- siblings too", because Postgres treats NULL as distinct from NULL in a
    -- unique constraint -- two root collections both named "Other" wouldn't
    -- violate it. Two partial indexes, one per case, close that gap.
    ALTER TABLE collections DROP CONSTRAINT collections_user_id_name_key;
    CREATE UNIQUE INDEX collections_root_sibling_name_idx
      ON collections (user_id, name) WHERE parent_id IS NULL;
    CREATE UNIQUE INDEX collections_child_sibling_name_idx
      ON collections (user_id, parent_id, name) WHERE parent_id IS NOT NULL;

    CREATE INDEX collections_parent_id_idx ON collections (parent_id);

    -- Every recipe now belongs to exactly one collection. Added nullable
    -- first so existing rows can be backfilled below, then locked to
    -- NOT NULL once every row has a value.
    ALTER TABLE recipes ADD COLUMN collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE;

    -- Give every existing user a root-level "Other" collection to fall back
    -- on. It's an ordinary collection with no special flag -- see
    -- ensureDefaultCollection in backend/src/repositories/collections.ts,
    -- which does the same get-or-create for new users/recipes going forward.
    INSERT INTO collections (user_id, name)
      SELECT id, 'Other' FROM users
      ON CONFLICT (user_id, name) WHERE parent_id IS NULL DO NOTHING;

    -- Full snapshot of the many-to-many table before anything below touches
    -- it, kept around after recipe_collections itself is dropped. The
    -- backfill below collapses a recipe that was in more than one
    -- collection down to just one (see below) -- this table is what makes
    -- that recoverable rather than a silent, permanent loss: a human can
    -- read the original membership list straight out of it at any time,
    -- and down() restores from it exactly rather than only reconstructing
    -- one membership per recipe.
    CREATE TABLE recipe_collections_archive_1700000000010 AS
      SELECT * FROM recipe_collections;

    -- Best-effort only: this RAISE NOTICE is visible if this file is ever
    -- run directly through psql, but node-pg-migrate's own CLI -- what
    -- \`pnpm migrate up\` and every documented deploy step actually run --
    -- never listens for Postgres NOTICE events, so it is silently
    -- swallowed there (confirmed empirically, not assumed). The archive
    -- table above is the real safety net; verify with:
    --   SELECT recipe_id, COUNT(*) FROM recipe_collections_archive_1700000000010
    --   GROUP BY recipe_id HAVING COUNT(*) > 1;
    -- after running this migration, per docs/deployment.md.
    DO $do$
    DECLARE
      multi_membership_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO multi_membership_count FROM (
        SELECT recipe_id FROM recipe_collections GROUP BY recipe_id HAVING COUNT(*) > 1
      ) affected;
      IF multi_membership_count > 0 THEN
        RAISE NOTICE 'nest-collections migration: % recipe(s) were filed in more than one collection; only the lowest collection id is kept as recipes.collection_id for each. The full original membership list is preserved in recipe_collections_archive_1700000000010 for review/manual recovery.', multi_membership_count;
      END IF;
    END $do$;

    -- Backfill collection_id from the many-to-many recipe_collections table
    -- being dropped below. Deterministic rule for the (formerly allowed)
    -- case of a recipe belonging to more than one collection: keep the
    -- lowest collection id and drop the rest here -- documented in
    -- docs/decisions.md -- but nothing is actually destroyed: the archive
    -- table above holds every dropped membership.
    UPDATE recipes r SET collection_id = sub.collection_id
    FROM (
      SELECT DISTINCT ON (rc.recipe_id) rc.recipe_id, rc.collection_id
      FROM recipe_collections rc
      ORDER BY rc.recipe_id, rc.collection_id ASC
    ) sub
    WHERE r.id = sub.recipe_id;

    -- Recipes with zero prior memberships fall back to their owner's "Other".
    UPDATE recipes r SET collection_id = o.id
    FROM collections o
    WHERE r.collection_id IS NULL AND o.user_id = r.user_id AND o.parent_id IS NULL AND o.name = 'Other';

    ALTER TABLE recipes ALTER COLUMN collection_id SET NOT NULL;
    CREATE INDEX recipes_collection_id_idx ON recipes (collection_id);

    -- Fully replaced by the to-one recipes.collection_id FK above -- kept
    -- alongside it would just be a second, now-redundant source of truth.
    -- (The archive table above keeps its original contents regardless.)
    DROP TABLE recipe_collections;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    CREATE TABLE recipe_collections (
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      PRIMARY KEY (recipe_id, collection_id)
    );
    CREATE INDEX recipe_collections_collection_id_idx ON recipe_collections (collection_id);

    -- Restore the exact pre-migration membership set from up()'s archive
    -- when it's still there -- this is what makes rolling back this
    -- migration lossless rather than merely structural. Falls back to
    -- reconstructing one membership per recipe from recipes.collection_id
    -- only if the archive was deliberately cleaned up in the meantime.
    DO $do$
    BEGIN
      IF to_regclass('recipe_collections_archive_1700000000010') IS NOT NULL THEN
        INSERT INTO recipe_collections (recipe_id, collection_id)
          SELECT recipe_id, collection_id FROM recipe_collections_archive_1700000000010;
        DROP TABLE recipe_collections_archive_1700000000010;
      ELSE
        INSERT INTO recipe_collections (recipe_id, collection_id)
          SELECT id, collection_id FROM recipes WHERE collection_id IS NOT NULL;
      END IF;
    END $do$;

    ALTER TABLE recipes DROP COLUMN collection_id;

    DROP INDEX collections_parent_id_idx;
    DROP INDEX collections_child_sibling_name_idx;
    DROP INDEX collections_root_sibling_name_idx;
    -- Fails if nested collections created two same-named siblings at root
    -- level for one user in the meantime -- an accepted limit of rolling
    -- back a structural change like this one.
    ALTER TABLE collections ADD CONSTRAINT collections_user_id_name_key UNIQUE (user_id, name);
    ALTER TABLE collections DROP CONSTRAINT collections_no_self_parent;
    ALTER TABLE collections DROP COLUMN parent_id;
  `);
};
