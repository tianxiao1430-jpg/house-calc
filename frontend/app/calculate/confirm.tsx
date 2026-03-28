import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/lib/colors';
import { getSession, setSession } from '../../src/lib/session';
import type { Mode, ExtractedProperty } from '../../src/types';

interface FieldConfig {
  key: keyof ExtractedProperty;
  label: string;
  labelJa: string;
  unit: string;
  required: boolean;
  modes: Mode[];
}

const FIELDS: FieldConfig[] = [
  { key: 'price', label: '物件价格', labelJa: '物件価格', unit: '万円', required: true, modes: ['buy'] },
  { key: 'rent', label: '家賃', labelJa: '賃料', unit: '円/月', required: true, modes: ['rent'] },
  { key: 'management_fee', label: '管理费', labelJa: '管理費', unit: '円/月', required: false, modes: ['buy', 'rent'] },
  { key: 'repair_reserve', label: '修缮积立金', labelJa: '修繕積立金', unit: '円/月', required: false, modes: ['buy'] },
  { key: 'common_fee', label: '共益費', labelJa: '共益費', unit: '円/月', required: false, modes: ['rent'] },
  { key: 'area', label: '面积', labelJa: '専有面積', unit: 'm²', required: false, modes: ['buy', 'rent'] },
  { key: 'building_age', label: '房龄', labelJa: '築年数', unit: '年', required: false, modes: ['buy', 'rent'] },
  { key: 'location', label: '所在地', labelJa: '所在地', unit: '', required: false, modes: ['buy', 'rent'] },
  { key: 'deposit_months', label: '敷金', labelJa: '敷金', unit: '个月', required: false, modes: ['rent'] },
  { key: 'key_money_months', label: '礼金', labelJa: '礼金', unit: '个月', required: false, modes: ['rent'] },
];

// Mock extracted data for demo — will be replaced by API call
const MOCK_BUY: Partial<ExtractedProperty> = {
  price: 5480,
  management_fee: 12500,
  repair_reserve: undefined,
  area: 72.45,
  building_age: 12,
  location: '東京都渋谷区某某',
};

const MOCK_RENT: Partial<ExtractedProperty> = {
  rent: 120000,
  management_fee: 5000,
  common_fee: 0,
  area: 45,
  building_age: 8,
  location: '東京都新宿区某某',
  deposit_months: 1,
  key_money_months: 1,
};

