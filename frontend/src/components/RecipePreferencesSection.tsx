import { useState } from "react";
import { updateRecipePreferences, type RecipePreferences } from "../api/settings";
import { optionCardClass } from "../styles";
import { useToast } from "../toast/ToastContext";

interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

const LANGUAGE_CHOICES: Choice<RecipePreferences["language"]>[] = [
  { value: null, label: "Keep original", hint: "Imports stay in the source's language" },
  { value: "nl", label: "Nederlands" },
  { value: "en", label: "English" },
];

const UNIT_SYSTEM_CHOICES: Choice<RecipePreferences["unitSystem"]>[] = [
  { value: "metric", label: "Metric", hint: "g, kg, ml, l" },
  { value: "us", label: "US", hint: "oz, lb, cups" },
];

const TEMPERATURE_CHOICES: Choice<RecipePreferences["temperatureUnit"]>[] = [
  { value: "C", label: "°C" },
  { value: "F", label: "°F" },
];

function ChoiceGroup<K extends "language" | "unitSystem" | "temperatureUnit">({
  field,
  legend,
  choices,
  value,
  onChoose,
}: Readonly<{
  field: K;
  legend: string;
  choices: Choice<RecipePreferences[K]>[];
  value: RecipePreferences[K];
  onChoose: (value: RecipePreferences[K]) => void;
}>) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {choices.map((choice) => (
          <label key={String(choice.value)} className={optionCardClass}>
            <input
              type="radio"
              name={field}
              value={String(choice.value)}
              checked={value === choice.value}
              onChange={() => onChoose(choice.value)}
              className="mt-1 accent-sauce-500"
            />
            <span className="text-sm">
              <span className="font-medium text-ink">{choice.label}</span>
              {choice.hint && <span className="mt-0.5 block text-ink-muted">{choice.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Settings → Language & units: what imports are translated into, and
 * which units every recipe is shown (and imported) in. */
export function RecipePreferencesSection({ initial }: Readonly<{ initial: RecipePreferences }>) {
  const [preferences, setPreferences] = useState(initial);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const save = (changes: Partial<RecipePreferences>) => {
    const previous = preferences;
    // Optimistic, like the magic-import choice: the control moves at once
    // and snaps back if the save fails.
    setPreferences({ ...preferences, ...changes });
    setSaving(true);
    updateRecipePreferences(changes)
      .then(setPreferences)
      .catch(() => {
        setPreferences(previous);
        showToast("Couldn't save your preference");
      })
      .finally(() => setSaving(false));
  };

  return (
    <fieldset disabled={saving} className="space-y-5">
      <ChoiceGroup
        field="language"
        legend="Recipe language"
        choices={LANGUAGE_CHOICES}
        value={preferences.language}
        onChoose={(language) => save({ language })}
      />
      <p className="-mt-3 text-xs text-ink-faint">
        Imported recipes are translated into this language; that can use one extra AI request.
      </p>

      <ChoiceGroup
        field="unitSystem"
        legend="Units"
        choices={UNIT_SYSTEM_CHOICES}
        value={preferences.unitSystem}
        onChoose={(unitSystem) => save({ unitSystem })}
      />

      <ChoiceGroup
        field="temperatureUnit"
        legend="Oven temperature"
        choices={TEMPERATURE_CHOICES}
        value={preferences.temperatureUnit}
        onChoose={(temperatureUnit) => save({ temperatureUnit })}
      />

      <label className={optionCardClass}>
        <input
          type="checkbox"
          checked={preferences.keepSpoons}
          onChange={(event) => save({ keepSpoons: event.target.checked })}
          className="mt-1 accent-sauce-500"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Keep spoons as spoons</span>
          <span className="mt-0.5 block text-ink-muted">
            Show teaspoons and tablespoons as they are instead of converting them to ml.
          </span>
        </span>
      </label>

      <p className="text-xs text-ink-faint">
        Every recipe is shown in these units, and imports are saved in them. Amounts are exact, to
        two decimals.
      </p>
    </fieldset>
  );
}
