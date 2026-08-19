import { z } from "zod";

export const collectionSchema = z.object({
  name: z.string().trim().min(1),
});

export type CollectionInput = z.infer<typeof collectionSchema>;
