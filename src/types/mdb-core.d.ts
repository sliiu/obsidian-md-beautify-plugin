declare module "@mdb/core" {
	import type MarkdownIt from "markdown-it";

	export const createMarkdownParser: () => MarkdownIt;
	export const processHtml: (
		html: string,
		css: string,
		inlineStyles?: boolean,
		inlinePseudoElements?: boolean,
		replaceLocalImages?: boolean,
	) => string;
	export const convertCssToWeChatDarkMode: (css: string) => string;
	export const hasMathFormula: (content: string) => boolean;
	export const renderMathInElement: (element: HTMLElement) => void;
	export const katexInlineCss: string;
	export const basicTheme: string;
	export const customDefaultTheme: string;
	export const codeGithubTheme: string;
	export const academicPaperTheme: string;
	export const auroraGlassTheme: string;
	export const bauhausTheme: string;
	export const cyberpunkNeonTheme: string;
	export const knowledgeBaseTheme: string;
	export const luxuryGoldTheme: string;
	export const morandiForestTheme: string;
	export const neoBrutalismTheme: string;
	export const receiptTheme: string;
	export const sunsetFilmTheme: string;
	export const templateTheme: string;
	export const generateExportHtml: (
		contentHtml: string,
		options: { title?: string; themeCss: string; extraCss?: string },
	) => string;
	export const exportToPdfNative: (html: string) => void;
	export const getDefaultMarkdown: (locale?: string) => string;
}
