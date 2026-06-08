import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { usePlan, type Feature } from '../lib/usePlan';
import { useTheme } from './ThemeContext';

interface Props {
  feature:  Feature;
  children: React.ReactNode;
  upgradeTitle?: string;
  upgradeBody?:  string;
}

export function PlanGate({ feature, children, upgradeTitle, upgradeBody }: Props) {
  const { canUse } = usePlan();
  const { colors } = useTheme();

  if (canUse(feature)) return <>{children}</>;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: '#f59e0b' }]}>
      <Text style={styles.icon}>🏢</Text>
      <Text style={[styles.title, { color: colors.text }]}>
        {upgradeTitle ?? 'Enterprise Feature'}
      </Text>
      <Text style={[styles.body, { color: colors.subtext }]}>
        {upgradeBody ?? 'This feature is available on the Enterprise plan. Want to implement MJ Maps into your business?'}
      </Text>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: '#f59e0b' }]}
        onPress={() => router.push('/(auth)/plans')}
        accessibilityRole="button"
        accessibilityLabel="View Enterprise plan"
      >
        <Text style={styles.btnText}>Contact Us  →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 14, borderWidth: 1.5, padding: 20,
               alignItems: 'center', margin: 16 },
  icon:      { fontSize: 32, marginBottom: 8 },
  title:     { fontSize: 17, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  body:      { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  btn:       { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
});