/**
 * Reset password screen — reached via the email link:
 *   https://mjmapsystems.com/reset-password?token=<hex>
 *
 * Expo Router reads the `token` search param automatically.
 * On success: navigate to login.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState('');

  async function handleReset() {
    if (!token) { setError('Reset link is missing the token. Please use the link from your email.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== password2) { setError('Passwords do not match.'); return; }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'This link is invalid or has expired. Please request a new one.');
        return;
      }
      setDone(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Set new password</Text>

        {done ? (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>Password updated</Text>
            <Text style={styles.successBody}>
              Your password has been changed. You can now sign in with your new password.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.buttonText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {!token && (
              <Text style={styles.error}>
                Invalid reset link. Please use the link from your email.
              </Text>
            )}

            <TextInput
              style={styles.input}
              placeholder="New password (min 8 characters)"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor="#6b7280"
              value={password2}
              onChangeText={setPassword2}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={handleReset}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, (loading || !token) && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={loading || !token}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Saving…' : 'Set new password'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.backText}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#030712', justifyContent: 'center', padding: 24 },
  card:         { backgroundColor: '#111827', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#1f2937' },
  title:        { fontSize: 24, fontWeight: '700', color: '#f9fafb', marginBottom: 20 },
  input:        { backgroundColor: '#1f2937', borderRadius: 10, borderWidth: 1, borderColor: '#374151', color: '#f9fafb', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 12 },
  button:       { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  buttonText:   { color: '#fff', fontWeight: '600', fontSize: 15 },
  error:        { color: '#f87171', fontSize: 13, marginBottom: 8 },
  backBtn:      { marginTop: 16, alignItems: 'center' },
  backText:     { color: '#6b7280', fontSize: 14 },
  successBox:   { gap: 12 },
  successTitle: { fontSize: 18, fontWeight: '700', color: '#f9fafb' },
  successBody:  { fontSize: 14, color: '#9ca3af', lineHeight: 22 },
});
