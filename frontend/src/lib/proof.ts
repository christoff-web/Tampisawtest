/** Reads an uploaded file; images are downscaled to a small JPEG data URL so it fits in localStorage. */
export function readProof(file: File): Promise<{ name: string; image?: string }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) return resolve({ name: file.name })
    const reader = new FileReader()
    reader.onerror = () => resolve({ name: file.name })
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => resolve({ name: file.name })
      img.onload = () => {
        const scale = Math.min(1, 800 / Math.max(img.width, img.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve({ name: file.name, image: canvas.toDataURL("image/jpeg", 0.7) })
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export const PAYMENT_QR_SRC = "/payment-qr.png"
