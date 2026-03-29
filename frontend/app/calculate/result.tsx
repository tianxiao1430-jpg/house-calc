import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/lib/colors';
import { saveHistory } from '../../src/lib/storage';
import { getSession, setSession } from '../../src/lib/session';
import type { Mode, CostResult, CostLineItem, HistoryEntry } from '../../src/types';
import { BASE_URL, preparePropertyForApi } from '../../src/lib/api';
import { useState, useEffect } from 'react';

function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString()}`;
}



export default function ResultScreen() {
  const { mode, property: propertyStr, historyId } = useLocalSearchParams<{
    mode: Mode;
    property?: string;
    historyId?: string;
  }>();
  const router = useRouter();
  const [showInitial, setShowInitial] = useState(false);
  const [saved, setSaved] = useState(false);
  const session = getSession();
  const [result, setResult] = useState<CostResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // location loaded inside calculate()

  const [location, setLocation] = useState('未知地址');
  const [historyResult, setHistoryResult] = useState<CostResult | null>(null);

  useEffect(() => {
    // If viewing from history, load the saved result
    if (historyId) {
      (async () => {
        const { getHistory } = await import('../../src/lib/storage');
        const history = await getHistory();
        const entry = history.find(e => e.id === historyId);
        if (entry) {
          setResult(entry.result);
          setLocation(entry.location);
          setHistoryResult(entry.result);
        }
        setLoading(false);
      })();
      return;
    }

    async function calculate() {
      const session = await getSession();
      const loc = session.property?.location || session.extracted?.location || '未知地址';
      setLocation(loc);
      const rawProperty = session.property || (propertyStr ? JSON.parse(propertyStr) : {});
      const property = preparePropertyForApi(rawProperty);
      const BASE_URL = 'http://localhost:8000';

      try {
        let res;
        if (mode === 'buy') {
          res = await fetch(`${BASE_URL}/calculate/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property,
              down_payment: (property.price || 0) * 0.1,
              loan_term_years: 35,
              interest_rate: 0.00475,
              purpose: 'residence',
              is_new_construction: false,
            }),
          });
        } else {
          res = await fetch(`${BASE_URL}/calculate/rent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property,
              needs_guarantor: true,
            }),
          });
        }

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setResult(data);
      } catch (err: any) {
        // Don't silently show fake data - inform user
        setError(true);
        setResult(null);
      } finally {
        setLoading(false);
      }
    }
    calculate();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, color: Colors.textSecondary }}>正在计算费用明细...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
        <Text style={{ marginTop: 16, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
          无法连接计算服务{'\n'}请检查网络后重试
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 }}
          onPress={() => { setError(false); setLoading(true); }}
        >
          <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 16 }}>重试</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!result) return null;

  const handleSave = async () => {
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      mode: mode!,
      location,
      monthly_total: result.monthly_total,
      initial_total: result.initial_total,
      result,
      property: propertyStr ? JSON.parse(propertyStr) : {},
      created_at: new Date().toLocaleDateString('ja-JP'),
    };
    await saveHistory(entry);
    setSaved(true);
    Alert.alert('已保存', '计算结果已保存到历史记录');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              {mode === 'buy' ? '买房 [住宅購入]' : '租房 [賃貸]'}
            </Text>
          </View>
          <Text style={styles.heroLabel}>每月总支出 [月額合計]</Text>
          <Text style={styles.heroAmount}>{formatYen(result.monthly_total)}</Text>
          <Text style={styles.heroLocation}>{location}</Text>
        </View>

        {/* Monthly breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>月度支出明细 [月次の内訳]</Text>
          {result.monthly_items.map((item, i) => (
            <View key={i} style={styles.lineItem}>
              <Text style={styles.lineLabel}>{item.label}</Text>
              <Text style={styles.lineAmount}>{formatYen(item.amount)}</Text>
            </View>
          ))}
          <View style={[styles.lineItem, styles.totalLine]}>
            <Text style={styles.totalLabel}>小计 [合計]</Text>
            <Text style={styles.totalAmount}>{formatYen(result.monthly_total)}</Text>
          </View>
        </View>

        {/* Initial costs (collapsible) */}
        <TouchableOpacity
          style={styles.section}
          activeOpacity={0.7}
          onPress={() => setShowInitial(!showInitial)}
        >
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>初期费用 [初期費用]</Text>
              <Text style={styles.sectionSubtitle}>
                {mode === 'buy' ? '購入時一括支付' : '入居時一括支付'}
              </Text>
            </View>
            <View style={styles.initialTotal}>
              <Text style={styles.initialTotalAmount}>{formatYen(result.initial_total)}</Text>
              <Ionicons
                name={showInitial ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={Colors.textSecondary}
              />
            </View>
          </View>

          {showInitial &&
            result.initial_items.map((item, i) => (
              <View key={i} style={styles.lineItem}>
                <Text style={styles.lineLabel}>{item.label}</Text>
                <Text style={styles.lineAmount}>{formatYen(item.amount)}</Text>
              </View>
            ))}
        </TouchableOpacity>

        {/* Long term */}
        <View style={styles.longTermRow}>
          {result.long_term.map((item, i) => (
            <View key={i} style={styles.longTermCard}>
              <Text style={styles.longTermLabel}>{item.label}</Text>
              <Text style={styles.longTermAmount}>{formatYen(item.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          ※ 本计算结果为概算参考值，实际费用请以不動産会社的見積書为准。
          税费等可能因优惠政策有所不同。
        </Text>
      </ScrollView>

      {/* Bottom buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.footerBtnOutline}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.footerBtnOutlineText}>重新计算</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={async () => {
            const s = await getSession();
            await setSession({
              ...s,
              costResult: result,
            } as any);
            router.push({
              pathname: '/calculate/feedback',
              params: { mode },
            });
          }}
        >
          <Ionicons name="chatbubbles-outline" size={18} color={Colors.white} />
          <Text style={styles.footerBtnText}>咨询顾问</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 100 },

  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  heroBadgeText: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 4 },
  heroAmount: { color: Colors.white, fontSize: 36, fontWeight: '800' },
  heroLocation: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 8 },

  section: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.primaryDark, marginBottom: 12 },
  sectionSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: -8, marginBottom: 8 },

  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lineLabel: { fontSize: 14, color: Colors.text, flex: 1 },
  lineAmount: { fontSize: 15, fontWeight: '600', color: Colors.text },

  totalLine: { borderBottomWidth: 0, borderTopWidth: 2, borderTopColor: Colors.primaryDark, marginTop: 4, paddingTop: 14 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: Colors.primaryDark },
  totalAmount: { fontSize: 18, fontWeight: '800', color: Colors.primary },

  initialTotal: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  initialTotalAmount: { fontSize: 17, fontWeight: '700', color: Colors.primary },

  longTermRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  longTermCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  longTermLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  longTermAmount: { fontSize: 17, fontWeight: '700', color: Colors.primaryDark },

  disclaimer: { fontSize: 11, color: Colors.textMuted, lineHeight: 18, textAlign: 'center', marginTop: 4 },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 32,
    backgroundColor: Colors.background,
    gap: 12,
  },
  footerBtnOutline: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerBtnOutlineText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  footerBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  footerBtnDisabled: { backgroundColor: Colors.textMuted },
  footerBtnText: { fontSize: 15, fontWeight: '600', color: Colors.white },
});
