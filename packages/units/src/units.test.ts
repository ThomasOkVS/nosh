import { describe, expect, it } from "vitest";
import {
  anchorFactor,
  canAnchor,
  convertIngredient,
  convertTemperaturesInText,
  formatQuantity,
  lookupUnit,
  parseNumber,
  parseQuantity,
  UNIT_WORDS,
  type ConvertOptions,
} from "./index";

const metric: ConvertOptions = {
  unitSystem: "metric",
  temperatureUnit: "C",
  keepSpoons: true,
};
const metricNoSpoons: ConvertOptions = { ...metric, keepSpoons: false };
const us: ConvertOptions = {
  unitSystem: "us",
  temperatureUnit: "F",
  keepSpoons: true,
};

function ing(quantity: string | null, unit: string | null, name = "thing") {
  return { quantity, unit, name };
}

describe("parseNumber", () => {
  it.each([
    ["2", 2],
    ["2.5", 2.5],
    ["2,5", 2.5],
    ["1/2", 0.5],
    ["½", 0.5],
    ["1 1/2", 1.5],
    ["1 ½", 1.5],
    ["1½", 1.5],
    ["⅓", 1 / 3],
  ])("%s -> %d", (text, value) => {
    expect(parseNumber(text)).toBeCloseTo(value, 10);
  });

  it.each(["", "a few", "1/0", "1 2", "2.5.1", "½½"])("rejects %j", (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe("parseQuantity", () => {
  it("parses singles, ranges and multipacks", () => {
    expect(parseQuantity("1 1/2")).toEqual({ kind: "single", value: 1.5 });
    expect(parseQuantity("2-3")).toEqual({ kind: "range", min: 2, max: 3 });
    expect(parseQuantity("2 to 3")).toEqual({ kind: "range", min: 2, max: 3 });
    expect(parseQuantity("2 tot 3")).toEqual({ kind: "range", min: 2, max: 3 });
    expect(parseQuantity("2 x 400")).toEqual({
      kind: "multipack",
      count: 2,
      size: 400,
    });
    expect(parseQuantity("2×400")).toEqual({
      kind: "multipack",
      count: 2,
      size: 400,
    });
  });

  it("returns null for text it doesn't understand", () => {
    expect(parseQuantity(null)).toBeNull();
    expect(parseQuantity("a pinch")).toBeNull();
    expect(parseQuantity("some")).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("shows at most two decimals, trimmed, never fractions", () => {
    expect(formatQuantity(133.3333)).toBe("133.33");
    expect(formatQuantity(1.5)).toBe("1.5");
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(2.666666)).toBe("2.67");
    expect(formatQuantity(0.004)).toBe("0.004");
  });
});

describe("lookupUnit", () => {
  it("recognises English and Dutch spellings and plurals", () => {
    expect(lookupUnit("cups")).toBe("cup");
    expect(lookupUnit("Tablespoons")).toBe("tbsp");
    expect(lookupUnit("el")).toBe("tbsp");
    expect(lookupUnit("eetlepels")).toBe("tbsp");
    expect(lookupUnit("tl")).toBe("tsp");
    expect(lookupUnit("fl oz")).toBe("floz");
    expect(lookupUnit("gram")).toBe("g");
    expect(lookupUnit("lbs")).toBe("lb");
  });

  it("treats count units and a Dutch kopje as not measurable", () => {
    expect(lookupUnit("cloves")).toBeNull();
    expect(lookupUnit("kopje")).toBeNull();
    expect(lookupUnit(null)).toBeNull();
    expect(UNIT_WORDS.has("teentje")).toBe(true);
    expect(UNIT_WORDS.has("kopje")).toBe(true);
  });
});

describe("convertIngredient: scaling", () => {
  it("scales counts exactly (baking needs 2.67 eggs, not 3)", () => {
    expect(convertIngredient(ing("2", null, "eggs"), { ...metric, factor: 4 / 3 })).toEqual(
      ing("2.67", null, "eggs"),
    );
  });

  it("scales both ends of a range and only the count of a multipack", () => {
    expect(convertIngredient(ing("2-3", "cloves"), { ...metric, factor: 2 }).quantity).toBe("4-6");
    expect(convertIngredient(ing("2 x 400", "g"), { ...metric, factor: 1.5 })).toEqual(
      ing("3 x 400", "g"),
    );
  });

  it("leaves unparseable or empty quantities alone", () => {
    const pinch = ing(null, null, "salt to taste");
    expect(convertIngredient(pinch, { ...metric, factor: 3 })).toBe(pinch);
    const vague = ing("a few", "sprigs");
    expect(convertIngredient(vague, { ...metric, factor: 3 })).toBe(vague);
  });

  it("keeps the author's unit spelling when the unit doesn't change", () => {
    expect(convertIngredient(ing("150", "gram"), { ...metric, factor: 4 / 3 })).toEqual(
      ing("200", "gram"),
    );
    expect(convertIngredient(ing("2", "el"), metric)).toEqual(ing("2", "el"));
  });
});

describe("convertIngredient: auto-tidy", () => {
  it("moves up a unit when the result is a whole quarter", () => {
    expect(convertIngredient(ing("750", "g"), { ...metric, factor: 2 })).toEqual(ing("1.5", "kg"));
    expect(convertIngredient(ing("48", "tsp"), us)).toEqual(ing("1", "cup"));
    expect(convertIngredient(ing("3", "tsp"), metric)).toEqual(ing("1", "tbsp"));
  });

  it("stays put rather than show an awkward larger-unit decimal", () => {
    expect(convertIngredient(ing("4", "tsp"), metric)).toEqual(ing("4", "tsp"));
    expect(convertIngredient(ing("1200", "g"), metric)).toEqual(ing("1200", "g"));
  });

  it("keeps a fractional amount in the author's unit, but drops below a quarter", () => {
    expect(convertIngredient(ing("1/2", "cup"), us)).toEqual(ing("0.5", "cup"));
    expect(convertIngredient(ing("1/2", "cup"), { ...us, factor: 0.25 })).toEqual(ing("2", "tbsp"));
  });
});

describe("convertIngredient: unit systems", () => {
  it("converts US to metric with exact factors", () => {
    expect(convertIngredient(ing("1", "cup"), metric)).toEqual(ing("236.59", "ml"));
    expect(convertIngredient(ing("2", "lb"), metric)).toEqual(ing("907.18", "g"));
    expect(convertIngredient(ing("5", "cups"), metric)).toEqual(ing("1.18", "l"));
    expect(convertIngredient(ing("8", "oz"), metric)).toEqual(ing("226.8", "g"));
  });

  it("converts metric to US", () => {
    expect(convertIngredient(ing("500", "g"), us)).toEqual(ing("1.1", "lb"));
    expect(convertIngredient(ing("100", "g"), us)).toEqual(ing("3.53", "oz"));
    expect(convertIngredient(ing("250", "ml"), us)).toEqual(ing("1.06", "cups"));
    expect(convertIngredient(ing("5", "ml"), us)).toEqual(ing("1.01", "tsp"));
  });

  it("keeps spoons as spoons in metric unless told otherwise", () => {
    expect(convertIngredient(ing("2", "tbsp"), metric)).toEqual(ing("2", "tbsp"));
    expect(convertIngredient(ing("2", "tbsp"), metricNoSpoons)).toEqual(ing("29.57", "ml"));
    // 20 tbsp is past a cup's worth: ml even with keepSpoons on.
    expect(convertIngredient(ing("20", "tbsp"), metric)).toEqual(ing("295.74", "ml"));
  });

  it("normalises cl/dl to ml/l in metric", () => {
    expect(convertIngredient(ing("2", "dl"), metric)).toEqual(ing("200", "ml"));
    expect(convertIngredient(ing("150", "cl"), metric)).toEqual(ing("1.5", "l"));
  });

  it("labels a newly introduced unit in the recipe language", () => {
    expect(convertIngredient(ing("3", "tl"), { ...metric, language: "nl" })).toEqual(
      ing("1", "el"),
    );
    expect(convertIngredient(ing("3", "tl"), { ...metric, language: "en" })).toEqual(
      ing("1", "tbsp"),
    );
  });

  it("converts the pack size of a multipack and both ends of a range", () => {
    expect(convertIngredient(ing("2 x 14", "oz"), metric)).toEqual(ing("2 x 396.89", "g"));
    expect(convertIngredient(ing("1-2", "cups"), metric)).toEqual(ing("236.59-473.18", "ml"));
  });

  it("never converts count units", () => {
    expect(convertIngredient(ing("2", "cans"), us)).toEqual(ing("2", "cans"));
  });
});

describe("anchorFactor", () => {
  it("scales from what you have (150 g cottage cheese, have 200 g)", () => {
    expect(anchorFactor(ing("150", "g", "cottage cheese"), 200, "g")).toBeCloseTo(4 / 3, 10);
  });

  it("accepts another unit of the same dimension", () => {
    expect(anchorFactor(ing("500", "g"), 1, "kg")).toBeCloseTo(2, 10);
    expect(anchorFactor(ing("1", "cup"), 473.176473, "ml")).toBeCloseTo(2, 6);
  });

  it("works on counts and rejects mismatched dimensions or unusable amounts", () => {
    expect(anchorFactor(ing("2", null, "eggs"), 3, null)).toBe(1.5);
    expect(anchorFactor(ing("1", "cup"), 100, "g")).toBeNull();
    expect(anchorFactor(ing("2-3", "cups"), 1, "cup")).toBeNull();
    expect(anchorFactor(ing("2", "g"), 0, "g")).toBeNull();
  });

  it("canAnchor only on a single positive amount", () => {
    expect(canAnchor(ing("150", "g"))).toBe(true);
    expect(canAnchor(ing("2-3", "g"))).toBe(false);
    expect(canAnchor(ing("2 x 400", "g"))).toBe(false);
    expect(canAnchor(ing(null, null))).toBe(false);
  });
});

describe("convertTemperaturesInText", () => {
  it("converts explicit temperatures to whole degrees", () => {
    expect(convertTemperaturesInText("Preheat the oven to 350°F.", "C")).toBe(
      "Preheat the oven to 177°C.",
    );
    expect(convertTemperaturesInText("Bake at 180 °C for 20 min", "F")).toBe(
      "Bake at 356°F for 20 min",
    );
    expect(convertTemperaturesInText("Heat to 350 degrees Fahrenheit", "C")).toBe("Heat to 177°C");
    expect(convertTemperaturesInText("Oven op 200 graden Celsius", "F")).toBe("Oven op 392°F");
    expect(convertTemperaturesInText("Heat oven to 200C/180C fan", "F")).toBe(
      "Heat oven to 392°F/356°F fan",
    );
    expect(convertTemperaturesInText("Bake at 350-375°F", "C")).toBe("Bake at 177-191°C");
  });

  it("leaves bare numbers and already-matching temperatures alone", () => {
    const text = "Bake 20 minutes at 180, then 180°C for 5.";
    expect(convertTemperaturesInText(text, "C")).toBe(text);
    expect(convertTemperaturesInText("Cut into 4 pieces at 45 degrees", "F")).toBe(
      "Cut into 4 pieces at 45 degrees",
    );
  });
});
