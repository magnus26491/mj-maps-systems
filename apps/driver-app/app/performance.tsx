/**
 * app/performance.tsx
 *
 * Driver Performance Summary — Savings + Coaching Insights.
 *
 * Shows:
 *   - 30-day rolling savings summary (time, fuel, risky turns avoided)
 *   - Coaching insights summary (trend, fleet comparison)
 *   - Pro/Enterprise gated — free users see upgrade prompt
 *
 * Access: accessible from HUD (button) or bottom nav.
 * Auth: uses useAuthStore() for driver ID.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '../lib/auth';
import { useTheme } from '../components/ThemeContext';
import { apiGetSavingsSummary, apiGetInsightsSummary, type SavingsMetrics, type InsightsSummary } from '../lib/api';

const TEAL      = '#00C2A8';
const TEAL_BRIGHT = '#00E8D4';
const GREEN     = '#10B981';
const AMBER     = '#F59E0B';
const RED       = '#EF4444';
const BG        = '#0A0C10';
const SURFACE1  = '#12151B';
const SURFACE2  = '#1A1F26';
const TEXT1     = '#F1F5F9';
const TEXT2     = '#94A3B8';
const TEXT3     = '#64748B';
const BORDER    = '#334155';

// ── Pro Gate ─────────────────────────────────────────────────────────────────

function UpgradePrompt({ feature }: { feature: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.upgradeCard}>
      <View style={styles.upgradeIcon}>
        <Text style={styles.upgradeIconText}>⭐</Text>
      </View>
      <Text style={[styles.upgradeTitle, { color: TEAL }]}>
        {feature} — Pro or Enterprise
      </Text>
      <Text style={[styles.upgradeBody, { color: TEXT2 }]}>
        Performance insights are available on Driver Pro (£9.99/month) and Enterprise plans.
        Track your time saved, fuel saved, and turn-score coaching — all in one place.
      </Text>
      <TouchableOpacity
        style={styles.upgradeBtn}
        onPress={() => router.push('/plans')}
      >
        <Text style={styles.upgradeBtnText}>View plans →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Metric Card ────────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, accent }: {
  label: string; value: number | string; unit?: string; accent?: string;
}) {
  const col = accent ?? TEAL;
  return (
    <View style={[styles.metricCard, { borderColor: `${col}30`, backgroundColor: `${col}08` }]}>
      <Text style={[styles.metricValue, { color: col }]}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <Text style={styles.metricUnit}> {unit}</Text>}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// ── Trend Badge ────────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: string }) {
  const cfg: Record<string, { icon: string; label: string; color: string }> = {
    improving: { icon: '↑', label: 'Improving', color: GREEN },
    stable:    { icon: '→', label: 'Stable',   color: TEXT3 },
    declining: { icon: '↓', label: 'Declining', color: RED },
  };
  const c = cfg[trend] ?? cfg.stable;
  return (
    <View style={[styles.trendBadge, { borderColor: `${c.color}40`, backgroundColor: `${c.color}12` }]}>
      <Text style={[styles.trendIcon, { color: c.color }]}>{c.icon}</Text>
      <Text style={[styles.trendLabel, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

// ── Severity badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const cfg: Record<string, { color: string; label: string }> = {
    high:   { color: RED,   label: 'HIGH PRIORITY' },
    medium: { color: AMBER, label: 'MEDIUM PRIORITY' },
    low:    { color: GREEN, label: 'LOW PRIORITY' },
  };
  const c = cfg[severity] ?? cfg.low;
  return (
    <View style={[styles.severityBadge, { borderColor: `${c.color}50`, backgroundColor: `${c.color}12` }]}>
      <Text style={[styles.severityLabel, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

// ── Savings Section ────────────────────────────────────────────────────────────

function SavingsSection({ data }: { data: SavingsMetrics }) {
  const { metrics, headline, completedRoutes } = data;

  if (completedRoutes === 0) {
    return (
      <View style={[styles.sectionCard, { backgroundColor: SURFACE2 }]}>
        <Text style={styles.sectionTitle}>Savings Summary</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📍</Text>
          <Text style={[styles.emptyTitle, { color: TEXT1 }]}>No completed routes yet</Text>
          <Text style={[styles.emptyBody, { color: TEXT3 }]}>
            Complete your first route to start tracking time, fuel, and risk savings.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.sectionCard, { backgroundColor: SURFACE2 }]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>30-Day Savings</Text>
        <Text style={[styles.sectionSubtitle, { color: TEAL }]}>{headline}</Text>
      </View>

      <View style={styles.metricsGrid}>
        <MetricCard
          label="Minutes saved"
          value={metrics.durationSavedMin}
          unit="min"
          accent={GREEN}
        />
        <MetricCard
          label="Risky turns avoided"
          value={metrics.riskyTurnsAvoided}
          accent={GREEN}
        />
        <MetricCard
          label="Fuel saved"
          value={metrics.fuelSavedLitres.toFixed(1)}
          unit="L"
          accent={TEAL}
        />
        <MetricCard
          label="Distance saved"
          value={metrics.distanceSavedKm.toFixed(1)}
          unit="km"
          accent={TEAL}
        />
      </View>

      <Text style={[styles.savingsNote, { color: TEXT3 }]}>
        Based on {completedRoutes} completed route{completedRoutes !== 1 ? 's' : ''}.{' '}
        <Text style={{ color: TEAL }}>How we calculate this →</Text>
      </Text>
    </View>
  );
}

// ── Insights Section ────────────────────────────────────────────────────────────

function InsightsSection({ data }: { data: InsightsSummary }) {
  const { trend, greenRate, comparedToFleet, topPattern } = data;
  const betterThanFleet = comparedToFleet >= 0;

  return (
    <View style={[styles.sectionCard, { backgroundColor: SURFACE2 }]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Coaching Insights</Text>
        <TrendBadge trend={trend} />
      </View>

      <View style={styles.insightMetrics}>
        <View style={styles.insightMetric}>
          <Text style={[styles.insightValue, { color: greenRate > 70 ? GREEN : greenRate > 50 ? AMBER : RED }]}>
            {greenRate.toFixed(0)}%
          </Text>
          <Text style={styles.insightLabel}>GREEN rate</Text>
        </View>
        <View style={styles.insightMetric}>
          <Text style={[styles.insightValue, { color: betterThanFleet ? GREEN : RED }]}>
            {betterThanFleet ? '+' : ''}{comparedToFleet.toFixed(1)} pp
          </Text>
          <Text style={styles.insightLabel}>vs fleet avg</Text>
        </View>
      </View>

      {topPattern ? (
        <View style={styles.patternCard}>
          <SeverityBadge severity={topPattern.severity} />
          <Text style={[styles.patternDesc, { color: TEXT1 }]}>
            {topPattern.description}
          </Text>
          <View style={styles.patternRec}>
            <Text style={[styles.patternRecLabel, { color: TEXT3 }]}>→ </Text>
            <Text style={[styles.patternRecText, { color: TEXT2 }]}>
              {topPattern.recommendation}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: TEXT1 }]}>Complete more routes</Text>
          <Text style={[styles.emptyBody, { color: TEXT3 }]}>
            Build your performance history to see coaching observations.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function PerformanceScreen() {
  const { colors } = useTheme();
  const user  = useAuthStore(s => s.user);
  const [savings, setSavings] = useState<SavingsMetrics | null>(null);
  const [insights, setInsights] = useState<InsightsSummary | null>(null);
  const [savingsError, setSavingsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Load both in parallel
      const [savingsResult, insightsResult] = await Promise.allSettled([
        apiGetSavingsSummary(),
        user?.id ? apiGetInsightsSummary(user.id) : Promise.reject(new Error('No user')),
      ]);

      if (cancelled) return;

      if (savingsResult.status === 'rejected') {
        const err = savingsResult.reason as Error;
        if (err?.message?.includes('Enterprise')) {
          setSavingsError('ENTERPRISE_REQUIRED');
        } else {
          setSavingsError(err?.message ?? 'Failed to load savings');
        }
      } else {
        setSavings(savingsResult.value as SavingsMetrics);
      }

      if (insightsResult.status === 'fulfilled') {
        setInsights(insightsResult.value as InsightsSummary);
      }

      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors?.background ?? BG }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: colors?.text ?? TEXT1 }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors?.text ?? TEXT1 }]}>Performance</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={TEAL} size="large" />
            <Text style={[styles.loadingText, { color: TEXT3 }]}>Loading performance data...</Text>
          </View>
        ) : (
          <>
            {/* Savings — Pro/Enterprise gated */}
            {savingsError === 'ENTERPRISE_REQUIRED' ? (
              <UpgradePrompt feature="Performance insights" />
            ) : savingsError ? (
              <View style={[styles.errorCard, { borderColor: `${RED}50` }]}>
                <Text style={[styles.errorText, { color: RED }]}>
                  Could not load savings: {savingsError}
                </Text>
              </View>
            ) : savings ? (
              <SavingsSection data={savings} />
            ) : null}

            {/* Insights — available to all drivers */}
            {insights ? (
              <InsightsSection data={insights} />
            ) : (
              <View style={[styles.sectionCard, { backgroundColor: SURFACE2, marginTop: 12 }]}>
                <Text style={styles.sectionTitle}>Coaching Insights</Text>
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyBody, { color: TEXT3 }]}>
                    Insights will appear after your first completed route.
                  </Text>
                </View>
              </View>
            )}

            {/* Methodology disclosure */}
            <TouchableOpacity style={styles.methodologyBtn}>
              <Text style={[styles.methodologyText, { color: TEXT3 }]}>
                📐 How we calculate savings — methodology and confidence levels
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { padding: 8, minWidth: 60 },
  backBtnText: { fontSize: 16, fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif' },
  content: { padding: 16, paddingBottom: 40 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  loadingText: { marginTop: 12, fontSize: 14 },
  upgradeCard: {
    backgroundColor: SURFACE1, borderWidth: 1, borderColor: `${TEAL}30`,
    borderRadius: 12, padding: 24, alignItems: 'center',
  },
  upgradeIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: `${TEAL}15`, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  upgradeIconText: { fontSize: 28 },
  upgradeTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  upgradeBody: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  upgradeBtn: {
    backgroundColor: TEAL, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24,
  },
  upgradeBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  sectionCard: { borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT1, marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, fontWeight: '600' },
  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 8, marginBottom: 12,
  },
  metricCard: {
    flex: 1, minWidth: '45%',
    borderWidth: 1, borderRadius: 8,
    padding: 12, alignItems: 'center',
  },
  metricValue: { fontSize: 22, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  metricUnit: { fontSize: 13, fontWeight: '400' },
  metricLabel: { fontSize: 10, color: TEXT3, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  savingsNote: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  insightMetrics: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  insightMetric: { flex: 1, backgroundColor: SURFACE1, borderRadius: 8, padding: 12, alignItems: 'center' },
  insightValue: { fontSize: 20, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  insightLabel: { fontSize: 10, color: TEXT3, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  patternCard: {
    backgroundColor: SURFACE1, borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: AMBER,
  },
  severityBadge: {
    alignSelf: 'flex-start', borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 2, marginBottom: 8,
  },
  severityLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  patternDesc: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  patternRec: { flexDirection: 'row' },
  patternRecLabel: { fontSize: 14, fontWeight: '600' },
  patternRecText: { fontSize: 13, lineHeight: 18, flex: 1 },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  trendIcon: { fontSize: 14, fontWeight: '700' },
  trendLabel: { fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 20 },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  errorCard: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 13 },
  methodologyBtn: { paddingVertical: 8, alignItems: 'center' },
  methodologyText: { fontSize: 12 },
});
