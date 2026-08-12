import { ArrowLeftIcon, CircleNotchIcon, LinkIcon, SparkleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { importRecipeFromUrl, type ImportStage } from "../api/import";
import { buttonClass, errorBannerClass, inputClass, labelClass, sectionCardClass } from "../styles";

/** The two paths differ by an order of magnitude in how long they take, so
 * the copy says which one is running and sets the right expectation. */
const STAGE_LABELS: Record<ImportStage, string> = {
  fetching: "Fetching the page…",
  "structured-data": "Reading the page's recipe data…",
  ai: "No recipe data on this page — asking the AI to read it. This can take a few seconds…",
};

export function RecipeImportPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [stage, setStage] = useState<ImportStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // An import can run for ~20s. Without this, leaving the page mid-import
  // still resolves later and navigates the user off whatever page they moved
  // to — and keeps burning API quota for a result nobody will see.
  useEffect(() => () => abortRef.current?.abort(), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setImporting(false);
    setStage(null);
  }, []);

  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (importing) return;
      setError(null);
      setStage(null);
      setImporting(true);

      const controller = new AbortController();
      abortRef.current = controller;

      importRecipeFromUrl(url.trim(), setStage, controller.signal)
        .then((recipe) => {
          if (controller.signal.aborted) return;
          // Hand the extracted data to the normal create form rather than
          // saving it — the user reviews and corrects it there first.
          navigate("/recipes/new", { state: { importedRecipe: recipe } });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof ApiError ? err.message : "Failed to import that recipe");
          setImporting(false);
        });
    },
    [url, navigate, importing],
  );

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeftIcon size={16} />
        All recipes
      </Link>
      <h1 className="font-display text-2xl font-extrabold text-ink">Import a recipe</h1>

      {/* role="alert" so a failure is announced, not just shown — otherwise
        * a screen-reader user gets silence after a long wait. */}
      {error && (
        <p role="alert" className={errorBannerClass}>
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className={sectionCardClass}>
        <label htmlFor="import-url" className={labelClass}>
          Recipe URL
        </label>
        <input
          id="import-url"
          type="url"
          required
          placeholder="https://example.com/best-tomato-soup"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          // aria-disabled rather than disabled: disabling a focused input
          // throws focus to <body>, losing the user's place. The submit
          // handler guards against re-entry instead.
          aria-disabled={importing}
          readOnly={importing}
          className={`mt-1 w-full ${inputClass}`}
        />
        <p className="mt-2 text-sm text-ink-muted">
          Paste a link to a recipe page. We&rsquo;ll pull out the ingredients and steps so you can
          check them before saving.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={importing} className={buttonClass("primary")}>
            {importing ? (
              <>
                <CircleNotchIcon size={18} className="animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <LinkIcon size={18} weight="bold" />
                Import recipe
              </>
            )}
          </button>
          {/* An import can run for ~20s on the AI path; without this the only
            * way out is navigating away. */}
          {importing && (
            <button type="button" onClick={cancel} className={buttonClass("ghost")}>
              Cancel
            </button>
          )}
        </div>

        {/* aria-live so the stage change is announced rather than only seen —
         * it's the only feedback during a wait that can run to ~20 seconds. */}
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-ink-muted">
          {importing && stage !== null ? (
            <span className="inline-flex items-center gap-2">
              {stage === "ai" && <SparkleIcon size={16} weight="fill" className="text-citrus-500" />}
              {STAGE_LABELS[stage]}
            </span>
          ) : null}
        </p>
      </form>
    </div>
  );
}
