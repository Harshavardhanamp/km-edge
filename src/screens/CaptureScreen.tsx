import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import TypePickerSheet from '../components/TypePickerSheet';
import { sha256String } from '../lib/crypto';
import { createRecord } from '../lib/db/recordStore';
import { createEvent, requestCalendarPermission } from '../lib/calendar';
import { deriveTitle } from '../lib/titleDerive';
import { telemetry } from '../lib/telemetry';
import { useScreenTracking } from '../lib/useScreenTracking';
import {
  CAPTURE_TYPES,
  type CaptureKind,
  type Classification,
  type Importance,
  type RecordType,
} from '../lib/types';
import type { AppStackParamList } from '../navigation/AppStack';

type Props = NativeStackScreenProps<AppStackParamList, 'Capture'>;

const PLACEHOLDERS: Record<CaptureKind, string> = {
  JOURNAL: "What's on your mind?",
  NOTE: 'What do you want to remember?',
  EVENT: 'What happened?',
  DECISION: 'What did you decide, and why?',
  LESSON: 'What did you learn?',
  GOAL: 'What do you want to achieve?',
  PERSON: 'Who is this person?',
};

function uuidv7(): string {
  // ponytail: crypto.randomUUID() is available in Hermes/JSC; uuid v7 timestamp prefix
  // is not critical for V1 — using randomUUID is fine, upgrade when ordering matters.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 18)}`;
}

