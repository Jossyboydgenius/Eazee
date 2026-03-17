"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  X,
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { useEazeeStore, UploadedPhoto } from "@/lib/store";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { toast } from "@/lib/toast";

const MAX_PHOTOS = 6;

export function PhotoUploadZone() {
  const { photos, addPhoto, removePhoto } = useEazeeStore();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const activePreviewIndex =
    previewIndex === null
      ? null
      : Math.min(previewIndex, Math.max(photos.length - 1, 0));

  const previewPhoto: UploadedPhoto | null =
    activePreviewIndex !== null &&
    activePreviewIndex >= 0 &&
    activePreviewIndex < photos.length
      ? photos[activePreviewIndex]
      : null;

  const goToPreviousPreview = () => {
    if (photos.length <= 1) return;
    setPreviewIndex((current) => {
      if (current === null) return 0;
      return current === 0 ? photos.length - 1 : current - 1;
    });
  };

  const goToNextPreview = () => {
    if (photos.length <= 1) return;
    setPreviewIndex((current) => {
      if (current === null) return 0;
      return current === photos.length - 1 ? 0 : current + 1;
    });
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const remaining = MAX_PHOTOS - photos.length;
      if (remaining <= 0) {
        toast({
          title: "Upload limit reached",
          description: `Only ${MAX_PHOTOS} images are accepted per post.`,
          variant: "info",
        });
        return;
      }

      const toAdd = acceptedFiles.slice(0, remaining);
      void (async () => {
        const previews = await Promise.all(
          toAdd.map((file) => readFileAsDataUrl(file)),
        );

        previews.forEach((preview, index) => {
          const file = toAdd[index];
          const photo: UploadedPhoto = {
            id: `${Date.now()}-${Math.random()}`,
            file,
            preview,
          };
          addPhoto(photo);
        });
      })();

      const discarded = acceptedFiles.length - toAdd.length;
      if (discarded > 0) {
        toast({
          title: `Only ${MAX_PHOTOS} images accepted`,
          description: `Added ${toAdd.length} image${toAdd.length === 1 ? "" : "s"}, skipped ${discarded}.`,
          variant: "info",
        });
      }
    },
    [photos, addPhoto],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    disabled: photos.length >= MAX_PHOTOS,
  });

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {photos.length < MAX_PHOTOS && (
        <div
          {...getRootProps()}
          className={cn(
            "relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300",
            isDragActive
              ? "border-[var(--brand-green)] bg-[var(--brand-dim)] scale-[1.01]"
              : "border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]",
          )}
        >
          <input {...getInputProps()} />
          <motion.div
            animate={{ y: isDragActive ? -4 : 0 }}
            className="flex flex-col items-center gap-3"
          >
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all",
                isDragActive
                  ? "bg-[var(--brand-dim)]"
                  : "bg-[var(--bg-elevated)]",
              )}
            >
              {isDragActive ? (
                <ImagePlus className="w-6 h-6 text-[var(--brand-green)]" />
              ) : (
                <Upload className="w-6 h-6 text-[var(--text-muted)]" />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm text-[var(--text-primary)]">
                {isDragActive ? "Drop photos here" : "Upload product photos"}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Drag & drop or click · Up to 6 images · JPG, PNG, WebP
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 mt-3">
          <AnimatePresence>
            {photos.map((photo, index) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className="relative aspect-square rounded-xl overflow-hidden group border border-[var(--border)] cursor-zoom-in"
                onClick={() => setPreviewIndex(index)}
              >
                <Image
                  src={photo.preview}
                  alt={`Product ${index + 1}`}
                  fill
                  className="object-cover"
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Eye className="w-3 h-3" />
                    View
                  </span>
                </div>
                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto(photo.id);
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-500 z-10"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
                {/* Index badge */}
                <div className="absolute bottom-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add more placeholder */}
          {photos.length < MAX_PHOTOS && (
            <div
              {...getRootProps()}
              className="aspect-square rounded-xl border-2 border-dashed border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)] transition-all"
            >
              <input {...getInputProps()} />
              <ImagePlus className="w-5 h-5 text-[var(--text-muted)]" />
            </div>
          )}
        </div>
      )}

      {/* Count */}
      {photos.length > 0 && (
        <p className="text-xs text-[var(--text-muted)] text-right mt-2">
          {photos.length}/{MAX_PHOTOS} photos
        </p>
      )}

      <AnimatePresence>
        {previewPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewIndex(null)}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(event) => event.stopPropagation()}
              className="relative w-full max-w-4xl h-[80vh] rounded-2xl overflow-hidden border"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border)",
              }}
            >
              <button
                onClick={() => setPreviewIndex(null)}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/75 hover:bg-black/90 text-white flex items-center justify-center"
                aria-label="Close image preview"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-black/65 text-white text-xs font-semibold">
                {(activePreviewIndex ?? 0) + 1}/{photos.length}
              </div>

              {photos.length > 1 && (
                <>
                  <button
                    onClick={goToPreviousPreview}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/75 hover:bg-black/90 text-white flex items-center justify-center"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-4.5 h-4.5" />
                  </button>

                  <button
                    onClick={goToNextPreview}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/75 hover:bg-black/90 text-white flex items-center justify-center"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-4.5 h-4.5" />
                  </button>
                </>
              )}

              <Image
                src={previewPhoto.preview}
                alt="Uploaded preview"
                fill
                className="object-contain"
                unoptimized
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image file"));
    };
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });
}
