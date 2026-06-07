/**
 * components/ShiftProgressBar.tsx
 * Portable progress bar used in both PRO and ENT tiers.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from './ThemeContext';

interface ShiftProgressBarProps {
  current:        number;
  total:         number;
  remainingLabel?: string;
}

export function ShiftProgressBar({ current, total, remainingLabel }: ShiftProgressBarProps) {
  const { colors } = useTheme();
  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: colors.green, width: `${pct}%` },
          ]}
        />
      </View>
      <Text style={[styles.label, { color: colors.subtext }]}>
        Stop {Math.min(current + 1, total)} of {total}
        {remainingLabel ? ` · ${remainingLabel} remaining` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8 },
  track:     { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill:      { height: '100%', borderRadius: 3 },
  label:     { fontSize: 12, marginTop: 6, fontWeight: '500' },
});