/**
 * app/saved-routes.tsx
 * View, load, and delete saved routes from SQLite.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useShiftStore } from '../store/shift';
import { ThemeProvider, useTheme } from '../components/ThemeContext';
import {
  listSavedRoutes, deleteSavedRoute, touchSavedRoute,
} from '../lib/savedRoutes';
import type { SavedRoute } from '../lib/types';

function SavedRoutesInner() {
  const { colors } = useTheme();
  const setStagedStops = useShiftStore(s => s.setStagedStops);
  const [routes,  setRoutes]  = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSavedRoutes();
      setRoutes(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  const handleLoad = async (route: SavedRoute) => {
    await touchSavedRoute(route.id);
    // Map Stop[] from savedRoutes → DeliveryStop-shaped objects (stagedStops)
    const staged = route.stops.map(s => ({
      id:           s.id,
      sequence:     s.sequence,
      address:      s.address,
      parcelCount:  1,
      totalWeightKg: 1,
      pinLat:        s.pinLat,
      pinLon:        s.pinLon,
      notes:         s.accessNotes ?? s.last50m ?? null,
      status:        'pending' as const,
      failureCode:   null,
      index:         s.sequence,
      etaLabel:      '',
      distanceM:     0,
      alertLevel:    'GREEN' as const,
    }));
    setStagedStops(staged);
    router.push('/route-builder');
  };

  const handleDelete = (route: SavedRoute) => {
    Alert.alert(
      'Delete route?',
      route.name,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSavedRoute(route.id);
            loadRoutes();
          },
        },
      ],
    );
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4fc3f7" />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <FlatList
        data={routes}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📁</Text>
            <Text style={[styles.emptyTitle, { color: colors.subtext }]}>No saved routes yet</Text>
            <Text style={[styles.emptyHint, { color: colors.subtext }]}>
              Build a route in the route builder, then tap Save Route.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surface }]}
            onPress={() => handleLoad(item)}
            accessibilityRole="button"
            accessibilityLabel={`Load route ${item.name}, ${item.stops.length} stops`}
          >
            <View style={styles.cardMain}>
              <Text style={[styles.routeName, { color: colors.text }]}>{item.name}</Text>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item)}
                hitSlop={12}
                accessibilityLabel={`Delete ${item.name}`}
              >
                <Text style={[styles.deleteText, { color: colors.subtext }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardMeta}>
              <Text style={[styles.metaText, { color: colors.subtext }]}>
                {item.stops.length} stops
              </Text>
              <Text style={[styles.metaText, { color: colors.subtext }]}>
                {item.lastUsedAt
                  ? `Last used: ${fmtDate(item.lastUsedAt)}`
                  : `Created: ${fmtDate(item.createdAt)}`}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

export default function SavedRoutesScreen() {
  return (
    <ThemeProvider>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Saved Routes</Text>
          <View style={{ width: 50 }} />
        </View>
        <SavedRoutesInner />
      </SafeAreaView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#0f1923' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 44, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1c2a37',
  },
  backBtn:      { color: '#4fc3f7', fontSize: 16 },
  headerTitle:   { fontSize: 17, fontWeight: '600', color: '#ffffff' },
  wrap:         { flex: 1 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:         { padding: 12, gap: 12 },
  empty:        { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyEmoji:   { fontSize: 48, marginBottom: 16 },
  emptyTitle:   { fontSize: 17, fontWeight: '600', marginBottom: 8 },
  emptyHint:    { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  card: {
    borderRadius: 14, padding: 16, minHeight: 72,
  },
  cardMain:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  routeName:    { fontSize: 17, fontWeight: '700', flex: 1 },
  deleteBtn:    { paddingLeft: 12 },
  deleteText:   { fontSize: 16 },
  cardMeta:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  metaText:     { fontSize: 13 },
});