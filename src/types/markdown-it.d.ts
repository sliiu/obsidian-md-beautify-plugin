declare module "markdown-it" {
	interface MarkdownIt {
		render(src: string): string;
	}

	interface MarkdownItConstructor {
		new (): MarkdownIt;
		(): MarkdownIt;
	}

	const MarkdownIt: MarkdownItConstructor;
	export default MarkdownIt;
}
