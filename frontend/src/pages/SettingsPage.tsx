import { ScalesIcon, SparkleIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  getMagicImportSettings,
  getRecipePreferences,
  setMagicImportModel,
  type MagicImportModel,
  type MagicImportSettings,
} from "../api/settings";
import { Skeleton } from "../components/Skeleton";
import { useAsync } from "../hooks/useAsync";
import { RecipePreferencesSection } from "../components/RecipePreferencesSection";
import {
  errorBannerClass,
  optionCardClass,
  sectionCardClass,
  sectionHeadingClass,
} from "../styles";
import { useToast } from "../toast/ToastContext";

const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact" });

function formatTokens(model: MagicImportModel): string {
  const total = model.promptTokensToday + model.outputTokensToday;
  return `${compactNumber.format(total)} tokens used today`;
}

/** The headline number for one model — "left" only when a limit is known.
 * Always hedged with "~": Nosh only sees its own calls (see the footnote). */
function RequestsLine({ model }: Readonly<{ model: MagicImportModel }>) {
  if (model.dailyRequestLimit === null) {
    const noun = model.requestsToday === 1 ? "request" : "requests";
    return (
      <span>
        {model.requestsToday} {noun} today
      </span>
    );
  }
  const left = Math.max(0, model.dailyRequestLimit - model.requestsToday);
  const fraction = left / model.dailyRequestLimit;
  return (
    <span className="flex flex-col gap-1.5">
      <span className={left === 0 ? "text-danger-700 dark:text-danger-500" : undefined}>
        ~{left} of {model.dailyRequestLimit} requests left today
      </span>
      {/* Decorative — the sentence above already says the same thing. */}
      <span aria-hidden="true" className="block h-1 w-full max-w-48 bg-border">
        <span
          className={`block h-full ${fraction <= 0.2 ? "bg-danger-500" : "bg-sage-500"}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </span>
    </span>
  );
}

function MagicImportSection({ initial }: Readonly<{ initial: MagicImportSettings }>) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  if (!settings.aiConfigured) {
    return (
      <p className="text-sm text-ink-muted">
        AI-assisted import isn&rsquo;t set up on this server — it needs a{" "}
        <code>GEMINI_API_KEY</code>. Pages that publish their own recipe data still import fine.
      </p>
    );
  }

  const choose = (model: string | null) => {
    const previous = settings;
    // Optimistic: the radio moves immediately, and snaps back if the save
    // fails, rather than lagging a round trip behind the click.
    setSettings({ ...settings, selectedModel: model });
    setSaving(true);
    setMagicImportModel(model)
      .then(setSettings)
      .catch(() => {
        setSettings(previous);
        showToast("Couldn't save your model choice");
      })
      .finally(() => setSaving(false));
  };

  return (
    <fieldset disabled={saving} className="space-y-2">
      <legend className="mb-3 text-sm text-ink-muted">
        Only used when a page has no recipe data of its own, or for Instagram and TikTok videos.
      </legend>

      <label className={optionCardClass}>
        <input
          type="radio"
          name="import-model"
          value=""
          checked={settings.selectedModel === null}
          onChange={() => choose(null)}
          className="mt-1 accent-sauce-500"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Automatic</span>
          <span className="mt-0.5 block text-ink-muted">
            <span className="font-mono text-xs">{settings.defaultTextModel}</span> for web pages,{" "}
            <span className="font-mono text-xs">{settings.defaultVideoModel}</span> for videos
          </span>
        </span>
      </label>

      {settings.models.map((model) => (
        <label key={model.id} className={optionCardClass}>
          <input
            type="radio"
            name="import-model"
            value={model.id}
            checked={settings.selectedModel === model.id}
            onChange={() => choose(model.id)}
            className="mt-1 accent-sauce-500"
          />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block truncate font-mono text-ink">{model.id}</span>
            <span className="mt-1 flex flex-col gap-1 text-ink-muted sm:flex-row sm:items-start sm:justify-between">
              <RequestsLine model={model} />
              <span className="font-mono text-xs text-ink-faint">{formatTokens(model)}</span>
            </span>
          </span>
        </label>
      ))}

      <p className="pt-2 text-xs text-ink-faint">
        Estimates, counted from Nosh&rsquo;s own imports — Google doesn&rsquo;t report how much
        quota is left, and anything else using the same API key isn&rsquo;t seen here. Daily limits
        reset at midnight Pacific time.
      </p>
    </fieldset>
  );
}

export function SettingsPage() {
  const { data, error, loading } = useAsync(getMagicImportSettings);
  const preferences = useAsync(getRecipePreferences);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="font-display text-3xl font-bold italic text-ink sm:text-4xl">Settings</h1>
      </div>

      <section aria-labelledby="magic-import-heading" className={sectionCardClass}>
        <h2 id="magic-import-heading" className={`${sectionHeadingClass} mb-3`}>
          <SparkleIcon size={20} weight="fill" className="text-sauce-500" />
          Magic import
        </h2>
        {loading && !data && (
          <div className="space-y-2" aria-label="Loading">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {error && (
          <p role="alert" className={errorBannerClass}>
            <WarningIcon size={16} weight="fill" className="mr-1 inline" />
            {error}
          </p>
        )}
        {data && <MagicImportSection initial={data} />}
      </section>

      <section aria-labelledby="recipes-heading" className={sectionCardClass}>
        <h2 id="recipes-heading" className={`${sectionHeadingClass} mb-3`}>
          <ScalesIcon size={20} weight="fill" className="text-sauce-500" />
          Language &amp; units
        </h2>
        {preferences.loading && !preferences.data && (
          <div className="space-y-2" aria-label="Loading">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {preferences.error && (
          <p role="alert" className={errorBannerClass}>
            <WarningIcon size={16} weight="fill" className="mr-1 inline" />
            {preferences.error}
          </p>
        )}
        {preferences.data && <RecipePreferencesSection initial={preferences.data} />}
      </section>
    </div>
  );
}
