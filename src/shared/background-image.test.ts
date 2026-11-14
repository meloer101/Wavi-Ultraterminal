import { describe, expect, it } from 'vitest'
import { backgroundBlurPx, backgroundImageUrl, backgroundNameFromUrl, fitWithin, isBackgroundImageName, looksLikeJpeg } from './background-image'

const NAME = `${'a1'.repeat(32)}.jpg`

describe('背景图片 names (PRD v1.189)', () => {
  it('accepts only a content hash with .jpg, so no name can leave the store folder', () => {
    expect(isBackgroundImageName(NAME)).toBe(true)
    expect(isBackgroundImageName('../settings.json')).toBe(false)
    expect(isBackgroundImageName(`${'a1'.repeat(32)}.png`)).toBe(false)
    expect(isBackgroundImageName(`${'A1'.repeat(32)}.jpg`)).toBe(false)
    expect(isBackgroundImageName('')).toBe(false)
    expect(isBackgroundImageName(42)).toBe(false)
  })

  it('is served on its own scheme and read back from the URL', () => {
    expect(backgroundImageUrl(NAME)).toBe(`wavi-bg://image/${NAME}`)
    expect(backgroundNameFromUrl(backgroundImageUrl(NAME))).toBe(NAME)
  })

  it('serves nothing outside the store: other hosts, schemes and traversal are refused', () => {
    expect(backgroundNameFromUrl(`wavi-bg://other/${NAME}`)).toBeNull()
    expect(backgroundNameFromUrl(`file:///image/${NAME}`)).toBeNull()
    expect(backgroundNameFromUrl('wavi-bg://image/..%2Fsettings.json')).toBeNull()
    expect(backgroundNameFromUrl('wavi-bg://image/../settings.json')).toBeNull()
    expect(backgroundNameFromUrl('not a url')).toBeNull()
  })
})

describe('fitWithin', () => {
  it('scales the long edge down to the limit and keeps the ratio', () => {
    expect(fitWithin(10240, 5760, 5120)).toEqual({ width: 5120, height: 2880 })
    expect(fitWithin(3000, 6000, 5120)).toEqual({ width: 2560, height: 5120 })
  })

  it('never scales a small picture up', () => {
    expect(fitWithin(800, 600, 5120)).toEqual({ width: 800, height: 600 })
  })
})

describe('backgroundBlurPx', () => {
  it('maps 0–100 % to 0–40 px and clamps', () => {
    expect(backgroundBlurPx(0)).toBe(0)
    expect(backgroundBlurPx(0.4)).toBe(16)
    expect(backgroundBlurPx(1)).toBe(40)
    expect(backgroundBlurPx(3)).toBe(40)
  })
})

describe('looksLikeJpeg', () => {
  it('checks the SOI marker', () => {
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
    expect(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8]))).toBe(false)
  })
})
