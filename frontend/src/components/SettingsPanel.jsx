/**
 * Settings Panel - Feature flags and accessibility options
 */
import { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Switch,
  Stack,
  Group,
  Badge,
  ActionIcon,
  Divider,
  Select,
  Transition,
} from '@mantine/core';
import { getFeatureFlags, setFeatureFlag, resetFeatureFlags } from '../config/featureFlags';
import { getPaletteOptions } from '../config/colourPalettes';

export function SettingsPanel({ isOpen, onClose, onPaletteChange, currentPalette }) {
  const [flags, setFlags] = useState(getFeatureFlags());

  // Refresh flags when panel opens
  useEffect(() => {
    if (isOpen) {
      setFlags(getFeatureFlags());
    }
  }, [isOpen]);

  const handleFlagChange = (key, value) => {
    const updated = setFeatureFlag(key, value);
    setFlags(updated);
  };

  const handleReset = () => {
    const defaults = resetFeatureFlags();
    setFlags(defaults);
  };

  const paletteOptions = getPaletteOptions();

  return (
    <Transition mounted={isOpen} transition="slide-left" duration={200}>
      {(styles) => (
        <Paper
          shadow="xl"
          p="md"
          radius="md"
          style={{
            ...styles,
            position: 'absolute',
            top: 20,
            right: 380, // Position to the left of Tech Info panel
            background: 'rgba(26, 26, 46, 0.98)',
            backdropFilter: 'blur(20px)',
            width: 280,
            zIndex: 1001,
            border: '1px solid rgba(79, 209, 197, 0.3)',
          }}
        >
          {/* Header */}
          <Group justify="space-between" mb="md">
            <Group gap={8}>
              <Text size="sm" fw={700} c="cyan">Settings</Text>
              <Badge size="xs" color="teal" variant="light">Beta</Badge>
            </Group>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={onClose}
              aria-label="Close settings"
            >
              <Text size="xs">✕</Text>
            </ActionIcon>
          </Group>

          <Stack gap="md">
            {/* Feature Flags Section */}
            <div>
              <Text size="xs" fw={600} c="dimmed" mb={8} tt="uppercase" style={{ letterSpacing: 1 }}>
                Experimental Features
              </Text>

              <Stack gap="xs">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="white">3D Globe View</Text>
                    <Text size="xs" c="dimmed">Auto-rotating globe visualisation</Text>
                  </div>
                  <Switch
                    checked={flags.enableGlobe}
                    onChange={(e) => handleFlagChange('enableGlobe', e.currentTarget.checked)}
                    color="cyan"
                    size="sm"
                    aria-label="Toggle globe view feature"
                  />
                </Group>

                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="white">Region Computation</Text>
                    <Text size="xs" c="dimmed">Draw regions to compute mean values</Text>
                  </div>
                  <Switch
                    checked={flags.enableComputation}
                    onChange={(e) => handleFlagChange('enableComputation', e.currentTarget.checked)}
                    color="cyan"
                    size="sm"
                    aria-label="Toggle region computation feature"
                  />
                </Group>

                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="white">Accessibility Mode</Text>
                    <Text size="xs" c="dimmed">Enhanced keyboard nav & ARIA</Text>
                  </div>
                  <Switch
                    checked={flags.enableAccessibility}
                    onChange={(e) => handleFlagChange('enableAccessibility', e.currentTarget.checked)}
                    color="cyan"
                    size="sm"
                    aria-label="Toggle accessibility features"
                  />
                </Group>
              </Stack>
            </div>

            <Divider color="rgba(79, 209, 197, 0.2)" />

            {/* Colour Palette Section */}
            <div>
              <Text size="xs" fw={600} c="dimmed" mb={8} tt="uppercase" style={{ letterSpacing: 1 }}>
                Colour Accessibility
              </Text>

              <Select
                label="Colour Palette"
                size="xs"
                value={currentPalette || 'default'}
                onChange={onPaletteChange}
                data={paletteOptions}
                styles={{
                  input: { background: 'rgba(255,255,255,0.05)' },
                  dropdown: { zIndex: 10002 }
                }}
                comboboxProps={{ zIndex: 10002 }}
              />

              <Text size="xs" c="dimmed" mt={4} style={{ fontStyle: 'italic' }}>
                Viridis and Cividis are optimised for colour vision deficiency
              </Text>
            </div>

            <Divider color="rgba(79, 209, 197, 0.2)" />

            {/* Reset Button */}
            <Group justify="flex-end">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={handleReset}
                aria-label="Reset all settings to defaults"
              >
                <Text size="xs">Reset to Defaults</Text>
              </ActionIcon>
            </Group>
          </Stack>
        </Paper>
      )}
    </Transition>
  );
}

export default SettingsPanel;
