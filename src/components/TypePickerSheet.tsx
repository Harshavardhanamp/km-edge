import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { CAPTURE_TYPES, type CaptureKind, type RecordType } from '../lib/types';

interface Props {
  visible: boolean;
  onSelect: (type: RecordType, captureKind: CaptureKind) => void;
  onDismiss: () => void;
}

export default function TypePickerSheet({ visible, onSelect, onDismiss }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.heading}>What are you capturing?</Text>

        <View style={styles.grid}>
          {CAPTURE_TYPES.map((ct) => (
            <TouchableOpacity
              key={ct.capture_kind}
              style={styles.cell}
              onPress={() => onSelect(ct.type, ct.capture_kind)}
            >
              <Text style={styles.icon}>{ct.icon}</Text>
              <Text style={styles.label}>{ct.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const colors = { bg: '#FDF8F4', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  heading: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cell: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF',
    gap: 6,
  },
  icon: { fontSize: 28 },
  label: { fontSize: 13, color: colors.text },
});
