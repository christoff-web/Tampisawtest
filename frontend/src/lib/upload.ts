export const IMAGE_ACCEPT = "image/png,image/jpeg,.jpg,.jpeg,.png"
export const IMAGE_ERROR = "Only JPG, JPEG or PNG images are allowed."

/** True only for PNG/JPEG files (checked by MIME type and file extension). */
export function isAllowedImage(file: File | null | undefined): boolean {
  if (!file) return false
  const okType = file.type === "image/jpeg" || file.type === "image/png"
  const okExt = /\.(jpe?g|png)$/i.test(file.name)
  return okType && okExt
}

/** Returns an error message, or null when the file is an allowed image. */
export function imageError(file: File | null | undefined): string | null {
  return isAllowedImage(file) ? null : IMAGE_ERROR
}
