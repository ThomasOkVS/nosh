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

    -- Backfill collection_id from the many-to-many recipe_collections table
    -- being dropped below. Deterministic rule for the (formerly allowed)
    -- case of a recipe belonging to more than one collection: keep the
    -- lowest collection id and drop the rest -- a real, acknowledged
    -- data-loss choice (documented in docs/decisions.md), even though
    -- today's only data is seed/demo content.
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

    -- Restores each recipe's one collection as a single membership row.
    -- Structural rollback only -- any second/third membership the up()
    -- migration's "lowest id wins" rule collapsed away is not recoverable.
    INSERT INTO recipe_collections (recipe_id, collection_id)
      SELECT id, collection_id FROM recipes WHERE collection_id IS NOT NULL;

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
