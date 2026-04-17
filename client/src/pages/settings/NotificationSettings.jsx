import { useState } from 'react';
import { Bell, BellOff, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';

import ToggleSwitch from '../../components/common/ToggleSwitch.jsx';
import { useNotifications } from '../../contexts/NotificationContext.jsx';
import { usePreferences } from '../../contexts/PreferencesContext.jsx';
import { playNotificationSound } from '../../utils/notificationSound.js';

/**
 * NotificationSettings — browser notifications, sound, master mute.
 *
 * SECURITY / UX rules (mirrors STEP 31 spec):
 *   - The browser permission prompt is GATED behind an explicit user
 *     toggle. Calling `Notification.requestPermission()` on app load
 *     would burn the one-time prompt slot and land the user in
 *     "denied" forever on most browsers. We only ask when the user
 *     flips the switch on.
 *   - The "Send test notification" button is only shown when the
 *     permission is already granted, so a click can never silently
 *     turn into a permission prompt the user didn't expect.
 *   - The master mute (`muteAll`) does NOT toggle the underlying
 *     browser/sound prefs — it's an orthogonal kill switch. Re-enabling
 *     it later restores the user's previous fine-grained choices.
 */

const NotificationSettings = () => {
  const { preferences, updatePreference } = usePreferences();
  const { notificationPermission, requestPermission } = useNotifications();
  const [pending, setPending] = useState(null);

  const browserEnabled = preferences.notifications?.browser !== false;
  const soundEnabled = preferences.notifications?.sound !== false;
  const muteAll = preferences.notifications?.muteAll === true;

  const handleSavePref = async (path, value) => {
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

  const handleBrowserToggle = async (next) => {
    if (next && notificationPermission !== 'granted') {
      if (notificationPermission === 'unsupported') {
        toast.error('Your browser does not support notifications.');
        return;
      }
      const result = await requestPermission();
      if (result !== 'granted') {
        toast.error(
          'Permission denied. Update browser settings to enable notifications.',
        );
        return;
      }
    }
    await handleSavePref('notifications.browser', next);
  };

  const handleTestNotification = () => {
    if (notificationPermission !== 'granted') return;
    try {
      const notif = new Notification('Test notification', {
        body: 'If you can see this, browser notifications are working.',
        icon: '/favicon.svg',
        tag: 'chat-app-test',
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      if (soundEnabled) {
        playNotificationSound();
      }
    } catch {
      toast.error('Could not show test notification.');
    }
  };

  const permissionHint = (() => {
    switch (notificationPermission) {
      case 'denied':
        return 'Notifications are blocked at the browser level. Update your site permissions to re-enable.';
      case 'unsupported':
        return 'Your browser does not support notifications.';
      case 'granted':
        return 'Permission granted.';
      default:
        return 'You\u2019ll be asked for permission when you turn this on.';
    }
  })();

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Notifications
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Decide how the app reaches out to you. Per-conversation muting
          is available from each conversation header.
        </p>
      </header>

      {/* Master mute */}
      <section
        className={`rounded-xl border p-4 ${
          muteAll
            ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20'
            : 'border-gray-200 dark:border-gray-800'
        }`}
      >
        <ToggleSwitch
          label="Mute all notifications"
          description="Master kill switch. Stops every toast, sound and browser alert. Per-app preferences below stay remembered."
          checked={muteAll}
          onChange={(next) => handleSavePref('notifications.muteAll', next)}
          disabled={pending === 'notifications.muteAll'}
        />
        {muteAll ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <BellOff className="h-3 w-3" aria-hidden="true" />
            <span>All notifications are currently muted.</span>
          </p>
        ) : null}
      </section>

      {/* Browser */}
      <section className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-start gap-2">
          <Bell className="mt-0.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <div className="flex-1">
            <ToggleSwitch
              label="Browser notifications"
              description="Show native OS notifications when the app is in the background."
              checked={browserEnabled && notificationPermission === 'granted'}
              onChange={handleBrowserToggle}
              disabled={
                muteAll ||
                pending === 'notifications.browser' ||
                notificationPermission === 'unsupported' ||
                notificationPermission === 'denied'
              }
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {permissionHint}
            </p>

            {notificationPermission === 'granted' && browserEnabled ? (
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={muteAll}
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Send test notification</span>
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Sound */}
      <section className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-start gap-2">
          <Volume2 className="mt-0.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <div className="flex-1">
            <ToggleSwitch
              label="Sound"
              description="Play a short cue when a new message arrives."
              checked={soundEnabled}
              onChange={(next) => handleSavePref('notifications.sound', next)}
              disabled={muteAll || pending === 'notifications.sound'}
            />
          </div>
        </div>
      </section>
    </div>
  );
};

export default NotificationSettings;
