import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/lib/colors';
import { setSession } from '../../src/lib/session';
import type { Mode } from '../../src/types';

export default function ScreenshotScreen() {
  const { mode } = useLocalSearchParams<{ mode: Mode }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const pickImage = async (source: 'camera' | 'gallery') => {
    let result;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要相机权限', '请在设置中允许访问相机');
        return;
      }
      result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要相册权限', '请在设置中允许访问相册');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.8,
        mediaTypes: ['images'],
      });
    }

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setLoading(true);

    try {
      const formData = new FormData();

      // Web: fetch blob from URI; Native: use RN FormData format
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('image', blob, 'screenshot.jpg');
      formData.append('mode', mode!);

      const BASE_URL = 'http://localhost:8000';
      const res = await fetch(`${BASE_URL}/extract`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const extracted = await res.json();
      setSession({ mode: mode as Mode, imageUri: uri, extracted });
      setLoading(false);
      router.push({
        pathname: '/calculate/confirm',
        params: { mode },
      });
    } catch (err: any) {
      setLoading(false);
      Alert.alert('识别失败', `${err.message}\n\n请手动输入或重试`);
    }
  };

  const modeLabel = mode === 'buy' ? '买房计算' : '租房计算';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>识别房源信息</Text>
        <Text style={styles.subtitle}>
          只需上传截图，AI 将自动提取房价与各项税费
        </Text>

        <View style={styles.uploadArea}>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>AI 正在识别中...</Text>
            </View>
          ) : (
            <>
              <Ionicons name="image-outline" size={48} color={Colors.primary} />
              <Text style={styles.uploadText}>拍照或从相册选择房源截图</Text>
              <Text style={styles.uploadHint}>
                支持 SUUMO、HOME'S、アットホーム 等网站截图
              </Text>

              <View style={styles.buttons}>
                <TouchableOpacity
                  style={styles.btn}
                  onPress={() => pickImage('camera')}
                >
                  <Ionicons name="camera-outline" size={20} color={Colors.white} />
                  <Text style={styles.btnText}>拍照</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnOutline]}
                  onPress={() => pickImage('gallery')}
                >
                  <Ionicons name="images-outline" size={20} color={Colors.primary} />
                  <Text style={[styles.btnText, styles.btnOutlineText]}>相册</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.manualLink}
          onPress={() =>
            router.push({
              pathname: '/calculate/confirm',
              params: { mode, manual: 'true' },
            })
          }
        >
          <Text style={styles.manualLinkText}>没有截图？手动输入 →</Text>
        </TouchableOpacity>

        <Text style={styles.privacy}>
          截图将发送至 AI 进行分析，提取的信息仅用于本次计算。详见隐私政策
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.primaryDark, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, marginBottom: 24, lineHeight: 22 },
  uploadArea: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
  },
  loadingBox: { alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 16, color: Colors.textSecondary },
  uploadText: { fontSize: 16, fontWeight: '600', color: Colors.text, marginTop: 16, textAlign: 'center' },
  uploadHint: { fontSize: 13, color: Colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { fontSize: 15, fontWeight: '600', color: Colors.white },
  btnOutline: { backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.primary },
  btnOutlineText: { color: Colors.primary },
  manualLink: { alignItems: 'center', marginTop: 24 },
  manualLinkText: { fontSize: 15, color: Colors.primary, fontWeight: '500' },
  privacy: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: 20,
    lineHeight: 18,
  },
});
