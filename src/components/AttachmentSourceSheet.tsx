import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { AttachmentSource, IncomingFile } from '../lib/attachments/attachmentService';

interface Props {
  visible: boolean;
  onFile: (file: IncomingFile) => void;
  onDismiss: () => void;
}

const options = [
  { icon: '📁', label: 'Files', key: 'files' },
  { icon: '📷', label: 'Take photo', key: 'camera' },
  { icon: '🖼️', label: 'Photo library', key: 'gallery' },
  { icon: '📋', label: 'Scan document', key: 'scan' },
] as const;

export default function AttachmentSourceSheet({ visible, onFile, onDismiss }: Props) {
  async function pick(source: AttachmentSource) {
    onDismiss();

    if (source === 'files') {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        onFile({ uri: a.uri, name: a.name, size: a.size ?? 0, mimeType: a.mimeType ?? 'application/octet-stream', source });
      }
      return;
    }

    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Camera permission denied'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 1 });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        const name = a.fileName ?? `photo_${Date.now()}.jpg`;
        onFile({ uri: a.uri, name, size: a.fileSize ?? 0, mimeType: a.mimeType ?? 'image/jpeg', source });
      }
      return;
    }

    if (source === 'gallery') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Photo library permission denied'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        const name = a.fileName ?? `image_${Date.now()}.jpg`;
        onFile({ uri: a.uri, name, size: a.fileSize ?? 0, mimeType: a.mimeType ?? 'image/jpeg', source });
      }
      return;
    }

    // scan — use document picker in scan mode (best available in Expo without expo-camera doc scan)
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: 'application/pdf' });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      onFile({ uri: a.uri, name: a.name, size: a.size ?? 0, mimeType: a.mimeType ?? 'application/pdf', source: 'scan' });
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.heading}>Add attachment</Text>

        {options.map((o) => (
          <TouchableOpacity key={o.key} style={styles.row} onPress={() => pick(o.key)}>
            <Text style={styles.icon}>{o.icon}</Text>
            <Text style={styles.label}>{o.label}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={[styles.row, styles.cancelRow]} onPress={onDismiss}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const colors = { bg: '#FDF8F4', text: '#2D2016', border: '#E0D0C0', accent: '#C17A3A' };

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
  heading: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  icon: { fontSize: 22 },
  label: { fontSize: 16, color: colors.text },
  cancelRow: { borderBottomWidth: 0, justifyContent: 'center' },
  cancel: { fontSize: 16, color: colors.accent, fontWeight: '600' },
});
