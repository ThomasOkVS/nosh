import { createFileRoute } from "@tanstack/react-router";

// Placeholder so the recipe page's Edit resolves; Task 10 replaces it with the form.
export const Route = createFileRoute("/_app/recipes/$id_/edit")({
  component: () => (
    <div className="px-5 pt-4">
      <h1 className="text-[2.6rem] leading-none">Edit recipe</h1>
    </div>
  ),
});
