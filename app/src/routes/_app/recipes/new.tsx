import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RecipeForm, RecipeFormFrame } from "@/recipes/RecipeForm";

export const Route = createFileRoute("/_app/recipes/new")({
  // The form owns the screen; its Save bar takes the nav's slot.
  staticData: { fullBleed: true },
  component: NewRecipePage,
});

/** REC-27: the blank "New recipe" form. */
function NewRecipePage() {
  const navigate = useNavigate();
  return (
    <RecipeFormFrame title="New recipe" back={{ to: "/" }} backLabel="Back to library">
      <RecipeForm
        // REC-32: a fresh form for every route instance.
        key="new"
        mode="create"
        // REC-30: replace, so Back never returns to a form that would create a duplicate.
        onSaved={(id) => void navigate({ to: "/recipes/$id", params: { id: String(id) }, replace: true })}
      />
    </RecipeFormFrame>
  );
}
