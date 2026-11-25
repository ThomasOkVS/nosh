import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useUploadNewCover } from "@/recipes/api";
import { PhotoField } from "@/recipes/PhotoField";
import { RecipeForm, RecipeFormFrame } from "@/recipes/RecipeForm";

export const Route = createFileRoute("/_app/recipes/new")({
  // The form owns the screen; its Save bar takes the nav's slot.
  staticData: { fullBleed: true },
  component: NewRecipePage,
});

/** REC-27: the blank "New recipe" form. */
function NewRecipePage() {
  const navigate = useNavigate();
  // REC-33: nothing is stored until the recipe exists; the file waits here.
  const [photo, setPhoto] = useState<File | null>(null);
  const uploadCover = useUploadNewCover();
  return (
    <RecipeFormFrame title="New recipe" back={{ to: "/" }} backLabel="Back to library">
      <RecipeForm
        // REC-32: a fresh form for every route instance.
        key="new"
        mode="create"
        photo={<PhotoField mode="create" pending={photo} onPendingChange={setPhoto} />}
        // An upload error propagates: the form shows it and still goes on (REC-33).
        onCreated={async (recipe) => {
          if (photo !== null) await uploadCover.mutateAsync({ recipeId: recipe.id, file: photo });
        }}
        // REC-30: replace, so Back never returns to a form that would create a duplicate.
        onSaved={(id) => void navigate({ to: "/recipes/$id", params: { id: String(id) }, replace: true })}
      />
    </RecipeFormFrame>
  );
}
