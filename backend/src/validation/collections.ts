import { z } from "zod";

export const collectionSchema = z.object({
  name: z.string().trim().min(1),
  parentId: z.number().int().positive().nullable().default(null),
});

export type CollectionInput = z.infer<typeof collectionSchema>;
