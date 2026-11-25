import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { resetAccounts } from "./reset-db";

const PASSWORD = "correct horse battery";
const photo = fileURLToPath(new URL("./fixtures/photo.jpg", import.meta.url));

// One owner per project (sign-up is limited, SEC-20); the journey is one test.
test.beforeAll(async () => {
  await resetAccounts();
});

test("REC-02 REC-14 REC-20 REC-23 REC-24 REC-40: empty library → create with a photo → recipe page → edit → tag filter → delete → empty again", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Username").fill("cook");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Empty library.
  await expect(page.getByText("Your library is empty")).toBeVisible();

  // Create, with a photo and a tag.
  await page.getByRole("link", { name: "Add your first recipe" }).click();
  await page.getByLabel("Title").fill("Tomato soup");
  await page.getByLabel("Quantity 1", { exact: true }).fill("500");
  await page.getByLabel("Unit 1", { exact: true }).fill("g");
  await page.getByLabel("Ingredient 1", { exact: true }).fill("tomatoes");
  await page.getByLabel("Step 1", { exact: true }).fill("Simmer and blend.");
  const tags = page.getByRole("textbox", { name: "Tags" });
  await tags.fill("soup");
  await tags.press("Enter");
  await page.getByLabel("Choose a photo").setInputFiles(photo);
  await page.getByRole("button", { name: "Save" }).click();

  // The recipe page, with its cover.
  await expect(page.getByRole("heading", { name: "Tomato soup" })).toBeVisible();
  await expect(page.getByText("tomatoes").first()).toBeVisible();
  await expect(page.locator("img[src*='/api/recipes/']").first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const img = document.querySelector<HTMLImageElement>("img[src*='/api/recipes/']");
        return img !== null && img.complete && img.naturalWidth > 0;
      }),
    )
    .toBe(true);

  // Edit the title.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("Roasted tomato soup");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Roasted tomato soup" })).toBeVisible();

  // A second recipe, so the tag filter has something to leave out.
  await page.getByRole("link", { name: "Back to library" }).click();
  await page.getByRole("link", { name: "New recipe or import" }).click();
  await page.getByLabel("Title").fill("Pancakes");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Pancakes" })).toBeVisible();

  // Tag filter: the tag link on the recipe page opens the filtered library.
  await page.getByRole("link", { name: "Back to library" }).click();
  await expect(page.getByText("2 recipes")).toBeVisible();
  await page.getByRole("navigation", { name: "Tags" }).getByRole("link", { name: "soup" }).click();
  await expect(page).toHaveURL(/\?tag=soup/);
  await expect(page.getByText("1 of 2")).toBeVisible();
  await expect(page.getByText("Roasted tomato soup")).toBeVisible();
  await expect(page.getByText("Pancakes")).toHaveCount(0);

  // Delete both, back to the empty library.
  for (const title of ["Roasted tomato soup", "Pancakes"]) {
    await page.goto("/");
    await page.getByText(title).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText("Delete this recipe?")).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  }
  await expect(page.getByText("Your library is empty")).toBeVisible();
});
