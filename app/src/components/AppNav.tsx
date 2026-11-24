import { Link } from "@tanstack/react-router";
import { BookOpen, Plus } from "lucide-react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";

const floatShadow = "shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)]";

/**
 * Design §7 app nav: a floating bottom pill in the recipe-tab style (icon +
 * label, ink active pill that springs in) next to a round bright-mustard "+".
 * AUTH-24: the Library is one tap away. The "+" gets its action from the
 * recipes and import plans. The recipe page hides this nav.
 */
export function AppNav() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex items-center gap-2">
        <nav
          aria-label="App"
          className={`flex gap-1 rounded-full border bg-card/95 p-1.5 backdrop-blur ${floatShadow}`}
        >
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="relative flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring data-[status=active]:text-primary-foreground"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="app-nav-pill"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={spring}
                    className="absolute inset-0 rounded-full bg-primary"
                  />
                )}
                <BookOpen aria-hidden className="relative size-4" />
                <span className="relative">Library</span>
              </>
            )}
          </Link>
        </nav>
        <motion.button
          type="button"
          aria-label="New recipe or import"
          whileTap={{ scale: 0.92 }}
          transition={spring}
          className={`grid size-12 place-items-center rounded-full bg-accent text-accent-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${floatShadow}`}
        >
          <Plus aria-hidden className="size-5" />
        </motion.button>
      </div>
    </div>
  );
}
