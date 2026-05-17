import { ChatWidget } from './chat-widget.js';
import type {
  CortexChatWidgetHandle,
  NormalizedWidgetOptions,
  WidgetClientLike,
  WidgetDom,
} from './types.js';

export function createWidgetHandle(args: {
  options: NormalizedWidgetOptions;
  dom: WidgetDom;
  mountTarget: HTMLElement;
  historyTarget?: HTMLElement;
  createClient: () => WidgetClientLike;
}): CortexChatWidgetHandle {
  return new ChatWidget(args).mount();
}