export default function CaptureScreen({ navigation, route }: Props) {
  useScreenTracking('CaptureScreen');

  const initialKind: CaptureKind = (route.params as any)?.captureKind ?? 'JOURNAL';
  const initialType: RecordType = (route.params as any)?.recordType ?? 'KNOWLEDGE';

  const [recordType, setRecordType] = useState<RecordType>(initialType);
  const [captureKind, setCaptureKind] = useState<CaptureKind>(initialKind);
  const [content, setContent] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importance, setImportance] = useState<Importance>('NORMAL');
  const [classification, setClassification] = useState<Classification>('NORMAL');
  const [tags, setTags] = useState('');
  const [eventStart, setEventStart] = useState(new Date());
  const [eventEnd, setEventEnd] = useState<Date | null>(null);
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [saving, setSaving] = useState(false);

  const contentRef = useRef<TextInput>(null);

  const ctInfo = CAPTURE_TYPES.find((c) => c.capture_kind === captureKind)!;

  function handleBack() {
    if (content.trim()) {
      Alert.alert('Discard record?', undefined, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  }

  async function handleSave() {
    if (!content.trim() || saving) return;
    setSaving(true);

    const now = new Date();
    // EVENT: dates go into columns (envelope.event), NOT injected into body (contract §4)
    const contentFinal = content;

    const sha = await sha256String(contentFinal);
    const edge_id = uuidv7();

    let nativeCalendarEventId: string | null = null;
    if (captureKind === 'EVENT' && addToCalendar) {
      const permitted = await requestCalendarPermission();
      if (permitted) {
        try {
          nativeCalendarEventId = await createEvent(
            { title: deriveTitle(contentFinal), startDate: eventStart, endDate: eventEnd },
            reminderMinutes
          );
        } catch {
          // calendar creation failure is non-fatal — record still saves
        }
      }
    }

    createRecord({
      edge_id,
      gks_id: null,
      schema_version: 1,
      type: recordType,
      capture_kind: captureKind,
      title: deriveTitle(contentFinal),
      content: contentFinal,
      created: now.toISOString().slice(0, 10),
      author: 'human',
      classification,
      importance,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      life_areas: [],
      place: null,
      about: [],
      relationships: [],
      captured_at: now.toISOString(),
      sync_status: 'PENDING',
      sync_error: null,
      content_sha256: sha,
      native_calendar_event_id: nativeCalendarEventId,
      has_calendar_entry: nativeCalendarEventId !== null,
      reminder_minutes: nativeCalendarEventId !== null ? reminderMinutes : null,
      event_start: captureKind === 'EVENT' ? eventStart.toISOString() : null,
      event_end: captureKind === 'EVENT' && eventEnd ? eventEnd.toISOString() : null,
    });

    telemetry.action('record_save', { type: recordType, capture_kind: captureKind });
    setSaving(false);
    navigation.replace('RecordDetail', { edge_id });
  }

  return (
    <>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.headerBtn}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowTypePicker(true)} style={styles.typeLabel}>
          <Text style={styles.typeLabelText}>{ctInfo.icon} {ctInfo.label}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!content.trim() || saving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.headerBtn, styles.saveBtn, !content.trim() && styles.saveBtnDisabled]}>
            Save
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled">
          <TextInput
            ref={contentRef}
            style={styles.contentInput}
            placeholder={PLACEHOLDERS[captureKind]}
            placeholderTextColor="#A09080"
            multiline
            autoFocus
            value={content}
            onChangeText={setContent}
            textAlignVertical="top"
          />

          {/* More details toggle */}
          <TouchableOpacity
            style={styles.moreToggle}
            onPress={() => setMoreOpen((v) => !v)}
          >
            <Text style={styles.moreToggleText}>
              {moreOpen ? '▾' : '▸'} More details
            </Text>
          </TouchableOpacity>

          {moreOpen && (
            <View style={styles.moreSection}>
              <FieldRow label="Tags">
                <TextInput
                  style={styles.fieldInput}
                  placeholder="work, family, …"
                  placeholderTextColor="#A09080"
                  value={tags}
                  onChangeText={setTags}
                />
              </FieldRow>

              <FieldRow label="Importance">
                <SegmentControl
                  options={['LOW', 'NORMAL', 'HIGH'] as Importance[]}
                  selected={importance}
                  onSelect={setImportance}
                />
              </FieldRow>

              <FieldRow label="Classification">
                <SegmentControl
                  options={['NORMAL', 'PRIVATE'] as Classification[]}
                  selected={classification}
                  onSelect={setClassification}
                />
              </FieldRow>

              {captureKind === 'EVENT' && (
                <>
                  <FieldRow label="Event start">
                    <DateTimePicker
                      value={eventStart}
                      mode="datetime"
                      display="compact"
                      onChange={(_, d) => d && setEventStart(d)}
                    />
                  </FieldRow>
                  <FieldRow label="Event end (optional)">
                    <DateTimePicker
                      value={eventEnd ?? eventStart}
                      mode="datetime"
                      display="compact"
                      onChange={(_, d) => d && setEventEnd(d)}
                    />
                  </FieldRow>
                  <FieldRow label="Add to calendar">
                    <Switch
                      value={addToCalendar}
                      onValueChange={setAddToCalendar}
                      trackColor={{ true: '#C17A3A' }}
                    />
                  </FieldRow>
                  {addToCalendar && (
                    <FieldRow label="Reminder">
                      <SegmentControl
                        options={[0, 15, 30, 60] as any[]}
                        selected={reminderMinutes as any}
                        onSelect={(v: any) => setReminderMinutes(v)}
                        labels={['None', '15m', '30m', '1h']}
                      />
                    </FieldRow>
                  )}
                </>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <TypePickerSheet
        visible={showTypePicker}
        onSelect={(type, kind) => {
          setRecordType(type);
          setCaptureKind(kind);
          setShowTypePicker(false);
        }}
        onDismiss={() => setShowTypePicker(false)}
      />
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SegmentControl<T>({
  options,
  selected,
  onSelect,
  labels,
}: {
  options: T[];
  selected: T;
  onSelect: (v: T) => void;
  labels?: string[];
}) {
  return (
    <View style={styles.segment}>
      {options.map((o, i) => (
        <TouchableOpacity
          key={String(o)}
          style={[styles.segmentOption, selected === o && styles.segmentSelected]}
          onPress={() => onSelect(o)}
        >
          <Text style={[styles.segmentText, selected === o && styles.segmentTextSelected]}>
            {labels ? labels[i] : (String(o).charAt(0) + String(o).slice(1).toLowerCase())}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
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
  headerBtn: { fontSize: 15, color: colors.accent },
  typeLabel: { flex: 1, alignItems: 'center' },
  typeLabelText: { fontSize: 16, fontWeight: '600', color: colors.text },
  saveBtn: { fontWeight: '700' },
  saveBtnDisabled: { color: '#C0A88A' },
  contentInput: {
    padding: 20,
    fontSize: 16,
    color: colors.text,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  moreToggle: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  moreToggleText: { fontSize: 14, color: '#7A6A5A', fontWeight: '500' },
  moreSection: { paddingHorizontal: 20, paddingBottom: 20, gap: 16 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 14, color: '#7A6A5A', flex: 1 },
  fieldInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#FFF',
  },
  segment: { flexDirection: 'row', gap: 4 },
  segmentOption: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { fontSize: 13, color: colors.text },
  segmentTextSelected: { color: '#FFF' },
});
