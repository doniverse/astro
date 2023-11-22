import type { DevOverlayMetadata, DevOverlayPlugin } from '../../../../../@types/astro.js';
import type { DevOverlayHighlight } from '../../ui-library/highlight.js';
import { getIconElement } from '../../ui-library/icons.js';
import { attachTooltipToHighlight, createHighlight, positionHighlight } from '../utils/highlight.js';
import { a11y } from './a11y.js';

const icon =
	'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 16"><path fill="#fff" d="M.6 2A1.1 1.1 0 0 1 1.7.9h16.6a1.1 1.1 0 1 1 0 2.2H1.6A1.1 1.1 0 0 1 .8 2Zm1.1 7.1h6a1.1 1.1 0 0 0 0-2.2h-6a1.1 1.1 0 0 0 0 2.2ZM9.3 13H1.8a1.1 1.1 0 1 0 0 2.2h7.5a1.1 1.1 0 1 0 0-2.2Zm11.3 1.9a1.1 1.1 0 0 1-1.5 0l-1.7-1.7a4.1 4.1 0 1 1 1.6-1.6l1.6 1.7a1.1 1.1 0 0 1 0 1.6Zm-5.3-3.4a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z"/></svg>';

type DynamicString = string | ((element: Element) => string);

export interface AuditRule {
	code: string;
	title: DynamicString;
	message: DynamicString;
}

export interface ResolvedAuditRule {
	code: string;
	title: string;
	message: string;
}

export interface AuditRuleWithSelector extends AuditRule {
	selector: string;
	match?: (element: Element) => boolean | null | undefined | void;
}

const rules = [...a11y]

const dynamicAuditRuleKeys: Array<keyof AuditRule> = ['title', 'message']
function resolveAuditRule(rule: AuditRule, element: Element): ResolvedAuditRule {
	let resolved: ResolvedAuditRule = { ...rule } as any;
	for (const key of dynamicAuditRuleKeys) {
		const value = rule[key];
		if (typeof value === 'string') continue;
		resolved[key] = value(element);
	}
	return resolved;
}

