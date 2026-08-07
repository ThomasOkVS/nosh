import {
  ArrowLeftIcon,
  BookOpenIcon,
  CameraIcon,
  ListChecksIcon,
  ListNumbersIcon,
  PlusIcon,
  TagIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ChangeEvent, type DragEvent, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  createRecipe,
  deleteRecipeImage,
  getRecipe,
  recipeImageUrl,
  updateRecipe,
  uploadRecipeImage,
} from "../api/recipes";
import type { RecipeImage, RecipeInput } from "../api/types";
import { Skeleton } from "../components/Skeleton";
import { TagInput } from "../components/TagInput";
import { buttonClass, errorBannerClass, inputClass, labelClass, sectionCardClass, sectionHeadingClass } from "../styles";

interface IngredientRow {
  id: string;
  quantity: string;
  unit: string;
  name: string;
}

interface StepRow {
  id: string;
  instruction: string;
}

function createEmptyIngredient(): IngredientRow {
  return { id: crypto.randomUUID(), quantity: "", unit: "", name: "" };
}

function createEmptyStep(): StepRow {
  return { id: crypto.randomUUID(), instruction: "" };
}

/** Shown while fetching the existing recipe in edit mode — see
 * docs/design-system.md#loading-states. New-recipe mode never hits this,
 * there's nothing to fetch. */
function RecipeFormSkeleton() {
  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeftIcon size={16} />
        All recipes
      </Link>
      <Skeleton className="h-8 w-1/2 rounded-full" />
      <div className={sectionCardClass}>
        <Skeleton className="h-5 w-24 rounded-full" />
        <div className="mt-3 space-y-3">
          <Skeleton className="h-10 w-full rounded-sm" />
          <Skeleton className="h-16 w-full rounded-sm" />
          <Skeleton className="h-10 w-1/3 rounded-sm" />
        </div>
      </div>
      <div className={sectionCardClass}>
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="mt-3 h-12 w-full rounded-sm" />
      </div>
    </div>
  );
}

const removeButtonClass =
  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-sm text-ink-faint transition-colors duration-standard ease-standard hover:bg-danger-50 hover:text-danger-500 dark:hover:bg-danger-500/15";

