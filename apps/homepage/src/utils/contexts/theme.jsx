import { createContext, useEffect, useMemo, useState } from "react";

const getInitialTheme = () => {
  return "light";
};

export const ThemeContext = createContext();

export function ThemeProvider({ initialTheme, children }) {
  const [theme, setThemeState] = useState(() => initialTheme ?? getInitialTheme());

  const rawSetTheme = (rawTheme) => {
    const root = window.document.documentElement;

    root.classList.remove("dark");
    root.classList.add("light");

    localStorage.setItem("theme-mode", "light");
  };

  const setTheme = () => {
    setThemeState("light");
  };

  useEffect(() => {
    if (initialTheme !== undefined) setThemeState("light");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTheme]);

  useEffect(() => {
    rawSetTheme(theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
