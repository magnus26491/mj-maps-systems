/**
 * Privacy Policy screen — accessible from Settings.
 * Opens the full policy at the hosted URL.
 */
import { useEffect } from 'react';
import { Text, StyleSheet, ActivityIndicator, View, Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function PrivacyScreen() {
  const { url } = useLocalSearchParams<{ url?: string }>();

  useEffect(() => {
    const policyUrl = (url as string) || 'https://mjmaps.co.uk/privacy';
    Linking.openURL(policyUrl).catch(() => {
      // Fallback: show a message if the URL can't be opened
    });
  }, [url]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#3b82f6" size="large" />
      <Text style={styles.text}>Opening privacy policy...</Text>
      <Text style={styles.subtext}>
        If the page did not open, visit:{'\n'}mjmaps.co.uk/privacy
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  text: {
    color: '#d1d5db',
    fontSize: 16,
    marginTop: 16,
  },
  subtext: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
});