import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../src/lib/colors';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primaryDark,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="calculate/screenshot"
          options={{ title: '' }}
        />
        <Stack.Screen
          name="calculate/confirm"
          options={{ title: '确认物件信息' }}
        />
        <Stack.Screen
          name="calculate/chat"
          options={{ title: '补充信息' }}
        />
        <Stack.Screen
          name="calculate/result"
          options={{ title: '费用明细' }}
        />
      </Stack>
    </>
  );
}
