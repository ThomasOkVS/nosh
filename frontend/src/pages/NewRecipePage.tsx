import { WarningIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { getImport, markImportReviewed } from "../api/import";
import { importedRecipeFrom, type ImportedRecipeState } from "../import/importedRecipe";
import { buttonClass, errorBannerClass } from "../styles";
import { RecipeFormPage, RecipeFormSkeleton } from "./RecipeFormPage";

function importIdFrom(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * `/recipes/new`. Usually just the empty create form, but when reached from
 * a finished import (`?importId=…`) it makes sure the form has that
 * import's recipe to seed from.
 *
 * Normally the recipe is already in router state — ImportProvider puts it
 * there when it navigates here. But a tapped push notification cold-starts
 * the app straight onto this URL with no state at all, so in that case the
 * job is fetched and the recipe written *into* router state (a replace
 * navigation) before the form mounts. That keeps RecipeFormPage itself
 * unchanged: it only ever seeds from state, synchronously, in its `useState`
 * initializers — the React equivalent of an Angular route resolver running
 * before the component is created.
 */
export function NewRecipePage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const importId = importIdFrom(searchParams.get("importId"));
  const hasImportedState = importedRecipeFrom(location.state) !== null;
  const [error, setError] = useState<string | null>(null);

  // Once the user has the result in front of them, the app stops offering
  // it again on launch. Idempotent server-side, so StrictMode's double
  // effect run (or a reload of this page) is harmless.
  useEffect(() => {
    if (importId === null) return;
    markImportReviewed(importId).catch(() => undefined);
  }, [importId]);

  useEffect(() => {
    if (importId === null || hasImportedState) return;
    let cancelled = false;
    getImport(importId)
      .then((job) => {
        if (cancelled) return;
        if (job.status === "done" && job.recipe) {
          const state: ImportedRecipeState = { importedRecipe: job.recipe, importedImageUrl: job.imageUrl };
          navigate({ search: location.search }, { replace: true, state });
        } else if (job.status === "error") {
          setError(job.errorMessage ?? "That import failed.");
        } else {
          setError("That import isn't available any more.");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "That import isn't available any more."
            : "Couldn't load that import.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [importId, hasImportedState, navigate, location.search]);

  if (importId !== null && !hasImportedState) {
    if (!error) return <RecipeFormSkeleton />;
    return (
      <div className="space-y-4">
        <p role="alert" className={errorBannerClass}>
          <WarningIcon size={16} weight="fill" className="mr-1 inline" />
          {error}
        </p>
        <Link to="/recipes/new" className={buttonClass("secondary")}>
          Start a blank recipe
        </Link>
      </div>
    );
  }

  // Keyed so switching between a blank form and an imported one (same
  // route, same tree position) remounts instead of carrying state over.
  return <RecipeFormPage key={importId === null ? "new" : `import-${importId}`} />;
}
