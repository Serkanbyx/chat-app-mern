import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

import { useAuth } from './AuthContext.jsx';

/**
 * SocketContext — owns the *single* Socket.io client instance and the
 * derived state every chat surface listens to (online users, typing
 * indicators, raw notification stream).
 *
 * Architecture rules enforced here:
 *   - Exactly ONE socket per browser tab. No component may call
 *     `io()` directly; everything goes through this context. This is
 *     why a duplicate connection cannot occur even if multiple
 *     features mount simultaneously.
 *   - The connection lifecycle is bound to `token` from AuthContext.
 *     Login → connect; logout (token=null) → disconnect. There is no
 *     "manual" connect API exposed to consumers.
 *   - Reconnection is capped (5 attempts) so an unauthorised token
 *     can't loop forever and DDoS our own server with handshake
 *     attempts.
 *
 * Why `Set`/`Map` are wrapped in fresh instances on every update:
 *   React's reference equality bail-out skips re-renders when we
 *   mutate the same Set in place. Allocating a new Set on each
 *   transition costs ~O(n) but n is bounded by the user's
 *   conversation count, and the alternative (custom shouldUpdate
 *   logic in every consumer) is far worse for maintainability.
 */

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

/* Helper: shallow-clone a Set with one element added/removed. */
const setWith = (prev, value) => {
  const next = new Set(prev);
  next.add(value);
  return next;
};
const setWithout = (prev, value) => {
  const next = new Set(prev);
  next.delete(value);
  return next;
};

export const SocketProvider = ({ children }) => {
  const { token, logout } = useAuth();

  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  /* `onlineUserIds` is the union of every user the server has marked
   * online for any conversation we participate in. Components render
   * the green dot by checking `onlineUserIds.has(otherUserId)`. */
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());

  /* `typingByConversation` maps conversationId → Set<userId>. Using a
   * Map (not nested object) preserves insertion order and works well
   * with React's `===` comparison when we replace the whole Map. */
  const [typingByConversation, setTypingByConversation] = useState(() => new Map());

  /**
   * Fan-out registry for `notification:new`. NotificationContext
   * subscribes via `subscribeToNotifications` instead of attaching a
   * listener to the live socket directly — that way, if the socket is
   * recreated (token rotated), subscribers don't have to re-bind.
   */
  const notificationSubscribersRef = useRef(new Set());

  const subscribeToNotifications = useCallback((handler) => {
    notificationSubscribersRef.current.add(handler);
    return () => {
      notificationSubscribersRef.current.delete(handler);
    };
  }, []);

  /* Mirror the live socket in a ref so the `emit` helper stays
   * referentially stable across renders — consumers can list it in
   * effect dependency arrays without churning. */
  const socketRef = useRef(null);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  /**
   * Safe emit wrapper. Drops the call if we're disconnected so a UI
   * action mid-reconnect doesn't blow up. Returns `true` when the
   * event was dispatched, `false` when it was suppressed — callers
   * that need delivery guarantees (e.g. send-message) should fall
   * back to the REST layer on `false`.
   */
  const emit = useCallback((event, payload, ack) => {
    const live = socketRef.current;
    if (!live || !live.connected) return false;
    if (typeof ack === 'function') {
      live.emit(event, payload, ack);
    } else {
      live.emit(event, payload);
    }
    return true;
  }, []);

  /* ---------- Connection lifecycle ---------- */
  useEffect(() => {
    // No token → ensure no socket.
    if (!token) {
      setSocket(null);
      setIsConnected(false);
      setOnlineUserIds(new Set());
      setTypingByConversation(new Map());
      return undefined;
    }

    if (!SOCKET_URL) {
      console.warn('[SocketContext] VITE_SOCKET_URL is not set; sockets disabled.');
      return undefined;
    }

    const instance = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      // Auto-connects by default; we keep that so the first frame
      // after login attempts the handshake immediately.
    });

    /* ---------- Connection state ---------- */
    instance.on('connect', () => {
      setIsConnected(true);
    });

    instance.on('disconnect', (reason) => {
      setIsConnected(false);
      // Server-side forced disconnects (`io server disconnect`) won't
      // auto-reconnect; the most common cause is an admin suspending
      // this user. Treat it as a logout so the UI doesn't hang on a
      // ghost socket.
      if (reason === 'io server disconnect') {
        toast.error('Your session has ended.');
        logout();
      }
    });

    instance.on('connect_error', (err) => {
      // Auth failures arrive here; bouncing them through `logout`
      // clears the bad token instead of letting Socket.io retry it
      // five times with the same credentials.
      const message = err?.message || '';
      if (message === 'Unauthorized') {
        toast.error('Session expired. Please log in again.');
        logout();
      } else if (!isConnected) {
        // Transient: don't toast on every retry — only the first.
        // (We rely on isConnected starting `false` here.)
      }
    });

    /* ---------- Presence ---------- */
    instance.on('userOnline', ({ userId }) => {
      if (!userId) return;
      setOnlineUserIds((prev) => setWith(prev, String(userId)));
    });

    instance.on('userOffline', ({ userId }) => {
      if (!userId) return;
      setOnlineUserIds((prev) => setWithout(prev, String(userId)));
    });

    /* ---------- Typing indicators ----------
     * We replace the Map (not the inner Set) reference on each event
     * so consumers selecting `typingByConversation.get(id)` see a new
     * Set and re-render. */
    instance.on('typing:start', ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      setTypingByConversation((prev) => {
        const next = new Map(prev);
        const inner = new Set(next.get(conversationId) ?? []);
        inner.add(String(userId));
        next.set(conversationId, inner);
        return next;
      });
    });

    instance.on('typing:stop', ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      setTypingByConversation((prev) => {
        const inner = prev.get(conversationId);
        if (!inner) return prev;
        const nextInner = new Set(inner);
        nextInner.delete(String(userId));
        const next = new Map(prev);
        if (nextInner.size === 0) {
          next.delete(conversationId);
        } else {
          next.set(conversationId, nextInner);
        }
        return next;
      });
    });

    /* ---------- Notifications fan-out ----------
     * We do not call `playSound` / `new Notification(...)` here —
     * that's NotificationContext's job. SocketContext is only the
     * transport. Keeping presentation out of the transport means we
     * can swap to (e.g.) push notifications without touching this
     * file. */
    instance.on('notification:new', (payload) => {
      notificationSubscribersRef.current.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          // One bad subscriber must not silence the others.
          if (import.meta.env.DEV) {
            console.warn('[SocketContext] notification subscriber threw:', err);
          }
        }
      });
    });

    setSocket(instance);

    return () => {
      // Detach all listeners first so React strict-mode double-mount
      // in dev doesn't double-fire while the new instance is wiring up.
      instance.removeAllListeners();
      instance.disconnect();
      setSocket(null);
      setIsConnected(false);
      setOnlineUserIds(new Set());
      setTypingByConversation(new Map());
    };
    // `logout` is stable from AuthContext (useCallback). `isConnected`
    // is intentionally excluded — we read it inside the handler but
    // don't want to recreate the socket every time it flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, logout]);

  const value = useMemo(
    () => ({
      socket,
      isConnected,
      onlineUserIds,
      typingByConversation,
      emit,
      subscribeToNotifications,
    }),
    [socket, isConnected, onlineUserIds, typingByConversation, emit, subscribeToNotifications],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within a <SocketProvider>');
  }
  return ctx;
};

export default SocketContext;