export default function ConfirmScreen() {
  const { mode, manual } = useLocalSearchParams<{
    mode: Mode;
    manual?: string;
  }>();
  const router = useRouter();
  const session = getSession();

  const isManual = manual === 'true';
  const extractedData = session.extracted || (mode === 'buy' ? MOCK_BUY : MOCK_RENT);

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (isManual) return {};
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(extractedData)) {
      if (v !== undefined && v !== null) {
        // For buy mode, convert price from yen to 万円 for display
        if (k === 'price' && typeof v === 'number' && v > 100000) {
          init[k] = String(v / 10000);
        } else {
          init[k] = String(v);
        }
      }
    }
    return init;
  });

  const fields = FIELDS.filter((f) => f.modes.includes(mode!));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);

  // Parse numeric value, supporting Chinese 万 notation (e.g. "15万" → 150000)
  const parseNumericValue = (val: string): number | null => {
    if (!val || val.trim() === '') return null;
    const trimmed = val.trim();
    // Support "15万" format
    const wanMatch = trimmed.match(/^([\d.]+)\s*万$/);
    if (wanMatch) return parseFloat(wanMatch[1]) * 10000;
    const num = parseFloat(trimmed);
    return isNaN(num) ? null : num;
  };

  // Validate a single field
  const validateField = (field: FieldConfig, val: string): string | null => {
    if (field.key === 'location') return null; // location is free text
    if (!val && !field.required) return null;
    if (!val && field.required) return '此项为必填';

    const num = parseNumericValue(val);
    if (num === null) return '请输入有效数字';
    if (num < 0) return '不能为负数';

    // Range checks
    if (field.key === 'area' && num > 10000) return '面积超出合理范围';
    if (field.key === 'building_age' && num > 200) return '房龄超出合理范围';
    if ((field.key === 'deposit_months' || field.key === 'key_money_months') && num > 12) return '超出合理范围（一般不超过12个月）';
    if ((field.key === 'management_fee' || field.key === 'repair_reserve' || field.key === 'common_fee') && num > 1000000) return '金额超出合理范围';
    if (field.key === 'price' && num > 100000) return '请以万円为单位输入（例：5480）';
    if (field.key === 'rent' && num > 10000000) return '金额超出合理范围';

    return null;
  };

  const updateField = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear error on edit
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleConfirm = () => {
    // Validate all fields
    const newErrors: Record<string, string> = {};
    for (const f of fields) {
      const err = validateField(f, values[f.key as string] || '');
      if (err) newErrors[f.key as string] = err;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setShowErrors(true);
      return;
    }

    // Build property object
    const property: any = {};
    for (const f of fields) {
      const val = values[f.key];
      if (f.key === 'location') {
        property[f.key] = val || '';
      } else if (f.key === 'price') {
        // Price is in 万円, convert to 円
        const num = parseNumericValue(val || '0');
        property[f.key] = (num || 0) * 10000;
      } else {
        property[f.key] = parseNumericValue(val || '0') || 0;
      }
    }

    setSession({ property });

    // Both modes go through chat — AI collects info then explores needs
    router.push({
      pathname: '/calculate/chat',
      params: { mode },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>确认物件信息</Text>
          <Text style={styles.subtitle}>
            {isManual ? '请填写物件信息' : 'AI 识别结果如下，请确认或修改'}
          </Text>

          {fields.map((field) => {
            const value = values[field.key as string];
            const isEmpty = !value && field.required;
            const fieldError = showErrors && errors[field.key as string];
            const hasError = !!fieldError;

            // Format display value for price field
            const displayUnit = field.key === 'price' && value
              ? (() => {
                  const num = parseNumericValue(value);
                  return num !== null ? '万円' : field.unit;
                })()
              : field.unit;

            return (
              <View key={field.key}>
                <View style={[styles.fieldRow, isEmpty && styles.fieldEmpty, hasError && styles.fieldError]}>
                  <View style={styles.fieldLabel}>
                    <Text style={styles.fieldName}>{field.label}</Text>
                    <Text style={styles.fieldNameJa}>[{field.labelJa}]</Text>
                  </View>
                  <View style={styles.fieldInput}>
                    <TextInput
                      style={[styles.input, isEmpty && styles.inputEmpty, hasError && styles.inputError]}
                      value={value || ''}
                      onChangeText={(v) => updateField(field.key as string, v)}
                      placeholder={isEmpty ? '点击填写' : ''}
                      placeholderTextColor={Colors.warning}
                      keyboardType={field.key === 'location' ? 'default' : 'numeric'}
                    />
                    {displayUnit ? <Text style={styles.unit}>{displayUnit}</Text> : null}
                    <Ionicons
                      name={hasError ? 'close-circle' : value ? 'checkmark-circle' : 'alert-circle'}
                      size={18}
                      color={hasError ? Colors.error : value ? Colors.success : isEmpty ? Colors.warning : Colors.textMuted}
                      style={{ marginLeft: 8 }}
                    />
                  </View>
                </View>
                {hasError && (
                  <Text style={styles.errorText}>{fieldError}</Text>
                )}
              </View>
            );
          })}

          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.noticeText}>
              识别结果基于 AI 解析，请核对后再点击确认。修繕積立金等缺失信息将在月支出估算中自动处理。
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
            <Text style={styles.confirmBtnText}>确认，开始计算 →</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 100 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.primaryDark, marginBottom: 6 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 20 },
  fieldRow: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldEmpty: { borderWidth: 1, borderColor: Colors.warningLight },
  fieldError: { borderWidth: 1, borderColor: Colors.error },
  fieldLabel: { flex: 1 },
  fieldName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  fieldNameJa: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  fieldInput: { flexDirection: 'row', alignItems: 'center' },
  input: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'right',
    minWidth: 80,
    minHeight: 44,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  inputEmpty: { color: Colors.warning },
  inputError: { color: Colors.error },
  errorText: { fontSize: 12, color: Colors.error, marginLeft: 14, marginTop: -6, marginBottom: 6 },
  unit: { fontSize: 12, color: Colors.textMuted, marginLeft: 4 },
  notice: {
    flexDirection: 'row',
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  noticeText: { fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: Colors.background,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 17, fontWeight: '600', color: Colors.white },
});
