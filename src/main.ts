import { App, Plugin, PluginSettingTab, Setting, Notice, MarkdownView, Modal, ItemView, WorkspaceLeaf, TFile, setIcon, requestUrl, Menu, DropdownComponent, Editor } from 'obsidian';
import mermaid from 'mermaid';
import type MarkdownIt from 'markdown-it';
import { createMarkdownParser, processHtml, convertCssToWeChatDarkMode, hasMathFormula, renderMathInElement, katexInlineCss, basicTheme, customDefaultTheme, codeGithubTheme, academicPaperTheme, auroraGlassTheme, bauhausTheme, cyberpunkNeonTheme, knowledgeBaseTheme, luxuryGoldTheme, morandiForestTheme, neoBrutalismTheme, receiptTheme, sunsetFilmTheme, templateTheme, generateExportHtml, exportToPdfNative, getDefaultMarkdown } from '@mdb/core';
import { t, getLocaleKey, type TranslationKey } from './i18n';
import { getEditorScrollDOM, getEditorScrollRatio, setEditorScrollRatio } from './editorScroll';

const setElementHtml = (el: HTMLElement, html: string): void => {
	el.empty();
	const parsed = new DOMParser().parseFromString(html, 'text/html');
	el.append(...Array.from(parsed.body.childNodes));
};

const appendSvgMarkup = (container: HTMLElement, svgMarkup: string): void => {
	const parsed = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
	const svgEl = parsed.documentElement;
	if (svgEl?.tagName.toLowerCase() === 'svg') {
		container.appendChild(container.ownerDocument.importNode(svgEl, true));
	}
};

const buildPreviewThemeCss = (scopedCss: string, isDarkMode: boolean): string => {
	const colorScheme = isDarkMode ? 'dark' : 'light';
	return `${katexInlineCss}
${scopedCss}
#mdb {
	color-scheme: ${colorScheme};
}
#mdb * {
	color-scheme: ${colorScheme};
}
#mdb .katex-mathml {
	display: none !important;
}
#mdb .katex-html {
	display: inline-block !important;
}
#mdb .katex-display .katex-html {
	display: block !important;
}
.mdb-dark-mode .katex {
	color: var(--text-normal);
}
.mdb-view-controls,
.mdb-view-controls * {
	color-scheme: unset;
	color: var(--text-normal);
}`;
};

const themeLabelKey = (themeKey: string): TranslationKey => `theme_${themeKey}` as TranslationKey;
const hostLabelKey = (hostKey: string): TranslationKey => `host_${hostKey}` as TranslationKey;

const scopeCss = (css: string): string => {
	return css.replace(/(^|\n)(?!@)([^{}@]+)\{/g, (match: string, prefix: string, selector: string) => {
		const trimmed = selector.trim();
		
		// 跳过空选择器
		if (!trimmed) {
			return match;
		}
		
		// 跳过已经包含 #mdb 的选择器
		if (trimmed.includes("#mdb")) {
			return match;
		}
		
		// 处理逗号分隔的多个选择器
		if (trimmed.includes(',')) {
			const selectors = trimmed.split(',').map((s: string) => {
				const st = s.trim();
				
				// Skip selectors already containing #mdb / 跳过已包含 #mdb 的选择器
				if (st.includes('#mdb')) {
					return st;
				}
				
				// 转换全局选择器
				if (st === '*') {
					return '#mdb *';
				}
				if (st === 'body' || st === 'html') {
					return '#mdb';
				}
				if (st.startsWith('body ')) {
					return '#mdb ' + st.substring(5);
				}
				if (st.startsWith('html ')) {
					return '#mdb ' + st.substring(5);
				}
				// Remove :root selector (CSS variables would pollute global scope) / 移除 :root 选择器（CSS 变量会污染全局）
				if (st.startsWith(':root')) {
					return ''; // 返回空字符串，后续会被过滤
				}
				
				return `#mdb ${st}`;
			});
			
			// 过滤空字符串
			const filtered = selectors.filter((s: string) => s.trim() !== '');
			if (filtered.length === 0) {
				return ''; // 整个规则被移除
			}
			return `${prefix}${filtered.join(', ')}{`;
		}
		
		// Handle single selector / 单个选择器处理
		if (trimmed === '*') {
			return `${prefix}#mdb *{`;
		}
		if (trimmed === 'body' || trimmed === 'html') {
			return `${prefix}#mdb{`;
		}
		if (trimmed.startsWith('body ')) {
			return `${prefix}#mdb ${trimmed.substring(5)}{`;
		}
		if (trimmed.startsWith('html ')) {
			return `${prefix}#mdb ${trimmed.substring(5)}{`;
		}
		// 移除 :root 选择器
		if (trimmed.startsWith(':root')) {
			return ''; // 返回空字符串，规则被移除
		}
		
		return `${prefix}#mdb ${trimmed}{`;
	});
};

// Remove modern CSS color functions not supported by html2pdf.js / 移除 html2pdf.js 不支持的现代 CSS 颜色函数
const sanitizeModernColorFunctions = (css: string): string => {
	// 移除包含 oklch, oklab, lch, lab, color() 等现代颜色函数的属性
	// 需要处理嵌套函数（如 color-mix）和多行属性
	let result = css;
	
	// 处理可能包含现代颜色函数的所有情况
	// 包括单独使用和在 color-mix 等函数中嵌套使用
	const modernColorFunctions = [
		'oklch', 'oklab', 'lch', 'lab', 
		'color\\(', // color() 函数
		'color-mix\\([^)]*(?:oklch|oklab|lch|lab)', // color-mix 中包含现代颜色
	];
	
	modernColorFunctions.forEach(fn => {
		// Remove entire property declaration containing these functions / 移除包含这些函数的整个属性声明
		// Match property: value; including possible multi-lines and nested parentheses / 匹配 property: value; 包括可能的多行和嵌套括号
		const regex = new RegExp(
			`([a-z-][a-z0-9-]*)\\s*:\\s*[^;{]*${fn}[^;{]*;?`,
			'gi'
		);
		result = result.replace(regex, '');
	});
	
	// 清理空规则和多余的空白
	result = result
		.replace(/[^{}]+\{\s*\}/g, '') // 空规则
		.replace(/\n\s*\n/g, '\n'); // 多余空行
	
	return result;
};


const defaultMarkdown = getDefaultMarkdown(getLocaleKey());

const VIEW_TYPE_MDBEAUTIFY_PREVIEW = 'mdb-preview-view';

// 导出时需要的额外 CSS 样式（mermaid, katex 等）
const EXPORT_EXTRA_CSS = `
/* KaTeX 数学公式样式 */
#mdb .katex {
  font-size: 1.1em;
}

#mdb .katex-display {
  margin: 1em 0;
  text-align: center;
}

/* Mermaid 图表样式 */
#mdb .mermaid-wrapper {
  margin: 1em 0;
  text-align: center;
}

#mdb .mermaid-wrapper .mdb-mermaid-svg {
  display: inline-block;
  max-width: 100%;
  height: auto;
}

/* Mermaid 亮色主题样式 */
#mdb .mdb-mermaid-light {
  color-scheme: light;
}

#mdb .mdb-mermaid-light * {
  color-scheme: light;
}

#mdb .mdb-mermaid-light .node rect,
#mdb .mdb-mermaid-light .node circle,
#mdb .mdb-mermaid-light .node ellipse,
#mdb .mdb-mermaid-light .node polygon,
#mdb .mdb-mermaid-light .node path {
  fill: #fff4dd;
  stroke: #000;
}

#mdb .mdb-mermaid-light .label text,
#mdb .mdb-mermaid-light .label span,
#mdb .mdb-mermaid-light .nodeLabel,
#mdb .mdb-mermaid-light .edgeLabel {
  fill: #000;
  color: #000;
}

#mdb .mdb-mermaid-light .flowchart-link,
#mdb .mdb-mermaid-light .edgePath .path {
  stroke: #000;
}

#mdb .mdb-mermaid-light .marker {
  fill: #000;
  stroke: #000;
}

#mdb .mdb-mermaid-light .cluster rect {
  fill: #fff9ed;
  stroke: #000;
}

/* Mermaid 错误提示 */
#mdb .mermaid-error {
  color: #c62828;
  background: rgba(198, 40, 40, 0.08);
  padding: 12px;
  border-radius: 6px;
}
`;

const allThemes: Record<string, string> = {
	basic: basicTheme + '\n' + customDefaultTheme + '\n' + codeGithubTheme,
	codeGithub: basicTheme + '\n' + codeGithubTheme,
	academicPaper: basicTheme + '\n' + academicPaperTheme + '\n' + codeGithubTheme,
	auroraGlass: basicTheme + '\n' + auroraGlassTheme + '\n' + codeGithubTheme,
	bauhaus: basicTheme + '\n' + bauhausTheme + '\n' + codeGithubTheme,
	cyberpunkNeon: basicTheme + '\n' + cyberpunkNeonTheme + '\n' + codeGithubTheme,
	knowledgeBase: basicTheme + '\n' + knowledgeBaseTheme + '\n' + codeGithubTheme,
	luxuryGold: basicTheme + '\n' + luxuryGoldTheme + '\n' + codeGithubTheme,
	morandiForest: basicTheme + '\n' + morandiForestTheme + '\n' + codeGithubTheme,
	neoBrutalism: basicTheme + '\n' + neoBrutalismTheme + '\n' + codeGithubTheme,
	receipt: basicTheme + '\n' + receiptTheme + '\n' + codeGithubTheme,
	sunsetFilm: basicTheme + '\n' + sunsetFilmTheme + '\n' + codeGithubTheme,
	template: basicTheme + '\n' + templateTheme + '\n' + codeGithubTheme
};

function populateThemeDropdown(dropdown: DropdownComponent, plugin: MDBeautifyPlugin) {
	dropdown.selectEl.empty();
	Object.keys(allThemes).forEach(themeKey => {
		const label = t(themeLabelKey(themeKey)) || themeKey;
		dropdown.addOption(themeKey, label);
	});
	plugin.settings.customThemes.forEach(themeName => {
		dropdown.addOption(themeName, themeName);
	});
	const validThemes = new Set([...Object.keys(allThemes), ...plugin.settings.customThemes]);
	const theme = validThemes.has(plugin.settings.defaultTheme)
		? plugin.settings.defaultTheme
		: 'basic';
	dropdown.setValue(theme);
}

interface MermaidDesignerVariables {
	fontFamily?: string;
	fontSize?: string;
	mermaidTheme?: string;
}

interface MermaidThemeVariables {
	fontFamily?: string;
	fontSize?: string;
	darkMode?: boolean;
	[key: string]: string | number | boolean | undefined;
}

interface MermaidConfig {
	theme: string;
	darkMode?: boolean;
	themeCSS?: string;
	themeVariables: MermaidThemeVariables;
	flowchart?: {
		htmlLabels?: boolean;
		padding?: number;
		nodeSpacing?: number;
		rankSpacing?: number;
	};
	er?: {
		fontSize?: number;
	};
}

const getMermaidConfig = (
	designerVariables?: MermaidDesignerVariables,
	isDarkMode = false,
): MermaidConfig => {
	const userTheme = (designerVariables?.mermaidTheme as string) || "base";
	const mermaidTheme = isDarkMode ? "dark" : userTheme;
	
	const mermaidFontFamily =
		designerVariables?.fontFamily ||
		'-apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif';
	const fontSizeStr = designerVariables?.fontSize || "16px";
	const fontSizeInt = parseInt(fontSizeStr) || 16;
	
	const themeVariables: MermaidThemeVariables = {
		fontFamily: mermaidFontFamily,
		fontSize: fontSizeStr,
		darkMode: isDarkMode,
	};
	
	if (!isDarkMode) {
		Object.assign(themeVariables, {
			primaryColor: '#fff4dd',
			primaryTextColor: '#000',
			primaryBorderColor: '#000',
			lineColor: '#000',
			secondaryColor: '#efefef',
			tertiaryColor: '#fff',
			background: '#fff',
			mainBkg: '#fff4dd',
			secondBkg: '#efefef',
			tertiaryBkg: '#fff',
			edgeLabelBackground: '#ECEDFE',
			nodeBorder: '#000',
			clusterBkg: '#fff9ed',
			clusterBorder: '#000',
			defaultLinkColor: '#000',
			titleColor: '#000',
			edgeLabelColor: '#000',
		});
	} else {
		// 深色模式：使用浅色的节点和文字，深色的背景
		Object.assign(themeVariables, {
			primaryColor: '#2d3748',
			primaryTextColor: '#fff',
			primaryBorderColor: '#fff',
			lineColor: '#cbd5e0',
			secondaryColor: '#4a5568',
			tertiaryColor: '#1a202c',
			background: '#1a202c',
			mainBkg: '#2d3748',
			secondBkg: '#4a5568',
			tertiaryBkg: '#1a202c',
			edgeLabelBackground: '#2d3748',
			nodeBorder: '#cbd5e0',
			clusterBkg: '#4a5568',
			clusterBorder: '#cbd5e0',
			defaultLinkColor: '#cbd5e0',
			titleColor: '#fff',
			edgeLabelColor: '#fff',
			// 时间线图表专用颜色
			cScale0: '#2d3748',
			cScale1: '#4a5568',
			cScale2: '#718096',
			cScale3: '#a0aec0',
			cScale4: '#cbd5e0',
		});
	}
	
	return {
		theme: mermaidTheme,
		darkMode: isDarkMode,
		themeCSS: `
			foreignObject {
				overflow: visible;
			}
			.labelBkg {
				overflow: visible;
			}
			.labelBkg p {
				margin: 0;
				padding: 0;
				line-height: 1.2;
			}
		`,
		flowchart: {
			htmlLabels: true,
			padding: 20,
			nodeSpacing: 50,
			rankSpacing: 50,
		},
		er: {
			fontSize: fontSizeInt + 4,
		},
		themeVariables: themeVariables,
	};
};

const getThemedMermaidDiagram = (
	diagram: string,
	config: MermaidConfig,
): string => {
	if (!diagram.trim()) return "";
	if (diagram.trimStart().startsWith("%%{")) {
		return diagram;
	}
	return `%%{init: ${JSON.stringify(config)} }%%\n${diagram}`;
};

const normalizeMermaidText = (text: string): string => {
	return text.replace(/\u00A0/g, " ").replace(/\r\n?/g, "\n");
};

const isMermaidDiagramText = (text: string): boolean => {
	const normalized = normalizeMermaidText(text);
	if (!normalized.trim()) return false;
	const trimmed = normalized.trimStart();
	if (trimmed.startsWith("%%{")) return true;
	const firstLine =
		trimmed
			.split("\n")
			.find((line) => line.trim().length > 0)
			?.trim() ?? "";
	return /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart)\b/i.test(
		firstLine,
	);
};

