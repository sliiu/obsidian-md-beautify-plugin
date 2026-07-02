import type { Editor } from "obsidian";

interface Cm5ScrollInfo {
	top: number;
	height: number;
	clientHeight: number;
}

interface ScrollCapableEditor {
	cm?: { scrollDOM?: HTMLElement };
	scrollDOM?: HTMLElement;
	getScrollInfo?: () => unknown;
	scrollTo?: (x: number | null, y: number) => void;
}

function asScrollEditor(editor: Editor): ScrollCapableEditor {
	return editor;
}

function isCm5ScrollInfo(value: unknown): value is Cm5ScrollInfo {
	return (
		typeof value === "object" &&
		value !== null &&
		"height" in value &&
		"clientHeight" in value &&
		"top" in value &&
		typeof value.height === "number" &&
		typeof value.clientHeight === "number" &&
		typeof value.top === "number"
	);
}

function getCm5ScrollInfo(editor: Editor): Cm5ScrollInfo | null {
	const scrollEditor = asScrollEditor(editor);
	if (typeof scrollEditor.getScrollInfo !== "function") {
		return null;
	}
	const info = scrollEditor.getScrollInfo();
	if (!isCm5ScrollInfo(info)) {
		return null;
	}
	return info;
}

export function getEditorScrollDOM(editor: Editor): HTMLElement | null {
	const scrollEditor = asScrollEditor(editor);
	return scrollEditor.cm?.scrollDOM ?? scrollEditor.scrollDOM ?? null;
}

export function getEditorScrollRatio(editor: Editor): number | null {
	const scrollDOM = getEditorScrollDOM(editor);
	if (scrollDOM) {
		const total = scrollDOM.scrollHeight - scrollDOM.clientHeight;
		if (total <= 0) return null;
		return scrollDOM.scrollTop / total;
	}

	const info = getCm5ScrollInfo(editor);
	if (!info) return null;
	const total = info.height - info.clientHeight;
	if (total <= 0) return null;
	return info.top / total;
}

export function setEditorScrollRatio(editor: Editor, ratio: number): void {
	const scrollDOM = getEditorScrollDOM(editor);
	if (scrollDOM) {
		const total = scrollDOM.scrollHeight - scrollDOM.clientHeight;
		if (total <= 0) return;
		const newScrollTop = ratio * total;
		if (Math.abs(scrollDOM.scrollTop - newScrollTop) > 1) {
			scrollDOM.scrollTop = newScrollTop;
		}
		return;
	}

	const scrollEditor = asScrollEditor(editor);
	const info = getCm5ScrollInfo(editor);
	if (!info || typeof scrollEditor.scrollTo !== "function") {
		return;
	}
	const total = info.height - info.clientHeight;
	if (total <= 0) return;
	scrollEditor.scrollTo(null, ratio * total);
}
