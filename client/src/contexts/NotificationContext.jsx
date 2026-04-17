import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import { useAuth } from './AuthContext.jsx';
import { useSocket } from './SocketContext.jsx';
import { usePreferences } from './PreferencesContext.jsx';
import { useNotificationPermission } from '../hooks/useNotificationPermission.js';
import * as notificationService from '../api/notification.service.js';
import { playNotificationSound } from '../utils/notificationSound.js';
import { NOTIFICATION_BUFFER_SIZE } from '../utils/constants.js';

/**
 * NotificationContext — turns the raw `notification:new` socket stream
 * into the things a user actually perceives:
 *   - the unread badge (`unreadCount`),
 *   - in-app toast,
 *   - native OS notification (when permission granted),
 *   - notification sound,
 *   - and a small in-memory ring buffer of the latest payloads.
 *
 * Suppression rules (matched on the client to avoid noise):
 *   1. If the user is currently looking at the source conversation, no
 *      surfacing happens — the message itself is already visible.
 *   2. If the user has globally muted notifications (`muteAll`) or
 *      muted this specific conversation (`mutedConversations`), no
 *      surfacing happens.
 *   3. Sound + browser notifications are individually gated by the
 *      respective preferences (`notifications.sound`,
 *      `notifications.browser`).
 *
 * The "active conversation" signal is exposed via
 * `setActiveConversationId` so the chat page can call it on mount and
 * `null` on unmount. Using a context method (not a global) keeps the
 * lifecycle bound to React and survives strict-mode double mounts.
 */

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const { subscribeToNotifications } = useSocket();
  const { preferences } = usePreferences();
  const { permission, request: requestPermission } = useNotificationPermission();

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);

  /* Refs mirror the latest state so the socket subscriber (registered
   * once per session) reads current values without us having to
   * resubscribe on every render. Without this, `preferences` updates
   * would cause the listener to be torn down + re-added — losing any
   * in-flight events in between. */
  const activeConversationRef = useRef(activeConversationId);
  const preferencesRef = useRef(preferences);
  const userRef = useRef(user);
  useEffect(() => { activeConversationRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { userRef.current = user; }, [user]);

  /* ---------- Hydrate unread count on login ----------
   * The badge needs the right number BEFORE the first socket event
   * arrives, otherwise it would render as zero on a fresh tab even
   * when the user has 12 unread items waiting. */
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      setNotifications([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await notificationService.getUnreadCount();
        if (cancelled) return;
        const count = result?.data?.count ?? 0;
        setUnreadCount(count);
      } catch {
        /* Non-fatal — the badge will hydrate from the next event. */
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  /* ---------- Subscribe to live notifications ---------- */
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const unsubscribe = subscribeToNotifications((payload) => {
      if (!payload) return;

      const conversationId = payload.conversationId ?? payload.notification?.conversationId;
      const fromUser = payload.fromUser ?? payload.notification?.actor;
      const message = payload.message;

      const currentPrefs = preferencesRef.current;
      const currentUser = userRef.current;
      const activeId = activeConversationRef.current;

      // Suppression rule 1: conversation is open.
      if (conversationId && conversationId === activeId) return;

      // Suppression rule 2: muted (global or per-conversation).
      if (currentPrefs?.notifications?.muteAll) return;
      const mutedList = currentUser?.mutedConversations ?? [];
      if (
        conversationId &&
        mutedList.some((id) => String(id) === String(conversationId))
      ) {
        return;
      }

      // Build a body string. Image-only messages have no `text`; show a
      // generic placeholder rather than an empty string.
      let body = message?.text || '';
      if (!body && message?.imageUrl) body = '📷 Photo';
      if (!body) body = 'New message';

      const title = fromUser?.displayName || 'New notification';

      // 1. Bump in-memory state.
      setUnreadCount((prev) => prev + 1);
      setNotifications((prev) => {
        const persisted = payload.notification ?? null;
        const entry = persisted ?? {
          _id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          conversationId,
          actor: fromUser ?? null,
          text: body,
          isRead: false,
          createdAt: new Date().toISOString(),
        };
        const next = [entry, ...prev];
        return next.length > NOTIFICATION_BUFFER_SIZE
          ? next.slice(0, NOTIFICATION_BUFFER_SIZE)
          : next;
      });

      // 2. Toast — always (cheap, in-app, can be visually muted via prefs.animations
      // through global CSS if needed).
      toast(`${title}: ${body}`, { icon: '💬' });

      // 3. Sound — gated.
      if (currentPrefs?.notifications?.sound) {
        playNotificationSound();
      }

      // 4. Native browser notification — gated + permission required.
      // `tag: conversationId` collapses repeated alerts from the same
      // chat into a single OS-level notification, so a long thread
      // doesn't spam the user's notification tray.
      if (
        currentPrefs?.notifications?.browser &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        try {
          const notif = new Notification(title, {
            body, // plain text — Notification API does NOT parse HTML
            icon: fromUser?.avatarUrl || '/favicon.svg',
            tag: conversationId || undefined,
          });
          // Clicking the OS notification surfaces the tab; we leave
          // routing to whoever wires this up at the app level.
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        } catch {
          /* Permission revoked between check and call, or quota hit. */
        }
      }
    });

    return unsubscribe;
  }, [isAuthenticated, subscribeToNotifications]);

  /* ---------- Imperative API for consumers ---------- */

  const markRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await notificationService.markRead(id);
    } catch (error) {
      // Re-fetch the count to repair drift on failure.
      try {
        const result = await notificationService.getUnreadCount();
        setUnreadCount(result?.data?.count ?? 0);
      } catch { /* swallow */ }
      throw error;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const previous = unreadCount;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await notificationService.markAllRead();
    } catch (error) {
      setUnreadCount(previous);
      throw error;
    }
  }, [unreadCount]);

  const value = useMemo(
    () => ({
      unreadCount,
      notifications,
      notificationPermission: permission,
      requestPermission,
      markRead,
      markAllRead,
      activeConversationId,
      setActiveConversationId,
    }),
    [unreadCount, notifications, permission, requestPermission, markRead, markAllRead, activeConversationId],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a <NotificationProvider>');
  }
  return ctx;
};

export default NotificationContext;
