/**
 * components/PlanGate.tsx
 * Blocks feature access for free-tier users with a premium cartographic-styled upgrade prompt.
 * Uses exact design tokens from packages/design-tokens.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { router } from 'expo-router';
import { usePlan, type Feature } from '../lib/usePlan';

// ── Design tokens (mirrors packages/design-tokens) ─────────────────────────────
const T = {
  teal:       '#00C2A8',
  tealBright: '#00E8D4',
  tealDim:    '#006B5F',
  green:      '#10B981',
  amber:      '#F59E0B',
  red:        '#EF4444',
  surface:    '#12151B',
  surfaceAlt: '#1A1F26',
  text:       '#F1F5F9',
  subtext:    '#94A3B8',
  muted:      '#64748B',
  border:     '#334155',
  elevation:  '0 2px 8px rgb(0 0 0 / 0.30)',
};

interface Props {
  feature:       Feature;
  children:      React.ReactNode;
  upgradeTitle?: string;
  upgradeBody?:  string;
}

/** Icon SVG: upgrade arrow in a circle */
function UpgradeIcon({ color }: { color: string }) {
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.iconCircle, { borderColor: color }]}>
        {/* Arrow up icon — inline SVG via View composition */}
        <View style={{ width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 12, height: 12, borderRightWidth: 2, borderTopWidth: 2,
                        borderColor: color, transform: [{ rotate: '-45deg' }] }} />
          <View style={{ width: 2, height: 8, backgroundColor: color, marginTop: -2 }} />
        </View>
      </View>
    </View>
  );
}

export function PlanGate({ feature, children, upgradeTitle, upgradeBody }: Props) {
  const { canUse } = usePlan();

  if (canUse(feature)) return <>{children}</>;

  const handleUpgrade = () => {
    // If on driver app, route to in-app plans; otherwise open landing
    if (typeof router !== 'undefined') {
      router.push('/(auth)/plans');
    } else {
      Linking.openURL('/pricing');
    }
  };

  return (
    <View style={[styles.container, {
      backgroundColor: T.surface,
      borderColor: T.amber,
      shadowColor: T.amber,
      shadowOpacity: 0.15,
    }]}>
      <UpgradeIcon color={T.amber} />

      <Text style={[styles.title, { color: T.text }]}>
        {upgradeTitle ?? 'Upgrade to unlock'}
      </Text>

      <Text style={[styles.body, { color: T.subtext }]}>
        {upgradeBody ?? 'This feature is available on the Driver Pro plan. Upgrade to access it — cancel anytime, no auto-renew surprises.'}
      </Text>

      {/* Feature badge */}
      <View style={[styles.badge, { backgroundColor: `${T.amber}20`, borderColor: `${T.amber}40` }]}>
        <Text style={[styles.badgeText, { color: T.amber }]}>
          {feature.replace(/_/g, ' ')}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: T.teal }]}
        onPress={handleUpgrade}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="View Driver Pro plan"
      >
        <Text style={styles.btnText}>View plans</Text>
        <View style={styles.btnArrow}>
          <View style={{ width: 6, height: 6, borderRightWidth: 2, borderTopWidth: 2,
                        borderColor: '#fff', transform: [{ rotate: '45deg' }] }} />
        </View>
      </TouchableOpacity>

      <Text style={[styles.footer, { color: T.muted }]}>
        Cancel anytime · VAT inclusive pricing
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    margin: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 4,
  },
  iconWrap: { marginBottom: 12 },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
  },
  btnArrow: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    fontSize: 12,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
});