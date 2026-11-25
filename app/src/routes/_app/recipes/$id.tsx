import { createFileRoute } from "@tanstack/react-router";

// Placeholder so the library's cards resolve; Task 9 replaces it with the recipe page.
export const Route = createFileRoute("/_app/recipes/$id")({
  component: () => (
    <div className="px-5 pt-4">
      <h1 className="text-[2.6rem] leading-none">Recipe</h1>
    </div>
  ),
});
