/**
 * Shared navigation model for the documentation section.
 *
 * Hrefs are route ids, not resolved paths. Components call `resolve()` at
 * render time so the GitHub Pages base path is applied correctly on every
 * request.
 */

/** Every documentation route that appears in the sidebar. */
export type DocsHref =
	| '/docs'
	| '/docs/install'
	| '/docs/quickstart'
	| '/docs/sessions'
	| '/docs/audio'
	| '/docs/client-tools'
	| '/docs/components'
	| '/docs/signed-urls'
	| '/docs/reference'
	| '/docs/troubleshooting';

/** One documentation page inside a sidebar group. */
export interface DocsNavItem {
	/** Visible link label. */
	label: string;
	/** Route id used with `resolve()`. */
	href: DocsHref;
	/** One line summary used by the sidebar filter. */
	description: string;
}

/** A labelled block of documentation links. */
export interface DocsNavGroup {
	/** Group label shown above the links. */
	label: string;
	/** Pages in reading order. */
	items: DocsNavItem[];
}

/** Current package version displayed in the docs chrome. */
export const docsVersion = '0.4.0';

/** Sidebar groups in reading order. */
export const docsNav: DocsNavGroup[] = [
	{
		label: 'Start here',
		items: [
			{
				label: 'Overview',
				href: '/docs',
				description: 'What the library does and where to start.'
			},
			{
				label: 'Install',
				href: '/docs/install',
				description: 'Requirements, package setup, and Tailwind discovery.'
			},
			{
				label: 'Quickstart',
				href: '/docs/quickstart',
				description: 'A first voice session in one Svelte component.'
			}
		]
	},
	{
		label: 'Guides',
		items: [
			{
				label: 'Sessions',
				href: '/docs/sessions',
				description: 'Voice, text, mute, feedback, and controller lifecycle.'
			},
			{
				label: 'Audio',
				href: '/docs/audio',
				description: 'Formats, capture, playback, devices, and analyser data.'
			},
			{
				label: 'Client tools',
				href: '/docs/client-tools',
				description: 'Named tools, provider scoped tools, and MCP approvals.'
			},
			{
				label: 'Components',
				href: '/docs/components',
				description: 'Visualizer, widget, provider, and theme variables.'
			},
			{
				label: 'Signed URLs',
				href: '/docs/signed-urls',
				description: 'Keep the ElevenLabs API key on the server.'
			}
		]
	},
	{
		label: 'Reference',
		items: [
			{
				label: 'API reference',
				href: '/docs/reference',
				description: 'Options, controller fields, methods, and types.'
			},
			{
				label: 'Troubleshooting',
				href: '/docs/troubleshooting',
				description: 'Error codes, browser limits, and common fixes.'
			}
		]
	}
];

/** Every page in sidebar reading order, used by previous and next links. */
export const docsNavFlat: DocsNavItem[] = docsNav.flatMap((group) => group.items);
