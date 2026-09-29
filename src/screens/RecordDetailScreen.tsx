import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AttachmentSourceSheet from '../components/AttachmentSourceSheet';
import AttachmentStrip from '../components/AttachmentStrip';
import MarkdownView from '../components/MarkdownView';
import TypePickerSheet from '../components/TypePickerSheet';
import { sha256String } from '../lib/crypto';
import { addAttachment, getAttachments, removeAttachment, type IncomingFile } from '../lib/attachments/attachmentService';
import type { AttachmentMeta } from '../lib/db/attachmentStore';
import {
  getRecord,
  getCalendarFields,
  softDeleteRecord,
  updateRecord,
} from '../lib/db/recordStore';
import { updateEvent, deleteEvent } from '../lib/calendar';
import { telemetry } from '../lib/telemetry';
import { useScreenTracking } from '../lib/useScreenTracking';
import type { EdgeRecord, CaptureKind, RecordType } from '../lib/types';
import { CAPTURE_TYPES } from '../lib/types';
import type { AppStackParamList } from '../navigation/AppStack';

type Props = NativeStackScreenProps<AppStackParamList, 'RecordDetail'>;

export default function RecordDetailScreen({ navigation, route }: Props) {
  useScreenTracking('RecordDetailScreen');

  const { edge_id } = route.params;
  const [record, setRecord] = useState<EdgeRecord | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [editingContent, setEditingContent] = useState(false);
  const [content, setContent] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showAttachSource, setShowAttachSource] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const refreshAttachments = useCallback(() => {
    setAttachments(getAttachments(edge_id));
  }, [edge_id]);

  useEffect(() => {
    const r = getRecord(edge_id);
    if (r) {
      setRecord(r);
      setTitle(r.title);
      setContent(r.content);
    }
    refreshAttachments();
  }, [edge_id, refreshAttachments]);

  if (!record) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Record not found</Text>
      </View>
    );
  }

  const ctInfo = CAPTURE_TYPES.find((c) => c.capture_kind === record.capture_kind)!;
  const relTime = relativeTime(record.captured_at);

  async function saveChanges(
    newTitle = title,
    newContent = content,
    newType?: RecordType,
    newKind?: CaptureKind
  ) {
    const sha = await sha256String(newContent);
    updateRecord(edge_id, {
      title: newTitle,
      content: newContent,
      type: newType ?? record.type,
      capture_kind: newKind ?? record.capture_kind,
      content_sha256: sha,
    });

    // Keep native calendar entry in sync for EVENT records
    const calFields = getCalendarFields(edge_id);
    if (calFields?.has_calendar_entry && calFields.native_calendar_event_id) {
      try {
        await updateEvent(calFields.native_calendar_event_id, {
          title: newTitle,
          startDate: new Date(), // ponytail: date not stored separately in V1 — no update possible without parsing content
        });
      } catch {
        // non-fatal: native calendar may have been deleted by user
      }
    }

    setRecord((r) => r ? {
      ...r,
      title: newTitle,
      content: newContent,
      type: newType ?? r.type,
      capture_kind: newKind ?? r.capture_kind,
    } : r);
    setDirty(false);
    telemetry.action('record_save', { edge_id });
  }

  function handleDelete() {
    const calFields = getCalendarFields(edge_id);
    const hasCalEntry = calFields?.has_calendar_entry && calFields.native_calendar_event_id;

    const message = hasCalEntry
      ? 'This will also remove the linked calendar entry.'
      : 'This cannot be undone.';

    Alert.alert('Delete record?', message, [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (hasCalEntry) {
            try { await deleteEvent(calFields!.native_calendar_event_id!); } catch { /* non-fatal */ }
          }
          softDeleteRecord(edge_id);
          telemetry.action('record_delete', { edge_id });
          navigation.goBack();
        },
      },
    ]);
  }

  function showMenu() {
    Alert.alert('Record options', undefined, [
      { text: 'Change type', onPress: () => setShowTypePicker(true) },
      { text: 'Delete', style: 'destructive', onPress: handleDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <>
      {/* Custom header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {dirty && (
            <TouchableOpacity onPress={() => saveChanges()} style={styles.saveHeaderBtn}>
              <Text style={styles.saveHeaderText}>Save</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={showMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.menuBtn}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll}>
        {/* Sub-header: type + date */}
        <Text style={styles.subHeader}>
          {ctInfo.icon} {ctInfo.label} · {record.created} · {relTime}
        </Text>

        {/* Title */}
        {editingTitle ? (
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={(t) => { setTitle(t); setDirty(true); }}
            autoFocus
            onBlur={() => setEditingTitle(false)}
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingTitle(true)}>
            <Text style={styles.title}>{title}</Text>
          </TouchableOpacity>
        )}

        {/* Content */}
        <View style={styles.divider} />
        {editingContent ? (
          <TextInput
            style={styles.contentInput}
            value={content}
            onChangeText={(c) => { setContent(c); setDirty(true); }}
            multiline
            autoFocus
            textAlignVertical="top"
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingContent(true)} activeOpacity={0.8}>
            <MarkdownView content={content} />
          </TouchableOpacity>
        )}

        {/* Optional fields */}
        {record.tags.length > 0 && (
          <Text style={styles.metaLine}>Tags: {record.tags.join(', ')}</Text>
        )}
        {record.importance !== 'NORMAL' && (
          <Text style={styles.metaLine}>Importance: {record.importance}</Text>
        )}
        {record.classification !== 'NORMAL' && (
          <Text style={styles.metaLine}>Classification: {record.classification}</Text>
        )}
        {record.life_areas.length > 0 && (
          <Text style={styles.metaLine}>Life areas: {record.life_areas.join(', ')}</Text>
        )}

        <AttachmentStrip
          attachments={attachments}
          onAdd={() => setShowAttachSource(true)}
          onRemove={async (id) => {
            await removeAttachment(edge_id, id);
            refreshAttachments();
          }}
        />
      </ScrollView>

      <TypePickerSheet
        visible={showTypePicker}
        onSelect={(type, kind) => {
          setShowTypePicker(false);
          saveChanges(title, content, type, kind);
          telemetry.action('record_type_change', { edge_id, new_type: type });
        }}
        onDismiss={() => setShowTypePicker(false)}
      />

      <AttachmentSourceSheet
        visible={showAttachSource}
        onFile={async (file: IncomingFile) => {
          const result = await addAttachment(edge_id, file);
          if (!result.ok) {
            setAttachError(result.reason);
          } else {
            refreshAttachments();
          }
        }}
        onDismiss={() => setShowAttachSource(false)}
      />
    </>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  notFound: { color: '#7A6A5A', fontSize: 15 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  backBtn: { color: colors.accent, fontSize: 15 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveHeaderBtn: { backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 },
  saveHeaderText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  menuBtn: { fontSize: 22, color: colors.text, paddingHorizontal: 4 },
  scroll: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  subHeader: { fontSize: 13, color: '#7A6A5A', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 1,
    borderColor: colors.accent,
    paddingBottom: 4,
    marginBottom: 4,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  contentInput: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    minHeight: 160,
    textAlignVertical: 'top',
  },
  metaLine: { fontSize: 13, color: '#7A6A5A', marginTop: 8 },
});
