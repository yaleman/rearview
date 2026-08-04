import React, {useState} from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {loadRearview} from './rearview';

export default function App(): React.JSX.Element {
  const [status, setStatus] = useState('Not loaded');
  const [busy, setBusy] = useState(false);

  async function handleLoad(): Promise<void> {
    setBusy(true);

    try {
      await loadRearview(message => {
        console.log(message);
        setStatus(message);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error(error);
      setStatus(`Error: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Rearview</Text>

        <View style={styles.statusBox}>
          <Text selectable>{status}</Text>
        </View>

        <Button
          title={busy ? 'Working…' : 'Download and load model'}
          disabled={busy}
          onPress={handleLoad}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
  statusBox: {
    minHeight: 100,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
});