export const THEME_STORAGE_KEY = "theme";
export type ThemeChoice = "system" | "light" | "dark";

/**
 * Runs before first paint (inlined in <head>) so a saved light/dark choice never flashes the wrong theme.
 * "system" is represented by NO data-theme attribute, which lets the CSS follow prefers-color-scheme.
 * Constant string, no user input: safe to inline.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
