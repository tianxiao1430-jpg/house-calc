import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/lib/colors';
import { getSession } from '../../src/lib/session';
import type { Mode } from '../../src/types';

import { BASE_URL } from '../../src/lib/api';

type Step = 'satisfaction' | 'feedback' | 'contact' | 'done';

const FEEDBACK_TAGS = [
  { label: '预算太高', labelJa: '予算オーバー' },
  { label: '交通不便', labelJa: '交通の便' },
  { label: '面积太小', labelJa: '部屋が狭い' },
];

export default function FeedbackScreen() {
  const { mode } = useLocalSearchParams<{ mode: Mode }>();
  const router = useRouter();
  const [sessionData, setSessionData] = useState<any>({});

  useEffect(() => {
    getSession().then(s => setSessionData(s));
  }, []);
  const property = sessionData.property || sessionData.extracted || {};
  const costResult = sessionData.costResult || {};
  const imageUri = sessionData.imageUri;

  const [step, setStep] = useState<Step>('satisfaction');
  const [satisfied, setSatisfied] = useState<boolean | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refNumber] = useState(`REF-${Date.now().toString(36).toUpperCase()}`);

  const handleSatisfied = (value: boolean) => {
    setSatisfied(value);
    if (value) {
      setStep('contact');
    } else {
      setStep('feedback');
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleFeedbackNext = () => {
    if (!feedbackText.trim() && selectedTags.length === 0) {
      Alert.alert('提示', '请选择标签或填写具体原因');
      return;
    }
    setStep('contact');
  };

  const handleSubmit = async () => {
    if (!contactName.trim() || !contactInfo.trim()) {
      Alert.alert('提示', '请填写姓名和联系方式');
      return;
    }

    setSubmitting(true);
    const fullFeedback = [
      ...selectedTags,
      feedbackText.trim(),
    ].filter(Boolean).join('；');

    try {
      const res = await fetch(`${BASE_URL}/submit-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          satisfied,
          feedback: fullFeedback,
          contact_name: contactName,
          contact_info: contactInfo,
          property_summary: property,
          cost_summary: {
            monthly_total: costResult.monthly_total || 0,
            initial_total: costResult.initial_total || 0,
          },
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      setStep('done');
    } catch {
      setStep('done');
    } finally {
      setSubmitting(false);
    }
  };

  // Header bar
  const Header = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>意见反馈 [フィードバック]</Text>
      <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.headerBtn}>
        <Ionicons name="close" size={22} color={Colors.text} />
      </TouchableOpacity>
    </View>
  );

  // Step 4: Success
  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.doneContainer}>
          <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
          <Text style={styles.doneTitle}>提交成功</Text>
          <Text style={styles.doneSubtitle}>
            我们的顾问会尽快联系您{'\n'}[コンサルタントからご連絡いたします]
          </Text>

          <View style={styles.refCard}>
            <View style={styles.refRow}>
              <Text style={styles.refLabel}>联系序号 [参照]</Text>
              <Text style={styles.refValue}>{refNumber}</Text>
            </View>
            <View style={styles.refRow}>
              <Text style={styles.refLabel}>服务类型 [タイプ]</Text>
              <Text style={styles.refValue}>房产估算计算</Text>
            </View>
            <View style={styles.refRow}>
              <Text style={styles.refLabel}>预计回复 [予定]</Text>
              <Text style={styles.refValue}>24小时内</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.doneBtnText}>返回首页</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneLinkBtn}>
            <Text style={styles.doneLinkText}>查看你的咨询 [相談履歴]</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* Step 1: Satisfaction */}
          {step === 'satisfaction' && (
            <>
              <Text style={styles.title}>对这个物件感觉怎么样？</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-sharp" size={14} color={Colors.primary} />
                <Text style={styles.locationText}>
                  {property.location || '物件'} [{mode === 'buy' ? '購入' : '賃貸'}]
                </Text>
              </View>

              {imageUri && (
                <Image source={{ uri: imageUri }} style={styles.propertyImage} resizeMode="cover" />
              )}

              <TouchableOpacity
                style={styles.choiceCard}
                onPress={() => handleSatisfied(true)}
              >
                <Text style={styles.choiceEmoji}>😊</Text>
                <View style={styles.choiceContent}>
                  <Text style={styles.choiceTitle}>满意，想进一步了解</Text>
                  <Text style={styles.choiceDesc}>
                    我们的顾问可以帮您推进手续 [手続きを進める]
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.choiceCard}
                onPress={() => handleSatisfied(false)}
              >
                <Text style={styles.choiceEmoji}>😐</Text>
                <View style={styles.choiceContent}>
                  <Text style={styles.choiceTitle}>不太满意</Text>
                  <Text style={styles.choiceDesc}>
                    告诉我们哪里不合适，帮您找更好的 [条件を変更する]
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </>
          )}

          {/* Step 2: Feedback details */}
          {step === 'feedback' && (
            <>
              <Text style={styles.title}>哪里不满意？</Text>
              <Text style={styles.subtitle}>
                请告诉我们您的具体需求，以便我们为您精准推荐{'\n'}
                [ご要望をお聞かせください]
              </Text>

              <Text style={styles.sectionLabel}>详细描述 [詳細なフィードバック]</Text>
              <View style={styles.textAreaWrap}>
                <TextInput
                  style={styles.textArea}
                  value={feedbackText}
                  onChangeText={(t) => t.length <= 300 && setFeedbackText(t)}
                  placeholder="比如：预算希望控制在15万以内，希望离车站更近一些..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{feedbackText.length}/300</Text>
              </View>

              <View style={styles.tagsRow}>
                {FEEDBACK_TAGS.map((tag) => (
                  <TouchableOpacity
                    key={tag.label}
                    style={[
                      styles.tag,
                      selectedTags.includes(tag.label) && styles.tagActive,
                    ]}
                    onPress={() => toggleTag(tag.label)}
                  >
                    <Text
                      style={[
                        styles.tagText,
                        selectedTags.includes(tag.label) && styles.tagTextActive,
                      ]}
                    >
                      {tag.label} [{tag.labelJa}]
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Step 3: Contact info */}
          {step === 'contact' && (
            <>
              <Text style={styles.title}>留下联系方式</Text>
              <Text style={styles.subtitle}>
                {satisfied
                  ? '请提供您的姓名和联系方式，我们将为您安排专属顾问。\n[お名前とご連絡先を入力してください。専属のアドバイザーを手配いたします。]'
                  : '请提供您的姓名和联系方式，我们会根据您的需求推荐更合适的物件。\n[お名前とご連絡先を入力してください。ご要望に合った物件をご提案します。]'}
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>姓名 [お名前]</Text>
                <TextInput
                  style={styles.input}
                  value={contactName}
                  onChangeText={setContactName}
                  placeholder="请输入您的姓名"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>联系方式 [連絡先]</Text>
                <TextInput
                  style={styles.input}
                  value={contactInfo}
                  onChangeText={setContactInfo}
                  placeholder="电话 / LINE / WeChat"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.privacyRow}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyTitle}>隐私保护 [プライバシー保護]</Text>
                  <Text style={styles.privacyDesc}>
                    您的个人信息仅用于顾问联系，我们严格保护您的隐私信息。
                  </Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* Bottom button for feedback & contact steps */}
        {step === 'feedback' && (
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleFeedbackNext}>
              <Text style={styles.primaryBtnText}>下一步 →</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'contact' && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>提交 [送信する]</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },

  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120 },

  // Titles
  title: { fontSize: 24, fontWeight: '700', color: Colors.primaryDark, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 24 },

  // Step 1: Satisfaction
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  locationText: { fontSize: 13, color: Colors.textSecondary },
  propertyImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: Colors.border,
  },

  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  choiceEmoji: { fontSize: 28 },
  choiceContent: { flex: 1 },
  choiceTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  choiceDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

  // Step 2: Feedback
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 10,
  },
  textAreaWrap: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  textArea: {
    fontSize: 15,
    color: Colors.text,
    minHeight: 100,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  tagText: { fontSize: 13, color: Colors.textSecondary },
  tagTextActive: { color: Colors.primary, fontWeight: '600' },

  // Step 3: Contact
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  privacyRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  privacyTitle: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  privacyDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

  // Bottom button
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 36,
    backgroundColor: Colors.background,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: Colors.textMuted },
  primaryBtnText: { fontSize: 17, fontWeight: '600', color: Colors.white },

  // Step 4: Done
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  doneTitle: { fontSize: 26, fontWeight: '700', color: Colors.primaryDark, marginTop: 16, marginBottom: 8 },
  doneSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  refCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 18,
    width: '100%',
    marginBottom: 28,
  },
  refRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  refLabel: { fontSize: 13, color: Colors.textSecondary },
  refValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  doneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginBottom: 14,
  },
  doneBtnText: { fontSize: 17, fontWeight: '600', color: Colors.white },
  doneLinkBtn: { paddingVertical: 8 },
  doneLinkText: { fontSize: 14, color: Colors.primary, fontWeight: '500' },
});