let mermaidInitialized = false;

const ensureMermaidInitialized = () => {
	if (mermaidInitialized) return;
	try {
		mermaid.initialize({ startOnLoad: false });
		mermaidInitialized = true;
	} catch (e) {
		console.error("Mermaid initialization failed:", e);
	}
};

const getSvgDimensions = (svgElement: SVGElement) => {
	const parseSize = (value: string | null): number | null => {
		if (!value) return null;
		const trimmed = value.trim();
		if (trimmed.endsWith("%")) return null;
		const parsed = Number.parseFloat(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	};

	const width = parseSize(svgElement.getAttribute("width"));
	const height = parseSize(svgElement.getAttribute("height"));

	if (width && height) {
		return { width, height };
	}

	const viewBox = svgElement.getAttribute("viewBox");
	if (viewBox) {
		const parts = viewBox
			.trim()
			.split(/[\s,]+/)
			.map(Number);
		if (parts.length === 4 && parts.every(Number.isFinite)) {
			return { width: parts[2], height: parts[3] };
		}
	}

	return { width: 400, height: 300 };
};

const normalizeMermaidSvg = (svgMarkup: string): string => {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
	const svgEl = doc.documentElement;
	const defs = svgEl.querySelector("defs");
	const refNode = defs ? defs.nextSibling : svgEl.firstChild;
	const selectors = [
		"g.lineWrapper",
		"g.edgePaths",
		"g[class*='arrow']",
		"g[class*='node-line']",
		"g[class*='timeline-line']",
	];
	const lineGroups = Array.from(svgEl.querySelectorAll(selectors.join(", ")));
	for (const g of lineGroups) {
		if (g.parentNode === svgEl && (!refNode || refNode.parentNode === svgEl)) {
			if (refNode) {
				svgEl.insertBefore(g, refNode);
			} else {
				svgEl.insertBefore(g, svgEl.firstChild);
			}
		}
	}
	return new XMLSerializer().serializeToString(svgEl);
};

const svgMarkupToPng = async (svgMarkup: string): Promise<string> => {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
	const svgElement = doc.documentElement as unknown as SVGElement;
	const { width, height } = getSvgDimensions(svgElement);

	svgElement.setAttribute("width", String(width));
	svgElement.setAttribute("height", String(height));
	if (!svgElement.getAttribute("xmlns")) {
		svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	}

	const svgData = new XMLSerializer().serializeToString(svgElement);
	const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;

	const img = new Image();
	img.src = svgDataUrl;

	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error('Failed to load SVG image'));
	});

	const scale = 3;
	const canvas = img.ownerDocument.createElement("canvas");
	canvas.width = width * scale;
	canvas.height = height * scale;
	const ctx = canvas.getContext("2d")!;
	ctx.scale(scale, scale);
	ctx.drawImage(img, 0, 0);

	return canvas.toDataURL("image/png");
};

const renderMermaid = async (
	container: HTMLElement,
	isDarkMode: boolean,
	renderIdBase: string,
	checkToken?: () => boolean
): Promise<void> => {
	const mermaidNodes = Array.from(
		container.querySelectorAll<HTMLElement>(
			".mermaid, pre.mermaid, pre.language-mermaid, pre.lang-mermaid, pre.custom > code.hljs, pre > code.language-mermaid, pre > code.lang-mermaid, pre > code.mermaid, code.language-mermaid, code.lang-mermaid, code.mermaid",
		),
	);
	if (mermaidNodes.length === 0) return;

	ensureMermaidInitialized();
	const initConfig = getMermaidConfig(undefined, isDarkMode);

	const targets: { container: HTMLElement; diagram: string }[] = [];
	const visited = new Set<HTMLElement>();
	mermaidNodes.forEach((node) => {
		const isCode = node.tagName === "CODE";
		const containerEl = isCode ? node.parentElement : node;
		if (!(containerEl instanceof HTMLElement) || visited.has(containerEl)) return;
		visited.add(containerEl);
		const diagramSource = isCode ? node.textContent : containerEl.dataset.mermaidRaw || node.textContent;
		const diagram = normalizeMermaidText(diagramSource ?? "");
		const shouldRender =
			containerEl.classList.contains("mermaid") ||
			node.classList.contains("language-mermaid") ||
			node.classList.contains("lang-mermaid") ||
			node.classList.contains("mermaid") ||
			isMermaidDiagramText(diagram);

		if (!diagram.trim() || !shouldRender) return;
		containerEl.classList.add("mermaid");
		if (!containerEl.dataset.mermaidRaw) {
			containerEl.dataset.mermaidRaw = diagram;
		}
		targets.push({ container: containerEl, diagram });
	});

	for (const [index, target] of targets.entries()) {
		const block = target.container;
		const diagram = target.diagram;
		if (!diagram.trim()) continue;
		const themedDiagram = getThemedMermaidDiagram(diagram, initConfig);
		try {
			const { svg } = await mermaid.render(
				`${renderIdBase}-${index}`,
				themedDiagram,
			);
			
			if (checkToken && !checkToken()) {
				return;
			}

			const normalizedSvg = normalizeMermaidSvg(svg);
			
			const wrapper = container.doc.createDiv({ cls: 'mermaid-wrapper' });
			if (!isDarkMode) {
				wrapper.setAttribute('data-ui-theme', 'light');
			}
			appendSvgMarkup(wrapper, normalizedSvg);
			
			const svgEl = wrapper.querySelector('svg');
			if (svgEl) {
				svgEl.classList.add('mdb-mermaid-svg');
				if (!isDarkMode) {
					svgEl.classList.add('mdb-mermaid-light');
				}
			}
			
			// 替换整个容器，而不是仅仅替换 innerHTML
			// 避免 pre 标签的默认样式干扰 Mermaid 渲染
			if (block.parentNode) {
				block.parentNode.replaceChild(wrapper, block);
			} else {
				block.empty();
				block.appendChild(wrapper);
			}

		} catch (error: unknown) {
			const errorEl = block.doc.createDiv({ cls: 'mermaid-error' });
			const message = error instanceof Error ? error.message : String(error);
			errorEl.setText(`${t('mermaid_render_failed')}${message}`);
			block.empty();
			block.appendChild(errorEl);
		}
	}
};

