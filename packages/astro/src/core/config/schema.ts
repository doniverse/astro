import type {
	RehypePlugin,
	RemarkPlugin,
	RemarkRehype,
	ShikiConfig,
} from '@astrojs/markdown-remark';
import { markdownConfigDefaults } from '@astrojs/markdown-remark';
import { bundledThemes, type BuiltinTheme } from 'shikiji';
import type { AstroUserConfig, ViteUserConfig } from '../../@types/astro.js';

import fs from 'node:fs';
import type { OutgoingHttpHeaders } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { appendForwardSlash, prependForwardSlash, removeTrailingForwardSlash } from '../path.js';

// This import is required to appease TypeScript!
// See https://github.com/withastro/astro/pull/8762
import 'mdast-util-to-hast';

type ShikiLangs = NonNullable<ShikiConfig['langs']>;
type ShikiTheme = NonNullable<ShikiConfig['theme']>;

const ASTRO_CONFIG_DEFAULTS = {
	root: '.',
	srcDir: './src',
	publicDir: './public',
	outDir: './dist',
	cacheDir: './node_modules/.astro',
	base: '/',
	trailingSlash: 'ignore',
	build: {
		format: 'directory',
		client: './dist/client/',
		server: './dist/server/',
		assets: '_astro',
		serverEntry: 'entry.mjs',
		redirects: true,
		inlineStylesheets: 'auto',
		split: false,
		excludeMiddleware: false,
	},
	image: {
		service: { entrypoint: 'astro/assets/services/sharp', config: {} },
	},
	compressHTML: true,
	server: {
		host: false,
		port: 4321,
		open: false,
	},
	integrations: [],
	markdown: {
		drafts: false,
		...markdownConfigDefaults,
	},
	vite: {},
	legacy: {},
	redirects: {},
	experimental: {
		optimizeHoistedScript: false,
		devOverlay: false,
		contentCollectionCache: false,
	},
} satisfies AstroUserConfig & { server: { open: boolean } };

