import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/api';

/**
 * Loads data from the API and tracks loading / error state.
 *   const { data, loading, error, reload } = useFetch(() => productApi.list(filters), [filters]);
 * `loading` is true only for the first load; `refreshing` is true for later reloads,
 * so tables keep showing the old rows while new ones arrive.
 */
export default function useFetch(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, refreshing: false, error: null });
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(() => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: s.data === null, refreshing: s.data !== null, error: null }));
    return fetcherRef.current()
      .then((data) => {
        // Ignore answers to out-of-date requests (e.g. the user typed again).
        if (id === requestId.current) setState({ data, loading: false, refreshing: false, error: null });
      })
      .catch((err) => {
        if (id === requestId.current) setState((s) => ({ ...s, loading: false, refreshing: false, error: errorMessage(err) }));
      });
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: load };
}

// Returns `value` only after it has stopped changing for `delay` ms (for search boxes).
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
