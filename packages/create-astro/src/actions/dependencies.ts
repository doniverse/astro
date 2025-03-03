import { color } from '@astrojs/cli-kit';
import fs from 'node:fs';
import path from 'node:path';
import { error, info, spinner, title } from '../messages.js';
import { shell } from '../shell.js';
import type { Context } from './context.js';

export async function dependencies(
	ctx: Pick<Context, 'install' | 'yes' | 'prompt' | 'packageManager' | 'cwd' | 'dryRun'>
) {
	let deps = ctx.install ?? ctx.yes;
	if (deps === undefined) {
		({ deps } = await ctx.prompt({
			name: 'deps',
			type: 'confirm',
			label: title('deps'),
			message: `Install dependencies?`,
			hint: 'recommended',
			initial: true,
		}));
		ctx.install = deps;
	}

	if (ctx.dryRun) {
		await info('--dry-run', `Skipping dependency installation`);
	} else if (deps) {
		await spinner({
			start: `Installing dependencies with ${ctx.packageManager}...`,
			end: 'Dependencies installed',
			onError: (e) => {
				error('error', e);
				error(
					'error',
					`Dependencies failed to install, please run ${color.bold(
						ctx.packageManager + ' install'
					)} to install them manually after setup.`
				);
			},
			while: () => install({ packageManager: ctx.packageManager, cwd: ctx.cwd }),
		});
	} else {
		await info(
			ctx.yes === false ? 'deps [skip]' : 'No problem!',
			'Remember to install dependencies after setup.'
		);
	}
}

async function install({ packageManager, cwd }: { packageManager: string; cwd: string }) {
	if (packageManager === 'yarn') await ensureYarnLock({ cwd });
	return shell(packageManager, ['install'], { cwd, timeout: 90_000, stdio: 'ignore' });
}

async function ensureYarnLock({ cwd }: { cwd: string }) {
	const yarnLock = path.join(cwd, 'yarn.lock');
	if (fs.existsSync(yarnLock)) return;
	return fs.promises.writeFile(yarnLock, '', { encoding: 'utf-8' });
}
