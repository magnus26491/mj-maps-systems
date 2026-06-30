import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Keyboard, Platform, FlatList, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
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
import { useAuthStore } from '../lib/auth';
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
  uprn?:        string;
  pinSource?:   string;
}

interface PafAddress {
  line1:       string;
  line2?:      string;
  postTown:    string;
  postcode:    string;
  fullAddress: string;
  lat?:        number;
  lng?:        number;
  uprn?:       string;
  confidence?: number;
  source?:     string;
}

const normalisePC  = (q: string) => q.toUpperCase().replace(/\s+/g, '');
const UK_PC        = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/;
const isPostcode   = (q: string) => UK_PC.test(normalisePC(q));
const formatPC     = (q: string) => normalisePC(q).replace(UK_PC, '$1 $2');

export default function RouteBuilderScreen() {
  const { addMode } = useLocalSearchParams<{ addMode?: string }>();
  const isAddMode = addMode === '1';

  const [query,          setQuery]          = useState('');
  const [pafResults,     setPafResults]     = useState<PafAddress[]>([]);
  const [pafCounts,      setPafCounts]      = useState<Record<number, number>>({});
  const [pafLoading,     setPafLoading]     = useState(false);
  const [stops,          setStops]          = useState<LocalStop[]>(() => {
    if (isAddMode) return [];
    const staged = useShiftStore.getState().stagedStops;
    if (!staged?.length) return [];
    return staged.map((s: any) => ({
      id:          s.id,
      address:     s.address,
      lat:         s.lat ?? s.pinLat ?? 0,
      lng:         s.lng ?? s.pinLon ?? 0,
      parcelCount: s.parcelCount ?? 1,
      notes:       s.accessNotes ?? undefined,
      uprn:        s.uprn,
      pinSource:   s.pinSource,
    }));
  });
  const [optimising,     setOptimising]     = useState(false);
  const [pafError,       setPafError]       = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [departureTime,  setDepartureTime]  = useState<Date>(new Date());
  const [timeChip,       setTimeChip]       = useState<'now'|'30'|'60'|'custom'>('now');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const token = useAuthStore(s => s.token ?? '');
  const { plan } = usePlan();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveName,        setSaveName]         = useState('');

  const handlePafSearch = useCallback(async (q: string) => {
    const formatted = formatPC(q);
    setPafLoading(true);
    setPafResults([]);
    setPafCounts({});
    setPafError(null);
    try {
      const res = await fetch(
        `${API}/api/v1/paf/lookup?postcode=${encodeURIComponent(formatted)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Server error ${res.status}`);
      }
      const data = await res.json();
      const addresses = data.addresses ?? [];
      if (addresses.length === 0) {
        setPafError(`No addresses found for ${formatted}`);
      } else if (data.source === 'postcode_centroid') {
        setPafError(`No house-level data for ${formatted} — showing postcode area only`);
        setPafResults(addresses);
      } else {
        setPafResults(addresses);
      }
    } catch (e: any) {
      setPafResults([]);
      setPafError(e?.message ?? 'Could not load addresses. Check your connection.');
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
        setPafResults(geo.map(g => ({
          line1:       query.toUpperCase(),
          postTown:    '',
          postcode:    '',
          fullAddress: query,
          lat:         g.latitude,
          lng:         g.longitude,
        })));
      } catch { setPafResults([]); }
    }
  }, [query, handlePafSearch]);

  const handleSelectAll = useCallback(() => {
    const all: Record<number, number> = {};
    pafResults.forEach((_, i) => { all[i] = 1; });
    setPafCounts(all);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [pafResults]);

  const handlePafToggle = useCallback((index: number) => {
    setPafCounts(prev => {
      if (prev[index]) {
        const { [index]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [index]: 1 };
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleAddSelected = useCallback(() => {
    const selected = pafResults
      .map((addr, i) => ({ addr, count: pafCounts[i] ?? 0 }))
      .filter(({ count }) => count > 0);
    if (!selected.length) return;
    setStops(prev => [
      ...prev,
      ...selected.map(({ addr, count }, i) => ({
        id:         `paf-${Date.now()}-${i}`,
        address:    addr.fullAddress,
        lat:        addr.lat ?? 0,
        lng:        addr.lng ?? 0,
        parcelCount: count,
        uprn:       addr.uprn,
        pinSource:  addr.source,
      })),
    ]);
    setPafResults([]);
    setPafCounts({});
    setQuery('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [pafResults, pafCounts]);

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
          id:         `csv-${Date.now()}-${i}`,
          address:    s.address,
          lat:        0,
          lng:        0,
          parcelCount: s.parcelCount ?? 1,
          notes:      s.notes,
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
      const vehicleId = vehicle?.id ?? useShiftStore.getState().vehicleId ?? 'lwb_van';

      // Best-effort GPS depot
      let depotLat = 0, depotLng = 0;
      try {
        const { getLatestLocation } = await import('../lib/shared-location');
        const loc = getLatestLocation();
        if (loc) { depotLat = loc.latitude; depotLng = loc.longitude; }
      } catch { /* non-fatal */ }

      const res = await fetch(`${API}/api/v1/routes/optimise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          stops: stops.map(s => ({
            id: s.id, address: s.address,
            lat: s.lat, lng: s.lng,
            parcelCount: s.parcelCount,
            serviceMinutes: 3,
            notes: s.notes,
          })),
          config: {
            vehicleId,
            depotLat,
            depotLng,
            returnToDepot: false,
            shiftStartEpoch: Math.floor(departureTime.getTime() / 1000),
            shiftEndEpoch:   Math.floor(departureTime.getTime() / 1000) + 10 * 3600,
          },
        }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      const payload = json?.data ?? json;
      const ordered: LocalStop[] | undefined = payload?.orderedStops?.map((s: any) => ({
        ...(stops.find(x => x.id === s.id) ?? {}),
        id: s.id, address: s.address ?? (stops.find(x => x.id === s.id)?.address ?? ''),
        lat: s.lat, lng: s.lng, parcelCount: s.parcelCount ?? 1,
      }));
      if (ordered?.length) {
        setStops(ordered);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error('empty response');
      }
    } catch {
      Alert.alert('Could not optimise', 'Check your connection. You can drag stops to reorder manually.');
    } finally {
      setOptimising(false);
    }
  }, [stops, departureTime, token]);

  const handleMoveStop = useCallback((id: string, direction: 'up' | 'down') => {
    setStops(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      if (direction === 'up'   && idx === 0)              return prev;
      if (direction === 'down' && idx === prev.length - 1) return prev;
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleContinue = useCallback(() => {
    if (!stops.length) return;
    if (isAddMode) {
      const { addStop } = useShiftStore.getState();
      stops.forEach(stop => addStop(stop));
      router.back();
      return;
    }
    useShiftStore.getState().setStagedStops(stops as any);
    router.push({
      pathname: '/route-review',
      params: { departureEpochMs: String(departureTime.getTime()) },
    });
  }, [stops, departureTime, isAddMode]);

  const handleSaveRoute = useCallback(async () => {
    const name = saveName.trim();
    if (!name || !stops.length) return;

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

  // Computed
  const selectedPafCount = Object.values(pafCounts).filter(c => c > 0).length;

  interface StopRowProps {
    item: LocalStop;
    drag: () => void;
    isActive: boolean;
    onRemove: () => void;
    onParcelChange: (delta: number) => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
  }

  function StopRow({ item, drag, isActive, onRemove, onParcelChange, onMoveUp, onMoveDown }: StopRowProps) {
    const { colors: c } = useTheme();
    const [showNotes, setShowNotes] = useState(false);
    const [notesText, setNotesText] = useState(item.notes ?? '');

    // Sync notes back to parent stop list on blur
    const handleNotesBlur = useCallback(() => {
      if (notesText !== (item.notes ?? '')) {
        setStops(prev => prev.map(s => s.id === item.id ? { ...s, notes: notesText || undefined } : s));
      }
    }, [notesText, item.id, item.notes]);

    return (
      <Swipeable
        renderRightActions={() => (
          <TouchableOpacity
            style={styles.swipeRemove}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.address}`}
          >
            <Text style={styles.swipeRemoveText}>× Remove</Text>
          </TouchableOpacity>
        )}
      >
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={Platform.OS !== 'web' ? drag : undefined}
            disabled={isActive}
            style={[styles.stopRow, { backgroundColor: isActive ? c.green : c.surface }]}
            accessibilityRole="button"
            accessibilityLabel={`Stop: ${item.address}. ${Platform.OS !== 'web' ? 'Long press to reorder.' : ''}`}
          >
            {/* Drag handle / web arrows */}
            {Platform.OS === 'web' ? (
              <View style={styles.webMoveCol}>
                <TouchableOpacity onPress={onMoveUp} style={styles.webArrow} accessibilityLabel="Move stop up">
                  <Text style={{ color: c.subtext, fontSize: 14 }}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onMoveDown} style={styles.webArrow} accessibilityLabel="Move stop down">
                  <Text style={{ color: c.subtext, fontSize: 14 }}>▼</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[styles.handle, { color: c.subtext }]}>≡</Text>
            )}
            <View style={styles.stopContent}>
              <Text style={[styles.stopAddress, { color: c.text }]} numberOfLines={2}>
                {item.address}
              </Text>
              <TouchableOpacity
                onPress={() => setShowNotes(v => !v)}
                style={styles.notesToggle}
                accessibilityLabel={showNotes ? 'Hide note' : notesText ? 'Edit note' : 'Add note'}
              >
                <Text style={{ color: c.subtext, fontSize: 12 }}>
                  {showNotes ? '− hide note' : notesText ? `📝 ${notesText}` : '+ add note'}
                </Text>
              </TouchableOpacity>
              {showNotes && (
                <TextInput
                  style={[styles.notesInput, {
                    backgroundColor: c.background, color: c.text, borderColor: c.border,
                  }]}
                  placeholder="Access notes, buzzer code…"
                  placeholderTextColor={c.subtext}
                  value={notesText}
                  onChangeText={setNotesText}
                  onBlur={handleNotesBlur}
                  multiline
                  maxLength={200}
                />
              )}
            </View>
            {Platform.OS === 'web' && (
              <TouchableOpacity
                onPress={onRemove}
                style={styles.webRemoveBtn}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.address}`}
              >
                <Text style={{ color: '#f87171', fontSize: 20, lineHeight: 22 }}>×</Text>
              </TouchableOpacity>
            )}
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
        <Text style={[styles.title, { color: colors.text }]}>
          {isAddMode ? 'Add Stops' : 'Plan Route'}
        </Text>
        {!isAddMode && stops.length > 0 && (
          <TouchableOpacity
            onPress={() => { setSaveName(''); setSaveModalVisible(true); }}
            style={styles.saveBtn}
            accessibilityRole="button"
            accessibilityLabel="Save route"
          >
            <Text style={[styles.saveText, { color: colors.green }]}>💾</Text>
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
          onChangeText={v => { setQuery(v); if (pafError) setPafError(null); }}
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
      {(pafLoading || pafResults.length > 0 || pafError) && (
        <View style={[styles.pafPanel, { backgroundColor: colors.surface }]}>
          {pafLoading && (
            <ActivityIndicator color={colors.green} style={{ marginVertical: 12 }} />
          )}
          {pafError && !pafLoading && (
            <Text style={{ color: '#f87171', fontSize: 13, padding: 12, textAlign: 'center' }}>
              {pafError}
            </Text>
          )}
          {pafResults.length > 0 && (
            <>
              {/* Panel header row */}
              <View style={styles.pafHeader}>
                <Text style={[styles.pafHeaderText, { color: colors.subtext }]}>
                  {pafResults.length} address{pafResults.length !== 1 ? 'es' : ''}
                </Text>
                <TouchableOpacity
                  onPress={handleSelectAll}
                  accessibilityRole="button"
                  accessibilityLabel="Select all addresses"
                >
                  <Text style={[styles.pafSelectAll, { color: colors.green }]}>Select all</Text>
                </TouchableOpacity>
              </View>

              {/* Per-address rows — tap to add/remove */}
              <FlatList
                data={pafResults}
                keyExtractor={(_, i) => String(i)}
                style={{ maxHeight: 240 }}
                renderItem={({ item, index }) => {
                  const selected = !!(pafCounts[index]);
                  return (
                    <TouchableOpacity
                      onPress={() => handlePafToggle(index)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={selected ? `Remove ${item.line1}` : `Add ${item.line1}`}
                      style={[
                        styles.pafRow,
                        { borderBottomColor: colors.border },
                        selected && styles.pafRowSelected,
                      ]}
                    >
                      <View style={[
                        styles.pafToggle,
                        selected ? { backgroundColor: colors.green, borderColor: colors.green } : { borderColor: colors.subtext },
                      ]}>
                        <Text style={{ color: selected ? '#fff' : colors.subtext, fontSize: 16, fontWeight: '700', lineHeight: 18 }}>
                          {selected ? '✓' : '+'}
                        </Text>
                      </View>
                      <View style={styles.pafRowContent}>
                        <Text style={[styles.pafLine1, { color: colors.text }]} numberOfLines={1}>{item.line1}</Text>
                        {item.line2 ? (
                          <Text style={[styles.pafLine2, { color: colors.subtext }]}>{item.line2}</Text>
                        ) : null}
                        <Text style={[styles.pafLine2, { color: colors.subtext }]}>
                          {[item.postTown, item.postcode].filter(Boolean).join('  ')}
                        </Text>
                      </View>
                      {selected && (
                        <View style={styles.pafRemove}>
                          <Text style={{ color: '#f87171', fontSize: 18, lineHeight: 20 }}>×</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />

              {/* Panel footer */}
              <View style={styles.pafFooter}>
                <TouchableOpacity
                  onPress={() => { setPafResults([]); setPafCounts({}); }}
                  style={styles.pafDismissBtn}
                >
                  <Text style={{ color: colors.subtext }}>✕ Dismiss</Text>
                </TouchableOpacity>
                {selectedPafCount > 0 && (
                  <TouchableOpacity
                    style={[styles.pafAddSelectedBtn, { backgroundColor: colors.green }]}
                    onPress={handleAddSelected}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${selectedPafCount} selected address${selectedPafCount !== 1 ? 'es' : ''}`}
                  >
                    <Text style={styles.pafAddSelectedText}>
                      Add {selectedPafCount} selected
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
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
              {isAddMode
                ? 'Search a postcode to add more stops to your active route'
                : 'Enter a postcode to see all houses on that street, or tap 📂 to import a CSV'}
            </Text>
          </View>
        ) : Platform.OS === 'web' ? (
          <FlatList
            data={stops}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => (
              <StopRow
                item={item}
                drag={() => {}}
                isActive={false}
                onRemove={() => handleRemoveStop(item.id)}
                onParcelChange={delta => handleParcelCount(item.id, delta)}
                onMoveUp={index > 0 ? () => handleMoveStop(item.id, 'up') : undefined}
                onMoveDown={index < stops.length - 1 ? () => handleMoveStop(item.id, 'down') : undefined}
              />
            )}
            contentContainerStyle={{ paddingBottom: 260 }}
          />
        ) : (
          <DraggableFlatList
            data={stops}
            keyExtractor={item => item.id}
            onDragEnd={({ data }) => setStops(data)}
            renderItem={({ item, drag, isActive, getIndex }) => {
              const idx = getIndex() ?? 0;
              return (
                <StopRow
                  item={item}
                  drag={drag}
                  isActive={isActive}
                  onRemove={() => handleRemoveStop(item.id)}
                  onParcelChange={delta => handleParcelCount(item.id, delta)}
                  onMoveUp={idx > 0 ? () => handleMoveStop(item.id, 'up') : undefined}
                  onMoveDown={idx < stops.length - 1 ? () => handleMoveStop(item.id, 'down') : undefined}
                />
              );
            }}
            contentContainerStyle={{ paddingBottom: 260 }}
          />
        )}
      </View>

      {/* DEPARTURE TIME — hidden in add mode */}
      {!isAddMode && (
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
      )}

      {/* CTA FOOTER */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {isAddMode ? (
          /* Add mode: single button — appends stops to active shift */
          <TouchableOpacity
            style={[styles.ctaBtn, {
              backgroundColor: stops.length > 0 ? colors.green : '#1c2a37',
            }]}
            onPress={handleContinue}
            disabled={stops.length === 0}
            accessibilityRole="button"
            accessibilityLabel={`Add ${stops.length} stop${stops.length !== 1 ? 's' : ''} to route`}
          >
            <Text style={styles.ctaBtnText}>
              {stops.length > 0
                ? `Add ${stops.length} Stop${stops.length !== 1 ? 's' : ''} to Route`
                : 'Select stops to add'}
            </Text>
          </TouchableOpacity>
        ) : stops.length >= 2 ? (
          /* Normal mode with stops: two side-by-side buttons */
          <View style={styles.footerDual}>
            <TouchableOpacity
              style={[styles.ctaBtnHalf, { backgroundColor: '#1c2a37' }]}
              onPress={handleOptimise}
              disabled={optimising}
              accessibilityRole="button"
              accessibilityLabel="Optimise route order"
            >
              {optimising
                ? <ActivityIndicator color={colors.green} size="small" />
                : <Text style={[styles.ctaBtnText, { color: colors.green }]}>Optimise ✦</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ctaBtnHalf, { backgroundColor: colors.green }]}
              onPress={handleContinue}
              accessibilityRole="button"
              accessibilityLabel={`Review ${stops.length} stops`}
            >
              <Text style={styles.ctaBtnText}>Start Route →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Normal mode, 0–1 stops: single button */
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
                ? `Review ${stops.length} Stop  →`
                : 'Add stops to continue'}
            </Text>
          </TouchableOpacity>
        )}
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
  container:         { flex: 1 },
  header:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                       paddingVertical: 14, borderBottomWidth: 1 },
  backBtn:           { paddingRight: 12 },
  backText:          { fontSize: 18, fontWeight: '500' },
  title:             { flex: 1, fontSize: 18, fontWeight: '700' },
  saveBtn:           { paddingLeft: 12 },
  saveText:          { fontSize: 18 },
  searchRow:         { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  searchInput:       { flex: 1, height: 56, borderRadius: 12, paddingHorizontal: 16,
                       fontSize: 16, borderWidth: 1 },
  fileBtn:           { width: 56, height: 56, borderRadius: 12, justifyContent: 'center',
                       alignItems: 'center' },

  // PAF panel
  pafPanel:          { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  pafHeader:         { flexDirection: 'row', alignItems: 'center',
                       justifyContent: 'space-between',
                       paddingHorizontal: 16, paddingVertical: 12 },
  pafHeaderText:     { fontSize: 13, fontWeight: '600' },
  pafSelectAll:      { fontSize: 13, fontWeight: '700' },
  pafRow:            { flexDirection: 'row', alignItems: 'center',
                       paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1 },
  pafRowSelected:    { backgroundColor: '#1a2f1a' },
  pafRowContent:     { flex: 1, marginHorizontal: 10 },
  pafToggle:         { width: 24, height: 24, borderRadius: 12, borderWidth: 2,
                       justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  pafRemove:         { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  pafLine1:          { fontSize: 15, fontWeight: '600' },
  pafLine2:          { fontSize: 12, marginTop: 2 },
  pafFooter:         { flexDirection: 'row', alignItems: 'center',
                       justifyContent: 'space-between',
                       paddingHorizontal: 12, paddingVertical: 10 },
  pafDismissBtn:     { padding: 8 },
  pafAddSelectedBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  pafAddSelectedText:{ color: '#fff', fontWeight: '700', fontSize: 14 },

  // Stop list
  listSection:       { flex: 1 },
  emptyState:        { flex: 1, alignItems: 'center', justifyContent: 'center',
                       paddingHorizontal: 40, paddingTop: 60 },
  emptyIcon:         { fontSize: 48, marginBottom: 12 },
  emptyTitle:        { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody:         { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  stopRow:           { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
                       marginVertical: 4, padding: 14, borderRadius: 10, minHeight: 64 },
  handle:            { fontSize: 20, marginRight: 12, width: 24, textAlign: 'center' },
  webMoveCol:        { justifyContent: 'center', alignItems: 'center', marginRight: 8, gap: 2 },
  webArrow:          { padding: 6 },
  webRemoveBtn:      { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  stopContent:       { flex: 1 },
  stopAddress:       { fontSize: 15, fontWeight: '600' },
  notesToggle:       { marginTop: 4 },
  notesInput: {
    borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 13,
    marginTop: 6, minHeight: 48, textAlignVertical: 'top',
  },
  stepper:           { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn:           { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1c2a37',
                       justifyContent: 'center', alignItems: 'center' },
  stepText:          { fontSize: 18, fontWeight: '700', lineHeight: 20 },
  stepCount:         { fontSize: 15, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  swipeRemove:       { backgroundColor: '#c62828', justifyContent: 'center',
                       alignItems: 'center', width: 80, marginVertical: 4, borderRadius: 10 },
  swipeRemoveText:   { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Departure time
  timeSection:       { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 12 },
  timeLabel:         { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  chipRow:           { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip:              { flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
  chipText:          { fontSize: 13, fontWeight: '700' },
  timeDisplay:       { fontSize: 13, fontWeight: '500' },

  // Footer
  footer:            { paddingHorizontal: 16, paddingTop: 10 },
  footerDual:        { flexDirection: 'row', gap: 10 },
  ctaBtn:            { height: 60, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  ctaBtnHalf:        { flex: 1, height: 60, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  ctaBtnText:        { color: '#fff', fontSize: 17, fontWeight: '800' },

  // Modal
  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center',
                       alignItems: 'center', padding: 24 },
  modalCard:         { width: '100%', maxWidth: 400, borderRadius: 16, padding: 24 },
  modalTitle:        { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  modalInput:        { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48,
                       fontSize: 15, marginBottom: 16 },
  modalActions:      { flexDirection: 'row', gap: 12 },
  modalCancelBtn:    { flex: 1, height: 48, borderRadius: 10, borderWidth: 1,
                       justifyContent: 'center', alignItems: 'center' },
  modalCancelText:   { fontSize: 15, fontWeight: '600' },
  modalSaveBtn:      { flex: 1, height: 48, borderRadius: 10,
                       justifyContent: 'center', alignItems: 'center' },
  modalSaveText:     { fontSize: 15, fontWeight: '700' },
});
