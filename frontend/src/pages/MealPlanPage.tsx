import { CaretLeftIcon, CaretRightIcon, CircleNotchIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { clearMealPlanEntry, getMealPlanRange, setMealPlanEntry } from "../api/mealPlan";
import { recipeImageUrl } from "../api/recipes";
import type { MealPlanEntry } from "../api/types";
import { RecipePickerDialog } from "../components/RecipePickerDialog";
import { Skeleton } from "../components/Skeleton";
import { useAsync } from "../hooks/useAsync";
import { addDays, formatWeekLabel, startOfWeekMonday, todayString, weekDates } from "../lib/week";
import { buttonClass, errorBannerClass } from "../styles";
import { useToast } from "../toast/ToastContext";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayNumber(dateStr: string): number {
  return Number(dateStr.slice(-2));
}

/** Matches the real 7-column week grid's shape — see
 * docs/design-system.md#loading-states: no page may show bare "Loading…"
 * text for its initial load. */
function MealPlanSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="min-h-[9rem] rounded-lg border border-border bg-surface p-3">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="mt-3 aspect-[4/3] w-full" />
          <Skeleton className="mt-2 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function MealPlanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Seeded from the URL (like RecipeListPage's `?q=`) so a shared/reloaded
  // `?week=…` link restores the same week instead of always landing on the
  // current one.
  const [week, setWeek] = useState(() => searchParams.get("week") ?? startOfWeekMonday(new Date()));
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [clearingDate, setClearingDate] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("week", week);
        return next;
      },
      { replace: true },
    );
  }, [week, setSearchParams]);

  // Wrapped in useCallback with `week` as its dependency -- useAsync treats
  // this function itself as a useEffect dependency, so an unwrapped fetcher
  // would either refetch on every render or close over a stale week.
  const fetchWeek = useCallback(() => getMealPlanRange(week, addDays(week, 6)), [week]);
  const { data: entries, loading, error, reload } = useAsync(fetchWeek);

  // Switching weeks keeps the previous grid on screen with a small inline
  // spinner instead of blanking it -- only the very first load has no data
  // yet to show. See docs/design-system.md#loading-states.
  const isInitialLoad = loading && entries === null;
  const isRefetching = loading && entries !== null;

  const entriesByDate = new Map<string, MealPlanEntry>((entries ?? []).map((entry) => [entry.date, entry]));
  const dates = weekDates(week);
  const today = todayString();

  const handleSelect = (recipeId: number) => {
    const date = pickerDate;
    if (!date) return;
    setPickerDate(null);
    setMealPlanEntry(date, recipeId)
      .then(reload)
      .catch(() => showToast("Failed to assign recipe"));
  };

  const handleClear = (date: string) => {
    setClearingDate(date);
    clearMealPlanEntry(date)
      .then(reload)
      .catch(() => showToast("Failed to remove recipe"))
      .finally(() => setClearingDate(null));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold italic text-ink sm:text-4xl">This week</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-muted">
            {formatWeekLabel(week)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRefetching && (
            <CircleNotchIcon size={18} className="animate-spin text-ink-faint" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={() => setWeek((current) => addDays(current, -7))}
            aria-label="Previous week"
            className={buttonClass("ghost")}
          >
            <CaretLeftIcon size={18} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => setWeek(startOfWeekMonday(new Date()))}
            className={buttonClass("secondary")}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setWeek((current) => addDays(current, 7))}
            aria-label="Next week"
            className={buttonClass("ghost")}
          >
            <CaretRightIcon size={18} weight="bold" />
          </button>
        </div>
      </div>

      {error && <p className={errorBannerClass}>{error}</p>}

      {isInitialLoad ? (
        <MealPlanSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          {dates.map((date, index) => {
            const entry = entriesByDate.get(date);
            const isToday = date === today;
            return (
              <div
                key={date}
                data-testid={`meal-plan-day-${date}`}
                className={`flex min-h-[9rem] flex-col rounded-lg border p-3 ${
                  isToday
                    ? "border-sauce-500 bg-sauce-50 ring-1 ring-inset ring-sauce-500 dark:bg-sauce-500/10"
                    : "border-border bg-surface"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
                    {WEEKDAY_LABELS[index]}
                  </span>
                  <span className="font-display text-sm font-semibold text-ink">{dayNumber(date)}</span>
                </div>
                <div className="mt-2 flex-1">
                  {entry ? (
                    <div className="relative flex h-full flex-col gap-2">
                      <div className="aspect-[4/3] w-full overflow-hidden rounded-sm bg-surface-sunken">
                        {entry.recipe.images[0] && (
                          <img
                            src={recipeImageUrl(entry.recipe.id, entry.recipe.images[0].id)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <p className="truncate text-sm font-medium text-ink">{entry.recipe.title}</p>
                      <button
                        type="button"
                        onClick={() => handleClear(date)}
                        disabled={clearingDate === date}
                        aria-label={`Remove ${entry.recipe.title} from this day`}
                        className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-ink-muted shadow-sm hover:text-danger-500 disabled:opacity-50"
                      >
                        <XIcon size={14} weight="bold" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickerDate(date)}
                      className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-md text-ink-faint transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink-muted"
                    >
                      <PlusIcon size={20} />
                      <span className="text-xs">Add recipe</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecipePickerDialog
        open={pickerDate !== null}
        onSelect={handleSelect}
        onCancel={() => setPickerDate(null)}
      />
    </div>
  );
}
