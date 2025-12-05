import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

export interface BTIPNode {
	name: string;
	path: string;
	type: 'file' | 'directory';
	ext?: string;
	size?: number;
	children?: BTIPNode[];
	expanded?: boolean;
}

export interface SelectedFile {
	path: string;
	name: string;
	content: string;
	ext: string;
	size: number;
}

export const btipTree: Writable<BTIPNode[]> = writable([]);
export const selectedFile: Writable<SelectedFile | null> = writable(null);
export const currentPath: Writable<string> = writable('');
export const expandedNodes: Writable<Set<string>> = writable(new Set());

export function toggleNode(path: string): void {
	expandedNodes.update((nodes) => {
		const newNodes = new Set(nodes);
		if (newNodes.has(path)) {
			newNodes.delete(path);
		} else {
			newNodes.add(path);
		}
		return newNodes;
	});
}

export function selectFile(file: SelectedFile): void {
	selectedFile.set(file);
	currentPath.set(file.path);
}

export function clearSelection(): void {
	selectedFile.set(null);
}

export function updateTree(nodes: BTIPNode[]): void {
	btipTree.set(nodes);
}

export function updateNodeChildren(path: string, children: BTIPNode[]): void {
	btipTree.update((tree) => {
		const updateNode = (nodes: BTIPNode[]): BTIPNode[] => {
			return nodes.map((node) => {
				if (node.path === path) {
					return {
						...node,
						children,
						expanded: true
					};
				}
				if (node.children) {
					return {
						...node,
						children: updateNode(node.children)
					};
				}
				return node;
			});
		};
		return updateNode(tree);
	});
}