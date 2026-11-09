/** Marks elements the clipper adds to a page (toolbar, reader, toast), so
 *  extraction, anchors and selections leave them out. Kept apart from the
 *  extractor so the small restore script does not pull in Defuddle. */
export const UI_ATTR = 'data-zn-clipper-ui'
