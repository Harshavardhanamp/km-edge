import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import * as Network from 'expo-network';
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
import IdentityPicker from '../components/IdentityPicker';
import { clearCaptureDraft, loadCaptureDraft, saveCaptureDraft } from '../lib/db/captureDraft';
import { applySuggestion, buildStructure, confirmBlockers, deadlinePassed, edit, newCard, statusLine, SUGGEST_DEADLINE_MS, SUMMARY_MIN_CHARS, type CardState } from '../lib/capture/reviewCard';
import { suggest } from '../lib/gksClient';
import { get, KEYS } from '../lib/secureStore';
import { sha256String } from '../lib/crypto';
import { createRecord } from '../lib/db/recordStore';
import { createEvent, requestCalendarPermission } from '../lib/calendar';
import { deriveTitle } from '../lib/titleDerive';
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

type Step = 'write' | 'review';
interface CaptureDraft {
  step: Step;
  content: string;
  captureKind: CaptureKind;
  recordType: RecordType;
  classification: Classification;
  eventStart: string;
  eventEnd: string | null;
  addToCalendar: boolean;
  reminderMinutes: number;
  card: CardState | null;
}

const typeOf = (kind: CaptureKind): RecordType => CAPTURE_TYPES.find(c => c.capture_kind === kind)?.type ?? 'KNOWLEDGE';

