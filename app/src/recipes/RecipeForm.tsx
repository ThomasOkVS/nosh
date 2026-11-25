import { zodResolver } from "@hookform/resolvers/zod";
import { RECIPE_LIMITS, type RecipeDto } from "@nosh/shared";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronLeft, Plus, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  type FieldError,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { easeOut } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useCreateRecipe, useUpdateRecipe } from "./api";
import {
  emptyFormValues,
  emptyIngredient,
  emptyStep,
  recipeFormSchema,
  toFormValues,
  type RecipeFormOutput,
  type RecipeFormValues,
} from "./formValues";
import { TagInput } from "./TagInput";

type RecipeFormProps = (
  | {
      mode: "create";
      recipe?: undefined;
      /**
       * Awaited after the recipe is created and before `onSaved`, so the
       * photo chosen on the form can be uploaded (Task 11, REC-33). The
       * recipe is saved by then: errors it throws are swallowed and the owner
       * still lands on the recipe, so it must report its own failures.
       */
      onCreated?: (recipe: RecipeDto) => Promise<void>;
    }
  | { mode: "edit"; recipe: RecipeDto; onCreated?: undefined }
) & {
  /** Called once the save (and `onCreated`) is done; the route navigates. */
  onSaved: (id: number) => void;
  /** The Photo section (Task 11), shown after the tags. */
  photo?: ReactNode;
};

const sectionHeading = "font-display text-[1.625rem] leading-tight";
const fieldLabel = "text-sm font-medium";
const fieldInput = "h-11 rounded-xl bg-card px-3";
const iconButton =
  "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring";

/**
 * Design §6.4 form (REC-27 to REC-30, REC-35): title, description, servings
 * and times, ingredient and step rows, tags, then the Photo slot, with an ink
 * Save in a sticky bottom bar. The route keys it on its path (REC-32).
 */
