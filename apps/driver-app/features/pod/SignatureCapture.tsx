/**
 * features/pod/SignatureCapture.tsx
 *
 * Signature capture using @amwebexpert/react-native-sign-here (SVG + GestureHandler).
 * NOT react-native-signature-canvas (WebView-based).
 * Modal is only mounted while visible — no camera overhead when closed.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../components/ThemeContext';

// @amwebexpert/react-native-sign-here — SVG signature pad
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SignatureView = require('@amwebexpert/react-native-sign-here').default;

interface SignatureCaptureProps {
  onCapture: (svg: string) => void;
  captured:  boolean;
}

export function SignatureCapture({ onCapture, captured }: SignatureCaptureProps) {
  const { colors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [hasStrokes, setHasStrokes]     = useState(false);
  const sigRef = useRef<{ exportToSVG: () => Promise<string> } | null>(null);

  const handleConfirm = useCallback(async () => {
    if (!sigRef.current) return;
    try {
      const svg = await sigRef.current.exportToSVG();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCapture(svg);
      setModalVisible(false);
      setHasStrokes(false);
    } catch { /* non-fatal */ }
  }, [onCapture]);

  return (
    <>
      {/* Trigger button */}
      <View style={styles.wrapper}>
        <TouchableOpacity
          style={[
            styles.btn,
            { backgroundColor: captured ? colors.green : colors.surfaceAlt },
          ]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Capture customer signature"
          accessibilityHint="Opens a signature pad for the customer to sign"
        >
          <Text style={styles.icon}>✍️</Text>
          <Text style={styles.label}>Sign</Text>
          {captured && (
            <View style={styles.tickBadge}>
              <Text style={styles.tick}>✓</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Signature modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Customer Signature
            </Text>
            <TouchableOpacity
              onPress={() => { setModalVisible(false); setHasStrokes(false); }}
              accessibilityRole="button"
              accessibilityLabel="Close signature pad"
            >
              <Text style={[styles.headerBtn, { color: colors.subtext }]}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* Signature pad */}
          <View style={{ flex: 1, margin: 16 }}>
            <SignatureView
              ref={sigRef as any}
              style={{ flex: 1, backgroundColor: colors.surface }}
              strokeColor={isDark ? '#ffffff' : '#1a2733'}
              strokeWidth={3}
              onBeginStroke={() => setHasStrokes(true)}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                { backgroundColor: hasStrokes ? colors.green : colors.surfaceAlt },
              ]}
              onPress={handleConfirm}
              disabled={!hasStrokes}
              accessibilityRole="button"
              accessibilityLabel="Confirm signature"
            >
              <Text style={styles.confirmBtnText}>CONFIRM SIGNATURE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  btn: {
    flex: 1,
    height: 64,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  icon:   { fontSize: 22 },
  label:  { fontSize: 12, color: '#fff', fontWeight: '600', marginTop: 4 },
  tickBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1b5e20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tick:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  modal:  { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerBtn:   { fontSize: 16, fontWeight: '600' },
  footer: {
    paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12,
  },
  confirmBtn: {
    height: 56, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  confirmBtnText: {
    color: '#fff', fontSize: 17, fontWeight: '700',
  },
});