export const AstroConfigSchema = z.object({
	root: z
		.string()
		.optional()
		.default(ASTRO_CONFIG_DEFAULTS.root)
		.transform((val) => new URL(val)),
	srcDir: z
		.string()
		.optional()
		.default(ASTRO_CONFIG_DEFAULTS.srcDir)
		.transform((val) => new URL(val)),
	publicDir: z
		.string()
		.optional()
		.default(ASTRO_CONFIG_DEFAULTS.publicDir)
		.transform((val) => new URL(val)),
	outDir: z
		.string()
		.optional()
		.default(ASTRO_CONFIG_DEFAULTS.outDir)
		.transform((val) => new URL(val)),
	cacheDir: z
		.string()
		.optional()
		.default(ASTRO_CONFIG_DEFAULTS.cacheDir)
		.transform((val) => new URL(val)),
	site: z.string().url().optional(),
	compressHTML: z.boolean().optional().default(ASTRO_CONFIG_DEFAULTS.compressHTML),
	base: z.string().optional().default(ASTRO_CONFIG_DEFAULTS.base),
	trailingSlash: z
		.union([z.literal('always'), z.literal('never'), z.literal('ignore')])
		.optional()
		.default(ASTRO_CONFIG_DEFAULTS.trailingSlash),
	output: z
		.union([z.literal('static'), z.literal('server'), z.literal('hybrid')])
		.optional()
		.default('static'),
	scopedStyleStrategy: z
		.union([z.literal('where'), z.literal('class'), z.literal('attribute')])
		.optional()
		.default('attribute'),
	adapter: z.object({ name: z.string(), hooks: z.object({}).passthrough().default({}) }).optional(),
	integrations: z.preprocess(
		// preprocess
		(val) => (Array.isArray(val) ? val.flat(Infinity).filter(Boolean) : val),
		// validate
		z
			.array(z.object({ name: z.string(), hooks: z.object({}).passthrough().default({}) }))
			.default(ASTRO_CONFIG_DEFAULTS.integrations)
	),
	build: z
		.object({
			format: z
				.union([z.literal('file'), z.literal('directory')])
				.optional()
				.default(ASTRO_CONFIG_DEFAULTS.build.format),
			client: z
				.string()
				.optional()
				.default(ASTRO_CONFIG_DEFAULTS.build.client)
				.transform((val) => new URL(val)),
			server: z
				.string()
				.optional()
				.default(ASTRO_CONFIG_DEFAULTS.build.server)
				.transform((val) => new URL(val)),
			assets: z.string().optional().default(ASTRO_CONFIG_DEFAULTS.build.assets),
			assetsPrefix: z.string().optional(),
			serverEntry: z.string().optional().default(ASTRO_CONFIG_DEFAULTS.build.serverEntry),
			redirects: z.boolean().optional().default(ASTRO_CONFIG_DEFAULTS.build.redirects),
			inlineStylesheets: z
				.enum(['always', 'auto', 'never'])
				.optional()
				.default(ASTRO_CONFIG_DEFAULTS.build.inlineStylesheets),

			/**
			 * @deprecated
			 * Use the adapter feature instead
			 */
			split: z.boolean().optional().default(ASTRO_CONFIG_DEFAULTS.build.split),
			/**
			 * @deprecated
			 * Use the adapter feature instead
			 */
			excludeMiddleware: z
				.boolean()
				.optional()
				.default(ASTRO_CONFIG_DEFAULTS.build.excludeMiddleware),
		})
		.default({}),
	server: z.preprocess(
		// preprocess
		// NOTE: Uses the "error" command here because this is overwritten by the
		// individualized schema parser with the correct command.
		(val) => (typeof val === 'function' ? val({ command: 'error' }) : val),
		// validate
		z
			.object({
				open: z.boolean().optional().default(ASTRO_CONFIG_DEFAULTS.server.open),
				host: z
					.union([z.string(), z.boolean()])
					.optional()
					.default(ASTRO_CONFIG_DEFAULTS.server.host),
				port: z.number().optional().default(ASTRO_CONFIG_DEFAULTS.server.port),
				headers: z.custom<OutgoingHttpHeaders>().optional(),
			})
			.default({})
	),
	redirects: z
		.record(
			z.string(),
			z.union([
				z.string(),
				z.object({
					status: z.union([
						z.literal(300),
						z.literal(301),
						z.literal(302),
						z.literal(303),
						z.literal(304),
						z.literal(307),
						z.literal(308),
					]),
					destination: z.string(),
				}),
			])
		)
		.default(ASTRO_CONFIG_DEFAULTS.redirects),
	prefetch: z
		.union([
			z.boolean(),
			z.object({
				prefetchAll: z.boolean().optional(),
				defaultStrategy: z.enum(['tap', 'hover', 'viewport']).optional(),
			}),
		])
		.optional(),
	image: z
		.object({
			endpoint: z.string().optional(),
			service: z
				.object({
					entrypoint: z
						.union([
							z.literal('astro/assets/services/sharp'),
							z.literal('astro/assets/services/squoosh'),
							z.string(),
						])
						.default(ASTRO_CONFIG_DEFAULTS.image.service.entrypoint),
					config: z.record(z.any()).default({}),
				})
				.default(ASTRO_CONFIG_DEFAULTS.image.service),
			domains: z.array(z.string()).default([]),
			remotePatterns: z
				.array(
					z.object({
						protocol: z.string().optional(),
						hostname: z
							.string()
							.refine(
								(val) => !val.includes('*') || val.startsWith('*.') || val.startsWith('**.'),
								{
									message: 'wildcards can only be placed at the beginning of the hostname',
								}
							)
							.optional(),
						port: z.string().optional(),
						pathname: z
							.string()
							.refine((val) => !val.includes('*') || val.endsWith('/*') || val.endsWith('/**'), {
								message: 'wildcards can only be placed at the end of a pathname',
							})
							.optional(),
					})
				)
				.default([]),
		})
		.default(ASTRO_CONFIG_DEFAULTS.image),
	markdown: z
		.object({
			drafts: z.boolean().default(false),
			syntaxHighlight: z
				.union([z.literal('shiki'), z.literal('prism'), z.literal(false)])
				.default(ASTRO_CONFIG_DEFAULTS.markdown.syntaxHighlight),
			shikiConfig: z
				.object({
					langs: z
						.custom<ShikiLangs[number]>()
						.array()
						.transform((langs) => {
							for (const lang of langs) {
								// shiki -> shikiji compat
								if (typeof lang === 'object') {
									// shikiji does not support `path`
									// https://github.com/shikijs/shiki/blob/facb6ff37996129626f8066a5dccb4608e45f649/packages/shiki/src/loader.ts#L98
									const langPath = (lang as any).path;
									if (langPath) {
										// shiki resolves path from within its package directory :shrug:
										const astroRoot = fileURLToPath(new URL('../../../', import.meta.url));
										const normalizedPath = path.isAbsolute(langPath)
											? langPath
											: path.resolve(astroRoot, langPath);
										try {
											const content = fs.readFileSync(normalizedPath, 'utf-8');
											const parsed = JSON.parse(content);
											Object.assign(lang, parsed);
										} catch (e) {
											throw new Error(`Unable to find language file at ${normalizedPath}`, {
												cause: e,
											});
										}
									}
									// `id` renamed to `name` (always override)
									if ((lang as any).id) {
										lang.name = (lang as any).id;
									}
									// `grammar` flattened to lang itself
									if ((lang as any).grammar) {
										Object.assign(lang, (lang as any).grammar);
									}
								}
							}
							return langs;
						})
						.default([]),
					theme: z
						.enum(Object.keys(bundledThemes) as [BuiltinTheme, ...BuiltinTheme[]])
						.or(z.custom<ShikiTheme>())
						.default(ASTRO_CONFIG_DEFAULTS.markdown.shikiConfig.theme!),
					experimentalThemes: z
						.record(
							z
								.enum(Object.keys(bundledThemes) as [BuiltinTheme, ...BuiltinTheme[]])
								.or(z.custom<ShikiTheme>())
						)
						.default(ASTRO_CONFIG_DEFAULTS.markdown.shikiConfig.experimentalThemes!),
					wrap: z.boolean().or(z.null()).default(ASTRO_CONFIG_DEFAULTS.markdown.shikiConfig.wrap!),
				})
				.default({}),
			remarkPlugins: z
				.union([
					z.string(),
					z.tuple([z.string(), z.any()]),
					z.custom<RemarkPlugin>((data) => typeof data === 'function'),
					z.tuple([z.custom<RemarkPlugin>((data) => typeof data === 'function'), z.any()]),
				])
				.array()
				.default(ASTRO_CONFIG_DEFAULTS.markdown.remarkPlugins),
			rehypePlugins: z
				.union([
					z.string(),
					z.tuple([z.string(), z.any()]),
					z.custom<RehypePlugin>((data) => typeof data === 'function'),
					z.tuple([z.custom<RehypePlugin>((data) => typeof data === 'function'), z.any()]),
				])
				.array()
				.default(ASTRO_CONFIG_DEFAULTS.markdown.rehypePlugins),
			remarkRehype: z
				.custom<RemarkRehype>((data) => data instanceof Object && !Array.isArray(data))
				.optional()
				.default(ASTRO_CONFIG_DEFAULTS.markdown.remarkRehype),
			gfm: z.boolean().default(ASTRO_CONFIG_DEFAULTS.markdown.gfm),
			smartypants: z.boolean().default(ASTRO_CONFIG_DEFAULTS.markdown.smartypants),
		})
		.default({}),
	vite: z
		.custom<ViteUserConfig>((data) => data instanceof Object && !Array.isArray(data))
		.default(ASTRO_CONFIG_DEFAULTS.vite),
	experimental: z
		.object({
			optimizeHoistedScript: z
				.boolean()
				.optional()
				.default(ASTRO_CONFIG_DEFAULTS.experimental.optimizeHoistedScript),
			devOverlay: z.boolean().optional().default(ASTRO_CONFIG_DEFAULTS.experimental.devOverlay),
			i18n: z.optional(
				z
					.object({
						defaultLocale: z.string(),
						locales: z.string().array(),
						fallback: z.record(z.string(), z.string()).optional(),
						// TODO: properly add default when the feature goes of experimental
						routingStrategy: z
							.enum(['prefix-always', 'prefix-other-locales'])
							.optional()
							.default('prefix-other-locales'),
					})
					.optional()
					.superRefine((i18n, ctx) => {
						if (i18n) {
							const { defaultLocale, locales, fallback } = i18n;
							if (!locales.includes(defaultLocale)) {
								ctx.addIssue({
									code: z.ZodIssueCode.custom,
									message: `The default locale \`${defaultLocale}\` is not present in the \`i18n.locales\` array.`,
								});
							}
							if (fallback) {
								for (const [fallbackFrom, fallbackTo] of Object.entries(fallback)) {
									if (!locales.includes(fallbackFrom)) {
										ctx.addIssue({
											code: z.ZodIssueCode.custom,
											message: `The locale \`${fallbackFrom}\` key in the \`i18n.fallback\` record doesn't exist in the \`i18n.locales\` array.`,
										});
									}

									if (fallbackFrom === defaultLocale) {
										ctx.addIssue({
											code: z.ZodIssueCode.custom,
											message: `You can't use the default locale as a key. The default locale can only be used as value.`,
										});
									}

									if (!locales.includes(fallbackTo)) {
										ctx.addIssue({
											code: z.ZodIssueCode.custom,
											message: `The locale \`${fallbackTo}\` value in the \`i18n.fallback\` record doesn't exist in the \`i18n.locales\` array.`,
										});
									}
								}
							}
						}
					})
			),
			contentCollectionCache: z
				.boolean()
				.optional()
				.default(ASTRO_CONFIG_DEFAULTS.experimental.contentCollectionCache),
		})
		.strict(
			`Invalid or outdated experimental feature.\nCheck for incorrect spelling or outdated Astro version.\nSee https://docs.astro.build/en/reference/configuration-reference/#experimental-flags for a list of all current experiments.`
		)
		.default({}),
	legacy: z.object({}).default({}),
});

