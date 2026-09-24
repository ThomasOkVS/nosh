exports.up = (pgm) => {
  pgm.sql(`
    -- A recipe can now sit directly at Home (the top level of the library)
    -- instead of being forced into a real collection. NULL means "at Home";
    -- the FK and ON DELETE CASCADE are unchanged, so deleting a collection
    -- still deletes the recipes inside it, and a Home recipe is never
    -- touched by any collection delete. See docs/decisions.md.
    ALTER TABLE recipes ALTER COLUMN collection_id DROP NOT NULL;

    -- The auto-created root-level "Other" collection only existed because
    -- Home couldn't hold recipes, so the recipes filed directly in it move to
    -- Home. The folder itself is then removed only if that leaves it empty:
    -- one with sub-collections was organized by hand, so it stays as an
    -- ordinary folder, keeping them.
    UPDATE recipes SET collection_id = NULL
      WHERE collection_id IN (
        SELECT id FROM collections WHERE parent_id IS NULL AND name = 'Other'
      );
    DELETE FROM collections c
      WHERE c.parent_id IS NULL AND c.name = 'Other'
        AND NOT EXISTS (SELECT 1 FROM collections child WHERE child.parent_id = c.id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Rebuild a root-level "Other" for every user who has recipes at Home,
    -- then move those recipes into it so NOT NULL can be restored.
    INSERT INTO collections (user_id, name)
      SELECT DISTINCT user_id, 'Other' FROM recipes WHERE collection_id IS NULL
      ON CONFLICT (user_id, name) WHERE parent_id IS NULL DO NOTHING;

    UPDATE recipes r SET collection_id = o.id
      FROM collections o
      WHERE r.collection_id IS NULL AND o.user_id = r.user_id
        AND o.parent_id IS NULL AND o.name = 'Other';

    ALTER TABLE recipes ALTER COLUMN collection_id SET NOT NULL;
  `);
};
