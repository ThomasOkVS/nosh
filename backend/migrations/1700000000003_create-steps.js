exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE steps (
      id SERIAL PRIMARY KEY,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      instruction TEXT NOT NULL
    );

    CREATE INDEX steps_recipe_id_idx ON steps (recipe_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE steps;`);
};
