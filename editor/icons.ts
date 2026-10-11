// Static SVG icons of HTMLEditor and its table components, rendered with {@html}.
// Paths copied from Material Design Icons (@iconify-json/mdi, Apache 2.0); the horizontal rule is drawn here.
// Sized 1em and filled with currentColor: the font-size and text color of the container style them.

const svgIcon = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`

// Toolbar
export const editorIconBold = svgIcon(`<path fill="currentColor" d="M13.5 15.5H10v-3h3.5A1.5 1.5 0 0 1 15 14a1.5 1.5 0 0 1-1.5 1.5m-3.5-9h3A1.5 1.5 0 0 1 14.5 8A1.5 1.5 0 0 1 13 9.5h-3m5.6 1.29c.97-.68 1.65-1.79 1.65-2.79c0-2.26-1.75-4-4-4H7v14h7.04c2.1 0 3.71-1.7 3.71-3.79c0-1.52-.86-2.82-2.15-3.42"/>`)
export const editorIconItalic = svgIcon(`<path fill="currentColor" d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>`)
export const editorIconUnderline = svgIcon(`<path fill="currentColor" d="M5 21h14v-2H5zm7-4a6 6 0 0 0 6-6V3h-2.5v8a3.5 3.5 0 0 1-3.5 3.5A3.5 3.5 0 0 1 8.5 11V3H6v8a6 6 0 0 0 6 6"/>`)
export const editorIconTextSize = svgIcon(`<path fill="currentColor" d="M2 4v3h5v12h3V7h5V4zm19 5h-9v3h3v7h3v-7h3z"/>`)
export const editorIconTextColor = svgIcon(`<path fill="currentColor" d="M9.62 12L12 5.67L14.37 12M11 3L5.5 17h2.25l1.12-3h6.25l1.13 3h2.25L13 3z"/>`)
export const editorIconBackgroundColor = svgIcon(`<path fill="currentColor" d="m4 17l2.75-2.75l-.03-.02c-.58-.59-.58-1.54 0-2.12l4.74-4.74l4.24 4.24l-4.74 4.74c-.57.58-1.5.58-2.09.02l-.63.63zM15.91 2.91c.59-.58 1.54-.58 2.12 0l2.13 2.12c.58.59.58 1.54 0 2.13l-3.3 3.29l-4.24-4.24z"/>`)
export const editorIconTable = svgIcon(`<path fill="currentColor" d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 4v4h6V8zm8 0v4h6V8zm-8 6v4h6v-4zm8 0v4h6v-4z"/>`)
export const editorIconAlignLeft = svgIcon(`<path fill="currentColor" d="M3 3h18v2H3zm0 4h12v2H3zm0 4h18v2H3zm0 4h12v2H3zm0 4h18v2H3z"/>`)
export const editorIconAlignCenter = svgIcon(`<path fill="currentColor" d="M3 3h18v2H3zm4 4h10v2H7zm-4 4h18v2H3zm4 4h10v2H7zm-4 4h18v2H3z"/>`)
export const editorIconAlignRight = svgIcon(`<path fill="currentColor" d="M3 3h18v2H3zm6 4h12v2H9zm-6 4h18v2H3zm6 4h12v2H9zm-6 4h18v2H3z"/>`)
export const editorIconAlignJustify = svgIcon(`<path fill="currentColor" d="M3 3h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3z"/>`)
export const editorIconBulletList = svgIcon(`<path fill="currentColor" d="M7 5h14v2H7zm0 8v-2h14v2zM4 4.5A1.5 1.5 0 0 1 5.5 6A1.5 1.5 0 0 1 4 7.5A1.5 1.5 0 0 1 2.5 6A1.5 1.5 0 0 1 4 4.5m0 6A1.5 1.5 0 0 1 5.5 12A1.5 1.5 0 0 1 4 13.5A1.5 1.5 0 0 1 2.5 12A1.5 1.5 0 0 1 4 10.5M7 19v-2h14v2zm-3-2.5A1.5 1.5 0 0 1 5.5 18A1.5 1.5 0 0 1 4 19.5A1.5 1.5 0 0 1 2.5 18A1.5 1.5 0 0 1 4 16.5"/>`)
export const editorIconNumberedList = svgIcon(`<path fill="currentColor" d="M7 13v-2h14v2zm0 6v-2h14v2zM7 7V5h14v2zM3 8V5H2V4h2v4zm-1 9v-1h3v4H2v-1h2v-.5H3v-1h1V17zm2.25-7a.75.75 0 0 1 .75.75c0 .2-.08.39-.21.52L3.12 13H5v1H2v-.92L4 11H2v-1z"/>`)
// A full-width rule between faded text lines
export const editorIconHorizontalRule = svgIcon(`<path fill="currentColor" d="M2 11h20v2H2z"/><path fill="currentColor" opacity=".45" d="M5 5h14v2H5zm0 12h14v2H5z"/>`)
export const editorIconClearFormat = svgIcon(`<path fill="currentColor" d="m19.36 2.72l1.42 1.42l-5.72 5.71c1.07 1.54 1.22 3.39.32 4.59L9.06 8.12c1.2-.9 3.05-.75 4.59.32zM5.93 17.57c-2.01-2.01-3.24-4.41-3.58-6.65l4.88-2.09l7.44 7.44l-2.09 4.88c-2.24-.34-4.64-1.57-6.65-3.58"/>`)
export const editorIconUndo = svgIcon(`<path fill="currentColor" d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88c3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8"/>`)
export const editorIconRedo = svgIcon(`<path fill="currentColor" d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16a8 8 0 0 1 7.6-5.5c1.95 0 3.73.72 5.12 1.88L13 16h9V7z"/>`)

