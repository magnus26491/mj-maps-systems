import { Redirect } from 'expo-router';
import { useShiftStore } from '../store/shift';
import { useAuthStore } from '../lib/auth';

export default function Index() {
  const isShiftActive = useShiftStore(s => s.isActive);
  const isAuthed      = useAuthStore(s => s.token !== null);

  if (!isAuthed) return <Redirect href="/(auth)/plans" />;
  return <Redirect href={isShiftActive ? '/delivery' : '/vehicle-select'} />;
}
