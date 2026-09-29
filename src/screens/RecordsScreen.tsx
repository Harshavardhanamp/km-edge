import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../lib/db/index';
import { telemetry } from '../lib/telemetry';
import { useScreenTracking } from '../lib/useScreenTracking';
import { CAPTURE_TYPES, type CaptureKind, type EdgeRecord } from '../lib/types';
import AppHeader from '../components/AppHeader';
import TypePickerSheet from '../components/TypePickerSheet';
import type { RecordType } from '../lib/types';

const PAGE_SIZE = 20;

type Filter = CaptureKind | 'ALL';
const FILTERS: Filter[] = ['ALL', 'JOURNAL', 'NOTE', 'EVENT', 'DECISION', 'LESSON', 'GOAL', 'PERSON'];

type Row = Pick<EdgeRecord, 'edge_id' | 'capture_kind' | 'title' | 'captured_at'>;

function queryRecords(search: string, filter: Filter, limit: number, offset: number): Row[] {
  const whereType = filter === 'ALL' ? '' : `AND capture_kind = '${filter}'`;
  const whereSearch = search.trim()
    ? `AND (title LIKE '%${search.trim().replace(/'/g, "''")}%' OR content LIKE '%${search.trim().replace(/'/g, "''")}%')`
    : '';
  return db.getAllSync<Row>(
    `SELECT edge_id, capture_kind, title, captured_at FROM records
     WHERE is_deleted = 0 ${whereType} ${whereSearch}
     ORDER BY captured_at DESC LIMIT ? OFFSET ?`,
    limit,
    offset
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export default function RecordsScreen({ navigation }: any) {
  useScreenTracking('RecordsScreen');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [records, setRecords] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((s: string, f: Filter, p: number, reset = false) => {
    const rows = queryRecords(s, f, PAGE_SIZE, p * PAGE_SIZE);
    setRecords((prev) => reset ? rows : [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
  }, []);

  useEffect(() => {
    setPage(0);
    load(search, filter, 0, true);
  }, [filter, load]);

  function handleSearch(text: string) {
    setSearch(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      telemetry.action('search', { query_length: text.length });
      setPage(0);
      load(text, filter, 0, true);
    }, 300);
  }

  function handleFilterChange(f: Filter) {
    setFilter(f);
    telemetry.action('filter_apply', { filter: f });
  }

  function loadMore() {
    if (!hasMore) return;
    const next = page + 1;
    setPage(next);
    load(search, filter, next, false);
  }

  function filterLabel(f: Filter): string {
    if (f === 'ALL') return 'All';
    return CAPTURE_TYPES.find((c) => c.capture_kind === f)?.label ?? f;
  }

  return (
    <View style={styles.container}>
      <AppHeader title="Records" />
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search records..."
          placeholderTextColor="#A09080"
          value={search}
          onChangeText={handleSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter chips */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f}
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => handleFilterChange(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {filterLabel(f)}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Record list */}
      <FlatList
        data={records}
        keyExtractor={(r) => r.edge_id}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <Text style={styles.empty}>No records found.</Text>
        }
        renderItem={({ item: r }) => {
          const ct = CAPTURE_TYPES.find((c) => c.capture_kind === r.capture_kind);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('RecordDetail', { edge_id: r.edge_id })}
            >
              <Text style={styles.rowIcon}>{ct?.icon ?? '📝'}</Text>
              <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
              <Text style={styles.rowTime}>{relTime(r.captured_at)}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowTypePicker(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <TypePickerSheet
        visible={showTypePicker}
        onSelect={(type: RecordType, captureKind: CaptureKind) => {
          setShowTypePicker(false);
          navigation.navigate('Capture', { recordType: type, captureKind });
        }}
        onDismiss={() => setShowTypePicker(false)}
      />
    </View>
  );
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchRow: { padding: 12, paddingBottom: 0 },
  searchInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    color: colors.text,
  },
  filterRow: { flexGrow: 0 },
  filterContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, color: colors.text },
  chipTextActive: { color: '#FFF', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  rowIcon: { fontSize: 20 },
  rowTitle: { flex: 1, fontSize: 14, color: colors.text },
  rowTime: { fontSize: 12, color: '#A09080' },
  empty: { padding: 32, textAlign: 'center', color: '#A09080', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabText: { fontSize: 28, color: '#FFF', lineHeight: 32 },
});
