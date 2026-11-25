import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Skeleton } from "@/components/Skeleton";
import { errorMessage } from "@/lib/api";
import { recipeQuery } from "@/recipes/api";
import { PhotoField } from "@/recipes/PhotoField";
import { RecipeForm, RecipeFormFrame } from "@/recipes/RecipeForm";
import { parseRecipeId, RECIPE_NOT_FOUND } from "@/recipes/recipeId";

// The trailing underscore keeps this route out of the recipe page, which has no outlet.
export const Route = createFileRoute("/_app/recipes/$id_/edit")({
  staticData: { fullBleed: true },
  component: EditRecipePage,
});

/** REC-27: "Edit recipe" with the stored recipe loaded into the fields. */
function EditRecipePage() {
  const { id: rawId } = Route.useParams();
  const navigate = useNavigate();
  const id = parseRecipeId(rawId);
  // An impossible id never reaches the API; the query stays idle.
  const { data, error } = useQuery({ ...recipeQuery(id ?? 0), enabled: id !== null });

  return (
    <RecipeFormFrame
      title="Edit recipe"
      back={{ to: "/recipes/$id", params: { id: rawId } }}
      backLabel="Back to recipe"
    >
      {id === null ? (
        <LoadError message={RECIPE_NOT_FOUND} />
      ) : data !== undefined ? (
        <RecipeForm
          // REC-32: keyed on the recipe, so no draft carries between forms.
          key={`edit-${id}`}
          mode="edit"
          recipe={data}
          // The photo follows the live query; the form's fields keep their draft.
          photo={<PhotoField mode="edit" recipe={data} pending={null} onPendingChange={noPending} />}
          onSaved={(savedId) =>
            void navigate({ to: "/recipes/$id", params: { id: String(savedId) }, replace: true })
          }
        />
      ) : error !== null ? (
        <LoadError message={errorMessage(error)} />
      ) : (
        <FormSkeleton />
      )}
    </RecipeFormFrame>
  );
}

/** The edit form never holds a pending file: it uploads at once. */
function noPending() {}

function LoadError({ message }: { message: string }) {
  return (
    <p role="alert" className="px-5 pt-8 font-display text-[1.75rem] leading-tight">
      {message}
    </p>
  );
}

/** REC-27: shaped like the form while the recipe loads. */
function FormSkeleton() {
  return (
    <div role="status" aria-label="Loading recipe" className="flex flex-col gap-4 px-5 pt-6">
      <Skeleton className="h-3.5 w-12" />
      <Skeleton className="h-11 rounded-xl" />
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <Skeleton className="mt-4 h-7 w-36" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-11 rounded-xl" />
      ))}
    </div>
  );
}
