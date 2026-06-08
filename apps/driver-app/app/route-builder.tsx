import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Keyboard, Platform, FlatList, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import DateTimePicker, { DateTimePickerEvent }
  from '@react-native-community/datetimepicker';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import DraggableFlatList, { ScaleDecorator }
  from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { useShiftStore } from '../store/shift';
import { useTheme } from '../components/ThemeContext';
import { parseStopsCsv } from '../utils/parseStopsCsv';
import { saveRoute, countSavedRoutes } from '../lib/savedRoutes';
import { usePlan } from '../lib/usePlan';
import type { Stop } from '../lib/types';

const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

interface LocalStop {
  id:           string;
  address:      string;
  lat:          number;
  lng:          number;
  parcelCount:  number;
  notes?:       string;
}

interface PafAddress {
  line1:       string;
  line2?:      string;
  postTown:    string;
  postcode:    string;
  fullAddress: string;
}

const normalisePC  = (q: string) => q.toUpperCase().replace(/\s+/g, '');
const UK_PC        = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/;
const isPostcode   = (q: string) => UK_PC.test(normalisePC(q));
const formatPC     = (q: string) => normalisePC(q).replace(UK_PC, '$1 $2');

export default function RouteBuilderScreen() {
  const [query,          setQuery]          = useState('');
  const [pafResults,     setPafResults]     = useState<PafAddress[]>([]);
  const [pafLoading,     setPafLoading]     = useState(false);
  const [stops,          setStops]          = useState<LocalStop[]>([]);
  const [optimising,     setOptimising]     = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [departureTime,  setDepartureTime]  = useState<Date>(new Date());
  const [timeChip,       setTimeChip]       = useState<'now'|'30'|'60'|'custom'>('now');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useShiftStore(s => (s as any).token ?? '');
  const { plan } = usePlan();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveName,        setSaveName]         = useState('');

  const handlePafSearch = useCallback(async (q: string) => {
    const formatted = formatPC(q);
    setPafLoading(true);
    try {
      const res = await fetch(
        `${API}/api/v1/paf/lookup?postcode=${encodeURIComponent(formatted)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPafResults(data.addresses ?? []);
    } catch {
      setPafResults([]);
    } finally {
      setPafLoading(false);
    }
  }, [token]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    if (isPostcode(query)) {
      await handlePafSearch(query);
    } else {
      try {
        const geo = await Location.geocodeAsync(query);
        setPafResults(geo.map(() => ({
          line1:       query.toUpperCase(),
          postTown:    '',
          postcode:    '',
          fullAddress: query,
        })));
      } catch { setPafResults([]); }
    }
  }, [query, handlePafSearch]);

  const handleAddPafStop = useCallback((addr: PafAddress) => {
    setStops(prev => [...prev, {
      id: `paf-${Date.now()}-${Math.random()}`,
      address: addr.fullAddress, lat: 0, lng: 0, parcelCount: 1,
    }]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleAddAllPaf = useCallback(() => {
    setStops(prev => [
      ...prev,
      ...pafResults.map((addr, i) => ({
        id: `paf-all-${Date.now()}-${i}`,
        address: addr.fullAddress, lat: 0, lng: 0, parcelCount: 1,
      })),
    ]);
    setPafResults([]);
    setQuery('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [pafResults]);

  const handleFilePick = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const parsed = parseStopsCsv(text);
      if (!parsed.length) {
        Alert.alert('No stops found', 'Check your CSV has address data.');
        return;
      }
      setStops(prev => [
        ...prev,
        ...parsed.map((s, i) => ({
          id: `csv-${Date.now()}-${i}`,
          address: s.address, lat: 0, lng: 0,
          parcelCount: s.parcelCount ?? 1,
          notes: s.notes,
        })),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Import failed', 'Could not read the file. Try pasting instead.');
    }
  }, []);

  const handleRemoveStop = useCallback((id: string) => {
    setStops(prev => prev.filter(s => s.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleParcelCount = useCallback((id: string, delta: number) => {
    setStops(prev => prev.map(s =>
      s.id === id ? { ...s, parcelCount: Math.max(1, s.parcelCount + delta) } : s,
    ));
  }, []);

  const handleTimeChip = useCallback((chip: 'now'|'30'|'60'|'custom') => {
    setTimeChip(chip);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (chip === 'now') setDepartureTime(new Date());
    if (chip === '30')  setDepartureTime(new Date(Date.now() + 30 * 60_000));
    if (chip === '60')  setDepartureTime(new Date(Date.now() + 60 * 60_000));
    if (chip === 'custom') setShowTimePicker(true);
  }, []);

  const handleTimeChange = useCallback(
    (_: DateTimePickerEvent, selected?: Date) => {
      setShowTimePicker(Platform.OS === 'ios');
      if (selected) setDepartureTime(selected);
    }, [],
  );

  const handleOptimise = useCallback(async () => {
    if (stops.length < 2) return;
    setOptimising(true);
    try {
      const vehicle = useShiftStore.getState().vehicle;
      const res = await fetch(`${API}/api/v1/optimise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          depot:                { lat: 0, lng: 0 },
          stops:                stops.map(s => ({
                                  id: s.id, address: s.address,
                                  lat: s.lat, lng: s.lng, parcelCount: s.parcelCount,
                                })),
          vehicleProfileKey:    vehicle?.profileKey ?? 'TRANSIT_LWB_GB',
          plannedDepartureTime: departureTime.toISOString(),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.optimized?.orderedStops) {
        const reordered: LocalStop[] = data.optimized.orderedStops.map((s: any) => ({
          ...(stops.find(x => x.id === s.id) ?? {}),
          id: s.id, address: s.address,
          lat: s.lat, lng: s.lng, parcelCount: s.parcelCount ?? 1,
        }));
        setStops(reordered);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert('Could not optimise', 'Check your connection. You can reorder manually.');
    } finally {
      setOptimising(false);
    }
  }, [stops, departureTime, token]);

  const handleContinue = useCallback(() => {
    if (!stops.length) return;
    useShiftStore.getState().setStagedStops(stops as any);
    router.push({
      pathname: '/route-review',
      params: { departureEpochMs: String(departureTime.getTime()) },
    });
  }, [stops, departureTime]);

  const handleSaveRoute = useCallback(async () => {
    const name = saveName.trim();
    if (!name || !stops.length) return;

    // Pro plan limit: 10 saved routes
    const count = await countSavedRoutes();
    if (plan !== 'enterprise' && count >= 10) {
      Alert.alert(
        'Route limit reached',
        "You've reached the 10 route limit on Pro. Delete a saved route to add more.",
      );
      return;
    }

    const routeStops: Stop[] = stops.map((s, i) => ({
      id:               s.id,
      sequence:         i,
      address:          s.address,
      status:           'pending',
      failureCode:      null,
      accessNotes:      s.notes ?? null,
      last50m:          null,
      podPhotoUrl:      null,
      pinLat:           s.lat || null,
      pinLon:           s.lng || null,
      fcmCustomerToken: null,
    }));

    await saveRoute(name, routeStops);
    setSaveModalVisible(false);
    setSaveName('');
    Alert.alert('Route saved!', `"${name}" has been saved to your routes.`);
  }, [stops, saveName, plan]);

  interface StopRowProps {
    item: LocalStop;
    drag: () => void;
    isActive: boolean;
    onRemove: () => void;
    onParcelChange: (delta: number) => void;
  }

  function StopRow({ item, drag, isActive, onRemove, onParcelChange }: StopRowProps) {
    const { colors: c } = useTheme();
    return (
      <Swipeable
        renderRightActions={() => (
          <TouchableOpacity
            style={[styles.swipeRemove]}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.address}`}
          >
            <Text style={styles.swipeRemoveText}>Remove</Text>
          </TouchableOpacity>
        )}
      >
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            style={[styles.stopRow, { backgroundColor: isActive ? c.green : c.surface }]}
            accessibilityRole="button"
            accessibilityLabel={`Stop: ${item.address}. Long press to reorder.`}
          >
            <Text style={[styles.handle, { color: c.subtext }]}>≡</Text>
            <View style={styles.stopContent}>
              <Text style={[styles.stopAddress, { color: c.text }]} numberOfLines={2}>
                {item.address}
              </Text>
            </View>
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => onParcelChange(-1)}
                style={styles.stepBtn}
                accessibilityLabel="Decrease parcel count"
              >
                <Text style={[styles.stepText, { color: c.text }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.stepCount, { color: c.text }]}>{item.parcelCount}</Text>
              <TouchableOpacity
                onPress={() => onParcelChange(1)}
                style={styles.stepBtn}
                accessibilityLabel="Increase parcel count"
              >
                <Text style={[styles.stepText, { color: c.text }]}>+</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      </Swipeable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

      {/* HEADER */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.green }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Plan Route</Text>
        {stops.length > 0 && (
          <TouchableOpacity
            onPress={() => { setSaveName(''); setSaveModalVisible(true); }}
            style={styles.saveBtn}
            accessibilityRole="button"
            accessibilityLabel="Save route"
          >
            <Text style={[styles.saveText, { color: colors.green }]}>💾</Text>
          </TouchableOpacity>
        )}
        {stops.length >= 2 && (
          <TouchableOpacity onPress={handleOptimise} disabled={optimising} style={styles.optimiseBtn}>
            {optimising
              ? <ActivityIndicator color={colors.green} size="small" />
              : <Text style={[styles.optimiseText, { color: colors.green }]}>Optimise ✦</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* SEARCH ROW */}
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput, {
            backgroundColor: colors.surface, color: colors.text, borderColor: colors.border,
          }]}
          placeholder="Postcode or address..."
          placeholderTextColor={colors.subtext}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Search postcode or address"
        />
        <TouchableOpacity
          onPress={handleFilePick}
          style={[styles.fileBtn, { backgroundColor: colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Import stops from CSV file"
        >
          <Text style={{ fontSize: 20 }}>📂</Text>
        </TouchableOpacity>
      </View>

      {/* PAF RESULTS PANEL */}
      {(pafLoading || pafResults.length > 0) && (
        <View style={[styles.pafPanel, { backgroundColor: colors.surface }]}>
          {pafLoading && (
            <ActivityIndicator color={colors.green} style={{ marginVertical: 12 }} />
          )}
          {pafResults.length > 0 && (
            <>
              <TouchableOpacity
                style={[styles.addAllBtn, { backgroundColor: colors.green }]}
                onPress={handleAddAllPaf}
                accessibilityRole="button"
                accessibilityLabel={`Add all ${pafResults.length} addresses`}
              >
                <Text style={styles.addAllText}>+ Add all {pafResults.length} addresses</Text>
              </TouchableOpacity>
              <FlatList
                data={pafResults}
                keyExtractor={(_, i) => String(i)}
                style={{ maxHeight: 200 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.pafRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleAddPafStop(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add stop: ${item.fullAddress}`}
                  >
                    <Text style={[styles.pafLine1, { color: colors.text }]}>{item.line1}</Text>
                    {item.line2 ? (
                      <Text style={[styles.pafLine2, { color: colors.subtext }]}>{item.line2}</Text>
                    ) : null}
                    <Text style={[styles.pafLine2, { color: colors.subtext }]}>
                      {item.postTown}  {item.postcode}
                    </Text>
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity onPress={() => setPafResults([])} style={styles.pafDismiss}>
                <Text style={{ color: colors.subtext }}>✕ Dismiss</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* STOP LIST */}
      <View style={styles.listSection}>
        {stops.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No stops yet</Text>
            <Text style={[styles.emptyBody, { color: colors.subtext }]}>
              Enter a postcode to see all houses on that street, or tap 📂 to import a CSV
            </Text>
          </View>
        ) : (
          <DraggableFlatList
            data={stops}
            keyExtractor={item => item.id}
            onDragEnd={({ data }) => setStops(data)}
            renderItem={({ item, drag, isActive }) => (
              <StopRow
                item={item}
                drag={drag}
                isActive={isActive}
                onRemove={() => handleRemoveStop(item.id)}
                onParcelChange={delta => handleParcelCount(item.id, delta)}
              />
            )}
            contentContainerStyle={{ paddingBottom: 240 }}
          />
        )}
      </View>

      {/* DEPARTURE TIME */}
      <View style={[styles.timeSection, { backgroundColor: colors.surface }]}>
        <Text style={[styles.timeLabel, { color: colors.subtext }]}>DEPARTURE TIME</Text>
        <View style={styles.chipRow}>
          {(['now', '30', '60', 'custom'] as const).map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, { backgroundColor: timeChip === c ? colors.green : '#1c2a37' }]}
              onPress={() => handleTimeChip(c)}
              accessibilityRole="button"
              accessibilityLabel={
                c === 'now' ? 'Depart now' :
                c === '30'  ? 'Depart in 30 minutes' :
                c === '60'  ? 'Depart in 1 hour' : 'Choose custom time'
              }
            >
              <Text style={[styles.chipText, { color: timeChip === c ? '#fff' : colors.subtext }]}>
                {c === 'now' ? 'Now' : c === '30' ? '+30 min' : c === '60' ? '+1 hr' : 'Custom'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.timeDisplay, { color: colors.text }]}>
          Departing at {departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {showTimePicker && (
          <DateTimePicker
            value={departureTime}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleTimeChange}
            minuteInterval={5}
          />
        )}
      </View>

      {/* CTA FOOTER */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.ctaBtn, {
            backgroundColor: stops.length > 0 ? colors.green : '#1c2a37',
          }]}
          onPress={handleContinue}
          disabled={stops.length === 0}
          accessibilityRole="button"
          accessibilityLabel={`Continue to review with ${stops.length} stops`}
        >
          <Text style={styles.ctaBtnText}>
            {stops.length > 0
              ? `Review ${stops.length} Stop${stops.length !== 1 ? 's' : ''}  →`
              : 'Add stops to continue'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* SAVE ROUTE MODAL */}
      <Modal
        visible={saveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Save Route</Text>
            <TextInput
              style={[styles.modalInput, {
                backgroundColor: colors.background, color: colors.text, borderColor: colors.border,
              }]}
              placeholder="Route name (e.g. Monday North Run)"
              placeholderTextColor={colors.subtext}
              value={saveName}
              onChangeText={setSaveName}
              autoFocus
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={handleSaveRoute}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setSaveModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.subtext }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSaveBtn,
                  { backgroundColor: saveName.trim() ? colors.green : colors.surface },
                ]}
                onPress={handleSaveRoute}
                disabled={!saveName.trim()}
              >
                <Text style={[
                  styles.modalSaveText,
                  { color: saveName.trim() ? '#fff' : colors.subtext },
                ]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                     paddingVertical: 14, borderBottomWidth: 1 },
  backBtn:         { paddingRight: 12 },
  backText:        { fontSize: 18, fontWeight: '500' },
  title:           { flex: 1, fontSize: 18, fontWeight: '700' },
  optimiseBtn:     { paddingLeft: 12 },
  optimiseText:    { fontSize: 15, fontWeight: '700' },
  saveBtn:         { paddingLeft: 12 },
  saveText:        { fontSize: 18 },
  searchRow:       { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  searchInput:     { flex: 1, height: 56, borderRadius: 12, paddingHorizontal: 16,
                     fontSize: 16, borderWidth: 1 },
  fileBtn:         { width: 56, height: 56, borderRadius: 12, justifyContent: 'center',
                     alignItems: 'center' },
  pafPanel:        { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  addAllBtn:       { paddingVertical: 14, alignItems: 'center' },
  addAllText:      { color: '#fff', fontWeight: '700', fontSize: 15 },
  pafRow:          { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  pafLine1:        { fontSize: 15, fontWeight: '600' },
  pafLine2:        { fontSize: 12, marginTop: 2 },
  pafDismiss:      { padding: 12, alignItems: 'center' },
  listSection:     { flex: 1 },
  emptyState:      { flex: 1, alignItems: 'center', justifyContent: 'center',
                     paddingHorizontal: 40, paddingTop: 60 },
  emptyIcon:       { fontSize: 48, marginBottom: 12 },
  emptyTitle:      { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody:       { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  stopRow:         { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
                     marginVertical: 4, padding: 14, borderRadius: 10, minHeight: 64 },
  handle:          { fontSize: 20, marginRight: 12, width: 24, textAlign: 'center' },
  stopContent:     { flex: 1 },
  stopAddress:     { fontSize: 15, fontWeight: '600' },
  stepper:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn:         { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1c2a37',
                     justifyContent: 'center', alignItems: 'center' },
  stepText:        { fontSize: 18, fontWeight: '700', lineHeight: 20 },
  stepCount:       { fontSize: 15, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  swipeRemove:     { backgroundColor: '#c62828', justifyContent: 'center',
                     alignItems: 'center', width: 80, marginVertical: 4, borderRadius: 10 },
  swipeRemoveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  timeSection:     { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 12 },
  timeLabel:       { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  chipRow:         { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip:            { flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
  chipText:        { fontSize: 13, fontWeight: '700' },
  timeDisplay:     { fontSize: 13, fontWeight: '500' },
  footer:          { paddingHorizontal: 16, paddingTop: 10 },
  ctaBtn:          { height: 60, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  ctaBtnText:      { color: '#fff', fontSize: 17, fontWeight: '800' },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center',
                     alignItems: 'center', padding: 24 },
  modalCard:       { width: '100%', maxWidth: 400, borderRadius: 16, padding: 24 },
  modalTitle:      { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  modalInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48,
                     fontSize: 15, marginBottom: 16 },
  modalActions:    { flexDirection: 'row', gap: 12 },
  modalCancelBtn:  { flex: 1, height: 48, borderRadius: 10, borderWidth: 1,
                     justifyContent: 'center', alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600' },
  modalSaveBtn:    { flex: 1, height: 48, borderRadius: 10,
                     justifyContent: 'center', alignItems: 'center' },
  modalSaveText:   { fontSize: 15, fontWeight: '700' },
});