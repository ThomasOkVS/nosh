import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import argon2 from "argon2";
import type { Pool } from "pg";
import { addRecipeImage, createRecipe } from "../repositories/recipes";
import type { RecipeInput } from "../validation/recipes";

const DEMO_EMAIL = "demo@nosh.be";
const DEMO_USERNAME = "Demo";
const DEMO_PASSWORD = "123";

interface DemoRecipe {
  input: RecipeInput;
  imageColor: string;
}

const DEMO_RECIPES: DemoRecipe[] = [
  {
    imageColor: "#7c4a2d",
    input: {
      title: "Vlaamse Stoverij",
      description: "Classic Flemish beef stew braised in dark beer, best served with fries.",
      servings: 6,
      prepTimeMinutes: 20,
      cookTimeMinutes: 150,
      ingredients: [
        { quantity: "1", unit: "kg", name: "beef chuck, cubed" },
        { quantity: "2", unit: null, name: "onions, sliced" },
        { quantity: "500", unit: "ml", name: "Belgian dark ale" },
        { quantity: "2", unit: "tbsp", name: "Dijon mustard" },
        { quantity: "2", unit: "slices", name: "bread, spread with mustard" },
      ],
      steps: [
        { instruction: "Season the beef and brown it in batches in a hot pot, then set aside." },
        { instruction: "Soften the onions in the same pot until golden." },
        {
          instruction:
            "Return the beef, add the ale and mustard, tuck in the bread slices, cover and braise on low heat for 2.5 hours.",
        },
      ],
      tags: ["belgian", "stew", "comfort food", "dinner"],
      sourceUrl: null,
    },
  },
  {
    imageColor: "#c0392b",
    input: {
      title: "Tomato Soup",
      description: "A warm, simple tomato soup finished with a swirl of cream.",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 25,
      ingredients: [
        { quantity: "1", unit: "kg", name: "ripe tomatoes, chopped" },
        { quantity: "1", unit: null, name: "onion, diced" },
        { quantity: "2", unit: "cloves", name: "garlic, minced" },
        { quantity: "500", unit: "ml", name: "vegetable stock" },
        { quantity: "2", unit: "tbsp", name: "cream" },
      ],
      steps: [
        { instruction: "Sauté the onion and garlic until soft." },
        { instruction: "Add the tomatoes and stock, and simmer for 20 minutes." },
        { instruction: "Blend until smooth and stir in the cream." },
      ],
      tags: ["soup", "comfort food", "vegetarian", "dinner"],
      sourceUrl: null,
    },
  },
  {
    imageColor: "#d35400",
    input: {
      title: "Spaghetti Bolognese",
      description: "A rich, slow-simmered meat sauce over spaghetti.",
      servings: 4,
      prepTimeMinutes: 15,
      cookTimeMinutes: 45,
      ingredients: [
        { quantity: "500", unit: "g", name: "beef mince" },
        { quantity: "1", unit: null, name: "onion, diced" },
        { quantity: "2", unit: "cloves", name: "garlic, minced" },
        { quantity: "400", unit: "g", name: "canned tomatoes" },
        { quantity: "400", unit: "g", name: "spaghetti" },
      ],
      steps: [
        { instruction: "Brown the mince with the onion and garlic." },
        { instruction: "Add the tomatoes and simmer for 30 minutes." },
        { instruction: "Cook the spaghetti and toss with the sauce." },
      ],
      tags: ["pasta", "italian", "dinner", "comfort food"],
      sourceUrl: null,
    },
  },
  {
    imageColor: "#4c9a4a",
    input: {
      title: "Greek Salad",
      description: "A crisp, fresh salad with feta and olives.",
      servings: 4,
      prepTimeMinutes: 15,
      cookTimeMinutes: null,
      ingredients: [
        { quantity: "2", unit: null, name: "tomatoes, cut into wedges" },
        { quantity: "1", unit: null, name: "cucumber, sliced" },
        { quantity: "100", unit: "g", name: "feta cheese, cubed" },
        { quantity: "50", unit: "g", name: "black olives" },
        { quantity: "2", unit: "tbsp", name: "olive oil" },
      ],
      steps: [
        { instruction: "Combine the tomatoes, cucumber, feta, and olives in a bowl." },
        { instruction: "Drizzle with olive oil and toss gently." },
      ],
      tags: ["salad", "vegetarian", "healthy", "lunch"],
      sourceUrl: null,
    },
  },
  {
    imageColor: "#d4a017",
    input: {
      title: "Belgian Waffles",
      description: "Light, crisp waffles — a Belgian breakfast classic.",
      servings: 4,
      prepTimeMinutes: 15,
      cookTimeMinutes: 20,
      ingredients: [
        { quantity: "250", unit: "g", name: "flour" },
        { quantity: "2", unit: null, name: "eggs" },
        { quantity: "500", unit: "ml", name: "milk" },
        { quantity: "50", unit: "g", name: "butter, melted" },
        { quantity: "1", unit: "tbsp", name: "sugar" },
      ],
      steps: [
        { instruction: "Whisk the flour, eggs, milk, butter, and sugar into a smooth batter." },
        { instruction: "Cook in a waffle iron until golden, about 4 minutes each." },
      ],
      tags: ["belgian", "breakfast", "sweet"],
      sourceUrl: null,
    },
  },
];

// Real photos aren't available for seed data, so each recipe gets a simple
// generated placeholder instead — a colored card with the recipe's name.
// SVG rather than a raster format so this needs no image-encoding library;
// Express infers the right Content-Type from the .svg extension when the
// existing image route serves it back.
function placeholderImageSvg(title: string, color: string): string {
  const escaped = title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="${color}" />
  <text x="400" y="300" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700" fill="#ffffff">${escaped}</text>
</svg>
`;
}

async function ensureRecipeImage(
  pool: Pool,
  uploadsDir: string,
  recipeId: number,
  demo: DemoRecipe,
): Promise<void> {
  const existingImage = await pool.query(`SELECT 1 FROM recipe_images WHERE recipe_id = $1`, [recipeId]);
  if (existingImage.rows.length > 0) {
    return;
  }

  const filename = `${randomUUID()}.svg`;
  fs.writeFileSync(path.join(uploadsDir, filename), placeholderImageSvg(demo.input.title, demo.imageColor));
  await addRecipeImage(pool, recipeId, filename);
}

export async function seedDemoData(pool: Pool, uploadsDir: string): Promise<void> {
  fs.mkdirSync(uploadsDir, { recursive: true });

  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  const userResult = await pool.query<{ id: number }>(
    `INSERT INTO users (email, username, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [DEMO_EMAIL, DEMO_USERNAME, passwordHash],
  );
  const userId = userResult.rows[0]!.id;

  let seededCount = 0;
  for (const demo of DEMO_RECIPES) {
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM recipes WHERE user_id = $1 AND title = $2`,
      [userId, demo.input.title],
    );

    let recipeId: number;
    if (existing.rows.length > 0) {
      recipeId = existing.rows[0]!.id;
    } else {
      const recipe = await createRecipe(pool, userId, demo.input);
      recipeId = recipe.id;
      seededCount += 1;
    }

    await ensureRecipeImage(pool, uploadsDir, recipeId, demo);
  }

  console.log(
    `Seeded demo data: user ${DEMO_EMAIL} (username "${DEMO_USERNAME}", password "${DEMO_PASSWORD}"), ${seededCount} new recipe(s) added.`,
  );
}
