exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ingredients (
      id SERIAL PRIMARY KEY,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      quantity TEXT,
      unit TEXT,
      name TEXT NOT NULL
    );

    CREATE INDEX ingredients_recipe_id_idx ON ingredients (recipe_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE ingredients;`);
};
