import { historyStyles } from './history.js';
import { layoutStyles } from './layout.js';
import { messageStyles } from './messages.js';
import { themeStyles } from './theme.js';
import { typographyStyles } from './typography.js';

export const widgetStyles = [
  themeStyles,
  layoutStyles,
  typographyStyles,
  messageStyles,
  historyStyles,
].join('\n');
