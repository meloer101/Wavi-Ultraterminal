/* Where the magazine shows 1440×900 spreads instead of single pages (wide enough, and landscape enough).
   scripts/book.ts switches layouts on it and the images' `sizes` pick their widths by it, so they cannot disagree.
   The spread's own size lives once, in site.css (.book-spread .board); book.ts reads it back from the page. */
export const SPREAD_QUERY = '(min-width: 900px) and (min-aspect-ratio: 23/20)'

/** `sizes` for an image that is `spreadVw` of the viewport on a spread and nearly full width on a phone page. */
export const imageSizes = (spreadVw: number, pageVw = 94): string => `${SPREAD_QUERY} ${spreadVw}vw, ${pageVw}vw`
