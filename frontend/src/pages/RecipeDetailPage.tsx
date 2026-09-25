import {
  ArrowLeftIcon,
  ImageSquareIcon,
  LinkIcon,
  ListChecksIcon,
  ListNumbersIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { convertTemperaturesInText, formatQuantity } from "@nosh/units";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteRecipe, getRecipe, recipeImageUrl } from "../api/recipes";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IngredientList } from "../components/IngredientList";
import { RecipeCollectionPicker } from "../components/RecipeCollectionPicker";
import { ServingsStepper } from "../components/ServingsStepper";
import { Skeleton } from "../components/Skeleton";
import { TagChip } from "../components/TagChip";
import { useAsync } from "../hooks/useAsync";
import { useRecipePreferences } from "../hooks/useRecipePreferences";
import { libraryPath } from "../lib/collectionTree";
import { errorBannerClass, sectionHeadingClass } from "../styles";
import { useToast } from "../toast/ToastContext";

/**
 * Parses a stored source URL for display, returning null rather than throwing
 * if it isn't a usable web link. Both halves matter: `new URL()` throws on a
 * malformed value (which would blank the whole page, since this runs during
 * render), and the scheme check keeps a `javascript:` value out of the href.
 */
function parseSourceLink(sourceUrl: string | null): { href: string; hostname: string } | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { href: url.toString(), hostname: url.hostname };
  } catch {
    return null;
  }
}

/** Mirrors the loaded layout below (back link real, everything data-dependent
 * skeletonized) — see docs/design-system.md#loading-states. */
function RecipeDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeftIcon size={16} />
        Library
      </Link>
      <Skeleton className="aspect-[16/9] w-full rounded-lg" />
      <div className="space-y-2 border-b border-border pb-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const recipeId = Number(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Scaling is view-only state: just a multiplier (and which ingredient it
  // was set from, if any). Every displayed amount is derived from it.
  const [scale, setScale] = useState<{ factor: number; anchorId: number | null }>({
    factor: 1,
    anchorId: null,
  });
  const preferences = useRecipePreferences();

  const fetchRecipe = useCallback(() => getRecipe(recipeId), [recipeId]);
  const { data: recipe, loading, error, reload } = useAsync(fetchRecipe);

  const steps = useMemo(
    () =>
      (recipe?.steps ?? []).map((step) => ({
        ...step,
        instruction: convertTemperaturesInText(step.instruction, preferences.temperatureUnit),
      })),
    [recipe, preferences.temperatureUnit],
  );

  const confirmDelete = useCallback(() => {
    deleteRecipe(recipeId)
      .then(() => navigate(libraryPath(recipe?.collectionId ?? null)))
      .catch(() => showToast("Failed to delete recipe"));
  }, [recipeId, recipe, navigate, showToast]);

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
  const sourceLink = parseSourceLink(recipe.sourceUrl);
  const metaLine = [
    recipe.servings ? `Serves ${formatQuantity(recipe.servings * scale.factor)}` : null,
    recipe.prepTimeMinutes ? `Prep ${recipe.prepTimeMinutes} min` : null,
    recipe.cookTimeMinutes ? `Cook ${recipe.cookTimeMinutes} min` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="space-y-6">
      <Link
        to={libraryPath(recipe.collectionId)}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon size={16} />
        Library
      </Link>

      {/* Cookbook Editorial (2026-08-26) drops the glass-photo overlay
          pattern: title/meta/tags now sit below the photo as a masthead
          block, in both the photo and no-photo case, rather than one of them
          floating text over the image — see docs/design-system.md#detail-page-layout.
          That also removes the original collision risk the overlay's
          title+buttons flex row was built to avoid (nothing floats over the
          image any more), but the same "one flex row, not independently
          positioned" shape is kept below for the same reason: robust to a
          long title regardless of layout. */}
      {heroImage ? (
        <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border border-border bg-surface-sunken">
          <img
            src={recipeImageUrl(recipe.id, heroImage.id)}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg border border-border bg-sauce-50 text-sauce-500 dark:bg-sauce-500/15 dark:text-sauce-400">
          <ImageSquareIcon size={48} />
        </div>
      )}

      <div className="space-y-3 border-b border-border pb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-bold italic text-ink sm:text-3xl">
            {recipe.title}
          </h1>
          <div className="flex flex-shrink-0 gap-2">
            <Link
              to={`/recipes/${recipe.id}/edit`}
              aria-label="Edit recipe"
              className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink"
            >
              <PencilSimpleIcon size={18} />
            </Link>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Delete recipe"
              className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-danger-500"
            >
              <TrashIcon size={18} />
            </button>
          </div>
        </div>

        {recipe.description && (
          <p className="font-display text-lg italic text-ink-muted">{recipe.description}</p>
        )}
        {metaLine && (
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{metaLine}</p>
        )}
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-1">
            {recipe.tags.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                variant="editorial"
                onClick={(t) => navigate(`/?tag=${encodeURIComponent(t)}`)}
              />
            ))}
          </div>
        )}
      </div>

      {sourceLink && (
        <a
          href={sourceLink.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <LinkIcon size={16} />
          Imported from {sourceLink.hostname}
        </a>
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

      <RecipeCollectionPicker
        recipeId={recipe.id}
        collectionId={recipe.collectionId}
        onMoved={reload}
      />

      {recipe.ingredients.length > 0 && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={sectionHeadingClass}>
              <ListChecksIcon size={20} className="text-sage-500" />
              Ingredients
            </h2>
            <ServingsStepper
              servings={recipe.servings}
              factor={scale.factor}
              onChange={(factor) => setScale({ factor, anchorId: null })}
            />
          </div>
          <IngredientList
            ingredients={recipe.ingredients}
            factor={scale.factor}
            preferences={preferences}
            anchorId={scale.anchorId}
            onAnchor={(anchorId, factor) => setScale({ factor, anchorId })}
          />
        </section>
      )}

      {steps.length > 0 && (
        <section>
          <h2 className={sectionHeadingClass}>
            <ListNumbersIcon size={20} className="text-sauce-500" />
            Steps
          </h2>
          {/* Large serif numerals instead of a circular badge, and a drop cap
              on the first step's first letter — the "pull-quote" signature
              this direction was picked for, see docs/design-system.md#detail-page-layout. */}
          <ol className="mt-3 space-y-6">
            {steps.map((step, index) => (
              <li key={step.id} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="w-8 flex-shrink-0 font-display text-3xl font-bold italic leading-none text-sauce-500/50"
                >
                  {index + 1}
                </span>
                <p
                  className={`pt-1 text-ink ${
                    index === 0
                      ? "first-letter:float-left first-letter:mr-1 first-letter:font-display first-letter:text-4xl first-letter:font-bold first-letter:italic first-letter:leading-[0.8] first-letter:text-sauce-600 dark:first-letter:text-sauce-400"
                      : ""
                  }`}
                >
                  {step.instruction}
                </p>
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
