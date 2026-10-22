/**
 * A small, dependency-free tokenizer for the documentation code samples.
 *
 * It trades full language parsing for a predictable set of colors: strings,
 * comments, keywords, tags, attributes, and numbers. Every token is rendered
 * as text, so the output is safe for any sample a page can contain.
 */

/** A visual category used by the `tok-*` classes in `docs.css`. */
export type TokenKind =
	| 'plain'
	| 'comment'
	| 'keyword'
	| 'string'
	| 'number'
	| 'function'
	| 'tag'
	| 'attr'
	| 'property'
	| 'type'
	| 'meta'
	| 'punct';

/** One colored fragment of source code. */
export interface Token {
	/** Exact source text, including whitespace. */
	text: string;
	/** Visual category. */
	kind: TokenKind;
}

const JS_KEYWORDS = [
	'import',
	'export',
	'from',
	'const',
	'let',
	'var',
	'function',
	'return',
	'if',
	'else',
	'for',
	'while',
	'do',
	'new',
	'await',
	'async',
	'default',
	'type',
	'interface',
	'implements',
	'extends',
	'class',
	'try',
	'catch',
	'finally',
	'throw',
	'switch',
	'case',
	'break',
	'continue',
	'typeof',
	'instanceof',
	'in',
	'of',
	'as',
	'satisfies',
	'void',
	'delete',
	'yield',
	'static',
	'enum',
	'declare',
	'readonly',
	'namespace',
	'abstract',
	'public',
	'private',
	'protected',
	'override'
].join('|');

const JS_TYPES = 'string|number|boolean|unknown|any|never|object|symbol|bigint';

/** Join multiline rule literals without leaving whitespace inside the regex. */
function compact(source: string): string {
	return source.trim().replace(/\n/g, '');
}

const JS_RULES = compact(String.raw`
(?<comment>\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->)
|(?<string>'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")
|(?<tag><\/?[A-Za-z][\w.:-]*|\/?>)
|(?<directive>\{[#:/](?:if|each|else|await|then|catch|snippet|render|key)\b)
|(?<type>\b(?:${JS_TYPES})\b)
|(?<keyword>\b(?:${JS_KEYWORDS})\b)
|(?<literal>\b(?:true|false|null|undefined|this|super)\b)
|(?<number>\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b)
|(?<attr>[A-Za-z_$][\w$.:-]*(?=\s*=(?!=)))
|(?<property>[A-Za-z_$][\w$]*(?=\s*:))
|(?<function>[A-Za-z_$][\w$]*(?=\s*\())
|(?<punct>(?:(?!\{[#:/])[{}()\[\].,;:=+\-*/%!?&|^~])+)
`);

const CSS_RULES = compact(String.raw`
(?<comment>\/\*[\s\S]*?\*\/)
|(?<string>'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")
|(?<keyword>@[\w-]+)
|(?<number>#[\da-fA-F]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh|vmin|vmax|ms|s|deg|ch|fr|ex)?\b)
|(?<property>--[\w-]+|[A-Za-z-]+(?=\s*:))
|(?<function>[A-Za-z-]+(?=\())
|(?<tag>\.-?[_a-zA-Z][\w-]*|#[a-zA-Z][\w-]*)
|(?<punct>[{}();:,])
`);

const JSON_RULES = compact(String.raw`
(?<property>"(?:\\.|[^"\\])*"(?=\s*:))
|(?<string>"(?:\\.|[^"\\])*")
|(?<number>-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)
|(?<keyword>\b(?:true|false|null)\b)
|(?<punct>[{}\[\],:])
`);

const HTTP_RULES = compact(String.raw`
(?<keyword>\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b)
|(?<meta>HTTP\/\d(?:\.\d)?)
|(?<string>\/[^\s"']*|"(?:\\.|[^"\\])*")
|(?<property>[A-Za-z-]+(?=\s*:))
|(?<number>\b\d{3}\b)
|(?<punct>[:?=&])
`);

const SHELL_RULES = compact(String.raw`
(?<comment>#[^\n]*)
|(?<string>'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")
|(?<property>\b[A-Z][A-Z0-9_]{2,}\b)
|(?<attr>(?<!\S)--?[A-Za-z][\w-]*)
|(?<function>^[ \t]*[A-Za-z_][\w.-]*)
|(?<number>\b\d+\b)
|(?<punct>[=*])
`);

const JS_LANGUAGES = new Set([
	'js',
	'javascript',
	'jsx',
	'ts',
	'typescript',
	'tsx',
	'svelte',
	'html'
]);
const CSS_LANGUAGES = new Set(['css', 'scss']);
const JSON_LANGUAGES = new Set(['json', 'jsonc']);
const SHELL_LANGUAGES = new Set(['sh', 'bash', 'shell', 'zsh', 'console', 'env']);

