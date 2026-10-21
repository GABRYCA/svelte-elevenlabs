/**
 * Prerender the showcase only for the GitHub Pages target.
 *
 * The default Node build keeps runtime environment variables dynamic, so it
 * must not bake the page at build time.
 */
export const prerender = import.meta.env.MODE === 'pages';