export default {
	id: 'astro:audit',
	name: 'Audit',
	icon: icon,
	async init(canvas, eventTarget) {
		let audits: { highlightElement: DevOverlayHighlight; auditedElement: HTMLElement }[] = [];

		await lint();

		document.addEventListener('astro:after-swap', async () => lint());
		document.addEventListener('astro:page-load', async () => refreshLintPositions);
	
		async function lint() {
			initStyle();

			audits.forEach(({ highlightElement }) => {
				highlightElement.remove();
			});
			audits = [];
			canvas.getElementById('no-audit')?.remove();
			const selectorCache = new Map<string, NodeListOf<Element>>();

			for (const rule of rules) {
				const elements = selectorCache.get(rule.selector) ?? document.querySelectorAll(rule.selector);
				let matches: Element[] = [];
				if (typeof rule.match === 'undefined') {
					matches = Array.from(elements);
				} else {
					for (const element of elements) {
						if (rule.match(element)) {
							matches.push(element);
						}
					}
				}
				for (const element of matches) {
					await createAuditProblem(rule, element);
				}
			}

			if (audits.length > 0) {
				eventTarget.dispatchEvent(
					new CustomEvent('toggle-notification', {
						detail: {
							state: true,
						},
					})
				);
			} else {
				eventTarget.dispatchEvent(
					new CustomEvent('toggle-notification', {
						detail: {
							state: false,
						},
					})
				);

				const noAuditBlock = document.createElement('div');
				noAuditBlock.id = 'no-audit';

				const noAuditIcon = getIconElement('check-circle');
				const text = document.createElement('div');
				text.textContent = 'No issues found!';

				if (noAuditIcon) {
					noAuditIcon.style.width = '24px';
					noAuditBlock.append(noAuditIcon);
				}
				noAuditBlock.append(text);

				canvas.append(noAuditBlock);
			}

			(['scroll', 'resize'] as const).forEach((event) => {
				window.addEventListener(event, refreshLintPositions);
			});
		}

		function refreshLintPositions() {
			const noAuditBlock = canvas.getElementById('no-audit');
			if (noAuditBlock) {
				const devOverlayRect = document
					.querySelector('astro-dev-overlay')
					?.shadowRoot.querySelector('#dev-overlay')
					?.getBoundingClientRect();

				noAuditBlock.style.top = `${
					(devOverlayRect?.top ?? 0) - (devOverlayRect?.height ?? 0) - 16
				}px`;
			}

			audits.forEach(({ highlightElement, auditedElement }) => {
				const rect = auditedElement.getBoundingClientRect();
				positionHighlight(highlightElement, rect);
			});
		}

		async function createAuditProblem(rule: AuditRule, originalElement: Element) {
			const computedStyle = window.getComputedStyle(originalElement);
			const targetedElement = (originalElement.children[0] as HTMLElement) || originalElement;

			// If the element is hidden, don't do anything
			if (targetedElement.offsetParent === null || computedStyle.display === 'none') {
				audits.push();
				return;
			}

			// If the element is an image, wait for it to load
			if (originalElement.nodeName === 'IMG' && !(originalElement as HTMLImageElement).complete) {
				await (originalElement as HTMLImageElement).decode();
			}

			const rect = originalElement.getBoundingClientRect();
			const highlight = createHighlight(rect, 'warning');
			const tooltip = buildAuditTooltip(rule, originalElement);
			attachTooltipToHighlight(highlight, tooltip, originalElement);

			canvas.append(highlight);
			audits.push({ highlightElement: highlight, auditedElement: originalElement as HTMLElement });
		}

		function buildAuditTooltip(rule: AuditRule, element: Element) {
			const tooltip = document.createElement('astro-dev-overlay-tooltip');
			const { title, message } = resolveAuditRule(rule, element);

			tooltip.sections = [
				{
					icon: 'warning',
					title,
				},
				{
					content: message
				},
			];

			const elementFile = element.getAttribute('data-astro-source-file');
			const elementPosition = element.getAttribute('data-astro-source-loc');

			if (elementFile) {
				const elementFileWithPosition =
					elementFile + (elementPosition ? ':' + elementPosition : '');

				tooltip.sections.push({
					content: elementFileWithPosition.slice(
						(window as DevOverlayMetadata).__astro_dev_overlay__.root.length - 1 // We want to keep the final slash, so minus one.
					),
					clickDescription: 'Click to go to file',
					async clickAction() {
						// NOTE: The path here has to be absolute and without any errors (no double slashes etc)
						// or Vite will silently fail to open the file. Quite annoying.
						await fetch('/__open-in-editor?file=' + encodeURIComponent(elementFileWithPosition));
					},
				});
			}

			return tooltip;
		}

		function initStyle() {
			const devOverlayRect = document
				.querySelector('astro-dev-overlay')
				?.shadowRoot.querySelector('#dev-overlay')
				?.getBoundingClientRect();

			const style = document.createElement('style');
			style.textContent = `
			:host {
				opacity: 0;
				transition: opacity 0.1s ease-in-out;
			}

			:host([data-active]) {
				opacity: 1;
			}

			#no-audit {
				border: 1px solid rgba(113, 24, 226, 1);
				background-color: #310A65;
				box-shadow: 0px 0px 0px 0px rgba(0, 0, 0, 0.30), 0px 1px 2px 0px rgba(0, 0, 0, 0.29), 0px 4px 4px 0px rgba(0, 0, 0, 0.26), 0px 10px 6px 0px rgba(0, 0, 0, 0.15), 0px 17px 7px 0px rgba(0, 0, 0, 0.04), 0px 26px 7px 0px rgba(0, 0, 0, 0.01);
				color: white;
				text-align: center;
				border-radius: 4px;
				padding: 8px;
				font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
				position: fixed;
				transform: translate(-50%, 0);
				top: ${(devOverlayRect?.top ?? 0) - (devOverlayRect?.height ?? 0) - 16}px;
				left: calc(50% + 12px);
				width: 200px;
			}
		`;

			canvas.append(style);
		}
	},
	async beforeTogglingOff(canvas) {
		canvas.host?.removeAttribute('data-active');

		await new Promise((resolve) => {
			canvas.host.addEventListener('transitionend', resolve);
		});

		return true;
	},
} satisfies DevOverlayPlugin;
