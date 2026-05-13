import { CortexClient } from '@cortex-suite/sdk/browser';
import { createWidgetError } from './errors.js';
import { createWidgetDom } from './dom.js';
import { createWidgetHandle } from './widget.js';
import type {
  CortexChatWidgetHandle,
  CortexChatWidgetOptions,
  MountTargetResolution,
  NormalizedWidgetOptions,
  WidgetClientLike,
} from './types.js';

function callOnError(options: Partial<CortexChatWidgetOptions>, error: unknown) {
  options.onError?.(error);
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement;
}

function assertBrowserEnvironment(options: Partial<CortexChatWidgetOptions>) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const error = createWidgetError('browser_unsupported', 'Cortex Chat Widget requires a browser environment.');
    callOnError(options, error);
    throw error;
  }

  if (typeof HTMLElement === 'undefined') {
    const error = createWidgetError('browser_unsupported', 'HTMLElement is unavailable in the current environment.');
    callOnError(options, error);
    throw error;
  }
}

function resolveOptions(
  targetOrOptions?: string | HTMLElement | CortexChatWidgetOptions,
  maybeOptions?: CortexChatWidgetOptions,
): NormalizedWidgetOptions {
  const baseOptions = (
    typeof targetOrOptions === 'string'
    || isHTMLElement(targetOrOptions)
  )
    ? { ...maybeOptions, target: targetOrOptions }
    : { ...(targetOrOptions ?? {}) } as Partial<CortexChatWidgetOptions>;

  if (!baseOptions.apiKey) {
    const error = createWidgetError('missing_api_key', 'Cortex Chat Widget requires apiKey.');
    callOnError(baseOptions, error);
    throw error;
  }

  return {
    ...baseOptions,
    apiKey: baseOptions.apiKey,
    authUrl: baseOptions.authUrl,
    controlPlaneUrl: baseOptions.controlPlaneUrl,
    target: baseOptions.target,
    historyTarget: baseOptions.historyTarget,
    theme: baseOptions.theme,
    client: baseOptions.client,
    onReady: baseOptions.onReady,
    onStateChange: baseOptions.onStateChange,
    onError: baseOptions.onError,
    mode: baseOptions.mode ?? 'floating',
    position: baseOptions.position ?? 'bottom-right',
    title: baseOptions.title ?? 'Ask Cortex',
    subtitle: baseOptions.subtitle ?? 'Your Digital Worker is here to help.',
    placeholder: baseOptions.placeholder ?? 'Write your message...',
    launcherLabel: baseOptions.launcherLabel ?? 'Ask Cortex',
    initialOpen: baseOptions.initialOpen ?? false,
  };
}

function resolveMountTarget(options: NormalizedWidgetOptions): MountTargetResolution {
  if (options.mode === 'embedded') {
    if (!options.target) {
      throw createWidgetError('missing_target', 'Embedded mode requires a target element or selector.');
    }
  }

  let historyTarget: HTMLElement | undefined;
  if (options.mode === 'embedded' && options.historyTarget) {
    if (!options.controlPlaneUrl) {
      throw createWidgetError(
        'missing_control_plane_url',
        'historyTarget requires controlPlaneUrl in embedded mode.',
      );
    }
    if (typeof options.historyTarget === 'string') {
      const historyElement = document.querySelector(options.historyTarget);
      if (!isHTMLElement(historyElement)) {
        throw createWidgetError('history_target_not_found', `History target selector not found: ${options.historyTarget}`);
      }
      historyTarget = historyElement;
    } else if (isHTMLElement(options.historyTarget)) {
      historyTarget = options.historyTarget;
    } else {
      throw createWidgetError('history_target_not_found', 'historyTarget must be a selector or HTMLElement.');
    }
  }

  if (typeof options.target === 'string') {
    const targetElement = document.querySelector(options.target);
    if (!isHTMLElement(targetElement)) {
      throw createWidgetError('target_not_found', `Target selector not found: ${options.target}`);
    }
    return {
      mountTarget: targetElement,
      targetElement,
      historyTarget,
    };
  }

  if (isHTMLElement(options.target)) {
    return {
      mountTarget: options.target,
      targetElement: options.target,
      historyTarget,
    };
  }

  return {
    mountTarget: document.body,
    historyTarget,
  };
}

function createClient(options: NormalizedWidgetOptions): WidgetClientLike {
  if (options.client) {
    return options.client;
  }

  return new CortexClient({
    apiKey: options.apiKey,
    workerRef: options.workerRef,
    authUrl: options.authUrl,
    onMessage: () => {},
  }) as unknown as WidgetClientLike;
}

export function mountCortexChat(
  targetOrOptions?: string | HTMLElement | CortexChatWidgetOptions,
  maybeOptions?: CortexChatWidgetOptions,
): CortexChatWidgetHandle {
  const partialOptions = (
    typeof targetOrOptions === 'object'
    && targetOrOptions !== null
    && !isHTMLElement(targetOrOptions)
  ) ? targetOrOptions : maybeOptions ?? {};

  assertBrowserEnvironment(partialOptions);
  const options = resolveOptions(targetOrOptions, maybeOptions);
  const { mountTarget, historyTarget } = resolveMountTarget(options);

  void mountTarget;

  if (typeof HTMLElement.prototype.attachShadow !== 'function') {
    const error = createWidgetError('shadow_dom_unsupported', 'Cortex Chat Widget requires Shadow DOM support.');
    callOnError(options, error);
    throw error;
  }

  const dom = createWidgetDom(options);
  return createWidgetHandle({
    options,
    dom,
    mountTarget,
    historyTarget,
    createClient: () => createClient(options),
  });
}
