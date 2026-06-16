'use client';

import { useEffect, useState } from 'react';

export function usePersistentTheme(defaultTheme = 'dark') {
  const [theme, setTheme] = useState(defaultTheme);
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('hecto-theme')
      || document.documentElement.getAttribute('data-theme')
      || defaultTheme;

    document.documentElement.setAttribute('data-theme', savedTheme);
    setTheme(savedTheme);
    setThemeLoaded(true);
  }, [defaultTheme]);

  useEffect(() => {
    if (!themeLoaded) return;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hecto-theme', theme);
  }, [theme, themeLoaded]);

  return [theme, setTheme];
}
