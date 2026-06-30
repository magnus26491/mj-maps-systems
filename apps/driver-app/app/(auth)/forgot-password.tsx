import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit() {
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setLoading(true);
    setError('');
    try {
      await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // Always show success — backend never reveals whether email exists
      setSent(true);
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
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back to sign in</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Reset password</Text>

        {sent ? (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successBody}>
              If an account exists for {email.trim()}, you'll receive a reset link within a
              few minutes. Check your spam folder too.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => router.back()}>
              <Text style={styles.buttonText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Enter the email address on your account and we'll send you a link to reset your
              password.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#6b7280"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Text>
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
  backBtn:      { marginBottom: 20 },
  backText:     { color: '#6b7280', fontSize: 14 },
  title:        { fontSize: 24, fontWeight: '700', color: '#f9fafb', marginBottom: 8 },
  subtitle:     { fontSize: 14, color: '#9ca3af', marginBottom: 24, lineHeight: 20 },
  input:        { backgroundColor: '#1f2937', borderRadius: 10, borderWidth: 1, borderColor: '#374151', color: '#f9fafb', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 12 },
  button:       { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  buttonText:   { color: '#fff', fontWeight: '600', fontSize: 15 },
  error:        { color: '#f87171', fontSize: 13, marginBottom: 8 },
  successBox:   { gap: 12 },
  successTitle: { fontSize: 18, fontWeight: '700', color: '#f9fafb' },
  successBody:  { fontSize: 14, color: '#9ca3af', lineHeight: 22 },
});
