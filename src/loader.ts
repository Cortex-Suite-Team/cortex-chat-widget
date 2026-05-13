import { mountCortexChat } from './index.js';
import type { CortexChatWidgetOptions } from './types.js';

declare global {
  interface Window {
    CortexChatWidget?: {
      mountCortexChat: typeof mountCortexChat;
    };
  }
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === 'true' || value === '1';
}

function buildOptionsFromScript(script: HTMLScriptElement): CortexChatWidgetOptions {
  const dataset = script.dataset;
  return {
    apiKey: dataset.apiKey ?? '',
    workerRef: dataset.workerRef,
    mode: dataset.mode === 'embedded' ? 'embedded' : 'floating',
    target: dataset.target,
    historyTarget: dataset.historyTarget,
    authUrl: dataset.authUrl,
    controlPlaneUrl: dataset.controlPlaneUrl,
    title: dataset.title,
    subtitle: dataset.subtitle,
    placeholder: dataset.placeholder,
    launcherLabel: dataset.launcherLabel,
    position: dataset.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    initialOpen: parseBoolean(dataset.initialOpen),
    theme: {
      accentColor: dataset.accentColor,
      backgroundColor: dataset.backgroundColor,
      textColor: dataset.textColor,
      borderRadius: dataset.borderRadius,
    },
  };
}

window.CortexChatWidget = { mountCortexChat };

const currentScript = document.currentScript;
if (!(currentScript instanceof HTMLScriptElement)) {
  throw new Error('Cortex Chat Widget loader could not resolve document.currentScript.');
}

mountCortexChat(buildOptionsFromScript(currentScript));

export { mountCortexChat };
