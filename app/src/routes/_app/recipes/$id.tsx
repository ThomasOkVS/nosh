import type { IngredientDto, RecipeDto, StepDto } from "@nosh/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Carrot, ChevronLeft, ClipboardList, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/Skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { recipeQuery, useDeleteRecipe } from "@/recipes/api";
import { factsLine, sourceHost } from "@/recipes/facts";
import { RecipeCover } from "@/recipes/RecipeCover";
import { panelId, SectionPill, tabId, type Section } from "@/recipes/SectionPill";

export const Route = createFileRoute("/_app/recipes/$id")({
  // Design §7: the page owns the screen; its section pill takes the nav's slot.
  staticData: { fullBleed: true },
  component: RecipePage,
});

const MAX_ID = 2147483647;
const NOT_FOUND = "Recipe not found";

/** Recipe ids are positive 32-bit integers; anything else can't be a recipe. */
function parseId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_ID ? id : null;
}

const floatButton =
  "grid size-9.5 place-items-center rounded-full bg-card/90 text-foreground shadow-[0_6px_20px_-10px_rgb(0_0_0/0.45)] backdrop-blur outline-none focus-visible:ring-3 focus-visible:ring-ring";
const floatTop = "absolute top-[max(1.125rem,env(safe-area-inset-top))] z-10";
const headlineCard =
  "relative mx-3.5 -mt-14 rounded-2xl bg-card px-4.5 pt-4.5 pb-4 text-card-foreground shadow-[0_10px_30px_-18px_rgb(0_0_0/0.3)]";
const kicker = "text-[0.6875rem] font-semibold tracking-[0.2em] text-highlight uppercase";

/**
 * Design §6.4 recipe page (REC-20 to REC-25): the magazine cover. The Back
 * link floats from the first frame, so it works while loading and on errors.
 */
function RecipePage() {
  const { id: rawId } = Route.useParams();
  const id = parseId(rawId);
  // An impossible id never reaches the API (REC-25); the query stays idle.
  const { data, error } = useQuery({ ...recipeQuery(id ?? 0), enabled: id !== null });

  return (
    // Room at the bottom for the floating section pill.
    <div className="relative flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <Link to="/" aria-label="Back to library" className={cn(floatButton, floatTop, "left-4")}>
        <ChevronLeft aria-hidden className="size-5" />
      </Link>
      {id === null ? (
        <PageError message={NOT_FOUND} />
      ) : data !== undefined ? (
        <Recipe recipe={data} />
      ) : error !== null ? (
        <PageError message={errorMessage(error)} />
      ) : (
        <RecipeSkeleton />
      )}
    </div>
  );
}

