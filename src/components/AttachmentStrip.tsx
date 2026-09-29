import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import type { AttachmentMeta } from '../lib/db/attachmentStore';
import { blobPath } from '../lib/db/attachmentStore';

interface Props {
  attachments: AttachmentMeta[];
  onAdd: () => void;
  onRemove: (edgeAttachmentId: string) => void;
}

function isImage(mimeType: string) {
  return mimeType.startsWith('image/');
}

function absPath(sha256: string): string {
  return `${FileSystem.documentDirectory}${blobPath(sha256)}`;
}

export default function AttachmentStrip({ attachments, onAdd, onRemove }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showError(msg: string) {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 5000);
  }

  useEffect(() => () => { if (errorTimer.current) clearTimeout(errorTimer.current); }, []);

  const images = attachments
    .filter((a) => isImage(a.mime_type))
    .map((a) => ({ uri: absPath(a.sha256) }));

  function handleLongPress(a: AttachmentMeta) {
    Alert.alert('Remove attachment?', a.original_filename, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => onRemove(a.edge_attachment_id),
      },
    ]);
  }

  async function handleTap(a: AttachmentMeta, imgIndex: number) {
    if (isImage(a.mime_type)) {
      setViewerIndex(imgIndex);
    } else {
      const path = absPath(a.sha256);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path);
      } else {
        showError('Cannot open this file type on this device.');
      }
    }
  }

  let imgIdx = -1;

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Attachments ({attachments.length})</Text>
        <TouchableOpacity onPress={onAdd}>
          <Text style={styles.addBtn}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>⚠️ {error}</Text>}

      {attachments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
          {attachments.map((a) => {
            const img = isImage(a.mime_type);
            if (img) imgIdx++;
            const capturedImgIdx = imgIdx;
            return (
              <TouchableOpacity
                key={a.edge_attachment_id}
                style={styles.thumb}
                onPress={() => handleTap(a, capturedImgIdx)}
                onLongPress={() => handleLongPress(a)}
              >
                {img ? (
                  <Image source={{ uri: absPath(a.sha256) }} style={styles.thumbImg} />
                ) : (
                  <View style={styles.docThumb}>
                    <Text style={styles.docIcon}>📄</Text>
                  </View>
                )}
                <Text style={styles.thumbName} numberOfLines={1}>
                  {a.original_filename}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {viewerIndex !== null && (
        <ImageViewing
          images={images}
          imageIndex={viewerIndex}
          visible
          onRequestClose={() => setViewerIndex(null)}
          FooterComponent={({ imageIndex }) => (
            <View style={styles.viewerFooter}>
              <Text style={styles.viewerFooterText}>
                {images[imageIndex]?.uri.split('/').pop()} ·{' '}
                {(attachments.find((a) => isImage(a.mime_type) && absPath(a.sha256) === images[imageIndex]?.uri)?.size_bytes ?? 0 / 1024).toFixed(0)} KB
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  addBtn: { fontSize: 14, color: colors.accent, fontWeight: '600' },
  error: { fontSize: 13, color: '#8B3A00', backgroundColor: '#FDE8D8', padding: 8, borderRadius: 6, marginBottom: 8 },
  strip: { flexGrow: 0 },
  thumb: { width: 72, marginRight: 10, alignItems: 'center' },
  thumbImg: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.border },
  docThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIcon: { fontSize: 28 },
  thumbName: { fontSize: 10, color: '#7A6A5A', marginTop: 4, textAlign: 'center' },
  viewerFooter: { alignItems: 'center', padding: 12 },
  viewerFooterText: { color: '#FFF', fontSize: 13 },
});
