import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned]           = useState(false);
  const [result, setResult]             = useState<string | null>(null);

  // Permission not yet determined
  if (!permission) {
    return <View style={styles.container} />;
  }

  // Permission denied — show request prompt
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.permText}>
          Camera access is required to scan delivery barcodes.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function handleScan({ data }: BarcodeScanningResult) {
    if (scanned) return;
    setScanned(true);
    setResult(data);
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: [
            'qr', 'code128', 'code39', 'ean13', 'ean8',
            'datamatrix', 'pdf417', 'aztec',
          ],
        }}
        onBarcodeScanned={scanned ? undefined : handleScan}
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
  container:   { flex: 1, backgroundColor: '#000' },
  center:      { justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlay:     { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  viewport:    { width: 260, height: 260, borderWidth: 2, borderColor: '#3b82f6', borderRadius: 16 },
  permText:    { color: '#d1d5db', fontSize: 15, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  resultCard:  { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: '#111827', borderRadius: 16, padding: 20 },
  resultLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  resultValue: { color: '#f9fafb', fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 16 },
  btn:         { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnText:     { color: '#fff', fontWeight: '700' },
});