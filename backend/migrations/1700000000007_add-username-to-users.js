exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN username TEXT;
    UPDATE users SET username = split_part(email, '@', 1) || '_' || id WHERE username IS NULL;
    ALTER TABLE users ALTER COLUMN username SET NOT NULL;
    ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE users DROP COLUMN username;`);
};