const renderMermaidBlocksForCopy = async (
	container: HTMLElement,
	onProgress?: (current: number, total: number) => void
): Promise<void> => {
	const mermaidNodes = Array.from(
		container.querySelectorAll<HTMLElement>(
			".mermaid, pre.language-mermaid, pre.lang-mermaid, pre.custom > code.hljs, pre > code.language-mermaid, pre > code.lang-mermaid, pre > code.mermaid, code.language-mermaid, code.lang-mermaid, code.mermaid",
		),
	);
	if (mermaidNodes.length === 0) return;

	ensureMermaidInitialized();
	const designerVariables: MermaidDesignerVariables = { mermaidTheme: "base" };
	const initConfig = getMermaidConfig(designerVariables, false);
	const renderIdBase = `mdb-mermaid-${Date.now()}`;

	const targets: { container: HTMLElement; diagram: string }[] = [];
	const visited = new Set<HTMLElement>();
	mermaidNodes.forEach((node) => {
		const isCode = node.tagName === "CODE";
		const containerEl = isCode ? node.parentElement : node;
		if (!(containerEl instanceof HTMLElement) || visited.has(containerEl)) return;
		visited.add(containerEl);
		const diagramSource = isCode ? node.textContent : containerEl.dataset.mermaidRaw || node.textContent;
		const diagram = normalizeMermaidText(diagramSource ?? "");
		const shouldRender =
			containerEl.classList.contains("mermaid") ||
			node.classList.contains("language-mermaid") ||
			node.classList.contains("lang-mermaid") ||
			node.classList.contains("mermaid") ||
			isMermaidDiagramText(diagram);
		if (!diagram.trim() || !shouldRender) return;
		containerEl.classList.add("mermaid");
		containerEl.dataset.mermaidRaw = diagram;
		targets.push({ container: containerEl, diagram });
	});

	const total = targets.length;
	
	for (const [index, target] of targets.entries()) {
		const diagram = target.diagram;
		if (!diagram.trim()) continue;

		try {
			onProgress?.(index + 1, total);
			
			// 添加超时机制防止卡住
			const renderTimeout = 30000; // 30秒超时
			const renderPromise = (async () => {
				const themedDiagram = getThemedMermaidDiagram(diagram, initConfig);
				const { svg } = await mermaid.render(
					`${renderIdBase}-${index}`,
					themedDiagram,
				);
				const normalizedSvg = normalizeMermaidSvg(svg);
				const pngDataUrl = await svgMarkupToPng(normalizedSvg);
				return pngDataUrl;
			})();

			const timeoutPromise = new Promise<string>((_, reject) => 
				window.setTimeout(() => reject(new Error('Mermaid render timeout')), renderTimeout)
			);

			const pngDataUrl = await Promise.race([renderPromise, timeoutPromise]);

			const figure = target.container.doc.createDiv({ cls: 'mdb-mermaid-figure' });
			figure.setAttribute('data-tool', 'MD Beautify');

			const img = figure.doc.createEl('img', { cls: 'mdb-mermaid-copy-img' });
			img.src = pngDataUrl;

			figure.appendChild(img);
			target.container.parentNode?.replaceChild(figure, target.container);
		} catch (error) {
			console.error(`[Obsidian MD Beautify] Mermaid render failed (${index + 1}/${total}):`, error);
			// 渲染失败时，保留原始代码块
			const errorDiv = target.container.doc.createDiv({ cls: 'mermaid-error' });
			errorDiv.setText(`图表渲染失败: ${error instanceof Error ? error.message : String(error)}`);
			target.container.parentNode?.insertBefore(errorDiv, target.container);
		}
	}
};

type ImageHostKey = 'official' | 'qiniu' | 'aliyun' | 'tencent' | 's3';
type ImageHostConfig = Record<string, string>;

const IMAGE_HOST_KEYS: ImageHostKey[] = ['official', 'qiniu', 'aliyun', 'tencent', 's3'];

function isImageHostKey(value: string): value is ImageHostKey {
	return (IMAGE_HOST_KEYS as string[]).includes(value);
}

interface MDBeautifySettings {
	defaultTheme: string;
	copyAsHtml: boolean;
	customThemeStyles: Record<string, string>;
	activeImageHost: ImageHostKey;
	officialUploadUrl: string;
	imageHostConfigs: Record<ImageHostKey, ImageHostConfig>;
	autoUploadImages: boolean;
	customThemes: string[];
	controlsVisible: boolean;
	themeMode: 'auto' | 'light' | 'dark';
	fixedWidthPreview: boolean;
	previewWidth: number;
	previewDevice: string;
	customPreviewWidth: string;
	customPreviewHeight: string;
	previewRotated: boolean;
	previewAutoScale: boolean;
	previewManualScale: number;
	syncScroll: boolean;
}

const DEFAULT_SETTINGS: MDBeautifySettings = {
	defaultTheme: 'basic',
	copyAsHtml: true,
	customThemeStyles: {},
	activeImageHost: 'official',
	officialUploadUrl: 'https://api.wemd.app/upload',
	imageHostConfigs: {
		official: {},
		qiniu: {},
		aliyun: {},
		tencent: {},
		s3: {}
	},
	autoUploadImages: false,
	customThemes: [],
	controlsVisible: false,
	themeMode: 'auto',
	fixedWidthPreview: true,
	previewWidth: 430,
	previewDevice: 'custom',
	customPreviewWidth: '100%',
	customPreviewHeight: '100%',
	previewRotated: false,
	previewAutoScale: true,
	previewManualScale: 100,
	syncScroll: true
}

export default class MDBeautifyPlugin extends Plugin {
	settings: MDBeautifySettings = DEFAULT_SETTINGS;
	parser!: MarkdownIt;

