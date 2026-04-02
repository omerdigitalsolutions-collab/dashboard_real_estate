import { useState, useEffect } from 'react';

/**
 * useMediaQuery hook: Efficiently listens for media query changes.
 * @param query (e.g. '(min-width: 768px)')
 * @returns boolean
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);

  return matches;
}