export type AstroConfigType = z.infer<typeof AstroConfigSchema>;

export function createRelativeSchema(cmd: string, fileProtocolRoot: string) {
	// We need to extend the global schema to add transforms that are relative to root.
	// This is type checked against the global schema to make sure we still match.
	const AstroConfigRelativeSchema = AstroConfigSchema.extend({
		root: z
			.string()
			.default(ASTRO_CONFIG_DEFAULTS.root)
			.transform((val) => resolveDirAsUrl(val, fileProtocolRoot)),
		srcDir: z
			.string()
			.default(ASTRO_CONFIG_DEFAULTS.srcDir)
			.transform((val) => resolveDirAsUrl(val, fileProtocolRoot)),
		compressHTML: z.boolean().optional().default(ASTRO_CONFIG_DEFAULTS.compressHTML),
		publicDir: z
			.string()
			.default(ASTRO_CONFIG_DEFAULTS.publicDir)
			.transform((val) => resolveDirAsUrl(val, fileProtocolRoot)),
		outDir: z
			.string()
			.default(ASTRO_CONFIG_DEFAULTS.outDir)
			.transform((val) => resolveDirAsUrl(val, fileProtocolRoot)),
		cacheDir: z
			.string()
			.default(ASTRO_CONFIG_DEFAULTS.cacheDir)
			.transform((val) => resolveDirAsUrl(val, fileProtocolRoot)),
		build: z
			.object({
				format: z
					.union([z.literal('file'), z.literal('directory')])
					.optional()
					.default(ASTRO_CONFIG_DEFAULTS.build.format),
				client: z
					.string()
					.optional()
					.default(ASTRO_CONFIG_DEFAULTS.build.client)
					.transform((val) => resolveDirAsUrl(val, fileProtocolRoot)),
				server: z
					.string()
					.optional()
					.default(ASTRO_CONFIG_DEFAULTS.build.server)
					.transform((val) => resolveDirAsUrl(val, fileProtocolRoot)),
				assets: z.string().optional().default(ASTRO_CONFIG_DEFAULTS.build.assets),
				assetsPrefix: z.string().optional(),
				serverEntry: z.string().optional().default(ASTRO_CONFIG_DEFAULTS.build.serverEntry),
				redirects: z.boolean().optional().default(ASTRO_CONFIG_DEFAULTS.build.redirects),
				inlineStylesheets: z
					.enum(['always', 'auto', 'never'])
					.optional()
					.default(ASTRO_CONFIG_DEFAULTS.build.inlineStylesheets),

				split: z.boolean().optional().default(ASTRO_CONFIG_DEFAULTS.build.split),
				excludeMiddleware: z
					.boolean()
					.optional()
					.default(ASTRO_CONFIG_DEFAULTS.build.excludeMiddleware),
			})
			.optional()
			.default({}),
		server: z.preprocess(
			// preprocess
			(val) => {
				if (typeof val === 'function') {
					return val({ command: cmd === 'dev' ? 'dev' : 'preview' });
				} else {
					return val;
				}
			},
			// validate
			z
				.object({
					host: z
						.union([z.string(), z.boolean()])
						.optional()
						.default(ASTRO_CONFIG_DEFAULTS.server.host),
					port: z.number().optional().default(ASTRO_CONFIG_DEFAULTS.server.port),
					open: z.boolean().optional().default(ASTRO_CONFIG_DEFAULTS.server.open),
					headers: z.custom<OutgoingHttpHeaders>().optional(),
					streaming: z.boolean().optional().default(true),
				})
				.optional()
				.default({})
		),
	})
		.transform((config) => {
			// If the user changed outDir but not build.server, build.config, adjust so those
			// are relative to the outDir, as is the expected default.
			if (
				!config.build.server.toString().startsWith(config.outDir.toString()) &&
				config.build.server.toString().endsWith('dist/server/')
			) {
				config.build.server = new URL('./dist/server/', config.outDir);
			}
			if (
				!config.build.client.toString().startsWith(config.outDir.toString()) &&
				config.build.client.toString().endsWith('dist/client/')
			) {
				config.build.client = new URL('./dist/client/', config.outDir);
			}

			// Handle `base` trailing slash based on `trailingSlash` config
			if (config.trailingSlash === 'never') {
				config.base = prependForwardSlash(removeTrailingForwardSlash(config.base));
			} else if (config.trailingSlash === 'always') {
				config.base = prependForwardSlash(appendForwardSlash(config.base));
			} else {
				config.base = prependForwardSlash(config.base);
			}

			return config;
		})
		.refine((obj) => !obj.outDir.toString().startsWith(obj.publicDir.toString()), {
			message:
				'The value of `outDir` must not point to a path within the folder set as `publicDir`, this will cause an infinite loop',
		});

	return AstroConfigRelativeSchema;
}

function resolveDirAsUrl(dir: string, root: string) {
	let resolvedDir = path.resolve(root, dir);
	if (!resolvedDir.endsWith(path.sep)) {
		resolvedDir += path.sep;
	}
	return pathToFileURL(resolvedDir);
}
