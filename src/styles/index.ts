import { historyStyles } from './history.js';
import { layoutStyles } from './layout.js';
import { themeStyles } from './theme.js';
import { typographyStyles } from './typography.js';

export const widgetStyles = [
  themeStyles,
  layoutStyles,
  typographyStyles,
  historyStyles,
].join('\n');
