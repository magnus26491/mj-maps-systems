import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useTheme } from '../../components/ThemeContext';

export default function PlansScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: '#030712' }]}
      contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.logo}>MJ Maps</Text>
        <Text style={styles.tagline}>The smarter way to deliver</Text>
      </View>

      {/* PRO CARD */}
      <View style={[styles.card, { borderColor: colors.green, borderWidth: 1.5 }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>✦ Pro</Text>
          <Text style={[styles.cardPrice, { color: colors.green }]}>£9.99/mo</Text>
        </View>
        <Text style={styles.cardSub}>14-day free trial · cancel anytime</Text>
        <View style={[styles.divider, { borderBottomColor: '#1f2937' }]} />
        {[
          'Plan your own routes with PAF postcode lookup',
          'CSV & manual stop import',
          'AI route optimisation',
          'Save & name routes for reuse',
          'In-app voice turn-by-turn navigation',
          'Vehicle & height/weight profile',
          'POD capture — photo, signature & barcode',
          'Offline-first — works without signal',
          'iOS Live Activity & Android notification',
          'Driving mode safety lock',
        ].map((feat, i) => (
          <View key={i} style={styles.featRow}>
            <Text style={[styles.featCheck, { color: colors.green }]}>✓</Text>
            <Text style={styles.featText}>{feat}</Text>
          </View>
        ))}
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: colors.green }]}
          onPress={() => router.push('/(auth)/register')}
          accessibilityRole="button"
          accessibilityLabel="Get started with Pro plan"
        >
          <Text style={styles.ctaBtnText}>Get Started  →</Text>
        </TouchableOpacity>
      </View>

      {/* ENTERPRISE CARD */}
      <View style={[styles.card, styles.enterpriseCard, { borderColor: '#f59e0b' }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🏢 Enterprise</Text>
          <Text style={[styles.cardPrice, { color: '#f59e0b' }]}>Custom</Text>
        </View>
        <Text style={styles.cardSub}>For fleet operators & courier businesses</Text>
        <View style={[styles.divider, { borderBottomColor: '#1f2937' }]} />
        {[
          'Everything in Pro',
          'Dispatcher web dashboard',
          'Automatic route assignment to drivers',
          'Real-time fleet tracking',
          'Fleet performance analytics',
          'Proof of delivery reporting & export',
          'Bulk stop upload (100s of stops)',
          'Time-window delivery slots',
          'Priority stop flagging',
          'Custom POD branding',
          'Multi-depot support',
          'Dedicated account manager',
        ].map((feat, i) => (
          <View key={i} style={styles.featRow}>
            <Text style={[styles.featCheck, { color: '#f59e0b' }]}>✓</Text>
            <Text style={styles.featText}>{feat}</Text>
          </View>
        ))}
        <TouchableOpacity
          style={styles.enterpriseBtn}
          onPress={() => Linking.openURL('mailto:hello@mjmaps.co.uk?subject=' + encodeURIComponent('MJ Maps Enterprise Enquiry'))}
          accessibilityRole="button"
          accessibilityLabel="Contact us about Enterprise plan"
        >
          <Text style={styles.enterpriseBtnText}>Contact Us  →</Text>
        </TouchableOpacity>
      </View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
          <Text style={[styles.footerLink, { color: colors.green }]}>Log In</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  header:            { alignItems: 'center', marginBottom: 32 },
  logo:              { fontSize: 32, fontWeight: '800', color: '#f9fafb', marginBottom: 4 },
  tagline:           { fontSize: 15, color: '#9ca3af' },
  card:              { backgroundColor: '#111827', borderRadius: 16, padding: 20,
                       marginHorizontal: 16, marginBottom: 16 },
  enterpriseCard:    { marginTop: 0 },
  cardHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle:         { fontSize: 20, fontWeight: '800', color: '#f9fafb' },
  cardPrice:         { fontSize: 16, fontWeight: '700' },
  cardSub:           { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  divider:           { borderBottomWidth: 1, marginVertical: 12 },
  featRow:           { flexDirection: 'row', gap: 8, marginBottom: 8 },
  featCheck:         { fontSize: 14, fontWeight: '700' },
  featText:          { fontSize: 14, color: '#f9fafb', flex: 1 },
  ctaBtn:            { height: 56, borderRadius: 12, justifyContent: 'center',
                       alignItems: 'center', marginTop: 8 },
  ctaBtnText:        { color: '#fff', fontSize: 17, fontWeight: '800' },
  enterpriseBtn:     { height: 56, borderRadius: 12, justifyContent: 'center',
                       alignItems: 'center', marginTop: 8,
                       borderWidth: 1.5, borderColor: '#f59e0b' },
  enterpriseBtnText:  { color: '#f59e0b', fontSize: 17, fontWeight: '800' },
  footer:            { alignItems: 'center', paddingVertical: 24 },
  footerText:        { fontSize: 14, color: '#9ca3af' },
  footerLink:        { fontWeight: '700', fontSize: 15, marginTop: 8 },
});