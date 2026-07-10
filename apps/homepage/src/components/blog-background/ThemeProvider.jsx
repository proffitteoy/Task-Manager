"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ isDark: false, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(false);
    localStorage.setItem("blog-theme", "light");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
    localStorage.setItem("blog-theme", "light");
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(false);
    localStorage.setItem("blog-theme", "light");
  };

  return <ThemeContext.Provider value={{ isDark, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