const TAG_NAMES = new Set([
	'a',
	'abbr',
	'address',
	'area',
	'article',
	'aside',
	'audio',
	'b',
	'base',
	'bdi',
	'bdo',
	'blockquote',
	'body',
	'br',
	'button',
	'canvas',
	'caption',
	'cite',
	'code',
	'col',
	'colgroup',
	'data',
	'datalist',
	'dd',
	'del',
	'details',
	'dfn',
	'dialog',
	'div',
	'dl',
	'dt',
	'em',
	'embed',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'head',
	'header',
	'hgroup',
	'hr',
	'html',
	'i',
	'iframe',
	'img',
	'input',
	'ins',
	'kbd',
	'label',
	'legend',
	'li',
	'link',
	'main',
	'map',
	'mark',
	'menu',
	'meta',
	'meter',
	'nav',
	'noscript',
	'object',
	'ol',
	'optgroup',
	'option',
	'output',
	'p',
	'picture',
	'pre',
	'progress',
	'q',
	'rp',
	'rt',
	'ruby',
	's',
	'samp',
	'script',
	'search',
	'section',
	'select',
	'slot',
	'small',
	'source',
	'span',
	'strong',
	'style',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'template',
	'textarea',
	'tfoot',
	'th',
	'thead',
	'time',
	'title',
	'tr',
	'track',
	'u',
	'ul',
	'var',
	'video',
	'wbr'
]);

/**
 * Split code into colored lines. The outer array holds lines and the inner
 * arrays hold tokens, so a line can mix several colors without losing the
 * block-level layout of a `<pre>` element.
 */
export function highlight(code: string, lang: string): Token[][] {
	const source = code.replace(/\r\n?/g, '\n').replace(/\n$/, '');
	const language = lang
		.toLowerCase()
		.replace(/^language-/, '')
		.trim();

	if (JS_LANGUAGES.has(language)) return toLines(scanTagged(source));
	if (CSS_LANGUAGES.has(language)) return toLines(scan(source, CSS_RULES));
	if (JSON_LANGUAGES.has(language)) return toLines(scan(source, JSON_RULES));
	if (language === 'http') return toLines(scan(source, HTTP_RULES));
	if (SHELL_LANGUAGES.has(language)) return toLines(scan(source, SHELL_RULES));

	return toLines([{ text: source, kind: 'plain' }]);
}

/** Read named groups from a rule set and turn them into flat tokens. */
function scan(code: string, source: string, flags = 'gm'): Token[] {
	const pattern = new RegExp(source, flags);
	const tokens: Token[] = [];
	let last = 0;

	for (const match of code.matchAll(pattern)) {
		const index = match.index ?? 0;
		if (index > last) tokens.push({ text: code.slice(last, index), kind: 'plain' });

		const groups = match.groups ?? {};
		const kind = (Object.keys(groups).find((key) => groups[key] !== undefined) ??
			'plain') as TokenKind;

		tokens.push({ text: match[0], kind });
		last = index + match[0].length;
	}

	if (last < code.length) tokens.push({ text: code.slice(last), kind: 'plain' });
	return tokens;
}

/**
 * JavaScript and Svelte need a little state: once a tag opens, attribute names
 * can be colored differently, and generic type arguments must not look like
 * markup. Everything else is a flat scan.
 */
function scanTagged(code: string): Token[] {
	const tokens: Token[] = [];
	let last = 0;
	let inTag = false;

	for (const match of code.matchAll(new RegExp(JS_RULES, 'gm'))) {
		const index = match.index ?? 0;
		if (index > last) tokens.push({ text: code.slice(last, index), kind: 'plain' });

		const text = match[0];
		const groups = match.groups ?? {};
		const group = Object.keys(groups).find((key) => groups[key] !== undefined) ?? 'plain';
		let kind: TokenKind =
			group === 'directive' || group === 'literal' ? 'keyword' : (group as TokenKind);

		if (kind === 'tag') {
			if (text === '>' || text === '/>') {
				kind = inTag ? 'tag' : 'punct';
				inTag = false;
			} else {
				const closing = text.startsWith('</');
				const name = text.slice(closing ? 2 : 1);
				const previous = code[index - 1];
				const generic = !closing && previous !== undefined && /[\w$)\]]/.test(previous);

				if (generic) {
					tokens.push({ text: '<', kind: 'punct' });
					tokens.push({
						text: name,
						kind: isPrimitive(name) || /^[A-Z]/.test(name) ? 'type' : 'plain'
					});
					last = index + text.length;
					continue;
				}

				if (!closing && !isTagName(name)) {
					tokens.push({ text: '<', kind: 'punct' });
					tokens.push({ text: name, kind: 'plain' });
					last = index + text.length;
					continue;
				}

				inTag = true;
			}
		} else if (kind === 'attr' && !inTag) {
			kind = 'plain';
		}

		tokens.push({ text, kind });
		last = index + text.length;
	}

	if (last < code.length) tokens.push({ text: code.slice(last), kind: 'plain' });
	return tokens;
}

function isPrimitive(name: string): boolean {
	return /^(?:string|number|boolean|unknown|any|never|object|symbol|bigint|void)$/.test(name);
}

function isTagName(name: string): boolean {
	return (
		TAG_NAMES.has(name.toLowerCase()) ||
		/^[A-Z]/.test(name) ||
		name.includes('-') ||
		name.includes(':')
	);
}

/** Split tokens on newlines while preserving their colors. */
function toLines(tokens: Token[]): Token[][] {
	const lines: Token[][] = [[]];

	for (const token of tokens) {
		const parts = token.text.split('\n');

		for (let index = 0; index < parts.length; index += 1) {
			if (index > 0) lines.push([]);
			const text = parts[index];
			if (text) lines[lines.length - 1]?.push({ text, kind: token.kind });
		}
	}

	return lines;
}
