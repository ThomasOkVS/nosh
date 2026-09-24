import { z } from "zod";

// `z.url()` rather than the deprecated `z.string().url()` (zod 4). `.trim()`
// still applies first, so a pasted URL with stray whitespace validates.
export const importRequestSchema = z.object({
  url: z.url().trim(),
  // The folder the import was started from; omitted/null = Home.
  collectionId: z.number().int().positive().nullable().default(null),
});
