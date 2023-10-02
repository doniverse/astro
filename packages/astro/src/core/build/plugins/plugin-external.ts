import type { Plugin as VitePlugin } from 'vite';
import type { AstroBuildPlugin } from '../plugin.js';
import { slash, removeLeadingForwardSlash } from '../../path.js';

export function vitePluginExternalize(): VitePlugin {
	const MODULE_ID = `astro:content`;
	const VIRTUAL_MODULE_ID = `\0${MODULE_ID}`;

	return {
		name: '@astro/plugin-externalize',
		enforce: 'pre',
		resolveId(id) {
			// Ensure that `astro:content` is treated as external and rewritten to the final entrypoint
			if (id === MODULE_ID) {
				return { id: VIRTUAL_MODULE_ID, external: true }
            }
            return null;
		},
		renderChunk(code, chunk) {
			if (chunk.imports.find(name => name === VIRTUAL_MODULE_ID)) {
				// We want to generate a relative path and avoid a hardcoded absolute path in the output!
				const steps = removeLeadingForwardSlash(slash(chunk.fileName)).split('/').length - 1;
				const prefix = '../'.repeat(steps) || './';
				// dist/content/index.mjs is generated by the "content" build
				return code.replace(VIRTUAL_MODULE_ID, `${prefix}content/index.mjs`);
			}
		}
	};
}

export function pluginExternalize(): AstroBuildPlugin {
	return {
		targets: ['server'],
		hooks: {
			'build:before': () => {
				return {
					vitePlugin: vitePluginExternalize(),
				};
			},
		},
	};
}