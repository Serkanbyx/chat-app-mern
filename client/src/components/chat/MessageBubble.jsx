import { memo, useMemo } from 'react';
import clsx from 'clsx';

import Avatar from '../common/Avatar.jsx';
import MessageStatusTicks from './MessageStatusTicks.jsx';
import { formatClockTime } from '../../utils/helpers.js';
import { linkifyText } from '../../utils/helpers.js';

/**
 * MessageBubble — render a single message row inside the timeline.
 *
 * STEP 27 baseline: handles text, image, system messages and the read /
 * sent / pending tick. STEP 29 will extend this file with edit/delete
 * affordances and reaction chips; the prop surface is stable so that
 * extension is purely additive.
 *
 * Inputs the parent (MessagesList) computes:
 *   - `isOwn`        — message is from the viewer (right-aligned)
 *   - `showAvatar`   — render avatar slot (false on grouped continuation
 *                      bubbles to keep visual rhythm tight)
 *   - `showName`     — render the sender's display name above the bubble
 *                      (groups only, only on the first bubble of a run)
 *   - `tickStatus`   — 'pending' | 'sent' | 'read' (only for `isOwn`,
 *                      already gated by the viewer's privacy preference)
 *   - `isGroup`      — viewing a group conversation; only then do we
 *                      surface sender display names on others' bubbles
 *
 * SECURITY:
 *   - Text is rendered as plain JSX children → React auto-escapes any
 *     `<` / `>` / `&` so inline HTML cannot execute.
 *   - URLs are tokenised by `linkifyText` which only emits `<a>` for
 *     `http(s)://` schemes; everything else stays as plain text.
 *   - Image messages render with `loading="lazy"` and
 *     `referrerPolicy="no-referrer"` so the recipient's session does
 *     not leak HTTP referers to image hosts.
 */

const SystemBubble = ({ message }) => (
  <div className="flex justify-center px-2 py-1">
    <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] italic text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
      {message.text || 'Conversation updated'}
    </span>
  </div>
);

const DeletedBubble = ({ isOwn }) => (
  <span
    className={clsx(
      'inline-flex items-center rounded-2xl px-3 py-2 text-sm italic',
      isOwn
        ? 'bg-brand-50 text-brand-500 dark:bg-brand-900/20 dark:text-brand-300'
        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    )}
  >
    This message was deleted
  </span>
);

/* React-friendly key for linkified tokens. We never use the token text
 * as a key by itself because two identical URLs in one message would
 * produce duplicate keys; index suffix solves that without losing the
 * stability React wants. */
const renderLinkified = (text) =>
  linkifyText(text).map((token, index) => {
    if (token.type === 'link') {
      return (
        <a
          key={`l-${index}`}
          href={token.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-all underline decoration-1 underline-offset-2 hover:opacity-80"
        >
          {token.label}
        </a>
      );
    }
    return <span key={`t-${index}`}>{token.value}</span>;
  });

const MessageBubble = ({
  message,
  isOwn = false,
  isGroup = false,
  showAvatar = true,
  showName = true,
  tickStatus = 'sent',
}) => {
  const isSystem = message?.type === 'system';
  const isDeleted = message?.deletedFor === 'everyone';
  const isImage = message?.type === 'image' && Boolean(message?.imageUrl);
  const senderName =
    message?.sender?.displayName || message?.sender?.username || 'Unknown';
  const time = formatClockTime(message?.createdAt);

  const bodyContent = useMemo(() => {
    if (isDeleted) return <DeletedBubble isOwn={isOwn} />;

    if (isImage) {
      return (
        <span
          className={clsx(
            'block overflow-hidden rounded-2xl',
            isOwn ? 'rounded-br-sm' : 'rounded-bl-sm',
          )}
        >
          <img
            src={message.imageUrl}
            alt={message.text || 'Shared image'}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="max-h-80 w-auto max-w-full object-cover"
          />
          {message.text ? (
            <span
              className={clsx(
                'block px-3 py-2 text-sm whitespace-pre-wrap wrap-break-word',
                isOwn
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
              )}
            >
              {renderLinkified(message.text)}
            </span>
          ) : null}
        </span>
      );
    }

    return (
      <span
        className={clsx(
          'inline-block max-w-full whitespace-pre-wrap wrap-break-word rounded-2xl px-3 py-2 text-sm shadow-sm',
          isOwn
            ? 'rounded-br-sm bg-brand-600 text-white'
            : 'rounded-bl-sm bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
        )}
      >
        {renderLinkified(message.text || '')}
      </span>
    );
  }, [isDeleted, isImage, isOwn, message]);

  if (isSystem) {
    return <SystemBubble message={message} />;
  }

  return (
    <div
      className={clsx(
        'flex w-full items-end gap-2 px-2',
        isOwn ? 'justify-end' : 'justify-start',
      )}
    >
      {!isOwn ? (
        <span className={clsx('w-8 shrink-0', !showAvatar && 'invisible')}>
          {showAvatar ? (
            <Avatar
              src={message?.sender?.avatarUrl}
              name={senderName}
              size="sm"
            />
          ) : null}
        </span>
      ) : null}

      <div
        className={clsx(
          'flex max-w-[75%] flex-col gap-0.5',
          isOwn ? 'items-end' : 'items-start',
        )}
      >
        {!isOwn && isGroup && showName ? (
          <span className="px-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
            {senderName}
          </span>
        ) : null}

        {bodyContent}

        <span
          className={clsx(
            'flex items-center gap-1 px-1 text-[10px] tabular-nums',
            isOwn ? 'flex-row-reverse text-gray-400 dark:text-gray-500' : 'text-gray-400 dark:text-gray-500',
          )}
        >
          {time ? <span>{time}</span> : null}
          {message?.editedAt && !isDeleted ? (
            <span className="italic">edited</span>
          ) : null}
          {isOwn && !isDeleted ? <MessageStatusTicks status={tickStatus} /> : null}
        </span>
      </div>
    </div>
  );
};

export default memo(MessageBubble);
