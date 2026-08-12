exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE recipes ADD COLUMN source_url TEXT;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE recipes DROP COLUMN source_url;`);
};
