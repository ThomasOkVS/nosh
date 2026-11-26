import type { RecipeDto } from "@nosh/shared";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useId, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDeleteImage, useUploadCover } from "./api";
import { coverUrl } from "./facts";

type PhotoFieldProps = {
  pending: File | null;
  onPendingChange: (file: File | null) => void;
} & ({ mode: "create"; recipe?: undefined } | { mode: "edit"; recipe: RecipeDto });

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/** Browsers other than Safari cannot show HEIC, so it gets a tile (design §6.5). */
function isHeic(file: File): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/**
 * The form's Photo section (REC-33, REC-34). On the create form it only holds
 * the chosen file (previewed from an object URL) for the route to upload after
 * the save. On the edit form it uploads and deletes at once; the recipe prop
 * follows the query, so a new cover appears when the upload settles and the
 * form's own fields are never touched.
 */
export function PhotoField(props: PhotoFieldProps) {
  const { mode, pending, onPendingChange } = props;
  const recipeId = props.recipe?.id ?? 0;
  const upload = useUploadCover(recipeId);
  const remove = useDeleteImage(recipeId);
  const headingId = useId();
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  /** A file waiting for the owner to confirm replacing the cover. */
  const [candidate, setCandidate] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);

  const cover = props.recipe === undefined ? null : coverUrl(props.recipe);
  const busy = upload.isPending || remove.isPending;

  // The preview's object URL, revoked when the file changes and on unmount.
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (pending === null || isHeic(pending)) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pending);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  async function uploadNow(file: File) {
    try {
      await upload.mutateAsync(file);
    } catch (error) {
      // The cover is unchanged; say why (REC-33).
      toast.error(errorMessage(error));
    }
  }

  function choose(files: FileList | readonly File[] | null | undefined) {
    // Only the first file is taken (REC-33).
    const file = files?.[0];
    if (file === undefined || busy) return;
    if (mode === "create") onPendingChange(file);
    else if (cover === null) void uploadNow(file);
    else setCandidate(file);
  }

  async function deleteCover() {
    setRemoving(false);
    const id = props.recipe?.coverImageId;
    if (id === null || id === undefined) return;
    try {
      await remove.mutateAsync(id);
    } catch {
      toast.error("Failed to delete image");
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  }

  const showsPhoto = mode === "create" ? pending !== null : cover !== null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="font-display text-[1.625rem] leading-tight">
        Photo
      </h2>

      {showsPhoto && (
        <div className="relative overflow-hidden rounded-2xl bg-secondary">
          {mode === "edit" && cover !== null ? (
            <img
              src={cover}
              alt="Cover photo"
              decoding="async"
              className="aspect-4/3 w-full object-cover"
            />
          ) : preview !== null ? (
            <img
              src={preview}
              alt="Chosen photo"
              decoding="async"
              className="aspect-4/3 w-full object-cover"
            />
          ) : (
            <div className="grid aspect-4/3 w-full place-items-center px-6 text-center text-sm text-muted-foreground">
              Photo selected: {pending?.name}
            </div>
          )}
          <button
            type="button"
            aria-label="Remove photo"
            disabled={busy}
            onClick={() => (mode === "create" ? onPendingChange(null) : setRemoving(true))}
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-card text-foreground shadow-[0_6px_20px_-10px_rgb(0_0_0/0.45)] outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}

      <label
        data-testid="photo-drop"
        onDragEnter={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card px-4 py-5 text-center text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring",
          dragging ? "border-foreground bg-muted" : "border-border",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <input
          type="file"
          accept={ACCEPT}
          aria-label="Choose a photo"
          aria-describedby={hintId}
          disabled={busy}
          onChange={(event) => {
            choose(event.target.files);
            // The same file can then be chosen again.
            event.target.value = "";
          }}
          className="sr-only"
        />
        <ImagePlus aria-hidden className="size-6 text-muted-foreground" />
        {/* One live region, so "Uploading…" is announced when it appears. */}
        <span aria-live="polite">
          {upload.isPending
            ? "Uploading…"
            : showsPhoto
              ? "Choose another photo or drop it here"
              : "Choose a photo or drop it here"}
        </span>
      </label>
      <p id={hintId} className="text-xs text-muted-foreground">
        JPEG, PNG, WEBP or HEIC
      </p>

      <ConfirmDialog
        open={candidate !== null}
        title="Replace this photo?"
        message="The current one will be deleted."
        confirmLabel="Replace"
        onCancel={() => setCandidate(null)}
        onConfirm={() => {
          const file = candidate;
          setCandidate(null);
          if (file !== null) void uploadNow(file);
        }}
      />
      <ConfirmDialog
        open={removing}
        title="Remove this photo?"
        message="This can't be undone."
        confirmLabel="Remove"
        onCancel={() => setRemoving(false)}
        onConfirm={() => void deleteCover()}
      />
    </section>
  );
}
