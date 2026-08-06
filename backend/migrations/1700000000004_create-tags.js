exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE tags (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE recipe_tags (
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (recipe_id, tag_id)
    );

    CREATE INDEX recipe_tags_tag_id_idx ON recipe_tags (tag_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE recipe_tags;
    DROP TABLE tags;
  `);
};