	async onload() {
		await this.loadSettings();
		
		this.parser = createMarkdownParser();

		this.registerView(
			VIEW_TYPE_MDBEAUTIFY_PREVIEW,
			(leaf) => new MDBeautifyPreviewView(leaf, this)
		);

		// Add ribbon icons
		const ribbonIconEl = this.addRibbonIcon('eye', t('preview_ribbon_tooltip'), (_evt: MouseEvent) => {
			void this.activateView();
		});
		ribbonIconEl.addClass('mdb-ribbon-class');

		// Add commands
		this.addCommand({
			id: 'copy-beautified',
			name: t('copy_command_name'),
			callback: () => {
				void this.copyBeautified();
			}
		});

		this.addCommand({
			id: 'preview-beautified',
			name: t('preview_command_name'),
			callback: () => {
				void this.activateView();
			}
		});

		this.addCommand({
			id: 'upload-all-images',
			name: t('command_upload_all_images'),
			callback: () => {
				void this.uploadAllImagesInActiveView();
			}
		});

		this.addCommand({
			id: 'export-html',
			name: t('export_html_command'),
			callback: () => {
				void this.exportToHtml();
			}
		});

		this.addCommand({
			id: 'export-pdf',
			name: t('export_pdf_command'),
			callback: () => void this.exportToPdf(),
		});

		// Add event listener for paste and drop events
		this.registerEvent(
			this.app.workspace.on('editor-paste', (evt, editor, _view) => {
				if (evt.defaultPrevented) return;
				if (this.settings.autoUploadImages) {
					void this.onPaste(evt, editor);
					evt.preventDefault();
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-drop', (evt, editor, _view) => {
				if (evt.defaultPrevented) return;
				if (this.settings.autoUploadImages) {
					void this.onPaste(evt, editor);
					evt.preventDefault();
				}
			})
		);

		// Add context menu item for manual image upload
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, _view) => {
				const line = editor.getLine(editor.getCursor().line);
				// Support both Markdown links and WikiLinks
				const mdRegex = /!\[(.*?)\]\((.*?)\)/g;
				const wikiRegex = /!\[\[(.*?)(?:\|.*?)?\]\]/g;
				
				let match: RegExpExecArray | null = null;
				let fullMatch = "";
				let path = "";

				// Check for Markdown links
				let m;
				while ((m = mdRegex.exec(line)) !== null) {
					if (editor.getCursor().ch >= m.index && editor.getCursor().ch <= m.index + m[0].length) {
						match = m;
						fullMatch = m[0];
						path = m[2];
						break;
					}
				}

				// Check for WikiLinks if no Markdown link found
				if (!match) {
					while ((m = wikiRegex.exec(line)) !== null) {
						if (editor.getCursor().ch >= m.index && editor.getCursor().ch <= m.index + m[0].length) {
							match = m;
							fullMatch = m[0];
							path = m[1];
							break;
						}
					}
				}

				if (match && path) {
					if (!path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('data:')) {
						menu.addItem((item) => {
							item.setTitle(t('btn_upload'))
								.setIcon('upload-cloud')
								.onClick(() => {
									void this.uploadImageFromLink(editor, fullMatch, path);
								});
						});
					}
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new MDBeautifySettingTab(this.app, this));

		// Monitor theme mode changes (Light/Dark)
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
					this.updateAllPreviews(true);
				}
			});
		});
		
		observer.observe(this.app.workspace.containerEl.doc.body, {
			attributes: true,
			attributeFilter: ['class']
		});
		
		// Clean up observer when plugin is disabled
		this.register(() => observer.disconnect());
	}

	async onPaste(evt: ClipboardEvent | DragEvent, editor: Editor) {
		if (evt instanceof ClipboardEvent && evt.clipboardData) {
			const text = evt.clipboardData.getData('text/plain');
			const mermaidTextBlock = this.extractMermaidFromText(text);
			if (mermaidTextBlock) {
				evt.preventDefault();
				editor.replaceSelection(mermaidTextBlock);
				return;
			}

			const html = evt.clipboardData.getData('text/html');
			const mermaidBlock = this.extractMermaidFromHtml(html);
			if (mermaidBlock) {
				evt.preventDefault();
				editor.replaceSelection(mermaidBlock);
				return;
			}
		}

		const items = (evt instanceof ClipboardEvent) 
			? evt.clipboardData?.items 
			: evt.dataTransfer?.items;
			
		if (!items) return;

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (file) {
					evt.preventDefault();
					
					const notice = new Notice(t('msg_uploading_image'), 0);
					try {
						const url = await this.uploadImage(file);
						editor.replaceSelection(`![image](${url})`);
						notice.hide();
						new Notice(t('msg_upload_success'));
					} catch (err: unknown) {
						notice.hide();
						const message = err instanceof Error ? err.message : String(err);
						new Notice(t('msg_upload_failed') + message);
					}
				}
			}
		}
	}

	private extractMermaidFromHtml(html: string): string | null {
		if (!html) return null;
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const preMermaid = doc.querySelector('pre.mermaid');
		const codeMermaid = doc.querySelector('pre > code.language-mermaid, pre > code.lang-mermaid');
		const target = preMermaid || codeMermaid;
		if (!target) return null;
		const diagram = target.textContent ?? '';
		if (!diagram.trim()) return null;
		return `\`\`\`mermaid\n${diagram.trim()}\n\`\`\``;
	}

	private extractMermaidFromText(text: string): string | null {
		if (!text) return null;
		const match = text.match(/```mermaid\s*([\s\S]*?)```/i);
		if (!match) return null;
		const diagram = match[1] ?? '';
		if (!diagram.trim()) return null;
		return `\`\`\`mermaid\n${diagram.trim()}\n\`\`\``;
	}

	async uploadImageFromLink(editor: Editor, fullLink: string, path: string) {
		const notice = new Notice(t('msg_uploading_image'), 0);
		try {
			// Resolve the file from Obsidian vault
			const decodedPath = decodeURIComponent(path);
			const file = this.app.metadataCache.getFirstLinkpathDest(decodedPath, "");
			if (!(file instanceof TFile)) {
				throw new Error("File not found: " + decodedPath);
			}

			// Read file as array buffer
			const arrayBuffer = await this.app.vault.readBinary(file);
			const blob = new Blob([arrayBuffer], { type: 'image/' + file.extension });
			const fileObj = new File([blob], file.name, { type: 'image/' + file.extension });

			const url = await this.uploadImage(fileObj);
			
			// Replace the link in the editor
			const cursor = editor.getCursor();
			const lineText = editor.getLine(cursor.line);
			const newLineText = lineText.replace(fullLink, `![image](${url})`);
			editor.setLine(cursor.line, newLineText);
			
			notice.hide();
			new Notice(t('msg_upload_success'));
		} catch (err: unknown) {
			notice.hide();
			const message = err instanceof Error ? err.message : String(err);
			new Notice(t('msg_upload_failed') + message);
		}
	}

	async uploadImage(file: File | Blob): Promise<string> {
		const host = this.settings.activeImageHost;
		
		if (host === 'official') {
			const arrayBuffer = await file.arrayBuffer();
			const fileName = (file as File).name || 'image.png';
			const contentType = file.type || 'image/png';
			
			// Construct multipart/form-data manually for requestUrl
			const boundary = '----ObsidianBoundary' + Math.random().toString(36).substring(2);
			const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`;
			const footer = `\r\n--${boundary}--`;
			
			const headerUint8 = new TextEncoder().encode(header);
			const footerUint8 = new TextEncoder().encode(footer);
			const bodyUint8 = new Uint8Array(arrayBuffer);
			
			const combinedBody = new Uint8Array(headerUint8.length + bodyUint8.length + footerUint8.length);
			combinedBody.set(headerUint8);
			combinedBody.set(bodyUint8, headerUint8.length);
			combinedBody.set(footerUint8, headerUint8.length + bodyUint8.length);
			
			const response = await requestUrl({
				url: this.settings.officialUploadUrl,
				method: 'POST',
				headers: {
					'Content-Type': `multipart/form-data; boundary=${boundary}`
				},
				body: combinedBody.buffer,
			});
			
			if (response.status !== 200) {
				throw new Error(`Upload failed with status ${response.status}`);
			}
			
			const payload: unknown = response.json;
			if (
				typeof payload !== 'object' ||
				payload === null ||
				!('url' in payload) ||
				typeof payload.url !== 'string'
			) {
				throw new Error('Upload response missing url');
			}
			return payload.url;
		}
		
		throw new Error('Unsupported image host: ' + host);
	}

	async uploadAllImagesInActiveView() {
		const view = this.getTargetMarkdownView();
		
		if (!view || !view.file) {
			new Notice(t('no_active_view'));
			return;
		}

		const content = view.editor.getValue();
		// Match both standard markdown images and wikilinks
		// 1. Standard: ![alt](path)
		// 2. Wikilinks: ![[path]] or ![[path|alt]]
		const mdRegex = /!\[(.*?)\]\((?!https?:\/\/)(.*?)\)/g;
		const wikiRegex = /!\[\[(?!https?:\/\/)(.*?)\]\]/g;
		
		const matches: { full: string, alt: string, path: string, index: number }[] = [];
		
		let match;
		while ((match = mdRegex.exec(content)) !== null) {
			matches.push({ full: match[0], alt: match[1], path: match[2], index: match.index });
		}
		while ((match = wikiRegex.exec(content)) !== null) {
			const contentInner = match[1];
			const [path, ...altParts] = contentInner.split('|');
			matches.push({ full: match[0], alt: altParts.join('|'), path: path, index: match.index });
		}

		if (matches.length === 0) {
			new Notice(t('msg_no_local_images'));
			return;
		}

		// Sort matches by index in descending order to replace from bottom up
		matches.sort((a, b) => b.index - a.index);

		new Notice(t('msg_uploading_all', { count: String(matches.length) }));
		
		let newContent = content;
		let successCount = 0;
		let failCount = 0;

		for (const m of matches) {
			try {
				const decodedPath = decodeURIComponent(m.path);
				const file = this.app.metadataCache.getFirstLinkpathDest(decodedPath, view.file.path);
				
				if (file instanceof TFile) {
					const binary = await this.app.vault.readBinary(file);
					const blob = new Blob([binary], { type: 'image/' + file.extension });
					const url = await this.uploadImage(blob);
					
					const replacement = `![${m.alt || 'image'}](${url})`;
					newContent = newContent.substring(0, m.index) + replacement + newContent.substring(m.index + m.full.length);
					successCount++;
				} else {
					console.warn('File not found for path:', m.path, 'decoded:', decodedPath);
					failCount++;
				}
			} catch (err) {
				console.error('Failed to upload', m.path, err);
				failCount++;
			}
		}

		view.editor.setValue(newContent);
		if (failCount > 0) {
			new Notice(t('msg_upload_all_done', { count: String(successCount) }) + ` (${failCount} failed)`);
		} else {
			new Notice(t('msg_upload_all_done', { count: String(successCount) }));
		}
	}

	async activateView() {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_MDBEAUTIFY_PREVIEW);

		let leaf: WorkspaceLeaf | null;
		if (leaves.length > 0) {
			leaf = leaves[0] ?? null;
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_MDBEAUTIFY_PREVIEW, active: true });
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}

	getTargetMarkdownView(): MarkdownView | null {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			return activeView;
		}

		// 预览面板获得焦点时，使用预览正在展示的文件
		const previewLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MDBEAUTIFY_PREVIEW);
		for (const leaf of previewLeaves) {
			if (leaf.view instanceof MDBeautifyPreviewView) {
				const linkedView = leaf.view.getLinkedMarkdownView();
				if (linkedView) {
					return linkedView;
				}
			}
		}

		const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
		if (markdownLeaves.length > 0) {
			const view = markdownLeaves[0].view;
			return view instanceof MarkdownView ? view : null;
		}

		return null;
	}

	async exportToHtml() {
		const loadingNotice = new Notice(t('exporting'), 0);
		try {
			const activeView = this.getTargetMarkdownView();
			
			if (!activeView || !activeView.file) {
				loadingNotice.hide();
				new Notice(t('no_active_view'));
				return;
			}

			let content = activeView.editor.getValue();
			const title = activeView.file.basename;
			
			content = content.replace(/^---[\s\S]*?---/, '').trim();
			// 导出时强制使用浅色模式
			const isDarkMode = false;
			let themeCss = this.getThemeCss(undefined, isDarkMode, false);
			
			themeCss = sanitizeModernColorFunctions(themeCss);
			
			const html = this.parser.render(content);
			
		const tempContainer = activeView.containerEl.doc.body.createDiv({ cls: 'mdb-offscreen' });
		setElementHtml(tempContainer, html);
		
		// 渲染 Mermaid 图表
		const mermaidCount = tempContainer.querySelectorAll('.mermaid, pre.language-mermaid, code.language-mermaid').length;
		if (mermaidCount > 0) {
			loadingNotice.setMessage(`${t('exporting')} - 渲染图表 0/${mermaidCount}...`);
			await renderMermaidBlocksForCopy(tempContainer, (current, total) => {
				loadingNotice.setMessage(`${t('exporting')} - 渲染图表 ${current}/${total}...`);
			});
		} else {
			await renderMermaidBlocksForCopy(tempContainer);
		}
		
	const renderedHtml = tempContainer.innerHTML;
	tempContainer.remove();
	
	loadingNotice.setMessage(`${t('exporting')} - 生成 HTML...`);
	
	// 注意：不要在整个 HTML 上运行 sanitizeModernColorFunctions（太慢）
	// CSS 已经在之前清理过了
	let fullHtml = generateExportHtml(renderedHtml, {
		title: title,
		themeCss: themeCss,
		extraCss: EXPORT_EXTRA_CSS
	});
	
	loadingNotice.setMessage(`${t('exporting')} - 保存文件...`);
		const blob = new Blob([fullHtml], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		const a = activeView.containerEl.doc.createEl('a');
		a.href = url;
		a.download = `${title}.html`;
		a.click();
		URL.revokeObjectURL(url);
		
		loadingNotice.hide();
		new Notice(t('export_success'));
		} catch (err: unknown) {
			loadingNotice.hide();
			const message = err instanceof Error ? err.message : String(err);
			new Notice(t('export_failed') + message);
		}
	}

	async exportToPdf() {
		const loadingNotice = new Notice(t('exporting'), 0);
		try {
			const activeView = this.getTargetMarkdownView();
			
			if (!activeView || !activeView.file) {
				loadingNotice.hide();
				new Notice(t('no_active_view'));
				return;
			}

			let content = activeView.editor.getValue();
			const title = activeView.file.basename;
			
			content = content.replace(/^---[\s\S]*?---/, '').trim();
			const isDarkMode = false;
			let themeCss = this.getThemeCss(undefined, isDarkMode);
			
			themeCss = sanitizeModernColorFunctions(themeCss);

			const html = this.parser.render(content);
			
		const tempContainer = activeView.containerEl.doc.body.createDiv({ cls: 'mdb-offscreen' });
		setElementHtml(tempContainer, html);
		
		const mermaidCount = tempContainer.querySelectorAll('.mermaid, pre.language-mermaid, code.language-mermaid').length;
		if (mermaidCount > 0) {
			loadingNotice.setMessage(`${t('exporting')} - 渲染图表 0/${mermaidCount}...`);
			await renderMermaidBlocksForCopy(tempContainer, (current, total) => {
				loadingNotice.setMessage(`${t('exporting')} - 渲染图表 ${current}/${total}...`);
			});
		} else {
			await renderMermaidBlocksForCopy(tempContainer);
		}
		
		const renderedHtml = tempContainer.innerHTML;
		tempContainer.remove();
		
		loadingNotice.setMessage(`${t('exporting')} - 生成 HTML...`);
		
		let fullHtml = generateExportHtml(renderedHtml, {
			title: title,
			themeCss: themeCss,
			extraCss: EXPORT_EXTRA_CSS
		});

		loadingNotice.hide();
		exportToPdfNative(fullHtml);
		new Notice(t('msg_vector_print_instruction'));
		} catch (err: unknown) {
			loadingNotice.hide();
			const message = err instanceof Error ? err.message : String(err);
			new Notice(t('export_failed') + message);
		}
	}

	getThemeCss(themeId?: string, isDark?: boolean, wrapInMedia = false) {
		const id = themeId || this.settings.defaultTheme;
		let css = this.settings.customThemeStyles[id] || allThemes[id] || allThemes['basic'];
		
		const DARK_MARK = "/* mdb-wechat-dark-converted */";

		if (isDark) {
			if (css.includes(DARK_MARK)) {
				if (!wrapInMedia) {
					// 预览模式下提取转换后的暗色样式，减少冗余
					const parts = css.split(DARK_MARK);
					if (parts.length > 1) {
						return `${DARK_MARK}\n${parts[parts.length - 1].trim()}`;
					}
				}
				return css;
			}
			
			let darkCss = convertCssToWeChatDarkMode(css);
			// convertCssToWeChatDarkMode 已经包含了 DARK_MARK
			if (wrapInMedia) {
				darkCss = `@media (prefers-color-scheme: dark) {\n${darkCss}\n}`;
				css = `${css}\n${darkCss}`;
			} else {
				// 预览模式下只保留转换后的暗色样式，减少冗余
				css = darkCss;
			}
		} else {
			// 浅色模式下，如果包含转换标记，只提取浅色部分
			if (css.includes(DARK_MARK)) {
				return css.split(DARK_MARK)[0].trim();
			}
		}
		
		return css;
	}






	async copyBeautified() {
		const loadingNotice = new Notice(t('copying'), 0);
		try {
			let content = '';
			let sourceViewName = '';

			const activeMarkdownView = this.getTargetMarkdownView();
			
			if (activeMarkdownView) {
				content = activeMarkdownView.editor.getValue();
				sourceViewName = activeMarkdownView.getDisplayText();
			}

			if (!content) {
				loadingNotice.hide();
				new Notice(t('no_active_view'));
				return;
			}

			const rawMarkdown = content;
			content = content.replace(/^---[\s\S]*?---/, '').trim();
			const themeCss = this.getThemeCss(undefined, true, true);
			const scopedCss = scopeCss(themeCss);
			const sanitizedCss = `${scopedCss}\n#mdb pre.custom::before{display:none;}`;
			
			const parser = this.parser;
			const html = parser.render(content);
			const styledHtml = processHtml(html, sanitizedCss, true, true);
			
		const finalHtml = this.convertCheckboxesToEmoji(styledHtml);
		const copyContainer = this.app.workspace.containerEl.doc.body.createDiv({ cls: 'mdb-copy-temp' });
		setElementHtml(copyContainer, finalHtml);

		// 渲染 Mermaid 图表
		const mermaidCount = copyContainer.querySelectorAll('.mermaid, pre.language-mermaid, code.language-mermaid').length;
		if (mermaidCount > 0) {
			loadingNotice.setMessage(`${t('copying')} - 渲染图表 0/${mermaidCount}...`);
			await renderMermaidBlocksForCopy(copyContainer, (current, total) => {
				loadingNotice.setMessage(`${t('copying')} - 渲染图表 ${current}/${total}...`);
			});
			loadingNotice.setMessage(t('copying'));
		} else {
			await renderMermaidBlocksForCopy(copyContainer);
		}
		
		const htmlContent = `<meta charset="utf-8">${copyContainer.innerHTML}`;
		const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
			const textBlob = new Blob([rawMarkdown], { type: 'text/plain' });
			
			const data = [new ClipboardItem({ 
				'text/html': htmlBlob, 
				'text/plain': textBlob 
			})];
			
			await navigator.clipboard.write(data);
			copyContainer.remove();
			loadingNotice.hide();
			new Notice(t('copy_success') + (sourceViewName ? `: ${sourceViewName}` : ''));
		} catch (err: unknown) {
			loadingNotice.hide();
			console.error('MD Beautify copy error:', err);
			const message = err instanceof Error ? err.message : String(err);
			new Notice(t('copy_failed') + message);
			this.app.workspace.containerEl.doc.body.find('.mdb-copy-temp')?.remove();
		}
	}

	/**
	 * 将 HTML 中的 checkbox 转换为 emoji
	 * 微信公众号会过滤 <input> 标签，需要转为 emoji 替代
	 */
	private convertCheckboxesToEmoji(html: string): string {
		// 先替换选中的 checkbox（包含 checked 属性）
		let result = html.replace(/<input[^>]*checked[^>]*>/gi, "✅&nbsp;");
		// 再替换未选中的 checkbox
		result = result.replace(
			/<input[^>]*type=["']checkbox["'][^>]*>/gi,
			"⬜&nbsp;",
		);
		return result;
	}

	showPreviewModal() {
		void this.activateView();
	}

	async loadSettings() {
		const data: unknown = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, typeof data === 'object' && data !== null ? data as Partial<MDBeautifySettings> : {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updateAllPreviews(force = false) {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MDBEAUTIFY_PREVIEW);
		leaves.forEach(leaf => {
			if (leaf.view instanceof MDBeautifyPreviewView) {
				leaf.view.updatePreviewWidth();
				leaf.view.updatePreviewScale();
				leaf.view.schedulePreviewUpdate(force);
			}
		});
	}

	isDarkMode() {
		return this.settings.themeMode === 'auto' 
			? this.app.workspace.containerEl.doc.body.classList.contains('theme-dark')
			: this.settings.themeMode === 'dark';
	}
}

class MDBeautifyPreviewView extends ItemView {
	plugin: MDBeautifyPlugin;
	previewEl!: HTMLElement;
	scrollContainer!: HTMLElement;
	private lastScrollTime = 0;
	private lastScrollSource: 'editor' | 'preview' | null = null;
	private lastActiveView: MarkdownView | null = null;
	private isRestoringScroll = false;
	private mermaidRenderId = 0;
	private previewUpdateTimer: number | null = null;
	private pendingForceUpdate = false;
	constructor(leaf: WorkspaceLeaf, plugin: MDBeautifyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_MDBEAUTIFY_PREVIEW;
	}

	getDisplayText() {
		return t('view_display_text');
	}

	getIcon() {
		return "eye";
	}

	getLinkedMarkdownView(): MarkdownView | null {
		if (
			this.lastActiveView?.file &&
			this.app.vault.getAbstractFileByPath(this.lastActiveView.file.path)
		) {
			return this.lastActiveView;
		}
		return null;
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add('mdb-preview-view');

		const controlsEl = container.createDiv({ cls: 'mdb-view-controls' });

		const actionsRow = controlsEl.createDiv({ cls: 'mdb-controls-row' });

		const copyBtn = actionsRow.createEl('button', { text: t('btn_copy'), cls: 'mod-cta' });
		copyBtn.onclick = () => void this.plugin.copyBeautified();

		const uploadBtn = actionsRow.createEl('button', { cls: 'clickable-icon' });
		setIcon(uploadBtn, 'upload-cloud');
		uploadBtn.setAttribute('aria-label', t('command_upload_all_images'));
		uploadBtn.onclick = () => void this.plugin.uploadAllImagesInActiveView();

		const exportBtn = actionsRow.createEl('button', { cls: 'clickable-icon' });
		setIcon(exportBtn, 'download');
		exportBtn.setAttribute('aria-label', t('btn_export'));
		exportBtn.onclick = (e) => {
			const menu = new Menu();
			
			// HTML 导出
			menu.addItem((item) => {
				item.setTitle(t('export_html_command'))
					.setIcon('code')
					.onClick(() => void this.plugin.exportToHtml());
			});
			
			// PDF 导出
			menu.addItem((item) => {
				item.setTitle(t('export_pdf_command'))
					.setIcon('file-text')
					.onClick(() => void this.plugin.exportToPdf());
			});
			
			menu.showAtMouseEvent(e);
		};

		const syncScrollBtn = actionsRow.createEl('button', { cls: 'clickable-icon mdb-sync-scroll-btn' });
		setIcon(syncScrollBtn, 'refresh-cw');
		
		const updateSyncScrollIcon = () => {
			syncScrollBtn.setAttribute('aria-label', this.plugin.settings.syncScroll ? t('btn_sync_scroll_on') : t('btn_sync_scroll_off'));

			if (this.plugin.settings.syncScroll) {
				syncScrollBtn.classList.add('active');
			} else {
				syncScrollBtn.classList.remove('active');
			}
		};
		updateSyncScrollIcon();

		syncScrollBtn.onclick = async () => {
			this.plugin.settings.syncScroll = !this.plugin.settings.syncScroll;
			await this.plugin.saveSettings();
			updateSyncScrollIcon();
		};

		const toggleBtn = actionsRow.createEl('button', { cls: 'clickable-icon' });
		const updateToggleIcon = () => {
			setIcon(toggleBtn, this.plugin.settings.controlsVisible ? 'chevron-up' : 'chevron-down');
			toggleBtn.setAttribute('aria-label', t('btn_toggle_controls'));
		};
		updateToggleIcon();

		toggleBtn.onclick = async () => {
			this.plugin.settings.controlsVisible = !this.plugin.settings.controlsVisible;
			await this.plugin.saveSettings();
			selectorsRow.classList.toggle('mdb-hidden', !this.plugin.settings.controlsVisible);
			updateToggleIcon();
		};

		const selectorsRow = controlsEl.createDiv({ cls: 'mdb-controls-selectors-row' });
		if (!this.plugin.settings.controlsVisible) {
			selectorsRow.classList.add('mdb-hidden');
		}

		const themeContainer = selectorsRow.createDiv({ cls: 'mdb-control-container' });
		themeContainer.createSpan({ text: t('label_theme') + ':' });
		
		const themeSetting = new Setting(themeContainer)
			.addDropdown(dropdown => {
				populateThemeDropdown(dropdown, this.plugin);
				dropdown.selectEl.addEventListener('mousedown', () => {
					populateThemeDropdown(dropdown, this.plugin);
				});
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultTheme = value;
					await this.plugin.saveSettings();
					this.plugin.updateAllPreviews(true);
				});
			});
	themeSetting.infoEl.remove();

		const hostContainer = selectorsRow.createDiv({ cls: 'mdb-control-container' });
		hostContainer.createSpan({ text: t('label_host') + ':' });

		const hostSetting = new Setting(hostContainer)
			.addDropdown(dropdown => {
				IMAGE_HOST_KEYS.forEach(host => {
					const label = t(hostLabelKey(host)) || host;
					dropdown.addOption(host, label);
				});
				dropdown.setValue(this.plugin.settings.activeImageHost)
					.onChange(async (value) => {
						if (!isImageHostKey(value)) return;
						this.plugin.settings.activeImageHost = value;
						await this.plugin.saveSettings();
					});
			});
		hostSetting.infoEl.remove();

		const modeContainer = selectorsRow.createDiv({ cls: 'mdb-control-container' });
		modeContainer.createSpan({ text: t('label_appearance') + ':' });

		const modeSetting = new Setting(modeContainer)
			.addDropdown(dropdown => {
				dropdown
					.addOption('auto', t('theme_mode_auto'))
					.addOption('light', t('theme_mode_light'))
					.addOption('dark', t('theme_mode_dark'))
					.setValue(this.plugin.settings.themeMode)
					.onChange(async (value) => {
						this.plugin.settings.themeMode = value as 'auto' | 'light' | 'dark';
						await this.plugin.saveSettings();
						this.plugin.updateAllPreviews(true);
					});
			});
		modeSetting.infoEl.remove();

		const deviceRow = controlsEl.createDiv({ cls: 'mdb-controls-device-row' });
		if (!this.plugin.settings.controlsVisible) {
			deviceRow.classList.add('mdb-hidden');
		}

		const deviceContainer = deviceRow.createDiv({ cls: 'mdb-control-container' });
		deviceContainer.createSpan({ text: t('label_device') });

		let rotateBtn: HTMLElement;
		
		const deviceSetting = new Setting(deviceContainer)
			.addDropdown(dropdown => {
				dropdown
					.addOption('custom', t('device_custom'))
					.addOption('iphone16pro', t('device_iphone16pro'))
					.addOption('iphone16', t('device_iphone16'))
					.addOption('ipad', t('device_ipad'))
					.addOption('desktop', t('device_desktop'))
					.setValue(this.plugin.settings.previewDevice)
					.onChange(async (value) => {
						this.plugin.settings.previewDevice = value;
						if (value === 'custom') {
							this.plugin.settings.previewRotated = false;
							if (rotateBtn) {
								rotateBtn.classList.add('mdb-hidden');
							}
						} else {
							if (rotateBtn) {
								rotateBtn.classList.toggle('mdb-hidden', !this.plugin.settings.controlsVisible);
							}
						}
						await this.plugin.saveSettings();
						this.updatePreviewWidth();
						this.updatePreviewScale();
					});
			});
		deviceSetting.infoEl.remove();

		// Rotate Button (only for non-custom devices)
		rotateBtn = deviceRow.createEl('button', { cls: 'clickable-icon mdb-rotate-btn' });
		setIcon(rotateBtn, 'rotate-cw');
		rotateBtn.setAttribute('aria-label', t('btn_rotate_device'));
		rotateBtn.setAttribute('title', t('btn_rotate_device'));
		if (this.plugin.settings.previewDevice === 'custom') {
			rotateBtn.classList.add('mdb-hidden');
		}
		
		const updateRotateBtn = () => {
			if (this.plugin.settings.previewRotated) {
				rotateBtn.classList.add('active');
			} else {
				rotateBtn.classList.remove('active');
			}
		};
		
		updateRotateBtn();
		
		rotateBtn.onclick = async () => {
			this.plugin.settings.previewRotated = !this.plugin.settings.previewRotated;
			await this.plugin.saveSettings();
			updateRotateBtn();
			this.updatePreviewWidth();
			this.updatePreviewScale();
		};

		const scaleContainer = deviceRow.createDiv({ cls: 'mdb-control-container mdb-scale-control' });
		scaleContainer.createSpan({ text: t('label_scale') });

		const scaleSetting = new Setting(scaleContainer)
			.addDropdown(dropdown => {
				dropdown
					.addOption('auto', t('scale_auto'))
					.addOption('manual', t('scale_manual'))
					.setValue(this.plugin.settings.previewAutoScale ? 'auto' : 'manual')
					.onChange(async (value) => {
						this.plugin.settings.previewAutoScale = value === 'auto';
						await this.plugin.saveSettings();
						scaleSlider.classList.toggle('mdb-hidden', value !== 'manual');
						this.updatePreviewScale();
					});
			});
		scaleSetting.infoEl.remove();

		const scaleSlider = deviceRow.createDiv({ cls: 'mdb-scale-slider' });
		if (this.plugin.settings.previewAutoScale) {
			scaleSlider.classList.add('mdb-hidden');
		}

		const scaleInput = scaleSlider.createEl('input', { type: 'range' });
		scaleInput.min = '10';
		scaleInput.max = '200';
		scaleInput.value = String(this.plugin.settings.previewManualScale);
		scaleInput.oninput = () => {
			const value = parseInt(scaleInput.value);
			this.plugin.settings.previewManualScale = value;
			scaleLabel.textContent = `${value}%`;
			void (async () => {
				await this.plugin.saveSettings();
				this.updatePreviewScale();
			})();
		};

		const scaleLabel = scaleSlider.createSpan({ text: `${this.plugin.settings.previewManualScale}%`, cls: 'mdb-scale-label' });

		// Update device row visibility with controls
		const originalToggleOnclick = toggleBtn.onclick;
		toggleBtn.onclick = async (e) => {
			if (originalToggleOnclick) {
				const result: unknown = originalToggleOnclick.call(toggleBtn, e);
				if (result instanceof Promise) await result;
			}
			deviceRow.classList.toggle('mdb-hidden', !this.plugin.settings.controlsVisible);
			const shouldShowRotate = this.plugin.settings.previewDevice !== 'custom' && this.plugin.settings.controlsVisible;
			rotateBtn.classList.toggle('mdb-hidden', !shouldShowRotate);
		};

		this.scrollContainer = container.createDiv({ cls: 'mdb-view-preview-scroll' });

		this.previewEl = this.scrollContainer.createDiv({ cls: 'mdb-view-preview-content' });
		
		// 监听 previewEl 的滚动事件（内容容器）
		this.previewEl.addEventListener('scroll', () => {
			if (this.isRestoringScroll) return;
			if (this.lastScrollSource === 'editor' && Date.now() - this.lastScrollTime < 100) return;
			
			this.lastScrollSource = 'preview';
			this.lastScrollTime = Date.now();
			this.syncPreviewToEditor();
		});
		
		// 应用固定宽度设置
		this.updatePreviewWidth();
		
		// 初始化缩放
		window.setTimeout(() => this.updatePreviewScale(), 100);
		
		// 监听窗口大小变化
		const resizeObserver = new ResizeObserver(() => {
			if (this.plugin.settings.previewAutoScale) {
				this.updatePreviewScale();
			}
		});
		resizeObserver.observe(this.scrollContainer);
		this.register(() => resizeObserver.disconnect());
		
		// Set initial active view
		this.lastActiveView = this.app.workspace.getActiveViewOfType(MarkdownView);

		// Initial update
		this.updatePreview();

		// Listen for changes in active file
		this.registerEvent(
			this.app.workspace.on('editor-change', () => {
				this.schedulePreviewUpdate();
			})
		);
		
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf?.view instanceof MarkdownView) {
					this.lastActiveView = leaf.view;
				}
				this.schedulePreviewUpdate();
				this.setupEditorScrollListener();
			})
		);

		this.registerEvent(
			this.app.workspace.on('css-change', () => {
				this.schedulePreviewUpdate(true);
			})
		);

		// Obsidian doesn't have a direct 'scroll' event on workspace, 
		// so we need to monitor the active leaf's scroll
		this.registerInterval(
			window.setInterval(() => {
				this.syncScroll();
			}, 100) // Keep as fallback but less frequent
		);

		// Initial listener setup
		this.setupEditorScrollListener();
	}

	private setupEditorScrollListener() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.editor) return;

		const scrollDOM = getEditorScrollDOM(activeView.editor);

		if (scrollDOM && !scrollDOM.dataset.mdBeautifyHasListener) {
			scrollDOM.dataset.mdBeautifyHasListener = 'true';
			this.registerDomEvent(scrollDOM, 'scroll', () => {
				this.syncScroll();
			});
		}
	}

	private syncScroll() {
		if (!this.plugin.settings.syncScroll || !this.previewEl) return;

		// If we recently scrolled the preview, don't let the editor sync back immediately
		if (this.lastScrollSource === 'preview' && Date.now() - this.lastScrollTime < 150) {
			return;
		}

		// Try to find the active or most recent markdown view
		const activeView = this.lastActiveView ?? this.plugin.getTargetMarkdownView();
		if (!activeView?.editor) return;

		try {
			const ratio = getEditorScrollRatio(activeView.editor);
			if (ratio === null) return;

			const previewTotalHeight = this.previewEl.scrollHeight - this.previewEl.clientHeight;
			if (previewTotalHeight <= 0) return;

			const newScrollTop = ratio * previewTotalHeight;
			if (Math.abs(this.previewEl.scrollTop - newScrollTop) > 1) {
				this.lastScrollSource = 'editor';
				this.lastScrollTime = Date.now();
				this.previewEl.scrollTop = newScrollTop;
			}
		} catch {
			// Ignore
		}
	}

	updatePreviewWidth() {
		if (!this.previewEl) return;
		
		const { width, height, isCustom } = this.getPreviewSize();

		if (!isCustom || !height.includes('%')) {
			this.previewEl.setCssProps({ width, height });
			this.previewEl.removeClass('mdb-preview-custom-height');
		} else {
			this.previewEl.setCssProps({ width });
			this.previewEl.addClass('mdb-preview-custom-height');
		}
	}

	updatePreviewScale() {
		if (!this.previewEl || !this.scrollContainer) return;

		if (this.plugin.settings.previewAutoScale) {
			const containerWidth = this.scrollContainer.clientWidth - 40;
			const containerHeight = this.scrollContainer.clientHeight - 40;

			const { width, height } = this.getPreviewSize();
			const previewWidth = parseFloat(width || '0');
			const previewHeight = parseFloat(height || '0');

			if (previewWidth > 0) {
				const scaleX = containerWidth / previewWidth;
				const scaleY = previewHeight > 0 ? containerHeight / previewHeight : 1;
				const scale = Math.min(scaleX, scaleY, 1);
				this.previewEl.setCssProps({ transform: `scale(${scale})` });
			} else {
				this.previewEl.setCssProps({ transform: 'scale(1)' });
			}
		} else {
			const scale = this.plugin.settings.previewManualScale / 100;
			this.previewEl.setCssProps({ transform: `scale(${scale})` });
		}
	}

	private getPreviewSize() {
		const devices: Record<string, { width: string; height: string }> = {
			custom: { width: this.plugin.settings.customPreviewWidth, height: this.plugin.settings.customPreviewHeight },
			iphone16pro: { width: '430px', height: '932px' },
			iphone16: { width: '390px', height: '844px' },
			ipad: { width: '768px', height: '1024px' },
			desktop: { width: '1280px', height: '720px' }
		};

		const isCustom = this.plugin.settings.previewDevice === 'custom';
		const device = devices[this.plugin.settings.previewDevice] || devices.custom;
		const isRotated = this.plugin.settings.previewRotated && !isCustom;
		const width = isRotated ? device.height : device.width;
		const height = isRotated ? device.width : device.height;

		return { width, height, isCustom };
	}

	schedulePreviewUpdate(force = false) {
		this.pendingForceUpdate = this.pendingForceUpdate || force;
		if (this.previewUpdateTimer !== null) {
			window.clearTimeout(this.previewUpdateTimer);
		}
		this.previewUpdateTimer = window.setTimeout(() => {
			const shouldForce = this.pendingForceUpdate;
			this.previewUpdateTimer = null;
			this.pendingForceUpdate = false;
			this.updatePreview(shouldForce);
		}, 200);
	}

	private syncPreviewToEditor() {
		if (!this.plugin.settings.syncScroll || !this.previewEl) return;

		const previewTotalHeight = this.previewEl.scrollHeight - this.previewEl.clientHeight;
		if (previewTotalHeight <= 0) return;

		const ratio = this.previewEl.scrollTop / previewTotalHeight;

		const activeView = this.lastActiveView ?? this.plugin.getTargetMarkdownView();
		if (!activeView?.editor) return;

		try {
			setEditorScrollRatio(activeView.editor, ratio);
		} catch {
			// Ignore
		}
	}

	updatePreview(force = false) {
		// 检查深色模式并同步 UI 主题属性
		const isDarkMode = this.plugin.isDarkMode();
		
		// 在外层容器上设置主题属性，以便 CSS 变量和样式生效
		if (this.scrollContainer) {
			this.scrollContainer.setAttribute('data-ui-theme', isDarkMode ? 'dark' : 'light');
			if (isDarkMode) {
				this.scrollContainer.classList.add('mdb-dark-mode');
			} else {
				this.scrollContainer.classList.remove('mdb-dark-mode');
			}
		}

		if (this.previewEl) {
			this.previewEl.setAttribute('data-ui-theme', isDarkMode ? 'dark' : 'light');
			this.previewEl.toggleClass('mdb-dark-mode', isDarkMode);
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		
		if (activeView) {
			this.lastActiveView = activeView;
			this.renderContent(activeView);
			return;
		}

		if (this.lastActiveView) {
			// Check if the view is still valid (file still exists and is the same)
			if (this.lastActiveView.file && this.app.vault.getAbstractFileByPath(this.lastActiveView.file.path)) {
				this.renderContent(this.lastActiveView);
				return;
			} else {
				this.lastActiveView = null;
			}
		}

		if (force) {
			// 如果强制刷新但没有活跃视图，尝试找到第一个 Markdown 视图
			const leaves = this.app.workspace.getLeavesOfType("markdown");
			if (leaves.length > 0 && leaves[0].view instanceof MarkdownView) {
				this.lastActiveView = leaves[0].view;
				this.renderContent(leaves[0].view);
				return;
			}
		}

		// 如果没有活跃的 Markdown 视图，检查工作区是否还有任何 Markdown 叶子节点
		const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
		if (markdownLeaves.length === 0) {
			this.previewEl.empty();
			this.previewEl.createEl('p', { cls: 'mdb-preview-empty', text: t('no_active_markdown') });
		}
		// 如果还有 Markdown 视图只是失去了焦点（例如点击了预览视图或侧边栏），则保留当前预览内容
	}

	private renderContent(view: MarkdownView) {
		try {
			// Record current scroll ratio before update
			let scrollRatio = 0;
			if (this.previewEl) {
				const total = this.previewEl.scrollHeight - this.previewEl.clientHeight;
				if (total > 0) {
					scrollRatio = this.previewEl.scrollTop / total;
				}
			}

			let content = view.editor.getValue();
			
			// Remove frontmatter/properties
			content = content.replace(/^---[\s\S]*?---/, '').trim();

			const isDarkMode = this.plugin.isDarkMode();
			const themeCss = this.plugin.getThemeCss(undefined, isDarkMode, false);
			const scopedCss = scopeCss(themeCss);
			const combinedCss = buildPreviewThemeCss(scopedCss, isDarkMode);

			const html = this.plugin.parser.render(content);
			const finalHtml = processHtml(html, combinedCss, true, false, true);
			setElementHtml(this.previewEl, finalHtml);
			
			void this.renderMermaidBlocks(isDarkMode);

			this.previewEl.setAttribute('data-ui-theme', isDarkMode ? 'dark' : 'light');
			this.previewEl.toggleClass('mdb-dark-mode', isDarkMode);

			// 参考 web 端实现，添加 KaTeX 文本节点后处理
			if (hasMathFormula(content)) {
				window.setTimeout(() => {
					if (this.previewEl) {
						renderMathInElement(this.previewEl);
					}
				}, 100);
			}

			// Restore scroll ratio after content update (with multiple checks for images/rendering)
			if (scrollRatio > 0) {
				this.isRestoringScroll = true;
				const restoreScroll = () => {
					if (!this.previewEl) return;
					const newTotal = this.previewEl.scrollHeight - this.previewEl.clientHeight;
					if (newTotal > 0) {
						this.previewEl.scrollTop = scrollRatio * newTotal;
					}
				};

				// Immediate restore
				restoreScroll();
				
				// Delayed restores to account for image loading
				window.setTimeout(restoreScroll, 100);
				window.setTimeout(restoreScroll, 300);
				window.setTimeout(() => {
					restoreScroll();
					this.isRestoringScroll = false;
				}, 1000);
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			this.previewEl.empty();
			this.previewEl.createEl('p', { cls: 'mdb-preview-error', text: `Preview Error: ${message}` });
		}
	}

	private async renderMermaidBlocks(isDarkMode: boolean) {
		if (!this.previewEl) return;
		await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
		
		const renderToken = ++this.mermaidRenderId;
		await renderMermaid(
			this.previewEl,
			isDarkMode,
			`obsidian-preview-${renderToken}`,
			() => this.mermaidRenderId === renderToken
		);
	}
}

class ThemeManagerModal extends Modal {
	plugin: MDBeautifyPlugin;
	onChanged: () => void;

	constructor(app: App, plugin: MDBeautifyPlugin, onChanged: () => void) {
		super(app);
		this.plugin = plugin;
		this.onChanged = onChanged;
	}

	onOpen() {
		const { contentEl } = this;
		new Setting(contentEl)
			.setName(t('title_theme_manager'))
			.setHeading();

		const createSection = contentEl.createDiv({ cls: 'mdb-theme-manager-section' });

		const nameSetting = new Setting(createSection)
			.setName(t('btn_create_theme'))
			.addText(text => text
				.setPlaceholder(t('new_theme_placeholder'))
				.onChange(() => {}));

		const createBtn = createSection.createEl('button', { 
			text: t('btn_create_theme'), 
			cls: 'mod-cta mdb-theme-manager-btn' 
		});
		
		createBtn.onclick = async () => {
			const input = nameSetting.controlEl.querySelector('input') as HTMLInputElement;
			const name = input.value.trim();
			if (name) {
				if (!this.plugin.settings.customThemes.includes(name)) {
					this.plugin.settings.customThemes.push(name);
					this.plugin.settings.customThemeStyles[name] = '';
					await this.plugin.saveSettings();
					input.value = '';
					this.renderThemeList(listContainer);
					this.onChanged();
				}
			} else {
				new Notice(t('msg_enter_theme_name'));
			}
		};

		// --- Section: Theme List ---
		const listContainer = contentEl.createDiv();
		this.renderThemeList(listContainer);
	}

	renderThemeList(container: HTMLElement) {
		container.empty();
		
		if (this.plugin.settings.customThemes.length === 0) return;

		new Setting(container)
			.setName(t('tab_theme'))
			.setHeading();
		
		const list = container.createDiv({ cls: 'mdb-theme-list' });

		this.plugin.settings.customThemes.forEach((themeName: string) => {
			const item = list.createDiv({ cls: 'mdb-theme-list-item' });
			item.createSpan({ text: themeName });

			const deleteBtn = item.createEl('button', { 
				text: t('btn_delete'), 
				cls: 'mod-warning' 
			});

			deleteBtn.onclick = async () => {
				const confirmMsg = t('msg_confirm_delete_theme', { themeName });
				new ConfirmModal(this.app, confirmMsg, async () => {
					// Remove from customThemes
					this.plugin.settings.customThemes = this.plugin.settings.customThemes.filter(name => name !== themeName);
					// Remove style data
					delete this.plugin.settings.customThemeStyles[themeName];
					
					// If it was the default theme, reset to basic
					if (this.plugin.settings.defaultTheme === themeName) {
						this.plugin.settings.defaultTheme = 'basic';
					}

					await this.plugin.saveSettings();
					this.renderThemeList(container);
					this.onChanged();
					this.plugin.updateAllPreviews(true);
				}).open();
			};
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ConfirmModal extends Modal {
	constructor(app: App, private message: string, private onConfirm: () => void | Promise<void>) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('p', { text: this.message });

		new Setting(contentEl)
			.addButton(btn => {
				btn
					.setButtonText(t('btn_delete'))
					.setWarning()
					.onClick(() => {
						void this.onConfirm();
						this.close();
					});
				return btn;
			})
			.addButton(btn => {
				btn
					.setButtonText('Cancel')
					.onClick(() => this.close());
				return btn;
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}

class MDBeautifySettingTab extends PluginSettingTab {
	plugin: MDBeautifyPlugin;
	activeTab: 'general' | 'theme' | 'imagehost' = 'general';

	constructor(app: App, plugin: MDBeautifyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('settings_header'))
			.setHeading();

		const nav = containerEl.createDiv({ cls: 'mdb-settings-nav' });

		const createTabBtn = (id: typeof this.activeTab, label: string) => {
			const btn = nav.createEl('button', { text: label });
			if (this.activeTab === id) {
				btn.classList.add('active');
			}
			btn.onclick = () => {
				this.activeTab = id;
				this.display();
			};
		};

		createTabBtn('general', t('tab_general'));
		createTabBtn('theme', t('tab_theme'));
		createTabBtn('imagehost', t('tab_image_host'));

		const content = containerEl.createDiv({ cls: 'mdb-settings-content' });

		if (this.activeTab === 'general') {
			this.renderGeneralSettings(content);
		} else if (this.activeTab === 'theme') {
			void this.renderThemeSettings(content);
		} else if (this.activeTab === 'imagehost') {
			this.renderImageHostSettings(content);
		}
	}

	renderGeneralSettings(container: HTMLElement) {
		new Setting(container)
			.setName(t('setting_copy_as_html'))
			.setDesc(t('setting_copy_as_html_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.copyAsHtml)
				.onChange(async (value) => {
					this.plugin.settings.copyAsHtml = value;
					await this.plugin.saveSettings();
				}));

		new Setting(container)
			.setName(t('setting_header_preview'))
			.setHeading();

		new Setting(container)
			.setName(t('setting_default_device'))
			.setDesc(t('setting_default_device_desc'))
			.addDropdown(dropdown => dropdown
				.addOption('custom', t('device_custom'))
				.addOption('iphone16pro', t('device_iphone16pro'))
				.addOption('iphone16', t('device_iphone16'))
				.addOption('ipad', t('device_ipad'))
				.addOption('desktop', t('device_desktop'))
				.setValue(this.plugin.settings.previewDevice)
				.onChange(async (value) => {
					this.plugin.settings.previewDevice = value;
					if (value === 'custom') {
						this.plugin.settings.previewRotated = false;
					}
					await this.plugin.saveSettings();
					this.plugin.updateAllPreviews();
				}));

		new Setting(container)
			.setName(t('setting_custom_width'))
			.setDesc(t('setting_custom_width_desc'))
			.addText(text => text
				.setPlaceholder('100%')
				.setValue(this.plugin.settings.customPreviewWidth)
				.onChange(async (value) => {
					this.plugin.settings.customPreviewWidth = value.trim() || '100%';
					await this.plugin.saveSettings();
					this.plugin.updateAllPreviews();
				}));

		new Setting(container)
			.setName(t('setting_custom_height'))
			.setDesc(t('setting_custom_height_desc'))
			.addText(text => text
				.setPlaceholder('100%')
				.setValue(this.plugin.settings.customPreviewHeight)
				.onChange(async (value) => {
					this.plugin.settings.customPreviewHeight = value.trim() || '100%';
					await this.plugin.saveSettings();
					this.plugin.updateAllPreviews();
				}));

		new Setting(container)
			.setName(t('setting_default_scale_mode'))
			.setDesc(t('setting_default_scale_mode_desc'))
			.addDropdown(dropdown => dropdown
				.addOption('auto', t('setting_scale_auto'))
				.addOption('manual', t('setting_scale_manual'))
				.setValue(this.plugin.settings.previewAutoScale ? 'auto' : 'manual')
				.onChange(async (value) => {
					this.plugin.settings.previewAutoScale = value === 'auto';
					await this.plugin.saveSettings();
					this.plugin.updateAllPreviews();
				}));

		new Setting(container)
			.setName(t('setting_manual_scale'))
			.setDesc(t('setting_manual_scale_desc'))
			.addSlider(slider => slider
				.setLimits(10, 200, 10)
				.setValue(this.plugin.settings.previewManualScale)
				.onChange(async (value) => {
					this.plugin.settings.previewManualScale = value;
					await this.plugin.saveSettings();
					this.plugin.updateAllPreviews();
				}));

		new Setting(container)
			.setName(t('setting_sync_scroll'))
			.setDesc(t('setting_sync_scroll_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncScroll)
				.onChange(async (value) => {
					this.plugin.settings.syncScroll = value;
					await this.plugin.saveSettings();
				}));
	}

	async renderThemeSettings(container: HTMLElement) {
		const themeId = this.plugin.settings.defaultTheme;

		// Theme Management Button
		const actionContainer = container.createDiv({ cls: 'mdb-theme-actions' });

		const manageBtn = actionContainer.createEl('button', {
			text: t('btn_manage_themes'),
			cls: 'mod-cta'
		});

		manageBtn.onclick = () => {
			new ThemeManagerModal(this.app, this.plugin, () => {
				this.display();
			}).open();
		};

		new Setting(container)
			.setName(t('setting_base_theme'))
			.addDropdown(dropdown => {
				populateThemeDropdown(dropdown, this.plugin);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultTheme = value;
					await this.plugin.saveSettings();
					this.plugin.updateAllPreviews(true);
					this.display();
				});
			});

		new Setting(container)
			.setName(t('setting_theme_mode'))
			.setDesc(t('setting_theme_mode_desc'))
			.addDropdown(dropdown => {
				dropdown
					.addOption('auto', t('theme_mode_auto'))
					.addOption('light', t('theme_mode_light'))
					.addOption('dark', t('theme_mode_dark'))
					.setValue(this.plugin.settings.themeMode)
					.onChange(async (value) => {
						this.plugin.settings.themeMode = value as 'auto' | 'light' | 'dark';
						await this.plugin.saveSettings();
						this.plugin.updateAllPreviews(true);
					});
			});

		// Main Editor Container
		const editorContainer = container.createDiv({ cls: 'mdb-theme-editor-container' });

		const cssSection = editorContainer.createDiv({ cls: 'mdb-editor-section' });
		new Setting(cssSection)
			.setName(t('setting_custom_css'))
			.setHeading();
		
		const cssEditor = cssSection.createEl('textarea');
		// Show current effective CSS (either custom or built-in base)
		cssEditor.value = this.plugin.getThemeCss(themeId);

		const previewSection = editorContainer.createDiv({ cls: 'mdb-editor-section' });
		new Setting(previewSection)
			.setName(t('preview_title'))
			.setHeading();

		const previewFrame = previewSection.createDiv({ cls: 'mdb-editor-preview' });
		const previewContent = previewFrame.createDiv();
		let lastPreviewMarkup = '';

		const updateSettingsPreview = async () => {
			const isDarkMode = this.plugin.isDarkMode();
			const themeCss = this.plugin.getThemeCss(themeId, isDarkMode, false);
			const combinedSettingsCss = buildPreviewThemeCss(scopeCss(themeCss), isDarkMode);
			
			const html = this.plugin.parser.render(defaultMarkdown);
			const processedHtml = processHtml(html, combinedSettingsCss, true, false, true);
			const newHtml = `<div class="mdb-preview-wrapper">${processedHtml}</div>`;
			
			if (lastPreviewMarkup !== newHtml) {
				lastPreviewMarkup = newHtml;
				setElementHtml(previewContent, newHtml);
				previewContent.setAttribute('data-ui-theme', isDarkMode ? 'dark' : 'light');
				previewContent.toggleClass('mdb-dark-mode', isDarkMode);
				
				window.setTimeout(() => {
					void (async () => {
						if (!previewContent.isConnected) return;

						if (hasMathFormula(defaultMarkdown)) {
							renderMathInElement(previewContent);
						}

						await renderMermaid(previewContent, isDarkMode, `mdb-settings-mermaid-${Date.now()}`);
					})();
				}, 150);
			}
		};

		// Initial preview
		await updateSettingsPreview();

		// Auto save and live sync with debounce
		let debounceTimer: number | null = null;
		cssEditor.oninput = () => {
			if (debounceTimer !== null) {
				window.clearTimeout(debounceTimer);
			}
			debounceTimer = window.setTimeout(() => {
				void (async () => {
					this.plugin.settings.customThemeStyles[themeId] = cssEditor.value;
					await this.plugin.saveSettings();
					await updateSettingsPreview();
					this.plugin.updateAllPreviews(true);
				})();
			}, 500);
		};
	}

	renderImageHostSettings(container: HTMLElement) {
		const host = this.plugin.settings.activeImageHost;

		new Setting(container)
			.setName(t('setting_auto_upload'))
			.setDesc(t('setting_auto_upload_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoUploadImages)
				.onChange(async (value) => {
					this.plugin.settings.autoUploadImages = value;
					await this.plugin.saveSettings();
				}));

		new Setting(container)
			.setName(t('setting_active_image_host'))
			.setDesc(t('setting_active_image_host_desc'))
			.addDropdown(dropdown => {
				const hosts: ImageHostKey[] = ['official', 'qiniu', 'aliyun', 'tencent', 's3'];
				hosts.forEach(h => {
					const label = t(hostLabelKey(h)) || h;
					dropdown.addOption(h, label);
				});
				dropdown.setValue(host)
					.onChange(async (value) => {
						if (!isImageHostKey(value)) return;
						this.plugin.settings.activeImageHost = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (host === 'official') {
			container.createEl('p', { text: t('official_host_desc') });
			new Setting(container)
				.setName(t('setting_official_url'))
				.setDesc(t('setting_official_url_desc'))
				.addText(text => text
					.setValue(this.plugin.settings.officialUploadUrl)
					.onChange(async (value) => {
						this.plugin.settings.officialUploadUrl = value;
						await this.plugin.saveSettings();
					}));
		} else {
			this.renderHostConfigFields(container, host);
		}
	}

	renderHostConfigFields(container: HTMLElement, type: ImageHostKey) {
		if (type === 'qiniu') {
			this.createConfigInput(container, type, 'Access Key', 'accessKey', true);
			this.createConfigInput(container, type, 'Secret Key', 'secretKey', true);
			this.createConfigInput(container, type, 'Bucket', 'bucket');
			this.createConfigInput(container, type, 'Domain', 'domain', false, 'e.g., http://images.yourdomain.com');
		} else if (type === 'aliyun' || type === 'tencent' || type === 's3') {
			this.createConfigInput(container, type, 'Access Key ID', 'accessKeyId', true);
			this.createConfigInput(container, type, 'Secret Access Key', 'secretAccessKey', true);
			this.createConfigInput(container, type, 'Bucket', 'bucket');
			this.createConfigInput(container, type, 'Region', 'region');
			if (type === 's3') {
				this.createConfigInput(container, type, 'Endpoint', 'endpoint');
			}
		}
	}

	createConfigInput(container: HTMLElement, type: ImageHostKey, name: string, key: string, isPassword = false, placeholder = '') {
		const hostConfig = this.plugin.settings.imageHostConfigs[type];
		const s = new Setting(container)
			.setName(name)
			.addText(text => text
				.setPlaceholder(placeholder)
				.setValue(hostConfig[key] ?? '')
				.onChange(async (value) => {
					hostConfig[key] = value;
					await this.plugin.saveSettings();
				}));
		
		if (isPassword) {
			s.controlEl.querySelector('input')!.type = 'password';
		}
	}
}
