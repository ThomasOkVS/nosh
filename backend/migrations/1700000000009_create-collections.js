exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE collections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, name)
    );

    CREATE INDEX collections_user_id_idx ON collections (user_id);

    CREATE TABLE recipe_collections (
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      PRIMARY KEY (recipe_id, collection_id)
    );

    CREATE INDEX recipe_collections_collection_id_idx ON recipe_collections (collection_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE recipe_collections;
    DROP TABLE collections;
  `);
};
