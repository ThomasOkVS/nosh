export const RECIPE_LANGUAGES = ["nl", "en"] as const;
export type RecipeLanguage = (typeof RECIPE_LANGUAGES)[number];

export const UNIT_SYSTEMS = ["metric", "us"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const TEMPERATURE_UNITS = ["C", "F"] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

/** A user's display/import preferences for amounts. */
export interface UnitPreferences {
  unitSystem: UnitSystem;
  temperatureUnit: TemperatureUnit;
  /** Keep tsp/tbsp as spoons in metric instead of converting them to ml —
   * common practice in European recipes. */
  keepSpoons: boolean;
}

export const DEFAULT_UNIT_PREFERENCES: UnitPreferences = {
  unitSystem: "metric",
  temperatureUnit: "C",
  keepSpoons: true,
};