function Recipe({ recipe }: { recipe: RecipeDto }) {
  const facts = factsLine(recipe);
  const host = sourceHost(recipe.sourceUrl);
  return (
    <>
      <RecipeMenu recipeId={recipe.id} />
      <RecipeCover recipe={recipe} />
      <header className={headlineCard}>
        {recipe.tags.length > 0 && (
          <ul data-testid="recipe-tags" className={cn("flex flex-wrap", kicker)}>
            {recipe.tags.map((tag, index) => (
              <li key={tag}>
                {index > 0 && (
                  <span aria-hidden className="px-1.5">
                    ·
                  </span>
                )}
                {/* REC-23: across the whole library. */}
                <Link
                  to="/"
                  search={{ tag }}
                  className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                >
                  {tag}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <h1 className="mt-1.5 text-[2rem] leading-[1.02] break-words">{recipe.title}</h1>
        {facts !== "" && (
          <p data-testid="recipe-facts" className="mt-2 text-[0.8125rem] text-muted-foreground">
            {facts}
          </p>
        )}
        {recipe.description !== null && (
          <p
            data-testid="recipe-description"
            className="mt-3 text-sm leading-relaxed whitespace-pre-line"
          >
            {recipe.description}
          </p>
        )}
        {host !== null && recipe.sourceUrl !== null && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-block rounded-sm text-xs text-muted-foreground underline outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
          >
            Imported from {host}
          </a>
        )}
      </header>
      <Sections ingredients={recipe.ingredients} steps={recipe.steps} />
    </>
  );
}

type SectionId = "ingredients" | "method";

/** REC-20: Ingredients and Method, each only when it has entries. */
function Sections({ ingredients, steps }: { ingredients: IngredientDto[]; steps: StepDto[] }) {
  const idBase = useId();
  const [chosen, setChosen] = useState<SectionId>("ingredients");
  const sections: Section<SectionId>[] = [];
  if (ingredients.length > 0) sections.push({ id: "ingredients", label: "Ingredients", icon: Carrot });
  if (steps.length > 0) sections.push({ id: "method", label: "Method", icon: ClipboardList });
  const first = sections[0];
  if (first === undefined) return null;
  const active = sections.some((s) => s.id === chosen) ? chosen : first.id;

  return (
    <>
      <div
        role="tabpanel"
        id={panelId(idBase, active)}
        aria-labelledby={tabId(idBase, active)}
        className="px-5.5 pt-5"
      >
        {active === "ingredients" ? (
          <IngredientList ingredients={ingredients} />
        ) : (
          <StepList steps={steps} />
        )}
      </div>
      <SectionPill sections={sections} active={active} onChange={setChosen} idBase={idBase} />
    </>
  );
}

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** Amounts as stored ("2-3", "a pinch"); scaling and units come with UNIT. */
function IngredientList({ ingredients }: { ingredients: IngredientDto[] }) {
  return (
    <ol className="text-sm leading-relaxed">
      {[...ingredients].sort(byPosition).map((ingredient, index) => {
        const amount = [ingredient.quantity, ingredient.unit].filter((part) => part !== null).join(" ");
        return (
          <li key={ingredient.id} className="flex gap-3 py-1.5">
            <span aria-hidden className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <span className="w-[4.5rem] shrink-0 font-semibold break-words">{amount}</span>{" "}
            <span className="min-w-0 flex-1 break-words">{ingredient.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Steps with mustard numbers (design §7). */
function StepList({ steps }: { steps: StepDto[] }) {
  return (
    <ol className="space-y-4">
      {[...steps].sort(byPosition).map((step, index) => (
        <li key={step.id} className="flex gap-3">
          <span aria-hidden className="w-6 shrink-0 font-display text-xl leading-6 text-highlight">
            {index + 1}
          </span>
          <p className="min-w-0 flex-1 text-[0.9375rem] leading-6 break-words whitespace-pre-line">
            {step.instruction}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** The floating ⋯ menu: Edit, and Delete behind the confirm dialog (REC-20, REC-24). */
function RecipeMenu({ recipeId }: { recipeId: number }) {
  const navigate = useNavigate();
  const deleteRecipe = useDeleteRecipe(recipeId);
  const [confirming, setConfirming] = useState(false);

  function remove() {
    setConfirming(false);
    if (deleteRecipe.isPending) return;
    deleteRecipe.mutate(undefined, {
      // Replace: Back must never return to a recipe that is gone.
      onSuccess: () => void navigate({ to: "/", replace: true }),
      onError: () => toast.error("Failed to delete recipe"),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="More actions" className={cn(floatButton, floatTop, "right-4")}>
          <Ellipsis aria-hidden className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-36">
          <DropdownMenuItem
            onClick={() =>
              void navigate({ to: "/recipes/$id/edit", params: { id: String(recipeId) } })
            }
          >
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        title="Delete this recipe?"
        message="This can't be undone."
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/** REC-25: unknown, someone else's, or failed to load. */
function PageError({ message }: { message: string }) {
  return (
    <div className="px-5 pt-[calc(max(1.125rem,env(safe-area-inset-top))+4rem)]">
      <p role="alert" className="font-display text-[2rem] leading-tight">
        {message}
      </p>
    </div>
  );
}

/** REC-25: shaped like the page: cover, headline card, a list. */
function RecipeSkeleton() {
  return (
    <div role="status" aria-label="Loading recipe">
      <Skeleton className="h-[330px] rounded-none" />
      <div className={headlineCard}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-4/5" />
        <Skeleton className="mt-3 h-3.5 w-1/2" />
      </div>
      <div className="space-y-3 px-5.5 pt-6">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-3/4" />
        ))}
      </div>
    </div>
  );
}
