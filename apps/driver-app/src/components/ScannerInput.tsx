/**
 * ScannerInput — the postcode-first stop entry component
 *
 * Used in two scenarios:
 *   1. Manual entry: driver types a postcode, gets an address picker
 *   2. Scanner entry: driver scans a parcel barcode, postcode is auto-filled
 *      from the manifest data attached to the scan event
 *
 * Designed for one-handed use at the back of a van with gloves on.
 * All touch targets are 56px+.
 *
 * Compatible with DHL handheld scanners (Zebra TC series) which output
 * barcode data as keyboard HID events — the text input captures them naturally.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Keyboard,
} from 'react-native';
import { normalisePostcode, resolvePostcode, type AddressCandidate } from '../../../../services/postcode-resolver/index';

interface ScannerInputProps {
  geoapifyKey: string;
  onStopSelected: (candidate: AddressCandidate) => void;
  maxStops?: number;         // subscription gate — from plan
  currentStopCount?: number;
  onLimitReached?: () => void;
}

export function ScannerInput({
  geoapifyKey,
  onStopSelected,
  maxStops,
  currentStopCount = 0,
  onLimitReached,
}: ScannerInputProps) {
  const [query, setQuery]           = useState('');
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const inputRef                    = useRef<TextInput>(null);
  const debounceTimer               = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookup = useCallback(async (raw: string) => {
    const cleaned = raw.trim();
    // UK postcode is at least 5 chars e.g. "SW1A 2AA" or "CM14PP"
    if (cleaned.length < 5) { setCandidates([]); return; }

    setLoading(true);
    setError(null);
    try {
      const result = await resolvePostcode(cleaned, geoapifyKey);
      setCandidates(result.candidates);
    } catch (e: any) {
      setError('Could not find address. Check postcode and try again.');
    } finally {
      setLoading(false);
    }
  }, [geoapifyKey]);

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => lookup(text), 400);
  };

  const handleSelect = (candidate: AddressCandidate) => {
    // Check subscription gate
    if (maxStops !== undefined && maxStops !== -1 && currentStopCount >= maxStops) {
      onLimitReached?.();
      return;
    }
    Keyboard.dismiss();
    setQuery('');
    setCandidates([]);
    onStopSelected(candidate);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={handleChange}
          placeholder="Scan barcode or type postcode"
          placeholderTextColor="#666"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Postcode or barcode entry"
        />
        {loading && <ActivityIndicator style={styles.spinner} color="#01696f" />}
      </View>

      {error && (
        <Text style={styles.error}>{error}</Text>
      )}

      {candidates.length > 0 && (
        <FlatList
          data={candidates}
          keyExtractor={c => c.id}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.candidateRow}
              onPress={() => handleSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={`Add stop at ${item.address}`}
            >
              <View style={styles.candidateBody}>
                <Text style={styles.candidateAddress} numberOfLines={2}>
                  {item.address}
                </Text>
                <Text style={styles.candidateMeta}>
                  {item.postcode}
                  {item.confidence >= 0.8 ? '  ✓ Verified' : ''}
                </Text>
              </View>
              <Text style={styles.addIcon}>+</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { width: '100%' },
  inputRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 56,
    backgroundColor: '#1c1b19',
    borderWidth: 1,
    borderColor: '#393836',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#cdccca',
    fontFamily: 'Inter',
  },
  spinner:         { marginLeft: 8 },
  error:           { color: '#d163a7', fontSize: 14, marginTop: 6 },
  list:            { marginTop: 4, maxHeight: 320, backgroundColor: '#1c1b19', borderRadius: 8, borderWidth: 1, borderColor: '#393836' },
  candidateRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#262523', minHeight: 56 },
  candidateBody:   { flex: 1 },
  candidateAddress:{ color: '#cdccca', fontSize: 15, fontWeight: '500' },
  candidateMeta:   { color: '#797876', fontSize: 13, marginTop: 2 },
  addIcon:         { color: '#4f98a3', fontSize: 24, fontWeight: '700', marginLeft: 12 },
});
