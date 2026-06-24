'use client';

export const getCookieValue = (name) => {
  if (typeof window === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
};

export const getAuthValue = (key) =>
  getCookieValue(key) || (typeof window !== 'undefined' ? localStorage.getItem(key) : null) || '';
