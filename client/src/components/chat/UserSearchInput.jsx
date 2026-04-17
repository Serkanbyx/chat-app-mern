import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Loader2, Search, X } from 'lucide-react';

import { useDebounce } from '../../hooks/useDebounce.js';
import { useSocket } from '../../contexts/SocketContext.jsx';
import * as userService from '../../api/user.service.js';
import Avatar from '../common/Avatar.jsx';
import PresenceDot from './PresenceDot.jsx';

/**
 * UserSearchInput — debounced `/users/search` input with a result list.
 *
 * Designed as the single search primitive shared by both modals in
 * Step 26 (`NewChatModal`, `NewGroupModal`):
 *   - In single-select mode (`mode="single"`) clicking a row simply
 *     fires `onSelect(user)` and the parent decides what to do
 *     (typically: create a direct conversation and close).
 *   - In multi-select mode (`mode="multi"`) the parent owns the
 *     selection state via `selectedIds` and `onToggle`. Selected rows
 *     show a check, and the parent can also disable rows (e.g. when
 *     the group cap has been reached) via `disabledIds`.
 *
 * Why state lives partly inside this component (`query`, results) and
 * partly outside (`selectedIds`, `excludeIds`):
 *   The query lifecycle is purely a UI concern — it should reset
 *   when the modal closes. Selection, however, is the *output* of
 *   the modal and must survive across query changes (you can search
 *   for "alice", select her, then search for "bob" and select him).
 *   Splitting ownership along that axis keeps the parent contract
 *   minimal without making this component a black box.
 *
 * `excludeIds` is applied client-side after the network round-trip.
 * The server's `/users/search` already excludes blocked accounts
 * (per Step 9), so this filter is for UX hints only — typically
 * "don't show users who are already in this group".
 */

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

const UserSearchInput = ({
  ref,
  mode = 'single',
  onSelect,
  onToggle,
  selectedIds,
  disabledIds,
  excludeIds,
  placeholder = 'Search by name or @username…',
  autoFocus = false,
  limit = 8,
  emptyHint = 'Try a different name or @username.',
  busyId = null,
}) => {
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => {
      setQuery('');
      setResults([]);
    },
  }));

  const { onlineUserIds } = useSocket();

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 300);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);

  const selectedSet = useMemo(
    () => new Set((selectedIds ?? []).map((id) => String(id))),
    [selectedIds],
  );
  const disabledSet = useMemo(
    () => new Set((disabledIds ?? []).map((id) => String(id))),
    [disabledIds],
  );
  const excludeSet = useMemo(
    () => new Set((excludeIds ?? []).map((id) => String(id))),
    [excludeIds],
  );

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setIsSearching(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setIsSearching(true);
    setError(null);

    (async () => {
      try {
        const response = await userService.searchUsers(debouncedQuery, { limit });
        if (cancelled) return;
        const items = response?.data?.users ?? [];
        setResults(items);
      } catch (err) {
        if (cancelled) return;
        setError(err);
        setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, limit]);

  const visibleResults = useMemo(
    () => results.filter((user) => !excludeSet.has(idOf(user))),
    [results, excludeSet],
  );

  const handleRowActivate = (user) => {
    const userId = idOf(user);
    if (disabledSet.has(userId)) return;
    if (busyId && String(busyId) === userId) return;

    if (mode === 'multi') {
      onToggle?.(user);
      return;
    }
    onSelect?.(user);
  };

  const renderListBody = () => {
    if (!debouncedQuery) {
      return (
        <p className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
          Start typing to find people.
        </p>
      );
    }
    if (isSearching) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Searching" />
        </div>
      );
    }
    if (error) {
      return (
        <p className="px-3 py-6 text-center text-xs text-red-600 dark:text-red-400">
          Search failed. Please try again.
        </p>
      );
    }
    if (visibleResults.length === 0) {
      return (
        <div className="px-3 py-6 text-center">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
            No users matched "{debouncedQuery}".
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{emptyHint}</p>
        </div>
      );
    }

    return (
      <ul role="listbox" className="space-y-0.5 py-1">
        {visibleResults.map((user) => {
          const userId = idOf(user);
          const isSelected = selectedSet.has(userId);
          const isDisabled = disabledSet.has(userId);
          const isBusy = busyId && String(busyId) === userId;
          const isOnline = onlineUserIds.has(userId);
          return (
            <li key={userId}>
              <button
                type="button"
                role="option"
                aria-selected={mode === 'multi' ? isSelected : undefined}
                disabled={isDisabled || isBusy}
                onClick={() => handleRowActivate(user)}
                className={clsx(
                  'group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
                  isSelected && 'bg-brand-50 dark:bg-brand-900/30',
                )}
              >
                <span className="relative shrink-0">
                  <Avatar
                    src={user.avatarUrl}
                    name={user.displayName || user.username}
                    size="md"
                  />
                  {isOnline ? (
                    <span className="absolute right-0 bottom-0">
                      <PresenceDot online size="sm" />
                    </span>
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {user.displayName || user.username}
                  </span>
                  {user.username ? (
                    <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                      @{user.username}
                    </span>
                  ) : null}
                </span>
                {mode === 'multi' ? (
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isSelected
                        ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-500'
                        : 'border-gray-300 group-hover:border-gray-400 dark:border-gray-600 dark:group-hover:border-gray-500',
                    )}
                  >
                    {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                ) : isBusy ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-gray-400"
                    aria-label="Opening"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="relative block px-5 pt-4">
        <span className="sr-only">Search users</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-7 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pr-9 pl-9 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:bg-gray-900"
          aria-label="Search users"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute top-1/2 right-7 -translate-y-1/2 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </label>

      <div className="scrollbar-thin min-h-56 flex-1 overflow-y-auto px-3 pt-2 pb-3">
        {renderListBody()}
      </div>
    </div>
  );
};

export default UserSearchInput;
