import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { exactIdentities, identityName, searchIdentities, type IdentityKind } from '../lib/db/identityCache';
import { pendingChips, type CardIdentity } from '../lib/capture/reviewCard';
import type { SuggestedIdentity } from '../lib/contract';

// KK-2.2 E2: Topics / People / Place on the phone review card. Search runs over the local
// identity cache; a name that is not there becomes a label (never an identity, E8.4) that
// GKS matches on sync.
const TITLES: Record<IdentityKind, string> = { topic: 'Topics', person: 'People', place: 'Place' };

export default function IdentityPicker({ kind, single = false, selected, onChange, suggested }: {
  kind: IdentityKind;
  single?: boolean;
  selected: CardIdentity[];
  onChange: (items: CardIdentity[]) => void;
  suggested: SuggestedIdentity[];
}) {
  const [text, setText] = useState('');
  const matches = useMemo(() => (text.trim() ? searchIdentities(kind, text.trim()) : []), [kind, text]);
  const exact = text.trim() ? exactIdentities(kind, text.trim()).length > 0 : false;
  const chips = pendingChips(suggested, selected, identityName);
  const add = (item: CardIdentity) => {
    setText('');
    if (selected.some(s => (item.identity_id && s.identity_id === item.identity_id) || s.label.toLowerCase() === item.label.toLowerCase())) return;
    onChange(single ? [item] : [...selected, item]);
  };
  const noun = kind === 'person' ? 'person' : kind;
  const open = !single || selected.length === 0;

  return (
    <View style={styles.block}>
      <Text style={styles.title}>{TITLES[kind]}</Text>
      <View style={styles.row}>
        {selected.map(item => (
          <View key={item.identity_id ?? `label:${item.label}`} style={[styles.chip, styles.chosen]}>
            <Text style={styles.chipText}>{item.label}{item.identity_id ? '' : ' · new'}</Text>
            <TouchableOpacity accessibilityLabel={`Remove ${item.label}`} onPress={() => onChange(selected.filter(s => s !== item))}><Text style={styles.remove}>×</Text></TouchableOpacity>
          </View>
        ))}
      </View>
      {open && chips.length > 0 && (
        <View style={styles.row} accessibilityLabel={`Suggested ${TITLES[kind].toLowerCase()}`}>
          {chips.map(chip => (
            <TouchableOpacity key={chip.identity_id ?? chip.label} style={styles.chip} onPress={() => add({ identity_id: chip.identity_id, label: chip.label, fromSuggestion: true })}>
              <Text style={styles.chipText}>{chip.label} · <Text style={styles.action}>{chip.existing ? 'Use existing ✓' : 'Create'}</Text></Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {open && (
        <TextInput
          style={styles.input}
          accessibilityLabel={`Search or add a ${noun}`}
          placeholder={`Search or add a ${noun}…`}
          placeholderTextColor="#A09080"
          value={text}
          onChangeText={setText}
        />
      )}
      {open && text.trim() !== '' && (
        <View style={styles.results}>
          {matches.map(m => (
            <TouchableOpacity key={m.identity_id} style={styles.result} onPress={() => add({ identity_id: m.identity_id, label: m.name })}>
              <Text style={styles.resultText}>{m.name}{m.distinction ? ` (${m.distinction})` : ''}</Text>
            </TouchableOpacity>
          ))}
          {!exact && (
            <TouchableOpacity style={styles.result} onPress={() => add({ label: text.trim() })}>
              <Text style={[styles.resultText, styles.action]}>Create “{text.trim()}”</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const colors = { accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };
const styles = StyleSheet.create({
  block: { gap: 8 },
  title: { fontSize: 14, color: '#7A6A5A', fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FFF' },
  chosen: { borderColor: colors.accent, backgroundColor: '#FBEFE3' },
  chipText: { fontSize: 13, color: colors.text },
  action: { color: colors.accent, fontWeight: '600' },
  remove: { fontSize: 16, color: colors.accent, paddingHorizontal: 2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 8, fontSize: 14, color: colors.text, backgroundColor: '#FFF' },
  results: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: '#FFF' },
  result: { paddingVertical: 10, paddingHorizontal: 12 },
  resultText: { fontSize: 14, color: colors.text },
});
