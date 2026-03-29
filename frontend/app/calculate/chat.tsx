import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/lib/colors';
import { BASE_URL } from '../../src/lib/api';
import { getSession, setSession } from '../../src/lib/session';
import type { Mode, ChatMessage } from '../../src/types';

// Contact info — customize for your company
const COMPANY_CONTACT = {
  line: 'https://line.me/R/ti/p/@yourcompany', // TODO: replace with real LINE ID
  phone: 'tel:+81312345678',
  wechat: 'your_wechat_id',
};

export default function ChatScreen() {
  const { mode } = useLocalSearchParams<{ mode: Mode }>();
  const router = useRouter();
  const [sessionData, setSessionData] = useState<any>({});

  useEffect(() => {
    getSession().then(s => setSessionData(s));
  }, []);
  // Use AI raw extraction for chat context, not user-edited property
  const extracted = sessionData.extracted || {};
  const property = extracted;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [calcReady, setCalcReady] = useState(false);
  const [showConnect, setShowConnect] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Start conversation on mount — send a greeting as the first user message
  useEffect(() => {
    sendToAI([], '你好，帮我看看这套房子');
  }, []);

  async function sendToAI(conversation: ChatMessage[], userMessage = '') {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const res = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          extracted: property,
          conversation,
          user_message: userMessage,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      let replyText: string = data.reply;

      // Check for [CALC_READY] marker
      if (replyText.includes('[CALC_READY]')) {
        replyText = replyText.replace(/\[CALC_READY\]/g, '').trim();
        setCalcReady(true);
      }

      // Check for [CONNECT:xxx] marker
      const connectMatch = replyText.match(/\[CONNECT:(.+?)\]/);
      if (connectMatch) {
        replyText = replyText.replace(/\[CONNECT:.+?\]/g, '').trim();
        setShowConnect(connectMatch[1]);
      }

      const newMessages: ChatMessage[] = [
        ...conversation,
      ];
      if (userMessage) {
        newMessages.push({ role: 'user', content: userMessage });
      }
      newMessages.push({ role: 'assistant', content: replyText });

      setMessages(newMessages);
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError';
      const fallbackMessages = [...conversation];
      if (userMessage) {
        fallbackMessages.push({ role: 'user', content: userMessage });
      }
      fallbackMessages.push({
        role: 'assistant',
        content: isTimeout
          ? '响应超时了，可能网络不太稳定。你可以重新发送消息，或直接点击下方按钮查看计算结果。'
          : '抱歉，网络出了点问题。请重试或直接点击下方按钮查看计算结果。',
      });
      setMessages(fallbackMessages);
      setCalcReady(true);
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    }
  }

  const handleSend = (text: string) => {
    if (!text.trim() || loading) return;
    setInputText('');
    const userMsg = text.trim();
    const updated = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(updated);
    setTimeout(() => flatListRef.current?.scrollToEnd(), 50);
    sendToAI(messages, userMsg);
  };

  const handleViewResult = () => {
    router.push({
      pathname: '/calculate/result',
      params: { mode },
    });
  };

  const handleConnect = () => {
    // Open LINE contact
    Linking.openURL(COMPANY_CONTACT.line).catch(() => {
      // Fallback: show contact info
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'user' ? styles.bubbleUser : styles.bubbleBot,
              ]}
            >
              {item.role === 'assistant' && (
                <View style={styles.botAvatar}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={Colors.white} />
                </View>
              )}
              <View
                style={[
                  styles.bubbleContent,
                  item.role === 'user' ? styles.bubbleContentUser : styles.bubbleContentBot,
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    item.role === 'user' && styles.bubbleTextUser,
                  ]}
                >
                  {item.content}
                </Text>
              </View>
            </View>
          )}
          ListFooterComponent={
            loading ? (
              <View style={styles.typingIndicator}>
                <View style={styles.botAvatar}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={Colors.white} />
                </View>
                <View style={styles.bubbleContentBot}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              </View>
            ) : null
          }
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        />

        {/* Action buttons */}
        <View style={styles.actionArea}>
          {calcReady && (
            <TouchableOpacity style={styles.calcReadyBtn} onPress={handleViewResult}>
              <Ionicons name="calculator-outline" size={18} color={Colors.white} />
              <Text style={styles.calcReadyBtnText}>查看费用明细</Text>
            </TouchableOpacity>
          )}

          {showConnect && (
            <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
              <Ionicons name="chatbubbles-outline" size={18} color={Colors.primary} />
              <Text style={styles.connectBtnText}>{showConnect}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="输入信息..."
            placeholderTextColor={Colors.textMuted}
            onSubmitEditing={() => handleSend(inputText)}
            returnKeyType="send"
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
            onPress={() => handleSend(inputText)}
            disabled={loading}
          >
            <Ionicons name="send" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleBot: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  bubbleContent: { maxWidth: '75%', borderRadius: 16, padding: 12 },
  bubbleContentBot: { backgroundColor: Colors.white, borderBottomLeftRadius: 4 },
  bubbleContentUser: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22, color: Colors.text },
  bubbleTextUser: { color: Colors.white },
  typingIndicator: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
  actionArea: {
    paddingHorizontal: 16,
    gap: 8,
  },
  calcReadyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  calcReadyBtnText: { fontSize: 15, fontWeight: '600', color: Colors.white },
  connectBtn: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  connectBtnText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.text,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.textMuted },
});
