/**
 * DriverMenu — bottom-sheet hamburger menu for the HUD.
 *
 * Two tabs:
 *   Weather   — live conditions at driver's current location (Open-Meteo)
 *   Roadworks — National Highways motorway/A-road incidents (RSS)
 *
 * Data is fetched on first open and cached for the session.
 * Each tab shows a loading skeleton, then data, or a graceful error state.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Modal, ActivityIndicator, Linking,
} from 'react-native';
import { useTheme } from './ThemeContext';
import {
  apiGetWeather, apiGetRoadworks,
  type WeatherData, type RoadworksItem,
} from '../lib/api';

type Tab = 'weather' | 'roadworks';

interface Props {
  visible:   boolean;
  onDismiss: () => void;
  lat:       number | null;
  lng:       number | null;
}

// ── Weather helpers ──────────────────────────────────────────────────────────

const WEATHER_ICONS: Record<string, string> = {
  'Clear sky': '☀️', 'Mainly clear': '🌤️', 'Partly cloudy': '⛅', 'Overcast': '☁️',
  'Fog': '🌫️', 'Freezing fog': '🌫️',
  'Light drizzle': '🌦️', 'Moderate drizzle': '🌦️', 'Dense drizzle': '🌧️',
  'Light freezing drizzle': '🌨️', 'Heavy freezing drizzle': '🌨️',
  'Slight rain': '🌧️', 'Moderate rain': '🌧️', 'Heavy rain': '🌧️',
  'Light freezing rain': '🌨️', 'Heavy freezing rain': '🌨️',
  'Slight snow': '❄️', 'Moderate snow': '❄️', 'Heavy snow': '❄️', 'Snow grains': '❄️',
  'Slight showers': '🌦️', 'Moderate showers': '🌧️', 'Heavy showers': '⛈️',
  'Slight snow showers': '🌨️', 'Heavy snow showers': '🌨️',
  'Thunderstorm': '⛈️', 'Thunderstorm with hail': '⛈️', 'Thunderstorm with heavy hail': '⛈️',
};

function weatherIcon(description: string): string {
  return WEATHER_ICONS[description] ?? '🌡️';
}

const RISK_COLORS = { GREEN: '#22C55E', AMBER: '#F59E0B', RED: '#EF4444' } as const;
const RISK_BG     = { GREEN: 'rgba(34,197,94,0.12)', AMBER: 'rgba(245,158,11,0.12)', RED: 'rgba(239,68,68,0.12)' } as const;

const SEVERITY_COLORS = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#22C55E', UNKNOWN: '#94A3B8' } as const;

// ── Component ────────────────────────────────────────────────────────────────

export default function DriverMenu({ visible, onDismiss, lat, lng }: Props) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('weather');

  // Weather state
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Roadworks state
  const [roadworks, setRoadworks] = useState<RoadworksItem[] | null>(null);
  const [roadworksLoading, setRoadworksLoading] = useState(false);
  const [roadworksError, setRoadworksError] = useState<string | null>(null);

  const weatherFetched   = useRef(false);
  const roadworksFetched = useRef(false);

  const fetchWeather = useCallback(async () => {
    if (weatherFetched.current || lat == null || lng == null) return;
    weatherFetched.current = true;
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const data = await apiGetWeather(lat, lng);
      setWeather(data);
    } catch {
      setWeatherError('Could not load weather. Check your connection and try again.');
    } finally {
      setWeatherLoading(false);
    }
  }, [lat, lng]);

  const fetchRoadworks = useCallback(async () => {
    if (roadworksFetched.current) return;
    roadworksFetched.current = true;
    setRoadworksLoading(true);
    setRoadworksError(null);
    try {
      const data = await apiGetRoadworks();
      setRoadworks(data.items);
    } catch {
      setRoadworksError('Could not load roadworks. Check your connection and try again.');
    } finally {
      setRoadworksLoading(false);
    }
  }, []);

  // Fetch weather when menu first opens
  useEffect(() => {
    if (visible && !weatherFetched.current) {
      fetchWeather();
    }
  }, [visible, fetchWeather]);

  // Fetch roadworks when that tab is first selected
  useEffect(() => {
    if (visible && tab === 'roadworks' && !roadworksFetched.current) {
      fetchRoadworks();
    }
  }, [visible, tab, fetchRoadworks]);

  const handleTabPress = useCallback((t: Tab) => {
    setTab(t);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />

      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        {/* Handle + header */}
        <View style={styles.headerRow}>
          <View style={styles.handle} />
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>Driver Menu</Text>
          <TouchableOpacity onPress={onDismiss} accessibilityLabel="Close menu" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.closeBtn, { color: colors.subtext }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { backgroundColor: colors.background }]}>
          {(['weather', 'roadworks'] as Tab[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && { backgroundColor: colors.surface }]}
              onPress={() => handleTabPress(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
            >
              <Text style={[styles.tabLabel, { color: tab === t ? colors.blue : colors.subtext }]}>
                {t === 'weather' ? '🌤  Weather' : '🚧  Roadworks'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {tab === 'weather' && (
            <WeatherTab
              weather={weather}
              loading={weatherLoading}
              error={weatherError}
              onRetry={() => { weatherFetched.current = false; fetchWeather(); }}
              colors={colors}
            />
          )}
          {tab === 'roadworks' && (
            <RoadworksTab
              items={roadworks}
              loading={roadworksLoading}
              error={roadworksError}
              onRetry={() => { roadworksFetched.current = false; fetchRoadworks(); }}
              colors={colors}
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Weather tab ──────────────────────────────────────────────────────────────

function WeatherTab({
  weather, loading, error, onRetry, colors,
}: {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  colors: any;
}) {
  if (loading) return <LoadingState label="Fetching weather…" />;
  if (error)   return <ErrorState message={error} onRetry={onRetry} colors={colors} />;
  if (!weather) return null;

  const riskColor = RISK_COLORS[weather.riskLevel];
  const riskBg    = RISK_BG[weather.riskLevel];

  return (
    <View>
      {/* Main weather card */}
      <View style={[styles.weatherCard, { backgroundColor: colors.background }]}>
        <Text style={styles.weatherIcon}>{weatherIcon(weather.description)}</Text>
        <View style={styles.weatherMain}>
          <Text style={[styles.weatherTemp, { color: colors.text }]}>{weather.tempC}°C</Text>
          <Text style={[styles.weatherDesc, { color: colors.subtext }]}>{weather.description}</Text>
        </View>
      </View>

      {/* Driving risk badge */}
      <View style={[styles.riskBadge, { backgroundColor: riskBg }]}>
        <Text style={[styles.riskBadgeText, { color: riskColor }]}>
          {weather.riskLevel === 'RED' ? '⚠️  ' : weather.riskLevel === 'AMBER' ? '⚠️  ' : '✓  '}
          {weather.drivingAdvice}
        </Text>
      </View>

      {/* Stats row */}
      <View style={[styles.statsRow, { backgroundColor: colors.background }]}>
        <StatBlock label="Wind" value={`${weather.windMph} mph`} colors={colors} />
        <View style={[styles.statDivider, { backgroundColor: colors.surfaceAlt ?? '#2A2D35' }]} />
        <StatBlock label="Gusts" value={`${weather.gustMph} mph`} colors={colors} highlight={weather.gustMph >= 50} />
        <View style={[styles.statDivider, { backgroundColor: colors.surfaceAlt ?? '#2A2D35' }]} />
        <StatBlock label="Rain" value={`${weather.precipMm} mm`} colors={colors} />
      </View>

      <Text style={[styles.fetchedAt, { color: colors.subtext }]}>
        Updated {new Date(weather.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

function StatBlock({ label, value, colors, highlight = false }: { label: string; value: string; colors: any; highlight?: boolean }) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statLabel, { color: colors.subtext }]}>{label}</Text>
      <Text style={[styles.statValue, { color: highlight ? '#F59E0B' : colors.text }]}>{value}</Text>
    </View>
  );
}

// ── Roadworks tab ────────────────────────────────────────────────────────────

function RoadworksTab({
  items, loading, error, onRetry, colors,
}: {
  items: RoadworksItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  colors: any;
}) {
  if (loading) return <LoadingState label="Loading UK roadworks…" />;
  if (error)   return <ErrorState message={error} onRetry={onRetry} colors={colors} />;

  if (!items || items.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>✅</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No active incidents</Text>
        <Text style={[styles.emptySubtitle, { color: colors.subtext }]}>National Highways is showing no current motorway or A-road incidents.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.sectionHeader, { color: colors.subtext }]}>
        {items.length} active incident{items.length !== 1 ? 's' : ''} — National Highways
      </Text>
      {items.map((item, idx) => (
        <RoadworksCard key={idx} item={item} colors={colors} />
      ))}
      <Text style={[styles.fetchedAt, { color: colors.subtext }]}>
        Powered by National Highways / Traffic England RSS
      </Text>
    </View>
  );
}

function RoadworksCard({ item, colors }: { item: RoadworksItem; colors: any }) {
  const severityColor = SEVERITY_COLORS[item.severity];
  const formattedDate = item.pubDate
    ? (() => {
        try { return new Date(item.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
        catch { return item.pubDate; }
      })()
    : null;

  return (
    <View style={[styles.roadworksCard, { backgroundColor: colors.background }]}>
      <View style={styles.roadworksTitleRow}>
        <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
        <Text style={[styles.roadworksTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
      </View>
      {item.description ? (
        <Text style={[styles.roadworksDesc, { color: colors.subtext }]} numberOfLines={3}>{item.description}</Text>
      ) : null}
      <View style={styles.roadworksFooter}>
        {formattedDate ? <Text style={[styles.roadworksDate, { color: colors.subtext }]}>{formattedDate}</Text> : null}
        {item.link ? (
          <TouchableOpacity onPress={() => Linking.openURL(item.link)} accessibilityLabel="Open incident details">
            <Text style={[styles.roadworksLink, { color: colors.blue }]}>Details →</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ── Shared states ────────────────────────────────────────────────────────────

function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator size="large" color="#00C2A8" />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

function ErrorState({ message, onRetry, colors }: { message: string; onRetry: () => void; colors: any }) {
  return (
    <View style={styles.centerState}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={[styles.errorMsg, { color: colors.subtext }]}>{message}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryBtnText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '88%',
  },
  headerRow:  { alignItems: 'center', paddingTop: 12 },
  handle: { width: 40, height: 4, backgroundColor: '#ffffff30', borderRadius: 2 },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  title:    { fontSize: 20, fontWeight: '800' },
  closeBtn: { fontSize: 18, fontWeight: '600' },

  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabLabel: { fontSize: 15, fontWeight: '700' },

  scroll:       { maxHeight: 480 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },

  // Weather
  weatherCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 14, marginBottom: 12, gap: 16,
  },
  weatherIcon: { fontSize: 48 },
  weatherMain: { flex: 1 },
  weatherTemp: { fontSize: 36, fontWeight: '800', lineHeight: 40 },
  weatherDesc: { fontSize: 16, fontWeight: '500', marginTop: 4 },
  riskBadge: {
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12,
  },
  riskBadgeText: { fontSize: 15, fontWeight: '700', lineHeight: 22 },
  statsRow: {
    flexDirection: 'row', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 8, marginBottom: 12,
  },
  statBlock: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, marginVertical: 4 },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 18, fontWeight: '700' },

  // Roadworks
  sectionHeader: { fontSize: 13, fontWeight: '600', marginBottom: 10, letterSpacing: 0.3 },
  roadworksCard: {
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  roadworksTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  severityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, flexShrink: 0 },
  roadworksTitle: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  roadworksDesc:  { fontSize: 13, lineHeight: 20, marginBottom: 8 },
  roadworksFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roadworksDate:   { fontSize: 12 },
  roadworksLink:   { fontSize: 13, fontWeight: '700' },

  // Empty / error / loading
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  centerState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingLabel: { color: '#94A3B8', fontSize: 15, marginTop: 4 },
  errorIcon: { fontSize: 32 },
  errorMsg: { fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  retryBtn: { backgroundColor: '#00C2A8', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  retryBtnText: { color: '#0A0C10', fontWeight: '700', fontSize: 15 },

  fetchedAt: { fontSize: 12, textAlign: 'center', marginTop: 6 },
});
