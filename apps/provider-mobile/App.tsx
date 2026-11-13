import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, StatusBar } from 'react-native';
import { APP_NAME, APP_TAGLINE } from '@roadaid/shared';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B132B" />
      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PROVIDER PARTNER APP</Text>
        </View>
        <Text style={styles.title}>{APP_NAME}</Text>
        <Text style={styles.subtitle}>{APP_TAGLINE}</Text>
        <Text style={styles.meta}>Abuja Responders Network</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  badge: {
    backgroundColor: '#EE964B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  badgeText: {
    color: '#0B132B',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F4D35E',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  meta: {
    fontSize: 14,
    color: '#94A3B8',
  },
});