export default function CaptureScreen({ navigation, route }: Props) {
  // KK-2.2 E-D1: an unfinished capture (text and card) reopens where it was left.
  const draft = useRef(loadCaptureDraft<CaptureDraft>()).current;
  const initialKind: CaptureKind = draft?.captureKind ?? (route.params as any)?.captureKind ?? 'JOURNAL';
  const initialType: RecordType = draft?.recordType ?? (route.params as any)?.recordType ?? 'KNOWLEDGE';

  const [step, setStep] = useState<Step>(draft?.step ?? 'write');
  const [recordType, setRecordType] = useState<RecordType>(initialType);
  const [captureKind, setCaptureKind] = useState<CaptureKind>(initialKind);
  const [content, setContent] = useState(draft?.content ?? '');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [classification, setClassification] = useState<Classification>(draft?.classification ?? 'NORMAL');
  const [eventStart, setEventStart] = useState(draft ? new Date(draft.eventStart) : new Date());
  const [eventEnd, setEventEnd] = useState<Date | null>(draft?.eventEnd ? new Date(draft.eventEnd) : null);
  const [addToCalendar, setAddToCalendar] = useState(draft?.addToCalendar ?? false);
  const [reminderMinutes, setReminderMinutes] = useState(draft?.reminderMinutes ?? 30);
  const [card, setCard] = useState<CardState | null>(draft?.card ?? null);
  const [manualDate, setManualDate] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const request = useRef<AbortController | null>(null);

  const contentRef = useRef<TextInput>(null);
  const ctInfo = CAPTURE_TYPES.find((c) => c.capture_kind === (card?.type ?? captureKind)) ?? CAPTURE_TYPES[0];

  useEffect(() => {
    if (!content.trim() && !card) { clearCaptureDraft(); return; }
    saveCaptureDraft<CaptureDraft>({ step, content, captureKind, recordType, classification, eventStart: eventStart.toISOString(),
      eventEnd: eventEnd ? eventEnd.toISOString() : null, addToCalendar, reminderMinutes, card });
  }, [step, content, captureKind, recordType, classification, eventStart, eventEnd, addToCalendar, reminderMinutes, card]);
  useEffect(() => () => request.current?.abort(), []);

  function handleClose() {
    if (step === 'review') { setStep('write'); return; }   // Back keeps the text (E1.4)
    if (content.trim()) {
      Alert.alert('Discard record?', undefined, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { clearCaptureDraft(); navigation.goBack(); } },
      ]);
    } else {
      clearCaptureDraft();
      navigation.goBack();
    }
  }

  // Save → review card (E1.1). The card renders at once; suggestions arrive within 3 s or fill later.
  async function startReview() {
    if (!content.trim()) return;
    setStep('review');
    if (card && card.content === content) return;          // Back then Save with the same text keeps the card
    const baseUrl = await get(KEYS.GKS_SERVER_URL);
    const online = Boolean(baseUrl) && Boolean((await Network.getNetworkStateAsync()).isConnected);
    const fresh = newCard(content, online, captureKind);
    setCard(fresh);
    if (!online || !baseUrl) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => setCard(c => (c ? deadlinePassed(c) : c)), SUGGEST_DEADLINE_MS);
    const result = await suggest(baseUrl, content, controller.signal);
    clearTimeout(timer);
    if (controller.signal.aborted) return;
    setCard(c => (c && c.content === content ? applySuggestion(c, result.ok ? result.body : null) : c));
  }

  async function confirm() {
    if (!card || confirmBlockers(card).length || saving) return;
    setSaving(true);
    request.current?.abort();
    const now = new Date();
    const sha = await sha256String(content);
    const edge_id = uuidv7();
    const kind = card.type;
    let nativeCalendarEventId: string | null = null;
    if (kind === 'EVENT' && addToCalendar) {
      const permitted = await requestCalendarPermission();
      if (permitted) {
        try {
          nativeCalendarEventId = await createEvent({ title: card.title || deriveTitle(content), startDate: eventStart, endDate: eventEnd }, reminderMinutes);
        } catch {
          // calendar creation failure is non-fatal — record still saves
        }
      }
    }
    createRecord({
      edge_id,
      gks_id: null,
      schema_version: 1,
      type: typeOf(kind),
      capture_kind: kind,
      title: card.title.trim() || deriveTitle(content),
      content,
      created: now.toISOString().slice(0, 10),
      author: 'human',
      classification,
      importance: card.importance,
      tags: card.topics.map(t => t.label),        // shown on the phone; GKS links `structure` (v2 ignores tags)
      life_areas: [],
      place: card.place ? { name: card.place.label } : null,
      about: [],
      relationships: [],
      captured_at: now.toISOString(),
      sync_status: 'PENDING',
      sync_error: null,
      content_sha256: sha,
      structure: buildStructure(card),
      native_calendar_event_id: nativeCalendarEventId,
      has_calendar_entry: nativeCalendarEventId !== null,
      reminder_minutes: nativeCalendarEventId !== null ? reminderMinutes : null,
      event_start: kind === 'EVENT' ? eventStart.toISOString() : null,
      event_end: kind === 'EVENT' && eventEnd ? eventEnd.toISOString() : null,
    });
    clearCaptureDraft();
    setSaving(false);
    navigation.replace('RecordDetail', { edge_id });
  }

  const blockers = card ? confirmBlockers(card) : [];
  const status = card ? statusLine(card.suggestionState) : null;
  const suggestion = card?.suggestion?.generated ? card.suggestion : null;

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.headerBtn}>{step === 'review' ? 'Back' : '✕'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowTypePicker(true)} style={styles.typeLabel}>
          <Text style={styles.typeLabelText}>{ctInfo.icon} {ctInfo.label}</Text>
        </TouchableOpacity>
        {step === 'write' ? (
          <TouchableOpacity onPress={() => void startReview()} disabled={!content.trim()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.headerBtn, styles.saveBtn, !content.trim() && styles.saveBtnDisabled]}>Save</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => void confirm()} disabled={blockers.length > 0 || saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.headerBtn, styles.saveBtn, (blockers.length > 0 || saving) && styles.saveBtnDisabled]}>Confirm</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {step === 'write' || !card ? (
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
            {captureKind === 'EVENT' && (
              <>
                <TouchableOpacity style={styles.moreToggle} onPress={() => setMoreOpen((v) => !v)}>
                  <Text style={styles.moreToggleText}>{moreOpen ? '▾' : '▸'} Event details</Text>
                </TouchableOpacity>
                {moreOpen && (
                  <View style={styles.moreSection}>
                    <FieldRow label="Event start">
                      <DateTimePicker value={eventStart} mode="datetime" display="compact" onChange={(_, d) => d && setEventStart(d)} />
                    </FieldRow>
                    <FieldRow label="Event end (optional)">
                      <DateTimePicker value={eventEnd ?? eventStart} mode="datetime" display="compact" onChange={(_, d) => d && setEventEnd(d)} />
                    </FieldRow>
                    <FieldRow label="Add to calendar">
                      <Switch value={addToCalendar} onValueChange={setAddToCalendar} trackColor={{ true: '#C17A3A' }} />
                    </FieldRow>
                    {addToCalendar && (
                      <FieldRow label="Reminder">
                        <SegmentControl options={[0, 15, 30, 60] as any[]} selected={reminderMinutes as any} onSelect={(v: any) => setReminderMinutes(v)} labels={['None', '15m', '30m', '1h']} />
                      </FieldRow>
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.card} keyboardShouldPersistTaps="handled">
            <Text style={styles.cardTitle}>Check before saving</Text>
            {card.suggestionState === 'loading' && <Text style={styles.status}>Getting suggestions…</Text>}
            {status && <Text style={styles.status}>{status}</Text>}

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.fieldInput} value={card.title} onChangeText={v => setCard(edit(card, 'title', v))} />

            {(content.length >= SUMMARY_MIN_CHARS || card.summary !== '') && card.suggestionState !== 'offline' && (
              <>
                <Text style={styles.fieldLabel}>Summary</Text>
                <TextInput style={[styles.fieldInput, styles.multi]} multiline value={card.summary} onChangeText={v => setCard(edit(card, 'summary', v.slice(0, 600)))} />
              </>
            )}

            <FieldRow label="Importance">
              <SegmentControl options={['LOW', 'NORMAL', 'HIGH'] as Importance[]} selected={card.importance} onSelect={v => setCard(edit(card, 'importance', v))} />
            </FieldRow>

            <IdentityPicker kind="topic" selected={card.topics} onChange={topics => setCard({ ...card, topics })} suggested={suggestion?.topics ?? []} />
            <IdentityPicker kind="person" selected={card.people} onChange={people => setCard({ ...card, people })} suggested={suggestion?.people ?? []} />
            <IdentityPicker kind="place" single selected={card.place ? [card.place] : []} onChange={items => setCard({ ...card, place: items[0] ?? null })} suggested={suggestion?.place ? [suggestion.place] : []} />

            <Text style={styles.fieldLabel}>Dates</Text>
            {(suggestion?.dates ?? []).filter(d => !d.needs_year && d.date).map(d => <Text key={d.phrase} style={styles.note}>{d.phrase} · {d.date}</Text>)}
            {card.yearGroups.map(g => (
              <FieldRow key={g.group_id} label={`Year for “${g.phrases.join('”, “')}”`}>
                <TextInput style={[styles.fieldInput, styles.year]} keyboardType="number-pad" maxLength={4} placeholder="YYYY" accessibilityLabel={`Year for ${g.phrases.join(', ')}`}
                  value={card.years[g.group_id] ?? ''} onChangeText={v => setCard({ ...card, years: { ...card.years, [g.group_id]: v.replace(/\D/g, '') } })} />
              </FieldRow>
            ))}
            {card.manualDates.map(d => (
              <FieldRow key={d} label={d}>
                <TouchableOpacity onPress={() => setCard({ ...card, manualDates: card.manualDates.filter(x => x !== d) })}><Text style={styles.headerBtn}>Remove</Text></TouchableOpacity>
              </FieldRow>
            ))}
            <FieldRow label="Add a date">
              <DateTimePicker value={manualDate} mode="date" display="compact" onChange={(_, d) => d && setManualDate(d)} />
            </FieldRow>
            <TouchableOpacity onPress={() => { const iso = manualDate.toISOString().slice(0, 10); setCard(card.manualDates.includes(iso) ? card : { ...card, manualDates: [...card.manualDates, iso] }); }}>
              <Text style={styles.headerBtn}>Add date</Text>
            </TouchableOpacity>

            <FieldRow label="Visibility">
              <SegmentControl options={['NORMAL', 'PRIVATE'] as Classification[]} selected={classification} onSelect={setClassification} />
            </FieldRow>

            {blockers.map(b => <Text key={b} style={styles.blocker}>{b}</Text>)}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <TypePickerSheet
        visible={showTypePicker}
        onSelect={(type, kind) => {
          setRecordType(type);
          setCaptureKind(kind);
          if (card) setCard(edit(card, 'type', kind));
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
  card: { padding: 20, gap: 14 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  status: { fontSize: 13, color: '#7A6A5A' },
  note: { fontSize: 13, color: colors.text },
  multi: { minHeight: 64, textAlignVertical: 'top' },
  year: { flex: 0, width: 80 },
  blocker: { fontSize: 13, color: '#A0522D' },
});
