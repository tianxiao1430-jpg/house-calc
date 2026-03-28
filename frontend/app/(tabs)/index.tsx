import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/lib/colors';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>House Calc</Text>
        <Text style={styles.subtitle}>算清楚你的房子到底要花多少钱</Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => router.push('/calculate/screenshot?mode=buy')}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="home" size={28} color={Colors.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>买房计算</Text>
            <Text style={styles.cardDesc}>算清月供、管理费、税金等全部支出</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => router.push('/calculate/screenshot?mode=rent')}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="key" size={28} color={Colors.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>租房计算</Text>
            <Text style={styles.cardDesc}>算清家賃、更新料、保証会社等全部支出</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.primaryDark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  cards: {
    paddingHorizontal: 24,
    gap: 16,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
