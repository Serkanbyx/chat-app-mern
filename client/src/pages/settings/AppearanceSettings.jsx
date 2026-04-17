import { useState } from 'react';
import {
  AlignJustify,
  LayoutList,
  Monitor,
  Moon,
  Sun,
  Type,
} from 'lucide-react';
import toast from 'react-hot-toast';

import SelectableCard from '../../components/common/SelectableCard.jsx';
import ToggleSwitch from '../../components/common/ToggleSwitch.jsx';
import { usePreferences } from '../../contexts/PreferencesContext.jsx';

/**
 * AppearanceSettings — theme, font size, density and animations.
 *
 * Why every change auto-saves:
 *   - The Settings tree generally distinguishes "compose then save"
 *     (Profile, Account) from "tweak and see" (Appearance, Notifications,
 *     Privacy). Appearance is firmly in the second bucket — toggling
 *     dark mode and waiting for an explicit Save would feel broken.
 *   - PreferencesContext already does optimistic update + rollback on
 *     failure, so we don't need a save button OR a spinner per row.
 */

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', description: 'Always use the light theme.', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Always use the dark theme.', icon: Moon },
  {
    value: 'system',
    label: 'System',
    description: 'Match your operating system.',
    icon: Monitor,
  },
];

const FONT_SIZE_OPTIONS = [
  { value: 'sm', label: 'Small', description: '14 px base font.' },
  { value: 'md', label: 'Medium', description: '16 px base font.' },
  { value: 'lg', label: 'Large', description: '18 px base font.' },
];

const DENSITY_OPTIONS = [
  {
    value: 'comfortable',
    label: 'Comfortable',
    description: 'Roomier spacing in lists.',
    icon: LayoutList,
  },
  {
    value: 'compact',
    label: 'Compact',
    description: 'Show more on screen.',
    icon: AlignJustify,
  },
];

const AppearanceSettings = () => {
  const { preferences, updatePreference } = usePreferences();
  const [pending, setPending] = useState(null);

  const handleChange = async (path, value) => {
    if (pending === path) return;
    setPending(path);
    try {
      await updatePreference(path, value);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        'Could not save your preference. Please try again.';
      toast.error(message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Appearance
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Personalise how the app looks. Changes apply instantly.
        </p>
      </header>

      <SettingGroup
        title="Theme"
        description="Choose between a light, dark or system-matched colour scheme."
      >
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => (
            <SelectableCard
              key={option.value}
              selected={preferences.theme === option.value}
              onSelect={() => handleChange('theme', option.value)}
              disabled={pending === 'theme'}
              title={option.label}
              description={option.description}
              icon={option.icon}
            />
          ))}
        </div>
      </SettingGroup>

      <SettingGroup
        title="Font size"
        description="Make in-app text easier on the eyes."
      >
        <div role="radiogroup" aria-label="Font size" className="grid gap-3 sm:grid-cols-3">
          {FONT_SIZE_OPTIONS.map((option) => (
            <SelectableCard
              key={option.value}
              selected={preferences.fontSize === option.value}
              onSelect={() => handleChange('fontSize', option.value)}
              disabled={pending === 'fontSize'}
              title={option.label}
              description={option.description}
              icon={Type}
            />
          ))}
        </div>
      </SettingGroup>

      <SettingGroup
        title="Density"
        description="How tightly content packs into lists and conversation rows."
      >
        <div role="radiogroup" aria-label="Density" className="grid gap-3 sm:grid-cols-2">
          {DENSITY_OPTIONS.map((option) => (
            <SelectableCard
              key={option.value}
              selected={preferences.contentDensity === option.value}
              onSelect={() => handleChange('contentDensity', option.value)}
              disabled={pending === 'contentDensity'}
              title={option.label}
              description={option.description}
              icon={option.icon}
            />
          ))}
        </div>
      </SettingGroup>

      <SettingGroup title="Motion">
        <ToggleSwitch
          label="Animations"
          description="Disable to reduce motion across the app. Your OS reduce-motion setting is always respected."
          checked={preferences.animations !== false}
          onChange={(next) => handleChange('animations', next)}
          disabled={pending === 'animations'}
        />
      </SettingGroup>
    </div>
  );
};

const SettingGroup = ({ title, description, children }) => (
  <section className="space-y-3">
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {description ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      ) : null}
    </div>
    {children}
  </section>
);

export default AppearanceSettings;
