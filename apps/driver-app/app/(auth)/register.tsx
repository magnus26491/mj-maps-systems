import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../../lib/auth';
import { apiLogin } from '../../lib/api';

const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

const GREEN = '#2e7d32'; // DARK_THEME.green

function PasswordStrengthBar({ strength }: { strength: number }) {
  const segments = [1, 2, 3, 4];
  return (
    <View style={styles.strengthBar}>
      {segments.map(i => (
        <View
          key={i}
          style={[
            styles.strengthSegment,
            {
              backgroundColor: i <= strength
                ? strength >= 4 ? GREEN : '#f59e0b'
                : '#1f2937',
              borderRadius: 2,
            },
          ]}
        />
      ))}
      {strength > 0 && (
        <Text style={[styles.strengthLabel, { color: '#9ca3af' }]}>
          {['', 'Weak', 'Fair', 'Good', 'Strong'][strength]}
        </Text>
      )}
    </View>
  );
}

export default function RegisterScreen() {
  const router  = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);

  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [errors,          setErrors]          = useState<{
    name?: string; email?: string; password?: string; confirm?: string;
  }>({});

  const strength = [
    password.length >= 8,
    /[0-9]/.test(password),
    /[A-Z]/.test(password),
    /[!@#$%^&*]/.test(password),
  ].filter(Boolean).length;

  const handleRegister = useCallback(async () => {
    // Step 1 — Client validate
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = 'Full name is required';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Valid email is required';
    if (!password || password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword) errs.confirm = 'Passwords do not match';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});

    setLoading(true);
    try {
      // Step 2 — Call register API
      const regRes = await fetch(`${API}/api/v1/auth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });

      if (regRes.status === 409) {
        setErrors({ email: 'An account with this email already exists' });
        return;
      }
      if (regRes.status === 400) {
        const data = await regRes.json() as { error: string; fields?: string[] };
        const fieldErrs: typeof errors = {};
        if (data.fields) {
          data.fields.forEach(f => {
            if (f === 'name')    fieldErrs.name = 'Invalid name';
            if (f === 'email')   fieldErrs.email = 'Invalid email';
            if (f === 'password') fieldErrs.password = 'Password too short';
          });
        }
        setErrors(fieldErrs);
        return;
      }
      if (!regRes.ok) {
        Alert.alert('Registration failed', 'Please try again.');
        return;
      }

      // Step 3 — Auto-login (same as login.tsx)
      const loginRes = await apiLogin(email.trim(), password);
      await setAuth(loginRes.data.token, loginRes.data.refreshToken, loginRes.data.user);

      // Step 4 — Open Stripe Checkout
      const token = useAuthStore.getState().token;
      try {
        const checkoutRes = await fetch(`${API}/api/v1/billing/checkout`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (checkoutRes.ok) {
          const { data } = await checkoutRes.json() as { ok: boolean; data: { checkoutUrl: string } };
          if (data?.checkoutUrl) {
            const result = await WebBrowser.openAuthSessionAsync(
              data.checkoutUrl,
              'mjmaps://billing/success',
            );
            // Even if user cancels, proceed to app
            void result;
          }
        }
      } catch {
        // Don't block on billing failure
      }

      router.replace('/(app)/');
    } catch {
      Alert.alert('Registration failed', 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [name, email, password, confirmPassword, setAuth]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#030712' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: GREEN }]}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>14-day free trial · cancel anytime</Text>

        {/* Name */}
        <TextInput
          style={[styles.input, errors.name ? styles.inputError : undefined]}
          placeholder="Full Name"
          placeholderTextColor="#6b7280"
          value={name}
          onChangeText={t => { setName(t); setErrors(e => ({ ...e, name: undefined })); }}
          autoCapitalize="words"
        />
        {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

        {/* Email */}
        <TextInput
          style={[styles.input, errors.email ? styles.inputError : undefined]}
          placeholder="Email address"
          placeholderTextColor="#6b7280"
          value={email}
          onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: undefined })); }}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

        {/* Password */}
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, errors.password ? styles.inputError : undefined, { flex: 1 }]}
            placeholder="Password"
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={t => { setPassword(t); setErrors(e => ({ ...e, password: undefined })); }}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword(v => !v)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Text style={styles.eyeText}>{showPassword ? '👁' : '👁‍🗨'}</Text>
          </TouchableOpacity>
        </View>
        {password.length > 0 && <PasswordStrengthBar strength={strength} />}
        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

        {/* Confirm Password */}
        <TextInput
          style={[styles.input, errors.confirm ? styles.inputError : undefined]}
          placeholder="Confirm Password"
          placeholderTextColor="#6b7280"
          value={confirmPassword}
          onChangeText={t => { setConfirmPassword(t); setErrors(e => ({ ...e, confirm: undefined })); }}
          secureTextEntry={!showPassword}
        />
        {errors.confirm ? <Text style={styles.errorText}>{errors.confirm}</Text> : null}

        {/* Terms */}
        <Text style={styles.terms}>
          By continuing you agree to our{' '}
          <Text
            style={{ color: GREEN }}
            onPress={() => Linking.openURL('https://mjmaps.co.uk/terms')}
          >
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text
            style={{ color: GREEN }}
            onPress={() => Linking.openURL('https://mjmaps.co.uk/privacy')}
          >
            Privacy Policy
          </Text>
        </Text>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Create Account & Start Trial →</Text>}
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={[styles.footerLink, { color: GREEN }]}>Log In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll:          { padding: 24, paddingTop: 16 },
  back:            { fontSize: 18, fontWeight: '500', marginBottom: 24 },
  title:           { fontSize: 24, fontWeight: '700', color: '#f9fafb', marginBottom: 4 },
  subtitle:        { fontSize: 14, color: '#9ca3af', marginBottom: 24 },
  input:           {
    backgroundColor: '#1f2937', borderRadius: 10, borderWidth: 1,
    borderColor: '#374151', color: '#f9fafb', paddingHorizontal: 16,
    paddingVertical: 14, fontSize: 15, marginBottom: 12,
  },
  inputError:      { borderColor: '#f87171' },
  passwordRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn:          { padding: 10 },
  eyeText:         { fontSize: 18 },
  strengthBar:     { flexDirection: 'row', gap: 4, alignItems: 'center', marginBottom: 4 },
  strengthSegment: { flex: 1, height: 4 },
  strengthLabel:   { fontSize: 12, marginLeft: 6 },
  errorText:       { color: '#f87171', fontSize: 13, marginBottom: 8, marginTop: -6 },
  terms:           { color: '#9ca3af', fontSize: 13, lineHeight: 20, marginBottom: 20 },
  button:          {
    backgroundColor: GREEN, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginBottom: 24,
  },
  buttonDisabled:  { opacity: 0.5 },
  buttonText:      { color: '#fff', fontWeight: '700', fontSize: 16 },
  footer:          { alignItems: 'center', paddingBottom: 32 },
  footerText:      { fontSize: 14, color: '#9ca3af' },
  footerLink:      { fontWeight: '700', fontSize: 15, marginTop: 4 },
});