// Table size picker
export const editorIconTableColumns = svgIcon(`<path fill="currentColor" d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m0 8v4h8v-4zm0 6v4h8v-4zM8 4v4h8V4z"/>`)
export const editorIconTableRows = svgIcon(`<path fill="currentColor" d="M22 14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM4 14h4v-4H4zm6 0h4v-4h-4zm6 0h4v-4h-4z"/>`)

// Table row/column handles and their menus
export const editorIconRowHandle = svgIcon(`<path fill="currentColor" d="M12 16a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2m0-6a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2m0-6a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2"/>`)
export const editorIconColumnHandle = svgIcon(`<path fill="currentColor" d="M16 12a2 2 0 0 1 2-2a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2m-6 0a2 2 0 0 1 2-2a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2m-6 0a2 2 0 0 1 2-2a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2"/>`)
export const editorIconRowAbove = svgIcon(`<path fill="currentColor" d="M22 14a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7h2v-2h4v2h2v-2h4v2h2v-2h4v2h2zM4 14h4v3H4zm6 0h4v3h-4zm10 0v3h-4v-3zm-9-4h2V7h3V5h-3V2h-2v3H8v2h3z"/>`)
export const editorIconRowBelow = svgIcon(`<path fill="currentColor" d="M22 10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3h2v2h4V3h2v2h4V3h2v2h4V3h2zM4 10h4V7H4zm6 0h4V7h-4zm10 0V7h-4v3zm-9 4h2v3h3v2h-3v3h-2v-3H8v-2h3z"/>`)
export const editorIconColumnLeft = svgIcon(`<path fill="currentColor" d="M13 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h9V2zm7 8v4h-7v-4zm0 6v4h-7v-4zm0-12v4h-7V4zM9 11H6V8H4v3H1v2h3v3h2v-3h3z"/>`)
export const editorIconColumnRight = svgIcon(`<path fill="currentColor" d="M11 2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H2V2zm-7 8v4h7v-4zm0 6v4h7v-4zM4 4v4h7V4zm11 7h3V8h2v3h3v2h-3v3h-2v-3h-3z"/>`)
export const editorIconDeleteRow = svgIcon(`<path fill="currentColor" d="M9.41 13L12 15.59L14.59 13L16 14.41L13.41 17L16 19.59L14.59 21L12 18.41L9.41 21L8 19.59L10.59 17L8 14.41zM22 9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM4 9h4V6H4zm6 0h4V6h-4zm6 0h4V6h-4z"/>`)
export const editorIconDeleteColumn = svgIcon(`<path fill="currentColor" d="M4 2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m0 8v4h7v-4zm0 6v4h7v-4zM4 4v4h7V4zm13.59 8L15 9.41L16.41 8L19 10.59L21.59 8L23 9.41L20.41 12L23 14.59L21.59 16L19 13.41L16.41 16L15 14.59z"/>`)
export const editorIconDeleteTable = svgIcon(`<path fill="currentColor" d="m15.46 15.88l1.42-1.42L19 16.59l2.12-2.13l1.42 1.42L20.41 18l2.13 2.12l-1.42 1.42L19 19.41l-2.12 2.13l-1.42-1.42L17.59 18zM4 3h14a2 2 0 0 1 2 2v7.08a6 6 0 0 0-4.32.92H12v4h1.08c-.11.68-.11 1.35 0 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2m0 4v4h6V7zm8 0v4h6V7zm-8 6v4h6v-4z"/>`)
