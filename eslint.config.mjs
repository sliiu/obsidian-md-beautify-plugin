import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{ ignores: ["node_modules/**", "dist/**", "main.js"] },
	...tseslint.configs.recommendedTypeChecked,
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
);
