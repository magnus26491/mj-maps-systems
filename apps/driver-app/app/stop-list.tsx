/**
 * Stop List Screen — full route view with alert pills.
 * FlatList with fixed item height for virtualisation performance.
 * Bottom back button stays in thumb zone.
 */
import { useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useShiftStore } from '../store/shift';
import { useDrivingMode } from '../hooks/useDrivingMode';

const ITEM_HEIGHT = 88;

export default function StopListScreen() {
  const shift      = useShiftStore(s => s.shift);
  const stops      = useShiftStore(s => s.stops);
  const isActive   = useShiftStore(s => s.isActive);
  const endShift   = useShiftStore(s => s.endShift);
  const currentStop = useShiftStore(s => s.currentStop);
  const { isDriving } = useDrivingMode();
  const flatListRef = useRef<FlatList>(null);

  const jumpToCurrent = useCallback(() => {
    if (!currentStop) return;
    const idx = Math.max(0, currentStop.index - 1);
    flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [currentStop]);

  const handleEndShift = useCallback(() => {
    Alert.alert(
      'End shift?',
      'This will close your current route. All completed stops are saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Shift',
          style: 'destructive',
          onPress: () => { endShift(); router.replace('/'); },
        },
      ],
    );
  }, [endShift]);

  const renderStop = useCallback(({ item, index }: any) => {
    const isDone    = item.status === 'completed';
    const isFailed  = item.status === 'failed';
    const isCurrent = item.id === currentStop?.id;

    return (
      <TouchableOpacity
        style={[
          styles.stopRow,
          isCurrent && styles.stopRowCurrent,
          isDone    && styles.stopRowDone,
          isFailed  && styles.stopRowFailed,
        ]}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Stop ${index + 1}: ${item.address}`}
        onPress={() => router.push({ pathname: '/stop-delivery', params: { stopId: item.id } })}
      >
        <View style={[
          styles.indexBadge,
          isCurrent && styles.indexBadgeCurrent,
          isDone    && styles.indexBadgeDone,
          isFailed  && styles.indexBadgeFailed,
        ]}>
          <Text style={styles.indexText}>{isDone ? '✓' : isFailed ? '✕' : index + 1}</Text>
        </View>

        <View style={styles.stopInfo}>
          <Text
            style={[styles.stopAddr, isDone && styles.stopAddrDone]}
            numberOfLines={2}
          >
            {item.address}
          </Text>
          {item.notes ? (
            <Text style={styles.stopNote} numberOfLines={1}>{item.notes}</Text>
          ) : null}
          <View style={styles.stopMeta}>
            {item.alertLevel && item.alertLevel !== 'GREEN' && (
              <View style={[
                styles.alertPill,
                item.alertLevel === 'RED'   && styles.alertPillRed,
                item.alertLevel === 'AMBER' && styles.alertPillAmber,
              ]}>
                <Text style={styles.alertPillText}>
                  {item.alertLevel === 'RED' ? 'No turn' : 'Tight'}
                </Text>
              </View>
            )}
            {item.etaLabel && (
              <Text style={styles.metaText}>{item.etaLabel}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [currentStop]);

  return (
    <SafeAreaView style={styles.safe}>
      {isDriving && (
        <View style={styles.drivingBanner}>
          <Text style={styles.drivingBannerText}>🚗  Stop the vehicle before browsing stops</Text>
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to HUD"
        >
          <Text style={styles.backText}>‹ HUD</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{shift?.totalStops ?? 0} Stops</Text>
        <TouchableOpacity
          style={styles.jumpBtn}
          onPress={jumpToCurrent}
          accessibilityRole="button"
          accessibilityLabel="Jump to current stop"
        >
          <Text style={styles.jumpBtnText}>⊙ Now</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={stops}
        keyExtractor={item => item.id}
        renderItem={renderStop}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index,
        })}
        initialScrollIndex={Math.max(0, (currentStop?.index ?? 0) - 1)}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => flatListRef.current?.scrollToIndex({ index, animated: true }), 200);
        }}
        maxToRenderPerBatch={12}
        windowSize={5}
      />

      {/* FIX 6: End Shift footer — visible only when shift is active */}
      {isActive && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.endShiftBtn}
            onPress={handleEndShift}
            accessibilityRole="button"
            accessibilityLabel="End shift"
          >
            <Text style={styles.endShiftBtnText}>End shift</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: '#0f1923' },
  drivingBanner: {
    backgroundColor: '#c62828', paddingVertical: 16,
    alignItems: 'center', paddingHorizontal: 16,
  },
  drivingBannerText: {
    color: '#fff', fontWeight: '800', fontSize: 17, textAlign: 'center',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1c2a37',
  },
  backBtn:            { minWidth: 60, minHeight: 44, justifyContent: 'center' },
  backText:           { color: '#4fc3f7', fontSize: 17, fontWeight: '600' },
  title:              { color: '#e0eaf4', fontSize: 17, fontWeight: '700' },
  list:               { paddingVertical: 8 },
  stopRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    minHeight: ITEM_HEIGHT, borderBottomWidth: 1, borderBottomColor: '#1c2a37',
  },
  stopRowCurrent:     { backgroundColor: '#1a2f3f' },
  stopRowDone:        { opacity: 0.45 },
  stopRowFailed:      { opacity: 0.45 },
  indexBadge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1c2a37', alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  indexBadgeCurrent:  { backgroundColor: '#4fc3f7' },
  indexBadgeDone:     { backgroundColor: '#2e7d32' },
  indexBadgeFailed:   { backgroundColor: '#b71c1c' },
  indexText:          { color: '#e0eaf4', fontWeight: '700', fontSize: 14 },
  stopInfo:           { flex: 1 },
  stopAddr:           { color: '#c8d8e8', fontSize: 17, fontWeight: '600', lineHeight: 24 },
  stopAddrDone:       { color: '#607080' },
  stopNote:           { color: '#8fa0b0', fontSize: 12, marginTop: 2 },
  stopMeta:           { flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' },
  alertPill: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: '#3b2a0d',
  },
  alertPillRed:       { backgroundColor: '#3b0d0d' },
  alertPillAmber:     { backgroundColor: '#3b2a0d' },
  alertPillText:      { fontSize: 13, fontWeight: '700', color: '#ffe082' },
  metaText:           { fontSize: 12, color: '#607080' },
  jumpBtn:            { minWidth: 60, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  jumpBtnText:        { color: '#4fc3f7', fontSize: 13, fontWeight: '700' },

  // End Shift footer
  footer: {
    borderTopWidth: 1, borderTopColor: '#1c2a37',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  endShiftBtn: {
    borderWidth: 1, borderColor: '#EF4444', borderRadius: 12,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  endShiftBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 16 },
});
