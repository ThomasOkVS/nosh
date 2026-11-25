import { createFileRoute } from "@tanstack/react-router";

// Placeholder so the library's links resolve; Task 10 replaces it with the form.
export const Route = createFileRoute("/_app/recipes/new")({
  component: () => (
    <div className="px-5 pt-4">
      <h1 className="text-[2.6rem] leading-none">New recipe</h1>
    </div>
  ),
});
