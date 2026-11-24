import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "server/drizzle/**", ".claude/**", ".superpowers/**", "docs/**"] },
  ...tseslint.configs.recommended,
);
