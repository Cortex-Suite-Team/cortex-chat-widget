import { authStyles } from './auth.js';
import { historyStyles } from './history.js';
import { humanAssistanceStyles } from './human-assistance.js';
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
  humanAssistanceStyles,
  authStyles,
].join('\n');
