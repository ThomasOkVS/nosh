import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** AUTH-23: optional unique email, username unique ignoring case. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    email: text("email").unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${table.username})`)],
);

/** `id` is HMAC-SHA256(SESSION_SECRET, token) in hex; the raw token lives only in the cookie. */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Recipes (design §6.1). Integer ids so the importer can keep v1 ids; whoever inserts
 * explicit ids resets the sequence afterwards. `collection_id` has no FK until COL. */
export const recipes = pgTable(
  "recipes",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    servings: integer("servings"),
    prepTimeMinutes: integer("prep_time_minutes"),
    cookTimeMinutes: integer("cook_time_minutes"),
    sourceUrl: text("source_url"),
    collectionId: integer("collection_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("recipes_servings_positive", sql`${table.servings} > 0`),
    check("recipes_prep_time_positive", sql`${table.prepTimeMinutes} > 0`),
    check("recipes_cook_time_positive", sql`${table.cookTimeMinutes} > 0`),
    index("recipes_user_created_idx").on(table.userId, table.createdAt.desc()),
  ],
);

export const ingredients = pgTable(
  "ingredients",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    quantity: text("quantity"),
    unit: text("unit"),
    name: text("name").notNull(),
  },
  (table) => [index("ingredients_recipe_idx").on(table.recipeId)],
);

export const steps = pgTable(
  "steps",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    instruction: text("instruction").notNull(),
  },
  (table) => [index("steps_recipe_idx").on(table.recipeId)],
);

/** Shared across users, stored lower-case, never deleted when unused (REC-07). */
export const tags = pgTable("tags", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull().unique(),
});

export const recipeTags = pgTable(
  "recipe_tags",
  {
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.tagId] }),
    index("recipe_tags_tag_idx").on(table.tagId),
  ],
);

/** The cover is marked, never derived from position (REC-15); at most one per recipe. */
export const recipeImages = pgTable(
  "recipe_images",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    cardFileName: text("card_file_name"),
    position: integer("position").notNull(),
    isCover: boolean("is_cover").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every image of a recipe (REC-15 list, REC-13 delete); the cover index is partial.
    index("recipe_images_recipe_idx").on(table.recipeId),
    uniqueIndex("recipe_images_one_cover_idx")
      .on(table.recipeId)
      .where(sql`${table.isCover}`),
  ],
);
