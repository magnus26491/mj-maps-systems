import { View, Image, TouchableOpacity, Text, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface Props {
  photoUri:       string | null;
  onPhotoSelected: (uri: string) => void;
}

export default function PodCapture({ photoUri, onPhotoSelected }: Props) {
  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes:  ImagePicker.MediaTypeOptions.Images,
      quality:     0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets) {
      onPhotoSelected(result.assets[0].uri);
    }
  }

  return (
    <View>
      {photoUri ? (
        <View style={styles.preview}>
          <Image source={{ uri: photoUri }} style={styles.image} />
          <TouchableOpacity style={styles.retake} onPress={takePhoto}>
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.placeholder} onPress={takePhoto}>
          <Text style={styles.placeholderIcon}>📷</Text>
          <Text style={styles.placeholderText}>Take POD photo</Text>
          <Text style={styles.placeholderSub}>Optional — tap to open camera</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder:      { backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#374151', borderStyle: 'dashed', padding: 32, alignItems: 'center', gap: 6 },
  placeholderIcon:  { fontSize: 32 },
  placeholderText:  { color: '#f9fafb', fontWeight: '600', fontSize: 15 },
  placeholderSub:   { color: '#6b7280', fontSize: 13 },
  preview:          { position: 'relative' },
  image:             { width: '100%', height: 220, borderRadius: 12, resizeMode: 'cover' },
  retake:            { position: 'absolute', top: 8, right: 8, backgroundColor: '#111827cc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  retakeText:        { color: '#f9fafb', fontSize: 13, fontWeight: '600' },
});