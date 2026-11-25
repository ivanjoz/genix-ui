// Framing math of ImageCropper. At zoom 1 the whole picture fits the frame (contain); the zoom
// enlarges it from there and the pan moves its center away from the frame's center, as a fraction
// of the frame's width / height. Being relative, the same crop frames the small editor on screen
// and the full-size output canvas alike.

export interface ImageCropFrame { width: number; height: number }
export interface ImageCrop { zoom: number; panX: number; panY: number }
export interface ImageCropRect { x: number; y: number; width: number; height: number }

export const MIN_CROP_ZOOM = 1
export const MAX_CROP_ZOOM = 5
export const INITIAL_CROP: ImageCrop = { zoom: 1, panX: 0, panY: 0 }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** The rectangle the picture is drawn at inside a frame of the given size. */
export const cropDrawRect = (imageWidth: number, imageHeight: number, frame: ImageCropFrame, crop: ImageCrop): ImageCropRect => {
  const scale = Math.min(frame.width / imageWidth, frame.height / imageHeight) * crop.zoom
  const width = imageWidth * scale
  const height = imageHeight * scale
  return {
    x: (frame.width - width) / 2 + crop.panX * frame.width,
    y: (frame.height - height) / 2 + crop.panY * frame.height,
    width, height,
  }
}

/** Bounds the zoom and the pan: on each axis a picture smaller than the frame moves only inside it,
 *  and a bigger one only while it still covers the frame, so it can never be dragged out of sight. */
export const clampCrop = (imageWidth: number, imageHeight: number, frame: ImageCropFrame, crop: ImageCrop): ImageCrop => {
  const zoom = clamp(crop.zoom, MIN_CROP_ZOOM, MAX_CROP_ZOOM)
  const drawRect = cropDrawRect(imageWidth, imageHeight, frame, { zoom, panX: 0, panY: 0 })
  const maxPanX = Math.abs(frame.width - drawRect.width) / 2 / frame.width
  const maxPanY = Math.abs(frame.height - drawRect.height) / 2 / frame.height
  return { zoom, panX: clamp(crop.panX, -maxPanX, maxPanX), panY: clamp(crop.panY, -maxPanY, maxPanY) }
}

/** Draws the framed picture on a canvas of the output size. PNG keeps a logo's transparent
 *  background; the uploader converts the result to its own format afterwards. */
export const cropImageToBlob = async (image: ImageBitmap, outputFrame: ImageCropFrame, crop: ImageCrop): Promise<Blob> => {
  const canvas = document.createElement('canvas')
  canvas.width = outputFrame.width
  canvas.height = outputFrame.height
  const context = canvas.getContext('2d') as CanvasRenderingContext2D
  context.imageSmoothingQuality = 'high'
  const drawRect = cropDrawRect(image.width, image.height, outputFrame, crop)
  context.drawImage(image, drawRect.x, drawRect.y, drawRect.width, drawRect.height)
  const croppedImage = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!croppedImage) { throw new Error('The image could not be cropped.') }
  return croppedImage
}
