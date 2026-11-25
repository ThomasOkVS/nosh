import { normaliseTag, type RecipeDto } from "@nosh/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/Skeleton";
import { errorMessage } from "@/lib/api";
import { recipesQuery } from "@/recipes/api";
import { LibraryEmpty, LibraryNoMatch } from "@/recipes/LibraryEmpty";
import { RecipeCard } from "@/recipes/RecipeCard";
import { TagChips } from "@/recipes/TagChips";

interface LibrarySearch {
  tag?: string;
}

/** REC-10: `?tag=Soup` selects "soup"; a blank or unusable tag is ignored. */
function validateSearch(search: Record<string, unknown>): LibrarySearch {
  const raw = search.tag;
  // The router parses `?tag=2024` as a number.
  const tag =
    typeof raw === "string" || typeof raw === "number" ? normaliseTag(String(raw)) : "";
  return tag === "" ? {} : { tag };
}

export const Route = createFileRoute("/_app/")({
  validateSearch,
  component: LibraryPage,
});

/** REC-09: newest created first; the later id wins a tie. */
function newestFirst(a: RecipeDto, b: RecipeDto): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id;
}

/** The owner's own tags, once each, in alphabetical order. */
function ownTags(recipes: RecipeDto[]): string[] {
  const tags = new Set(recipes.flatMap((r) => r.tags.map(normaliseTag)));
  return [...tags].sort((a, b) => a.localeCompare(b));
}

const kickerClass = "text-[0.6875rem] font-semibold tracking-[0.2em] text-highlight uppercase";

/**
 * Design §6.4 library: count kicker, display title, tag chips, 2-column
 * cards. The full list is fetched once and filtered here, so chips switch
 * instantly.
 */
function LibraryPage() {
  const { tag } = Route.useSearch();
  const { data, error } = useQuery(recipesQuery);

  return (
    <div className="pt-4">
      <div className="px-5">
        {data === undefined ? (
          error === null && <Skeleton className="h-3.5 w-20" />
        ) : (
          <p className={kickerClass}>{data.length === 1 ? "1 recipe" : `${data.length} recipes`}</p>
        )}
        <h1 className="mt-2 text-[2.6rem] leading-none">Library</h1>
      </div>
      {error !== null && data === undefined ? (
        <p role="alert" className="px-5 pt-6 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : data === undefined ? (
        <LibrarySkeleton />
      ) : data.length === 0 ? (
        <LibraryEmpty />
      ) : (
        <Library recipes={data} tag={tag} />
      )}
    </div>
  );
}

function Library({ recipes, tag }: { recipes: RecipeDto[]; tag: string | undefined }) {
  const shown = recipes
    .filter((r) => tag === undefined || r.tags.some((t) => normaliseTag(t) === tag))
    .sort(newestFirst);
  return (
    <>
      <div className="pt-4">
        <TagChips tags={ownTags(recipes)} active={tag} />
      </div>
      {shown.length === 0 ? (
        <LibraryNoMatch />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-5 pt-5">
          {shown.map((recipe) => (
            <li key={recipe.id}>
              <RecipeCard recipe={recipe} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** REC-40: card-shaped placeholders while the list loads. */
function LibrarySkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading recipes"
      className="grid grid-cols-2 gap-x-3 gap-y-5 px-5 pt-[4.25rem]"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} data-testid="card-skeleton">
          <Skeleton className="aspect-[4/5] rounded-lg" />
          <Skeleton className="mt-2 h-4 w-4/5" />
          <Skeleton className="mt-1.5 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
