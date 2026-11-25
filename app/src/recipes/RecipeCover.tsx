import type { RecipeDto } from "@nosh/shared";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { coverUrl, placeholderLetter } from "./facts";

/** The photo's height; the parallax moves it a third as fast as the page. */
const COVER_HEIGHT = 330;

/**
 * Design §6.4 magazine cover (REC-21): the cover photo full-bleed and large,
 * drifting slower than the page as it scrolls (off under reduced motion).
 * Without a cover, a shorter chalk panel with the big serif first letter,
 * matching the card placeholder. Hidden v1 photos are never shown.
 */
export function RecipeCover({ recipe }: { recipe: Pick<RecipeDto, "title" | "images" | "coverImageId"> }) {
  const url = coverUrl(recipe);
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, COVER_HEIGHT], [0, COVER_HEIGHT / 3], { clamp: true });

  if (url === null) {
    return (
      <div
        data-testid="cover-placeholder"
        aria-hidden
        className="grid h-[230px] place-items-center bg-secondary font-display text-[6.875rem] leading-none text-muted-foreground"
      >
        {placeholderLetter(recipe.title)}
      </div>
    );
  }
  return (
    <div data-testid="recipe-cover" className="h-[330px] overflow-hidden bg-secondary">
      <motion.img
        src={url}
        alt=""
        decoding="async"
        draggable={false}
        style={reduceMotion === true ? undefined : { y }}
        className="size-full object-cover"
      />
    </div>
  );
}
