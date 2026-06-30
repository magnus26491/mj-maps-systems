import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../lib/auth';
import { apiLogin } from '../../lib/api';

export default function LoginScreen() {
  const router  = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const passwordRef = useRef<TextInput>(null);

  async function handleLogin() {
    setLoading(true);
    setError('');
    try {
      const res = await apiLogin(email.trim(), password);
      const user = { ...res.user, name: res.user.name ?? res.user.email };
      await setAuth(res.accessToken, res.refreshToken, user);
      router.replace('/(app)/');
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      // Only surface clean API error strings to the user.
      // Raw JS errors (crashes, "is not a function", etc.) become a generic message.
      const isCleanApiError = msg.length > 0 && msg.length < 100
        && !msg.includes(' is not ') && !msg.includes('Cannot ') && !msg.includes('undefined');
      setError(isCleanApiError ? msg : 'Sign in failed. Please check your connection and try again.');
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
        <Text style={styles.title}>MJ Maps</Text>
        <Text style={styles.subtitle}>Driver sign in</Text>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#6b7280"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <TextInput
          ref={passwordRef}
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#6b7280"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={handleLogin}
          autoComplete="current-password"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.forgotBtn} onPress={() => router.push('/(auth)/forgot-password')}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Sign in</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#030712', justifyContent: 'center', padding: 24 },
  card:           { backgroundColor: '#111827', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#1f2937' },
  title:          { fontSize: 24, fontWeight: '700', color: '#f9fafb', marginBottom: 4 },
  subtitle:       { fontSize: 14, color: '#9ca3af', marginBottom: 24 },
  input:          { backgroundColor: '#1f2937', borderRadius: 10, borderWidth: 1, borderColor: '#374151', color: '#f9fafb', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 12 },
  button:         { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: '#fff', fontWeight: '600', fontSize: 15 },
  error:          { color: '#f87171', fontSize: 13, marginBottom: 8 },
  forgotBtn:      { alignSelf: 'flex-end', marginBottom: 4 },
  forgotText:     { color: '#6b7280', fontSize: 13 },
});