export function RecipeForm(props: RecipeFormProps) {
  const { mode, recipe, onSaved, onCreated, photo } = props;
  const create = useCreateRecipe();
  // In create mode this hook is never used; it still has to be called.
  const update = useUpdateRecipe(recipe?.id ?? 0);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RecipeFormValues, unknown, RecipeFormOutput>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: recipe === undefined ? emptyFormValues() : toFormValues(recipe),
  });
  const ingredients = useFieldArray({ control, name: "ingredients" });
  const steps = useFieldArray({ control, name: "steps" });

  // Review Focus 4: set synchronously, so a second tap that lands before
  // React re-renders the disabled button still sends nothing.
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  // REC-30: keyboard focus moves to the banner.
  useEffect(() => {
    if (serverError !== null) bannerRef.current?.focus();
  }, [serverError]);

  async function save(output: RecipeFormOutput) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setServerError(null);
    let saved: RecipeDto;
    try {
      saved =
        mode === "create"
          ? await create.mutateAsync({ ...output, sourceUrl: null })
          : // REC-29: the stored source URL is kept; the collection is never sent.
            await update.mutateAsync({ ...output, sourceUrl: recipe.sourceUrl });
    } catch (error) {
      inFlight.current = false;
      setSaving(false);
      setServerError(errorMessage(error));
      return;
    }
    if (onCreated !== undefined) {
      try {
        await onCreated(saved);
      } catch {
        // The recipe is saved; onCreated reports its own failures (REC-33).
      }
    }
    // Still "Saving…" until the route has navigated away.
    onSaved(saved.id);
  }

  const idBase = useId();
  const fieldId = (name: string) => `${idBase}-${name}`;
  const ingredientsError = errors.ingredients?.root?.message ?? errors.ingredients?.message;
  const stepsError = errors.steps?.root?.message ?? errors.steps?.message;

  return (
    <form noValidate onSubmit={handleSubmit(save)} className="flex flex-1 flex-col">
      <div className="flex flex-col gap-8 px-5 pt-6 pb-8">
        {serverError !== null && (
          <motion.div
            ref={bannerRef}
            role="alert"
            tabIndex={-1}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: easeOut }}
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            {serverError}
          </motion.div>
        )}

        <section className="flex flex-col gap-4">
          <Field id={fieldId("title")} label="Title" error={errors.title}>
            <Input
              id={fieldId("title")}
              {...described(fieldId("title"), errors.title)}
              autoComplete="off"
              className={cn(fieldInput, "text-lg")}
              {...register("title")}
            />
          </Field>
          <Field id={fieldId("description")} label="Description" error={errors.description}>
            <AutoGrowTextarea
              id={fieldId("description")}
              className="min-h-20"
              {...register("description")}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              id={fieldId("servings")}
              label="Servings"
              error={errors.servings}
              field={register("servings")}
            />
            <NumberField
              id={fieldId("prep")}
              label="Prep time"
              unit="min"
              error={errors.prepTimeMinutes}
              field={register("prepTimeMinutes")}
            />
            <NumberField
              id={fieldId("cook")}
              label="Cook time"
              unit="min"
              error={errors.cookTimeMinutes}
              field={register("cookTimeMinutes")}
            />
          </div>
        </section>

        <section aria-labelledby={fieldId("ingredients")} className="flex flex-col gap-3">
          <h2 id={fieldId("ingredients")} className={sectionHeading}>
            Ingredients
          </h2>
          {ingredients.fields.length > 0 && (
            <ol role="list" className="flex flex-col gap-2">
              {ingredients.fields.map((row, index) => {
                const n = index + 1;
                const nameError = errors.ingredients?.[index]?.name;
                return (
                  <li key={row.id} className="flex items-start gap-2">
                    <Input
                      aria-label={`Quantity ${n}`}
                      placeholder="Qty"
                      autoComplete="off"
                      className={cn(fieldInput, "w-16 shrink-0 px-2.5")}
                      {...register(`ingredients.${index}.quantity`)}
                    />
                    <Input
                      aria-label={`Unit ${n}`}
                      placeholder="Unit"
                      autoComplete="off"
                      className={cn(fieldInput, "w-18 shrink-0 px-2.5")}
                      {...register(`ingredients.${index}.unit`)}
                    />
                    <Input
                      aria-label={`Ingredient ${n}`}
                      aria-invalid={nameError !== undefined || undefined}
                      placeholder="Ingredient"
                      autoComplete="off"
                      className={cn(fieldInput, "flex-1")}
                      {...register(`ingredients.${index}.name`)}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ingredient ${n}`}
                      onClick={() => ingredients.remove(index)}
                      className={cn(iconButton, "mt-1")}
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <FieldMessage message={ingredientsError} />
          <AddRow
            label="Add ingredient"
            disabled={ingredients.fields.length >= RECIPE_LIMITS.ingredients}
            onClick={() => ingredients.append(emptyIngredient())}
          />
        </section>

        <section aria-labelledby={fieldId("method")} className="flex flex-col gap-3">
          <h2 id={fieldId("method")} className={sectionHeading}>
            Method
          </h2>
          {steps.fields.length > 0 && (
            <ol role="list" className="flex flex-col gap-3">
              {steps.fields.map((row, index) => {
                const n = index + 1;
                return (
                  <li key={row.id} className="flex items-start gap-2">
                    {/* Mustard step numbers (design §7), following the order. */}
                    <span
                      aria-hidden
                      data-testid="step-number"
                      className="w-6 shrink-0 pt-2 text-right font-display text-xl leading-6 text-highlight"
                    >
                      {n}
                    </span>
                    <AutoGrowTextarea
                      aria-label={`Step ${n}`}
                      className="flex-1"
                      {...register(`steps.${index}.instruction`)}
                    />
                    <button
                      type="button"
                      aria-label={`Remove step ${n}`}
                      onClick={() => steps.remove(index)}
                      className={cn(iconButton, "mt-0.5")}
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <FieldMessage message={stepsError} />
          <AddRow
            label="Add step"
            disabled={steps.fields.length >= RECIPE_LIMITS.steps}
            onClick={() => steps.append(emptyStep())}
          />
        </section>

        <section aria-labelledby={fieldId("tags")} className="flex flex-col gap-3">
          <h2 id={fieldId("tags")} className={sectionHeading}>
            Tags
          </h2>
          <Controller
            control={control}
            name="tags"
            render={({ field }) => <TagInput value={field.value} onChange={field.onChange} />}
          />
          <FieldMessage message={errors.tags?.message} />
        </section>

        {photo}
      </div>

      <div
        data-testid="save-bar"
        className="sticky bottom-0 mt-auto border-t bg-background/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        <Button
          type="submit"
          disabled={saving}
          className="h-12 w-full rounded-full text-base focus-visible:ring-ring"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

/** aria-invalid and the message link for a field with an error. */
function described(id: string, error: FieldError | undefined) {
  return error === undefined
    ? {}
    : { "aria-invalid": true as const, "aria-describedby": `${id}-error` };
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: FieldError | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      {children}
      <FieldMessage id={`${id}-error`} message={error?.message} />
    </div>
  );
}

/** Servings and minutes: typed as text so a "0" reaches the schema's message (REC-28). */
function NumberField({
  id,
  label,
  unit,
  error,
  field,
}: {
  id: string;
  label: string;
  unit?: string;
  error: FieldError | undefined;
  field: UseFormRegisterReturn;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          {...described(id, error)}
          className={cn(fieldInput, unit !== undefined && "pr-10")}
          {...field}
        />
        {unit !== undefined && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted-foreground"
          >
            {unit}
          </span>
        )}
      </div>
    </Field>
  );
}

function FieldMessage({ id, message }: { id?: string; message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p id={id} className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

function AddRow({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className="h-10 self-start rounded-full px-4"
    >
      <Plus aria-hidden />
      {label}
    </Button>
  );
}

/**
 * The form's page: a back link and the serif title on top, shown while the
 * recipe loads and on errors too (REC-27).
 */
export function RecipeFormFrame({
  title,
  back,
  backLabel,
  children,
}: {
  title: string;
  back: LinkProps;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 px-5 pt-[max(1.125rem,env(safe-area-inset-top))]">
        <Link
          {...back}
          aria-label={backLabel}
          className="grid size-9.5 shrink-0 place-items-center rounded-full bg-card text-foreground shadow-[0_6px_20px_-10px_rgb(0_0_0/0.45)] outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
      </header>
      <h1 className="px-5 pt-4 text-[2.6rem] leading-none">{title}</h1>
      {children}
    </div>
  );
}
