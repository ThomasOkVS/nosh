import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
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
import { TagInput } from "../components/TagInput";

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

  const handleImageUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setUploadingImage(true);
      uploadRecipeImage(recipeId, file)
        .then((image) => setImages((prev) => [...prev, image]))
        .catch(() => window.alert("Failed to upload image"))
        .finally(() => {
          setUploadingImage(false);
          event.target.value = "";
        });
    },
    [recipeId],
  );

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
    (event: FormEvent<HTMLFormElement>) => {
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
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (loadError) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
        ← All recipes
      </Link>
      <h1 className="text-2xl font-semibold text-slate-800">
        {isEditMode ? "Edit recipe" : "New recipe"}
      </h1>

      {submitError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className="block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="servings" className="block text-sm font-medium text-slate-700">
            Servings
          </label>
          <input
            id="servings"
            type="number"
            min={1}
            value={servings}
            onChange={(event) => setServings(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="prepTime" className="block text-sm font-medium text-slate-700">
              Prep (min)
            </label>
            <input
              id="prepTime"
              type="number"
              min={0}
              value={prepTimeMinutes}
              onChange={(event) => setPrepTimeMinutes(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="cookTime" className="block text-sm font-medium text-slate-700">
              Cook (min)
            </label>
            <input
              id="cookTime"
              type="number"
              min={0}
              value={cookTimeMinutes}
              onChange={(event) => setCookTimeMinutes(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <section>
        <h2 className="font-medium text-slate-800">Ingredients</h2>
        <div className="mt-2 space-y-2">
          {ingredients.map((row, index) => (
            <div key={row.id} className="flex gap-2">
              <input
                placeholder="Qty"
                value={row.quantity}
                onChange={(event) => updateIngredient(index, "quantity", event.target.value)}
                className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Unit"
                value={row.unit}
                onChange={(event) => updateIngredient(index, "unit", event.target.value)}
                className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Ingredient"
                value={row.name}
                onChange={(event) => updateIngredient(index, "name", event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeIngredient(index)}
                aria-label="Remove ingredient"
                className="rounded-md border border-slate-300 px-2 text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addIngredient}
          className="mt-2 text-sm text-slate-600 underline hover:text-slate-800"
        >
          + Add ingredient
        </button>
      </section>

      <section>
        <h2 className="font-medium text-slate-800">Steps</h2>
        <div className="mt-2 space-y-2">
          {steps.map((row, index) => (
            <div key={row.id} className="flex gap-2">
              <span className="mt-2 w-5 flex-shrink-0 text-sm text-slate-400">{index + 1}.</span>
              <textarea
                placeholder="Instructions"
                value={row.instruction}
                onChange={(event) => updateStep(index, event.target.value)}
                rows={1}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeStep(index)}
                aria-label="Remove step"
                className="rounded-md border border-slate-300 px-2 text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-2 text-sm text-slate-600 underline hover:text-slate-800"
        >
          + Add step
        </button>
      </section>

      <div>
        <label htmlFor="tags" className="block text-sm font-medium text-slate-700">
          Tags
        </label>
        <TagInput id="tags" value={tags} onChange={setTags} />
        <p className="mt-1 text-xs text-slate-500">Press Enter or comma to add a tag.</p>
      </div>

      <section>
        <h2 className="font-medium text-slate-800">Photos</h2>
        {isEditMode ? (
          <>
            {images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-3">
                {images.map((image) => (
                  <div key={image.id} className="relative">
                    <img
                      src={recipeImageUrl(recipeId, image.id)}
                      alt=""
                      className="h-24 w-24 rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleImageDelete(image.id)}
                      aria-label="Remove photo"
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow hover:bg-slate-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageUpload}
              disabled={uploadingImage}
              className="mt-3 text-sm"
            />
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Save the recipe first to add photos.</p>
        )}
      </section>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save recipe"}
      </button>
    </form>
  );
}
