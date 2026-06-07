import { Redirect } from 'expo-router';
import { useShiftStore } from '../store/shift';

export default function Index() {
  const isShiftActive = useShiftStore(s => s.isActive);
  return <Redirect href={isShiftActive ? '/delivery' : '/vehicle-select'} />;
}
