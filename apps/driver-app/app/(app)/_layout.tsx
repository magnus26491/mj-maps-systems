import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle:      { backgroundColor: '#111827' },
        headerTintColor:  '#f9fafb',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle:     { backgroundColor: '#030712' },
      }}
    />
  );
}