// 设置 · 外观 · 背景图片 (PRD v1.189, Figma 86): the picked file, decoded here and re-encoded as a JPEG whose long edge is at
// most BACKGROUND_MAX_EDGE, the form main stores (main/background-image.ts). Decoding in the page keeps main from ever
// parsing an image file.
import { fitWithin } from '@shared/background-image'

/** The JPEG bytes main keeps. Rejects when the file is not a picture the browser can decode. */
export async function backgroundFromFile(file: Blob): Promise<Uint8Array> {
  const probe = await createImageBitmap(file)
  const { width, height } = fitWithin(probe.width, probe.height)
  probe.close()
  const bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob) throw new Error('could not encode the picture')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    bitmap.close()
  }
}
