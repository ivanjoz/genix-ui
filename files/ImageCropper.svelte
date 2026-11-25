<script lang="ts">
  import { useUI } from '../runtime/index.js';
  import { MAX_CROP_ZOOM, MIN_CROP_ZOOM, clampCrop, cropDrawRect, type ImageCrop } from './image-crop';

  export interface IImageCropperProps {
    file: Blob
    /** Width / height of the frame (1 = square). */
    aspectRatio: number
    /** The framing being edited: zoom, and pan as a fraction of the frame (see image-crop.ts). */
    crop: ImageCrop
    css?: string
  }

  let { file, aspectRatio, crop = $bindable(), css = 'h-[min(60vh,440px)]' }: IImageCropperProps = $props()
  const ui = useUI()

  const imageURL = $derived(URL.createObjectURL(file))
  $effect(() => {
    const shownImageURL = imageURL
    return () => URL.revokeObjectURL(shownImageURL)
  })

  let imageElement = $state<HTMLImageElement>()
  let frameElement = $state<HTMLDivElement>()
  let imageSize = $state({ width: 0, height: 0 })

  // The frame is the largest box of the aspect ratio that fits the area above the zoom bar.
  let areaWidth = $state(0)
  let areaHeight = $state(0)
  const frame = $derived({ width: Math.min(areaWidth, areaHeight * aspectRatio), height: Math.min(areaWidth / aspectRatio, areaHeight) })
  const drawRect = $derived(imageSize.width && frame.width ? cropDrawRect(imageSize.width, imageSize.height, frame, crop) : undefined)

  const setCrop = (nextCrop: ImageCrop) => {
    crop = clampCrop(imageSize.width, imageSize.height, frame, nextCrop)
  }

  // Dragging moves the picture inside the frame.
  let dragStart: { x: number; y: number; panX: number; panY: number } | undefined
  const onPointerDown = (event: PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    dragStart = { x: event.clientX, y: event.clientY, panX: crop.panX, panY: crop.panY }
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!dragStart) { return }
    setCrop({ ...crop, panX: dragStart.panX + (event.clientX - dragStart.x) / frame.width, panY: dragStart.panY + (event.clientY - dragStart.y) / frame.height })
  }

  // The mouse wheel zooms. Added by hand: it must be non-passive to keep the page from scrolling.
  $effect(() => {
    if (!frameElement) { return }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setCrop({ ...crop, zoom: crop.zoom * Math.exp(-event.deltaY * 0.002) })
    }
    frameElement.addEventListener('wheel', onWheel, { passive: false })
    return () => frameElement?.removeEventListener('wheel', onWheel)
  })
</script>

<div class="flex flex-col gap-12 {css}" role="group" aria-label={ui.translate('Frame the image|Encuadrar la imagen')}>
  <div class="relative flex flex-1 min-h-0 items-center justify-center" bind:clientWidth={areaWidth} bind:clientHeight={areaHeight}>
    <!-- Checkered background: shows where the image is transparent or leaves the frame empty. -->
    <div bind:this={frameElement} role="presentation"
      class="crop-frame relative overflow-hidden rounded-[6px] outline-2 outline-dashed outline-line-strong cursor-move touch-none"
      style:width="{frame.width}px" style:height="{frame.height}px"
      onpointerdown={onPointerDown} onpointermove={onPointerMove}
      onpointerup={() => { dragStart = undefined }} onpointercancel={() => { dragStart = undefined }}>
      <img bind:this={imageElement} src={imageURL} alt="" draggable="false"
        class="absolute max-w-none select-none pointer-events-none {drawRect ? '' : 'invisible'}"
        style:left="{drawRect?.x || 0}px" style:top="{drawRect?.y || 0}px"
        style:width="{drawRect?.width || 0}px" style:height="{drawRect?.height || 0}px"
        onload={() => {
          if (!imageElement) { return }
          imageSize = { width: imageElement.naturalWidth, height: imageElement.naturalHeight }
        }} />
    </div>
  </div>
  <div class="flex items-center gap-10 px-4">
    <i class="icon-[fa--search-minus] text-fg-muted" aria-hidden="true"></i>
    <input type="range" class="flex-1 min-w-0 accent-blue-solid" min={MIN_CROP_ZOOM} max={MAX_CROP_ZOOM} step="0.01"
      value={crop.zoom} aria-label={ui.translate('Zoom|Zoom')}
      oninput={(event) => setCrop({ ...crop, zoom: Number(event.currentTarget.value) })} />
    <i class="icon-[fa--search-plus] text-fg-muted" aria-hidden="true"></i>
  </div>
</div>

<style>
  .crop-frame {
    background: repeating-conic-gradient(var(--surface-soft) 0% 25%, var(--surface) 0% 50%) 0 0 / 20px 20px;
  }
</style>
