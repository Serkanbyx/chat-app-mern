import { memo } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { BellOff, Image as ImageIcon, Users } from 'lucide-react';

import Avatar from '../common/Avatar.jsx';
import PresenceDot from './PresenceDot.jsx';
import UnreadBadge from './UnreadBadge.jsx';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

/**
 * ConversationListItem — a single row inside the sidebar list.
 *
 * The component is intentionally presentational: it derives nothing
 * from contexts and does not call APIs. The parent (`Sidebar`) hands
 * down everything it needs to render — including the resolved "other
 * participant" for direct chats — so this row stays trivially testable
 * and `React.memo` works without bespoke comparators.
 *
 * Rendering rules:
 *  - Direct conversations show the other participant's avatar +
 *    presence dot. Group conversations show the group avatar + a tiny
 *    multi-user glyph in place of the dot.
 *  - The preview line falls back to "Photo" / "New conversation" /
 *    italicised system snippet so we never render an empty row.
 *  - The active row gets a brand-tinted background; unread rows get
 *    bolder text. The two states are independent — an unread row that
 *    is also active stays bold AND highlighted.
 */

const buildPreview = (conversation) => {
  const last = conversation?.lastMessage;
  if (!last) return { text: 'New conversation', isSystem: false, isImage: false };

  if (last.type === 'system') {
    return { text: last.text || 'Conversation updated', isSystem: true, isImage: false };
  }

  if (!last.text && last.type === 'image') {
    return { text: 'Photo', isSystem: false, isImage: true };
  }

  return { text: last.text || '', isSystem: false, isImage: false };
};

const ConversationListItem = ({
  conversation,
  to,
  isActive,
  isMuted,
  otherParticipant,
  isGroup,
  isOnline,
  unreadCount,
  onClick,
}) => {
  const displayName = isGroup
    ? conversation.name || 'Untitled group'
    : otherParticipant?.displayName || otherParticipant?.username || 'Unknown user';

  const avatarSrc = isGroup ? conversation.avatarUrl : otherParticipant?.avatarUrl;
  const preview = buildPreview(conversation);
  const time = formatRelativeTime(conversation.updatedAt ?? conversation.lastMessage?.createdAt);
  const showPresenceDot = !isGroup && Boolean(otherParticipant) && isOnline;
  const hasUnread = Number(unreadCount) > 0;

  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      className={clsx(
        'group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
        isActive
          ? 'bg-brand-50 dark:bg-brand-900/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800',
      )}
    >
      <span className="relative shrink-0">
        <Avatar src={avatarSrc} name={displayName} size="md" />
        {showPresenceDot ? (
          <span className="absolute right-0 bottom-0">
            <PresenceDot online size="sm" />
          </span>
        ) : null}
        {isGroup ? (
          <span className="absolute -right-1 -bottom-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-gray-600 ring-2 ring-white dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-900">
            <Users className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        ) : null}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center justify-between gap-2">
          <span
            className={clsx(
              'truncate text-sm',
              hasUnread
                ? 'font-semibold text-gray-900 dark:text-white'
                : 'font-medium text-gray-800 dark:text-gray-100',
            )}
          >
            {displayName}
          </span>
          {time ? (
            <span
              className={clsx(
                'shrink-0 text-[11px] tabular-nums',
                hasUnread
                  ? 'font-semibold text-brand-600 dark:text-brand-300'
                  : 'text-gray-400 dark:text-gray-500',
              )}
            >
              {time}
            </span>
          ) : null}
        </span>

        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={clsx(
              'flex min-w-0 items-center gap-1 truncate text-xs',
              preview.isSystem && 'italic',
              hasUnread
                ? 'font-medium text-gray-700 dark:text-gray-200'
                : 'text-gray-500 dark:text-gray-400',
            )}
          >
            {preview.isImage ? (
              <ImageIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : null}
            <span className="truncate">{preview.text}</span>
          </span>

          <span className="flex shrink-0 items-center gap-1">
            {isMuted ? (
              <BellOff
                className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500"
                aria-label="Muted"
              />
            ) : null}
            {hasUnread ? <UnreadBadge count={unreadCount} /> : null}
          </span>
        </span>
      </span>
    </Link>
  );
};

export default memo(ConversationListItem);