export function RecipeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = id !== undefined;
  const recipeId = Number(id);
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("");
  const [cookTimeMinutes, setCookTimeMinutes] = useState("");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(() => [createEmptyIngredient()]);
  const [steps, setSteps] = useState<StepRow[]>(() => [createEmptyStep()]);
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<RecipeImage[]>([]);

  const [loading, setLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }
    getRecipe(recipeId)
      .then((recipe) => {
        setTitle(recipe.title);
        setDescription(recipe.description ?? "");
        setServings(recipe.servings !== null ? String(recipe.servings) : "");
        setPrepTimeMinutes(recipe.prepTimeMinutes !== null ? String(recipe.prepTimeMinutes) : "");
        setCookTimeMinutes(recipe.cookTimeMinutes !== null ? String(recipe.cookTimeMinutes) : "");
        setIngredients(
          recipe.ingredients.length > 0
            ? recipe.ingredients.map((ingredient) => ({
                id: String(ingredient.id),
                quantity: ingredient.quantity ?? "",
                unit: ingredient.unit ?? "",
                name: ingredient.name,
              }))
            : [createEmptyIngredient()],
        );
        setSteps(
          recipe.steps.length > 0
            ? recipe.steps.map((step) => ({ id: String(step.id), instruction: step.instruction }))
            : [createEmptyStep()],
        );
        setTags(recipe.tags);
        setImages(recipe.images);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiError ? err.message : "Failed to load recipe");
      })
      .finally(() => setLoading(false));
  }, [isEditMode, recipeId]);

  const updateIngredient = useCallback((index: number, field: keyof IngredientRow, value: string) => {
    setIngredients((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }, []);
  const addIngredient = useCallback(() => {
    setIngredients((prev) => [...prev, createEmptyIngredient()]);
  }, []);
  const removeIngredient = useCallback((index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateStep = useCallback((index: number, value: string) => {
    setSteps((prev) => prev.map((row, i) => (i === index ? { ...row, instruction: value } : row)));
  }, []);
  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, createEmptyStep()]);
  }, []);
  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const uploadFile = useCallback(
    (file: File) => {
      setUploadingImage(true);
      uploadRecipeImage(recipeId, file)
        .then((image) => setImages((prev) => [...prev, image]))
        .catch(() => window.alert("Failed to upload image"))
        .finally(() => setUploadingImage(false));
    },
    [recipeId],
  );

  const handleImageUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile],
  );

  const handleImageDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsDraggingImage(false);
      const file = event.dataTransfer.files[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile],
  );

  const handleImageDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDraggingImage(true);
  }, []);

  const handleImageDragLeave = useCallback(() => {
    setIsDraggingImage(false);
  }, []);

  const removeImageFromState = useCallback((imageId: number) => {
    setImages((prev) => prev.filter((image) => image.id !== imageId));
  }, []);

  const handleImageDelete = useCallback(
    (imageId: number) => {
      deleteRecipeImage(recipeId, imageId)
        .then(() => removeImageFromState(imageId))
        .catch(() => window.alert("Failed to delete image"));
    },
    [recipeId, removeImageFromState],
  );

  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitError(null);
      setSubmitting(true);

      const payload: RecipeInput = {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        servings: servings ? Number(servings) : null,
        prepTimeMinutes: prepTimeMinutes ? Number(prepTimeMinutes) : null,
        cookTimeMinutes: cookTimeMinutes ? Number(cookTimeMinutes) : null,
        ingredients: ingredients
          .filter((row) => row.name.trim())
          .map((row) => ({
            quantity: row.quantity.trim() ? row.quantity.trim() : null,
            unit: row.unit.trim() ? row.unit.trim() : null,
            name: row.name.trim(),
          })),
        steps: steps
          .filter((row) => row.instruction.trim())
          .map((row) => ({ instruction: row.instruction.trim() })),
        tags,
      };

      const submit = isEditMode
        ? updateRecipe(recipeId, payload).then(() => navigate(`/recipes/${recipeId}`))
        : createRecipe(payload).then((created) => navigate(`/recipes/${created.id}/edit`));

      submit
        .catch((err: unknown) => {
          setSubmitError(err instanceof ApiError ? err.message : "Something went wrong");
        })
        .finally(() => setSubmitting(false));
    },
    [
      title,
      description,
      servings,
      prepTimeMinutes,
      cookTimeMinutes,
      ingredients,
      steps,
      tags,
      isEditMode,
      recipeId,
      navigate,
    ],
  );

  if (loading) {
    return <RecipeFormSkeleton />;
  }
  if (loadError) {
    return <p className={errorBannerClass}>{loadError}</p>;
  }

  const dropzoneBaseClass =
    "mt-3 flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors duration-standard ease-standard";
  let dropzoneStateClass: string;
  if (uploadingImage) {
    dropzoneStateClass = "cursor-not-allowed border-border opacity-60";
  } else if (isDraggingImage) {
    dropzoneStateClass = "cursor-pointer border-citrus-500 bg-citrus-50 dark:bg-citrus-500/10";
  } else {
    dropzoneStateClass = "cursor-pointer border-border hover:border-citrus-500 hover:bg-citrus-50 dark:hover:bg-citrus-500/10";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeftIcon size={16} />
        All recipes
      </Link>
      <h1 className="font-display text-2xl font-extrabold text-ink">{isEditMode ? "Edit recipe" : "New recipe"}</h1>

      {submitError && <p className={errorBannerClass}>{submitError}</p>}

      <section className={sectionCardClass}>
        <h2 className={sectionHeadingClass}>
          <BookOpenIcon size={20} className="text-citrus-500" />
          Basics
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className={labelClass}>
              Title
            </label>
            <input
              id="title"
              required
              placeholder="Grandma's Sunday Ragù"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={`mt-1 w-full ${inputClass}`}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea
              id="description"
              placeholder="A few sentences about this recipe…"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className={`mt-1 w-full ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="servings" className={labelClass}>
              Servings
            </label>
            <input
              id="servings"
              type="number"
              min={1}
              placeholder="4"
              value={servings}
              onChange={(event) => setServings(event.target.value)}
              className={`mt-1 w-full ${inputClass}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="prepTime" className={labelClass}>
                Prep (min)
              </label>
              <input
                id="prepTime"
                type="number"
                min={0}
                placeholder="20"
                value={prepTimeMinutes}
                onChange={(event) => setPrepTimeMinutes(event.target.value)}
                className={`mt-1 w-full ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="cookTime" className={labelClass}>
                Cook (min)
              </label>
              <input
                id="cookTime"
                type="number"
                min={0}
                placeholder="30"
                value={cookTimeMinutes}
                onChange={(event) => setCookTimeMinutes(event.target.value)}
                className={`mt-1 w-full ${inputClass}`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={sectionCardClass}>
        <h2 className={sectionHeadingClass}>
          <ListChecksIcon size={20} className="text-teal-500" />
          Ingredients
        </h2>
        <div className="mt-3 space-y-2">
          {ingredients.map((row, index) => (
            <div key={row.id} className="flex flex-wrap items-start gap-2 rounded-sm border border-border bg-surface p-2">
              <input
                placeholder="Qty"
                value={row.quantity}
                onChange={(event) => updateIngredient(index, "quantity", event.target.value)}
                className={`w-20 ${inputClass}`}
              />
              <input
                placeholder="Unit"
                value={row.unit}
                onChange={(event) => updateIngredient(index, "unit", event.target.value)}
                className={`w-24 ${inputClass}`}
              />
              <input
                placeholder="Ingredient"
                value={row.name}
                onChange={(event) => updateIngredient(index, "name", event.target.value)}
                className={`min-w-36 flex-1 ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => removeIngredient(index)}
                aria-label="Remove ingredient"
                className={removeButtonClass}
              >
                <XIcon size={16} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addIngredient} className={`mt-3 ${buttonClass("ghost")}`}>
          <PlusIcon size={16} />
          Add ingredient
        </button>
      </section>

      <section className={sectionCardClass}>
        <h2 className={sectionHeadingClass}>
          <ListNumbersIcon size={20} className="text-citrus-500" />
          Steps
        </h2>
        <div className="mt-3 space-y-2">
          {steps.map((row, index) => (
            <div key={row.id} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 flex-shrink-0 text-sm text-ink-faint">{index + 1}.</span>
              <textarea
                placeholder="Instructions"
                value={row.instruction}
                onChange={(event) => updateStep(index, event.target.value)}
                rows={1}
                className={`flex-1 bg-surface ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => removeStep(index)}
                aria-label="Remove step"
                className={removeButtonClass}
              >
                <XIcon size={16} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addStep} className={`mt-3 ${buttonClass("ghost")}`}>
          <PlusIcon size={16} />
          Add step
        </button>
      </section>

      <section className={sectionCardClass}>
        <h2 className={sectionHeadingClass}>
          <TagIcon size={20} className="text-teal-500" />
          Tags
        </h2>
        <div className="mt-3">
          <label htmlFor="tags" className="sr-only">
            Tags
          </label>
          <TagInput id="tags" value={tags} onChange={setTags} />
          <p className="mt-1 text-xs text-ink-faint">Press Enter or comma to add a tag.</p>
        </div>
      </section>

      <section className={sectionCardClass}>
        <h2 className={sectionHeadingClass}>
          <CameraIcon size={20} className="text-citrus-500" />
          Photos
        </h2>
        {isEditMode ? (
          <>
            {images.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {images.map((image) => (
                  <div key={image.id} className="relative">
                    <img
                      src={recipeImageUrl(recipeId, image.id)}
                      alt=""
                      className="h-24 w-24 rounded-md bg-surface object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleImageDelete(image.id)}
                      aria-label="Remove photo"
                      className="absolute -right-2.5 -top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-muted shadow-md hover:text-danger-500"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label
              htmlFor="photo-upload"
              onDragOver={handleImageDragOver}
              onDragLeave={handleImageDragLeave}
              onDrop={handleImageDrop}
              className={`${dropzoneBaseClass} ${dropzoneStateClass}`}
            >
              <UploadSimpleIcon size={24} className="text-citrus-500" />
              <span className="text-sm font-medium text-ink">
                {uploadingImage ? "Uploading…" : "Click to add a photo, or drag one here"}
              </span>
              <span className="text-xs text-ink-faint">JPEG, PNG, or WEBP</span>
              <input
                id="photo-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="sr-only"
              />
            </label>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Save the recipe first to add photos.</p>
        )}
      </section>

      <button type="submit" disabled={submitting} className={`w-full sm:w-auto ${buttonClass("primary")}`}>
        {submitting ? "Saving…" : "Save recipe"}
      </button>
    </form>
  );
}
