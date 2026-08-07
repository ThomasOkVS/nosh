import {
  ArrowLeftIcon,
  ImageSquareIcon,
  ListChecksIcon,
  ListNumbersIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteRecipe, getRecipe, recipeImageUrl } from "../api/recipes";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Skeleton } from "../components/Skeleton";
import { useAsync } from "../hooks/useAsync";
import { buttonClass, errorBannerClass, sectionHeadingClass } from "../styles";

/** Mirrors the loaded layout below (back link real, everything data-dependent
 * skeletonized) — see docs/design-system.md#loading-states. */
function RecipeDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeftIcon size={16} />
        All recipes
      </Link>
      <Skeleton className="aspect-[16/9] w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3 rounded-full" />
        <Skeleton className="h-4 w-1/3 rounded-full" />
      </div>
      <div className="flex gap-1">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const recipeId = Number(id);
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const fetchRecipe = useCallback(() => getRecipe(recipeId), [recipeId]);
  const { data: recipe, loading, error } = useAsync(fetchRecipe);

  const confirmDelete = useCallback(() => {
    deleteRecipe(recipeId)
      .then(() => navigate("/"))
      .catch(() => window.alert("Failed to delete recipe"));
  }, [recipeId, navigate]);

  if (loading) {
    return <RecipeDetailSkeleton />;
  }
  if (error) {
    return <p className={errorBannerClass}>{error}</p>;
  }
  if (!recipe) {
    return null;
  }

  const [heroImage, ...otherImages] = recipe.images;
  const metaLine = [
    recipe.servings ? `${recipe.servings} servings` : null,
    recipe.prepTimeMinutes ? `${recipe.prepTimeMinutes} min prep` : null,
    recipe.cookTimeMinutes ? `${recipe.cookTimeMinutes} min cook` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeftIcon size={16} />
        All recipes
      </Link>

      {heroImage ? (
        // Info panel floats over the hero photo — see
        // docs/design-system.md#photo-overlay-panels for why this uses a
        // fixed-dark glass + white text instead of the theme-following
        // tokens used everywhere else.
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-surface-sunken">
          <img
            src={recipeImageUrl(recipe.id, heroImage.id)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />

          <div className="glass-photo absolute inset-x-3 bottom-3 rounded-lg p-4 sm:inset-x-4 sm:bottom-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-xl font-extrabold text-white sm:text-2xl">{recipe.title}</h1>
              <div className="flex flex-shrink-0 gap-2">
                <Link
                  to={`/recipes/${recipe.id}/edit`}
                  aria-label="Edit recipe"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-transform duration-standard ease-standard hover:scale-105 hover:bg-white/25 active:scale-95"
                >
                  <PencilSimpleIcon size={18} />
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete recipe"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-standard ease-standard hover:bg-white/25 hover:text-danger-300"
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            </div>
            {recipe.description && <p className="mt-1 text-sm text-white/80">{recipe.description}</p>}
            {metaLine && <p className="mt-2 text-sm text-white/80">{metaLine}</p>}
            {recipe.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {recipe.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/20 px-2 py-0.5 text-xs capitalize text-white">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg bg-citrus-50 text-citrus-500 dark:bg-citrus-500/15 dark:text-citrus-400">
            <ImageSquareIcon size={48} />
          </div>

          <div>
            <h1 className="font-display text-2xl font-extrabold text-ink">{recipe.title}</h1>
            {recipe.description && <p className="mt-1 text-ink-muted">{recipe.description}</p>}
          </div>

          {metaLine && <p className="text-sm text-ink-muted">{metaLine}</p>}

          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipe.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-teal-50 px-2 py-0.5 text-xs capitalize text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Link to={`/recipes/${recipe.id}/edit`} className={buttonClass("secondary")}>
              <PencilSimpleIcon size={16} />
              Edit
            </Link>
            <button type="button" onClick={() => setConfirmingDelete(true)} className={buttonClass("ghost")}>
              <TrashIcon size={16} />
              Delete
            </button>
          </div>
        </>
      )}

      {otherImages.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {otherImages.map((image) => (
            <img
              key={image.id}
              src={recipeImageUrl(recipe.id, image.id)}
              alt=""
              className="h-16 w-16 flex-shrink-0 rounded-md bg-surface-sunken object-cover"
            />
          ))}
        </div>
      )}

      {recipe.ingredients.length > 0 && (
        <section>
          <h2 className={sectionHeadingClass}>
            <ListChecksIcon size={20} className="text-teal-500" />
            Ingredients
          </h2>
          <ul className="mt-3 space-y-1.5">
            {recipe.ingredients.map((ingredient) => (
              <li
                key={ingredient.id}
                className="flex items-center gap-3 rounded-md bg-surface-sunken px-3 py-2 text-ink"
              >
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-500" />
                {[ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(" ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipe.steps.length > 0 && (
        <section>
          <h2 className={sectionHeadingClass}>
            <ListNumbersIcon size={20} className="text-citrus-500" />
            Steps
          </h2>
          <ol className="mt-3 space-y-3">
            {recipe.steps.map((step, index) => (
              <li key={step.id} className="flex gap-3 rounded-md bg-surface-sunken p-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-citrus-50 text-sm font-bold text-citrus-600 dark:bg-citrus-500/15 dark:text-citrus-400">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-ink">{step.instruction}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this recipe?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
