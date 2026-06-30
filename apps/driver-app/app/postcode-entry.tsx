/**
 * Postcode Entry — Fast postcode/address entry for delivery intake
 * 
 * Workflow:
 * 1. Paste multiple postcodes (newline separated)
 * 2. Parse and validate
 * 3. Auto-suggest addresses
 * 4. Confirm and continue
 * 
 * Supports:
 * - Single postcode entry
 * - Bulk paste (e.g., "SW1A1AA\nM1 1AE\nB1 1AA")
 * - Address autocomplete
 * - Progress indicator for bulk operations
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useShiftStore } from '../store/shift';
import { useAuthStore } from '../lib/auth';
import { useTheme } from '../lib/theme';

const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

interface ParsedStop {
  id: string;
  postcode: string | null;
  address: string;
  status: 'pending' | 'validating' | 'resolved' | 'error';
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED';
  lat?: number;
  lng?: number;
  error?: string;
}

const UK_PC_REGEX = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/;

function normalisePC(q: string): string {
  const cleaned = q.toUpperCase().replace(/\s+/g, '');
  const match = UK_PC_REGEX.exec(cleaned);
  if (match) return `${match[1]} ${match[2]}`;
  return cleaned;
}

function isPostcode(q: string): boolean {
  return UK_PC_REGEX.test(q.toUpperCase().replace(/\s+/g, ''));
}

function parseBulkInput(text: string): string[] {
  return text
    .split(/[\r\n]+/)
    .map(line => line.trim())
    .filter(line => line.length > 2 && line.length < 10) // Postcodes are 5-8 chars
    .filter(isPostcode);
}

export default function PostcodeEntryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useAuthStore(s => s.token ?? '');

  const [rawInput, setRawInput] = useState('');
  const [stops, setStops] = useState<ParsedStop[]>([]);
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Handle bulk paste from clipboard
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) {
        Alert.alert('Clipboard empty', 'No text found in clipboard.');
        return;
      }
      setRawInput(text);
      await handleBulkParse(text);
    } catch {
      Alert.alert('Paste failed', 'Could not read clipboard.');
    }
  }, []);

  // Parse and validate bulk input
  const handleBulkParse = useCallback(async (text: string) => {
    const lines = text
      .split(/[\r\n]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      Alert.alert('No input', 'Enter postcodes or addresses to continue.');
      return;
    }

    // Initial parse - extract postcodes
    const initialStops: ParsedStop[] = lines.map((line, i) => {
      const postcode = isPostcode(line) ? normalisePC(line) : null;
      return {
        id: `stop-${Date.now()}-${i}`,
        postcode,
        address: postcode ? postcode : line,
        status: 'pending' as const,
      };
    });

    setStops(initialStops);
    setProgress({ current: 0, total: initialStops.length });
    setValidating(true);

    // Validate each stop via API
    const validatedStops = [...initialStops];
    for (let i = 0; i < validatedStops.length; i++) {
      const stop = validatedStops[i];
      setProgress({ current: i + 1, total: validatedStops.length });

      if (!stop.postcode) {
        // Try to geocode via PAF or autocomplete
        try {
          const res = await fetch(
            `${API}/api/v1/address/autocomplete?q=${encodeURIComponent(stop.address)}&limit=1`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.data?.length > 0) {
              validatedStops[i] = {
                ...stop,
                status: 'resolved',
                confidence: 'MEDIUM',
                lat: data.data[0].lat,
                lng: data.data[0].lng,
                address: data.data[0].label,
              };
            } else {
              validatedStops[i] = { ...stop, status: 'resolved', confidence: 'LOW' };
            }
          }
        } catch {
          validatedStops[i] = { ...stop, status: 'resolved', confidence: 'LOW' };
        }
      } else {
        // Validate postcode via PAF lookup
        try {
          const res = await fetch(
            `${API}/api/v1/paf/lookup?postcode=${encodeURIComponent(stop.postcode)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.addresses?.length > 0) {
              validatedStops[i] = {
                ...stop,
                status: 'resolved',
                confidence: 'HIGH',
                address: data.addresses[0].fullAddress,
              };
            } else {
              validatedStops[i] = { ...stop, status: 'resolved', confidence: 'LOW' };
            }
          }
        } catch {
          validatedStops[i] = { ...stop, status: 'resolved', confidence: 'LOW' };
        }
      }

      setStops([...validatedStops]);
      
      // Small delay to keep UI responsive
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    setValidating(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [token]);

  // Handle text input change
  const handleInputChange = useCallback((text: string) => {
    setRawInput(text);
  }, []);

  // Remove a stop
  const handleRemoveStop = useCallback((id: string) => {
    setStops(prev => prev.filter(s => s.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // Continue to address selection or route preparation
  const handleContinue = useCallback(() => {
    const resolvedStops = stops.filter(s => s.status === 'resolved');
    if (resolvedStops.length === 0) {
      Alert.alert('No valid stops', 'Add at least one valid postcode or address.');
      return;
    }

    // Store stops in shift store for next screen
    useShiftStore.getState().setStagedStops(resolvedStops.map(s => ({
      id: s.id,
      address: s.address,
      lat: s.lat ?? 0,
      lng: s.lng ?? 0,
      parcelCount: 1,
    })) as any);

    router.push('/route-preparation');
  }, [stops]);

  // Add individual postcode
  const handleAddPostcode = useCallback(() => {
    if (!rawInput.trim()) return;
    
    const postcode = isPostcode(rawInput) ? normalisePC(rawInput) : null;
    const newStop: ParsedStop = {
      id: `stop-${Date.now()}`,
      postcode,
      address: postcode || rawInput,
      status: 'pending',
    };

    setStops(prev => [...prev, newStop]);
    setRawInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [rawInput]);

  const renderStopItem = useCallback(({ item }: { item: ParsedStop }) => (
    <View style={[styles.stopItem, { backgroundColor: colors.surface }]}>
      <View style={styles.stopContent}>
        <Text style={[styles.stopAddress, { color: colors.text }]} numberOfLines={1}>
          {item.address}
        </Text>
        {item.postcode && (
          <Text style={[styles.stopPostcode, { color: colors.subtext }]}>
            {item.postcode}
          </Text>
        )}
      </View>
      <View style={styles.stopStatus}>
        {item.status === 'validating' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : item.status === 'resolved' ? (
          <View style={[styles.confidenceBadge, {
            backgroundColor: item.confidence === 'HIGH' ? colors.green :
                           item.confidence === 'MEDIUM' ? colors.amber : colors.subtext,
          }]}>
            <Text style={styles.confidenceText}>{item.confidence}</Text>
          </View>
        ) : (
          <Text style={[styles.pendingText, { color: colors.subtext }]}>Pending</Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => handleRemoveStop(item.id)}
        accessibilityLabel="Remove stop"
      >
        <Text style={styles.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  ), [colors, handleRemoveStop]);

  const summary = useMemo(() => {
    const total = stops.length;
    const high = stops.filter(s => s.confidence === 'HIGH').length;
    const medium = stops.filter(s => s.confidence === 'MEDIUM').length;
    const low = stops.filter(s => s.confidence === 'LOW').length;
    return { total, high, medium, low };
  }, [stops]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.green }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Enter Postcodes</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Input Section */}
      <View style={styles.inputSection}>
        <Text style={[styles.inputLabel, { color: colors.subtext }]}>
          Paste postcodes (one per line)
        </Text>
        <TextInput
          style={[styles.input, {
            backgroundColor: colors.surface,
            color: colors.text,
            borderColor: colors.border,
          }]}
          placeholder="SW1A1AA&#10;M1 1AE&#10;B1 1AA"
          placeholderTextColor={colors.subtext}
          value={rawInput}
          onChangeText={handleInputChange}
          multiline
          numberOfLines={4}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: colors.surface }]}
            onPress={handlePasteFromClipboard}
          >
            <Text style={styles.quickBtnText}>📋 Paste</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: colors.surface }]}
            onPress={handleAddPostcode}
            disabled={!rawInput.trim()}
          >
            <Text style={[styles.quickBtnText, !rawInput.trim() && { opacity: 0.5 }]}>
              + Add
            </Text>
          </TouchableOpacity>
          {stops.length > 0 && (
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary }]}
              onPress={() => handleBulkParse(rawInput)}
              disabled={validating}
            >
              <Text style={[styles.quickBtnText, { color: '#000' }]}>
                {validating ? 'Validating...' : 'Validate All'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Progress */}
      {validating && progress.total > 0 && (
        <View style={styles.progressSection}>
          <View style={[styles.progressBar, { backgroundColor: colors.surface }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: `${(progress.current / progress.total) * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.subtext }]}>
            Validating {progress.current} of {progress.total}...
          </Text>
        </View>
      )}

      {/* Summary */}
      {stops.length > 0 && !validating && (
        <View style={styles.summarySection}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {summary.total} Stop{summary.total !== 1 ? 's' : ''}
          </Text>
          <View style={styles.confidenceRow}>
            {summary.high > 0 && (
              <View style={[styles.confTag, { backgroundColor: colors.green }]}>
                <Text style={styles.confTagText}>🟢 {summary.high}</Text>
              </View>
            )}
            {summary.medium > 0 && (
              <View style={[styles.confTag, { backgroundColor: colors.amber }]}>
                <Text style={styles.confTagText}>🟡 {summary.medium}</Text>
              </View>
            )}
            {summary.low > 0 && (
              <View style={[styles.confTag, { backgroundColor: colors.subtext }]}>
                <Text style={styles.confTagText}>⚪ {summary.low}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Stops List */}
      <FlatList
        data={stops}
        keyExtractor={item => item.id}
        renderItem={renderStopItem}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>
              Paste postcodes above to get started
            </Text>
          </View>
        }
      />

      {/* CTA Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[
            styles.ctaBtn,
            {
              backgroundColor: stops.filter(s => s.status === 'resolved').length > 0
                ? colors.green
                : '#1c2a37',
            },
          ]}
          onPress={handleContinue}
          disabled={stops.filter(s => s.status === 'resolved').length === 0}
        >
          <Text style={styles.ctaBtnText}>
            {stops.filter(s => s.status === 'resolved').length > 0
              ? `Continue with ${stops.filter(s => s.status === 'resolved').length} Stops →`
              : 'Add stops to continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { paddingRight: 12 },
  backText: { fontSize: 18, fontWeight: '500' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  inputSection: { padding: 16 },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  quickActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quickBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  quickBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  progressSection: { paddingHorizontal: 16, paddingVertical: 8 },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%' },
  progressText: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  summarySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  summaryTitle: { fontSize: 16, fontWeight: '700' },
  confidenceRow: { flexDirection: 'row', gap: 6 },
  confTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  confTagText: { fontSize: 12, fontWeight: '700', color: '#000' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  stopContent: { flex: 1 },
  stopAddress: { fontSize: 15, fontWeight: '600' },
  stopPostcode: { fontSize: 12, marginTop: 2 },
  stopStatus: { marginHorizontal: 8 },
  confidenceBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  confidenceText: { fontSize: 10, fontWeight: '800', color: '#000' },
  pendingText: { fontSize: 12 },
  removeBtn: { padding: 8 },
  removeBtnText: { fontSize: 16, color: '#666' },
  emptyState: { paddingTop: 40, alignItems: 'center' },
  emptyText: { fontSize: 14 },
  footer: { padding: 16, position: 'absolute', bottom: 0, left: 0, right: 0 },
  ctaBtn: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
