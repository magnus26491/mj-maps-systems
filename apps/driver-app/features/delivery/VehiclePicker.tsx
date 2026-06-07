/**
 * Vehicle Picker and Settings components
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useVehicleStore, VEHICLE_OPTIONS, VehicleProfile } from '../../store/vehicleStore';
import { COLORS, TextStyles } from './components';

interface VehiclePickerProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  onSelect: (profile: VehicleProfile) => void;
}

export function VehiclePicker({ bottomSheetRef, onSelect }: VehiclePickerProps) {
  const vehicleProfile = useVehicleStore(s => s.vehicleProfile);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={['70%']}
      backgroundStyle={{ backgroundColor: COLORS.background }}
      handleIndicatorStyle={{ backgroundColor: COLORS.grayDark }}
    >
      <BottomSheetScrollView contentContainerStyle={pickerStyles.container}>
        <TextStyles.address style={pickerStyles.title}>Select your vehicle</TextStyles.address>

        <View style={pickerStyles.options}>
          {VEHICLE_OPTIONS.map((option) => {
            const isSelected = vehicleProfile === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[pickerStyles.option, isSelected && pickerStyles.optionSelected]}
                onPress={() => {
                  onSelect(option.key);
                  bottomSheetRef.current?.dismiss();
                }}
              >
                <View style={pickerStyles.optionContent}>
                  <Text style={pickerStyles.optionLabel}>{option.label}</Text>
                  <Text style={pickerStyles.optionDesc}>{option.description}</Text>
                </View>
                {isSelected && (
                  <Text style={pickerStyles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ─── Settings Bottom Sheet ────────────────────────────────────────────────────

interface SettingsSheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  onChangeVehicle: () => void;
  onEndShift: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export function SettingsSheet({
  bottomSheetRef,
  onChangeVehicle,
  onEndShift,
  isDarkMode,
  onToggleDarkMode,
}: SettingsSheetProps) {
  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={['50%']}
      backgroundStyle={{ backgroundColor: COLORS.background }}
      handleIndicatorStyle={{ backgroundColor: COLORS.grayDark }}
    >
      <View style={settingsStyles.container}>
        <TextStyles.address style={settingsStyles.title}>Settings</TextStyles.address>

        <TouchableOpacity style={settingsStyles.row} onPress={onChangeVehicle}>
          <Text style={settingsStyles.rowText}>🚗 Change vehicle</Text>
        </TouchableOpacity>

        <TouchableOpacity style={settingsStyles.row} onPress={onToggleDarkMode}>
          <Text style={settingsStyles.rowText}>
            {isDarkMode ? '☀️ Switch to light mode' : '🌙 Switch to dark mode'}
          </Text>
        </TouchableOpacity>

        <View style={settingsStyles.divider} />

        <TouchableOpacity style={settingsStyles.row} onPress={onEndShift}>
          <Text style={[settingsStyles.rowText, settingsStyles.dangerText]}>
            End shift
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={settingsStyles.cancelBtn}
          onPress={() => bottomSheetRef.current?.dismiss()}
        >
          <Text style={settingsStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  );
}

const pickerStyles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: COLORS.background,
  },
  title: {
    textAlign: 'center',
    marginBottom: 24,
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    minHeight: 72,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: COLORS.green,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.white,
  },
  optionDesc: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 24,
    color: COLORS.green,
    marginLeft: 12,
  },
});

const settingsStyles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: COLORS.background,
  },
  title: {
    textAlign: 'center',
    marginBottom: 24,
  },
  row: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
  },
  rowText: {
    fontSize: 18,
    color: COLORS.white,
  },
  dangerText: {
    color: COLORS.red,
  },
  divider: {
    height: 24,
  },
  cancelBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.gray,
  },
});