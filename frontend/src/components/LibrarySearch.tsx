import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type SubmitEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { isLibraryPath } from "../lib/collectionTree";
import { inputClass } from "../styles";

/**
 * The one recipe search box, always in the header so recipes can be found
 * from any page.
 *
 * - On a library folder page, the URL's `?q=` is the search: typing updates
 *   it (debounced) and `CollectionsPage` reads it to show results scoped to
 *   that folder and everything below it.
 * - Anywhere else (a recipe, the meal plan), pressing Enter jumps to Home's
 *   results for that query, i.e. a search of the whole library.
 */
export function LibrarySearch({ className = "" }: Readonly<{ className?: string }>) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const onLibrary = isLibraryPath(pathname);
  const urlQuery = onLibrary ? (searchParams.get("q") ?? "") : "";

  const [draft, setDraft] = useState(urlQuery);

  // Keep the box in step with the URL when *it* changes from outside —
  // Back/Forward, a "Search everywhere" link, leaving the library. This is
  // React's "adjust state while rendering" pattern (the recommended
  // alternative to a sync-state-from-props `useEffect`): React re-renders
  // immediately with the new state, before anything reaches the screen.
  // The `draft.trim()` check stops it undoing a trailing space the user is
  // mid-way through typing, since the URL only ever holds the trimmed value.
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    if (urlQuery !== draft.trim()) setDraft(urlQuery);
  }

  const writeQuery = useCallback(
    (query: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (query) next.set("q", query);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!onLibrary) return;
    const trimmed = draft.trim();
    if (trimmed === urlQuery) return;
    const timeout = setTimeout(() => writeQuery(trimmed), 300);
    return () => clearTimeout(timeout);
  }, [draft, onLibrary, urlQuery, writeQuery]);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (onLibrary) {
      writeQuery(trimmed);
    } else if (trimmed) {
      navigate(`/?q=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <form role="search" onSubmit={handleSubmit} className={`relative ${className}`}>
      <label htmlFor="library-search" className="sr-only">
        Search recipes
      </label>
      <MagnifyingGlassIcon
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
      />
      <input
        id="library-search"
        name="q"
        type="search"
        autoComplete="off"
        placeholder="Search recipes…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className={`w-full pl-9 ${inputClass}`}
      />
    </form>
  );
}
