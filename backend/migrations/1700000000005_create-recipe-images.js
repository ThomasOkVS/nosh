exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE recipe_images (
      id SERIAL PRIMARY KEY,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE INDEX recipe_images_recipe_id_idx ON recipe_images (recipe_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE recipe_images;`);
};
