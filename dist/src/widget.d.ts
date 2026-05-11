import type { CortexChatWidgetHandle, NormalizedWidgetOptions, WidgetClientLike, WidgetDom } from './types.js';
export declare function createWidgetHandle(args: {
    options: NormalizedWidgetOptions;
    dom: WidgetDom;
    mountTarget: HTMLElement;
    historyTarget?: HTMLElement;
    createClient: () => WidgetClientLike;
}): CortexChatWidgetHandle;
//# sourceMappingURL=widget.d.ts.map