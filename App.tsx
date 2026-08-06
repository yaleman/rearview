import React, {useState} from 'react';
import {
  Button,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {launchImageLibrary} from 'react-native-image-picker';
import {describeImage, loadRearview} from './rearview';

export default function App(): React.JSX.Element {
  const [status, setStatus] = useState('Not loaded');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageURI, setImageURI] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [timings, setTimings] = useState<unknown>(null);

  async function handleLoad(): Promise<void> {
    setBusy(true);

    try {
      await loadRearview(message => {
        console.log(message);
        setStatus(message);
      });

      setLoaded(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error(error);
      setStatus(`Error: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseImage(): Promise<void> {
    try {
      const response = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,

        // Avoid feeding a huge phone photo into the VLM.
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.9,
      });

      if (response.didCancel) {
        return;
      }

      if (response.errorCode) {
        throw new Error(
          response.errorMessage ?? `Image picker error: ${response.errorCode}`,
        );
      }

      const uri = response.assets?.[0]?.uri;

      if (!uri) {
        throw new Error('Image picker returned no image URI');
      }

      setImageURI(uri);
      setDescription('');
      setElapsed(null);
      setTimings(null);
      setBusy(true);
      setStatus('Analysing image…');

      const result = await describeImage(uri);

      setDescription(result.text);
      setElapsed(result.elapsedMilliseconds);
      setTimings(result.timings);
      setStatus('Analysis complete');
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
          title={loaded ? 'Model loaded' : 'Download and load model'}
          disabled={busy || loaded}
          onPress={handleLoad}
        />

        <Button
          title={busy ? 'Working…' : 'Choose and analyse image'}
          disabled={busy || !loaded}
          onPress={handleChooseImage}
        />

        {imageURI !== null && (
          <Image
            source={{uri: imageURI}}
            style={styles.preview}
            resizeMode="contain"
          />
        )}

        {description !== '' && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Result</Text>
            <Text selectable style={styles.resultText}>
              {description}
            </Text>

            {elapsed !== null && (
              <Text selectable style={styles.timing}>
                Total: {(elapsed / 1000).toFixed(3)} seconds
              </Text>
            )}
          </View>
        )}

        {timings !== null && (
          <View style={styles.timingBox}>
            <Text style={styles.resultTitle}>llama.cpp timings</Text>
            <Text selectable style={styles.monospace}>
              {JSON.stringify(timings, null, 2)}
            </Text>
          </View>
        )}
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
    minHeight: 80,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  preview: {
    width: '100%',
    height: 320,
    backgroundColor: '#ddd',
    borderRadius: 8,
  },
  resultBox: {
    gap: 8,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  timingBox: {
    gap: 8,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  resultText: {
    fontSize: 22,
  },
  timing: {
    marginTop: 8,
    fontSize: 16,
  },
  monospace: {
    fontFamily: 'Menlo',
    fontSize: 12,
  },
});