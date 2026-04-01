import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/lib/colors';
import { getHistory, deleteHistoryEntry } from '../../src/lib/storage';
import type { HistoryEntry } from '../../src/types';

function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString()}`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      getHistory().then(setHistory);
    }, [])
  );

  const handleDelete = async (id: string) => {
    await deleteHistoryEntry(id);
    setHistory((prev) => prev.filter((e) => e.id !== id));
  };

  if (history.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>计算历史</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyText}>还没有计算记录</Text>
          <Text style={styles.emptySubtext}>去首页开始吧</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>计算历史</Text>
        <Text style={styles.headerSub}>最近记录 [履歴]</Text>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/calculate/result?historyId=${item.id}`)}
          >
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.badge,
                  item.mode === 'buy' ? styles.badgeBuy : styles.badgeRent,
                ]}
              >
                <Text style={styles.badgeText}>
                  {item.mode === 'buy' ? '买房' : '租房'}
                </Text>
              </View>
              <Text style={styles.date}>{item.created_at}</Text>
            </View>
            <Text style={styles.location} numberOfLines={1}>
              {item.location || '未知地址'}
            </Text>
            <Text style={styles.amount}>
              {formatYen(item.monthly_total)}
              <Text style={styles.amountUnit}> /月</Text>
            </Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>总计次数</Text>
          <Text style={styles.summaryValue}>{history.length}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>平均月供</Text>
          <Text style={styles.summaryValue}>
            {formatYen(
              history.reduce((sum, e) => sum + e.monthly_total, 0) / history.length
            )}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.primaryDark },
  headerSub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.textSecondary },
  emptySubtext: { fontSize: 14, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  badgeBuy: { backgroundColor: Colors.primaryLight },
  badgeRent: { backgroundColor: Colors.successLight },
  badgeText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  date: { fontSize: 12, color: Colors.textMuted },
  location: { fontSize: 15, color: Colors.text, marginBottom: 4 },
  amount: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  amountUnit: { fontSize: 14, fontWeight: '400', color: Colors.textSecondary },
  summary: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    padding: 16,
    gap: 24,
  },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: '700', color: Colors.primaryDark },
});
