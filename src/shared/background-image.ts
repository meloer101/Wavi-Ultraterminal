// 设置 · 外观 · 背景图片 (PRD §5 / F7 v1.189, Figma 86): the user's own picture under the whole window. The settings page
// re-encodes the picked file to a JPEG of at most BACKGROUND_MAX_EDGE on its long edge; main keeps it as
// `<userData>/backgrounds/<sha256>.jpg` and serves it to the pages as `wavi-bg://image/<name>`. Settings hold the name
// only, so a moved or deleted original changes nothing and the settings broadcast stays small.

export const BACKGROUND_SCHEME = 'wavi-bg'

/** Long edge of the stored picture, px: a 5K display's width, no more. */
export const BACKGROUND_MAX_EDGE = 5120

/** A JPEG of BACKGROUND_MAX_EDGE at quality 0.88 is a few MB; this keeps a stray huge payload out of main. */
export const BACKGROUND_MAX_BYTES = 24 * 1024 * 1024

const NAME = /^[0-9a-f]{64}\.jpg$/

/** The only file names the settings, the store and the protocol accept: the content hash and `.jpg`. */
export function isBackgroundImageName(value: unknown): value is string {
  return typeof value === 'string' && NAME.test(value)
}

export function backgroundImageUrl(name: string): string {
  return `${BACKGROUND_SCHEME}://image/${name}`
}

/** The stored name a `wavi-bg://image/<name>` URL points at, or null for any other URL. */
export function backgroundNameFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${BACKGROUND_SCHEME}:` || parsed.host !== 'image') return null
  const name = parsed.pathname.replace(/^\//, '')
  return isBackgroundImageName(name) ? name : null
}

/** The picture's size once its long edge is at most `max`; never scaled up. */
export function fitWithin(width: number, height: number, max = BACKGROUND_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** 模糊 0–100 % → CSS blur radius in px (Figma 86G: 40 % ≈ 16 px). */
export const BACKGROUND_BLUR_MAX_PX = 40

export function backgroundBlurPx(blur: number): number {
  return Math.round(Math.min(1, Math.max(0, blur)) * BACKGROUND_BLUR_MAX_PX)
}

/** A JPEG starts with the SOI marker and a segment marker. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}
