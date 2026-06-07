import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';

export default function ScanScreen() {
  const [scanned, setScanned] = useState(false);
  const [result,   setResult] = useState<string | null>(null);

  function handleScan({ type, data }: { type: string; data: string }) {
    setScanned(true);
    setResult(data);
  }

  return (
    <View style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={scanned ? undefined : handleScan}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.overlay}>
        <View style={styles.viewport} />
      </View>
      {scanned && result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Scanned</Text>
          <Text style={styles.resultValue}>{result}</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => { setScanned(false); setResult(null); }}
          >
            <Text style={styles.btnText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  overlay:       { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  viewport:      { width: 260, height: 260, borderWidth: 2, borderColor: '#3b82f6', borderRadius: 16 },
  resultCard:    { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: '#111827', borderRadius: 16, padding: 20 },
  resultLabel:   { color: '#9ca3af', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  resultValue:   { color: '#f9fafb', fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 16 },
  btn:           { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnText:       { color: '#fff', fontWeight: '700' },
});