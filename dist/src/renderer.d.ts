import type { CortexChatWidgetState, NormalizedWidgetOptions, WidgetDom } from './types.js';
export declare function applyResolvedTheme(host: HTMLElement, root: HTMLElement, theme: NormalizedWidgetOptions['theme'] | undefined, variantClasses: {
    light: string;
    dark: string;
}): boolean;
export declare function renderWidget(dom: WidgetDom, state: CortexChatWidgetState, options: NormalizedWidgetOptions, attachmentsAvailable: boolean, isUploading: boolean): void;
//# sourceMappingURL=renderer.d.ts.map