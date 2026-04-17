import { useState } from 'react';
import { Eye, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

import ToggleSwitch from '../../components/common/ToggleSwitch.jsx';
import { usePreferences } from '../../contexts/PreferencesContext.jsx';

/**
 * PrivacySettings — visibility-affecting toggles.
 *
 * Both toggles are server-enforced (not just UI tricks):
 *   - `showOnlineStatus=false` masks `isOnline` and `lastSeenAt` in
 *     EVERY public projection (`getPublicProfile`, search results,
 *     conversation participant payloads). The client doesn't need to
 *     do anything special — the server simply stops shipping the data.
 *   - `showReadReceipts=false` is consumed by the message read-receipt
 *     pipeline so the user's reads don't generate `readBy` events that
 *     could be observed by the sender.
 *
 * No reload is needed after a flip; the next request naturally carries
 * the new behaviour.
 */

const PrivacySettings = () => {
  const { preferences, updatePreference } = usePreferences();
  const [pending, setPending] = useState(null);

  const handleChange = async (path, value) => {
    if (pending === path) return;
    setPending(path);
    try {
      await updatePreference(path, value);
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Could not save your preference.';
      toast.error(message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Privacy
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Control what other people can see about your activity.
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-start gap-2">
          <Eye className="mt-0.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <div className="flex-1">
            <ToggleSwitch
              label="Show online status"
              description={'When off, other users always see you as offline and your \u201Clast seen\u201D time is hidden.'}
              checked={preferences.showOnlineStatus !== false}
              onChange={(next) => handleChange('showOnlineStatus', next)}
              disabled={pending === 'showOnlineStatus'}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <div className="flex-1">
            <ToggleSwitch
              label="Send read receipts"
              description="When off, the people who message you won't see when you've read their messages. You also won't see read receipts for theirs."
              checked={preferences.showReadReceipts !== false}
              onChange={(next) => handleChange('showReadReceipts', next)}
              disabled={pending === 'showReadReceipts'}
            />
          </div>
        </div>
      </section>
    </div>
  );
};

export default PrivacySettings;
