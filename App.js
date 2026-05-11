import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';

const COLORS = {
  bg: '#0f0f11',
  surface: '#1a1a1f',
  border: '#2a2a32',
  accent: '#7c6af7',
  recording: '#ef4444',
  transcribing: '#f59e0b',
  text: '#e8e8f0',
  muted: '#6b6b7a',
  success: '#22c55e',
};

const LANGS = [
  { label: 'Auto', value: '' },
  { label: 'EN', value: 'en' },
  { label: 'UR', value: 'ur' },
  { label: 'HI', value: 'hi' },
  { label: 'AR', value: 'ar' },
];

const MAX_RECORDING_MS = 120000;
const API_KEY_STORE_KEY = 'openai_api_key';
const OPENAI_MODEL = 'gpt-4o-mini-transcribe';

export default function App() {
  return (
    <SafeAreaProvider>
      <VoiceToText />
    </SafeAreaProvider>
  );
}

function VoiceToText() {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [status, setStatus] = useState('Ready — tap mic to start');
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [language, setLanguage] = useState('en');
  const [toastVisible, setToastVisible] = useState(false);

  const recordingRef = useRef(null);
  const maxTimerRef = useRef(null);
  const apiKeyRef = useRef('');
  const languageRef = useRef('en');

  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { languageRef.current = language; }, [language]);

  useEffect(() => {
    (async () => {
      try {
        const k = await SecureStore.getItemAsync(API_KEY_STORE_KEY);
        if (k) {
          setApiKey(k);
        } else {
          setStatus('Set OpenAI key (gear icon) to start');
        }
      } catch {
        setStatus('Set OpenAI key (gear icon) to start');
      }
    })();
    return () => {
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    };
  }, []);

  async function startRecording() {
    if (!apiKeyRef.current) {
      openSettings();
      return;
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone blocked',
          'Enable it in Android Settings → Apps → Voice to Text → Permissions.'
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setStatus('Listening… tap stop when done');

      maxTimerRef.current = setTimeout(() => {
        stopRecording(`Auto-stopped (max ${MAX_RECORDING_MS / 1000}s)`);
      }, MAX_RECORDING_MS);
    } catch (e) {
      setStatus('Mic error: ' + (e?.message || String(e)));
      setIsRecording(false);
      recordingRef.current = null;
    }
  }

  async function stopRecording(autoStatusMsg) {
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    setIsRecording(false);
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }

    let uri = null;
    try {
      await rec.stopAndUnloadAsync();
      uri = rec.getURI();
    } catch (e) {
      setStatus('Stop error: ' + (e?.message || String(e)));
      return;
    }
    Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});

    if (!uri) {
      setStatus('No audio captured — try again');
      return;
    }

    setIsTranscribing(true);
    setStatus(autoStatusMsg || 'Transcribing…');
    try {
      const newText = await transcribe(uri);
      if (newText) {
        setText((cur) => {
          const merged = cur.trim() ? cur.trim() + ' ' + newText : newText;
          Clipboard.setStringAsync(merged).catch(() => {});
          return merged;
        });
        setStatus('Done — edit if needed, or tap mic to add more');
        showToast();
      } else {
        setStatus('No speech detected — try again');
      }
    } catch (e) {
      setStatus('❌ ' + (e?.message || String(e)));
    } finally {
      setIsTranscribing(false);
    }
  }

  async function transcribe(uri) {
    const form = new FormData();
    form.append('file', {
      uri,
      name: 'audio.m4a',
      type: 'audio/m4a',
    });
    form.append('model', OPENAI_MODEL);
    if (languageRef.current) form.append('language', languageRef.current);
    form.append('response_format', 'json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKeyRef.current },
      body: form,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j?.error?.message || '';
      } catch {}
      throw new Error('API ' + res.status + (detail ? ': ' + detail : ''));
    }
    const data = await res.json();
    return (data.text || '').trim();
  }

  async function toggleRecord() {
    if (isTranscribing) return;
    if (isRecording) await stopRecording();
    else await startRecording();
  }

  async function copyText() {
    const t = text.trim();
    if (!t) return;
    await Clipboard.setStringAsync(t);
    showToast();
  }

  function clearAll() {
    setText('');
    setStatus(apiKeyRef.current ? 'Cleared — tap mic to start' : 'Set OpenAI key (gear icon) to start');
  }

  async function saveSettings() {
    const k = tempKey.trim();
    if (k && !k.startsWith('sk-')) {
      Alert.alert('Invalid key', 'OpenAI keys should start with "sk-"');
      return;
    }
    try {
      await SecureStore.setItemAsync(API_KEY_STORE_KEY, k);
    } catch (e) {
      Alert.alert('Save failed', e?.message || String(e));
      return;
    }
    setApiKey(k);
    setShowSettings(false);
    setStatus(k ? 'Ready — tap mic to start' : 'Set OpenAI key (gear icon) to start');
  }

  function showToast() {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1800);
  }

  function openSettings() {
    setTempKey(apiKey);
    setShowSettings(true);
  }

  const hasText = text.trim().length > 0;
  const micColor = isRecording
    ? COLORS.recording
    : isTranscribing
    ? COLORS.transcribing
    : COLORS.accent;
  const micLabel = isRecording ? 'Stop' : isTranscribing ? '…' : 'Record';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.appIcon}>
            <Text style={styles.appIconText}>🎙</Text>
          </View>
          <Text style={styles.title}>Voice to Text</Text>
        </View>
        <TouchableOpacity onPress={openSettings} style={styles.gearBtn}>
          <Text style={styles.gearText}>⚙</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TextInput
          style={styles.output}
          value={text}
          onChangeText={setText}
          placeholder="Tap the mic to start speaking…"
          placeholderTextColor={COLORS.muted}
          multiline
          textAlignVertical="top"
          editable={!isTranscribing}
          scrollEnabled
        />

        <View style={styles.spacer} />

        <View style={styles.langRow}>
          {LANGS.map((l) => (
            <TouchableOpacity
              key={l.value || 'auto'}
              onPress={() => setLanguage(l.value)}
              style={[styles.langChip, language === l.value && styles.langChipActive]}
            >
              <Text
                style={[
                  styles.langChipText,
                  language === l.value && styles.langChipTextActive,
                ]}
              >
                {l.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.statusText} numberOfLines={2}>
          {status}
        </Text>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.actionBtn, !hasText && styles.actionBtnDisabled]}
            onPress={clearAll}
            disabled={!hasText}
          >
            <Text style={styles.actionBtnText}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.micBtn, { backgroundColor: micColor }]}
            onPress={toggleRecord}
            disabled={isTranscribing}
            activeOpacity={0.8}
          >
            <Text style={styles.micLabel}>{micLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.actionBtnPrimary,
              !hasText && styles.actionBtnDisabled,
            ]}
            onPress={copyText}
            disabled={!hasText}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Copy</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {toastVisible && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>Copied ✓</Text>
        </View>
      )}

      <Modal
        visible={showSettings}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>OpenAI API Key</Text>
            <TextInput
              style={styles.modalInput}
              value={tempKey}
              onChangeText={setTempKey}
              placeholder="sk-..."
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={styles.modalHint}>
              Get a key at platform.openai.com → API keys. Stored encrypted on this device.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setShowSettings(false)}
              >
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={saveSettings}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconText: { fontSize: 14 },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderColor: COLORS.border,
    borderWidth: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearText: { color: COLORS.muted, fontSize: 18 },
  content: { flex: 1, padding: 16, gap: 12 },
  output: {
    minHeight: 200,
    maxHeight: 400,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 24,
  },
  spacer: { flex: 1 },
  langRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  langChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  langChipText: { color: COLORS.muted, fontSize: 12, fontWeight: '500' },
  langChipTextActive: { color: 'white' },
  statusText: { color: COLORS.muted, fontSize: 13, paddingHorizontal: 2 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 6,
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  micLabel: { color: 'white', fontSize: 14, fontWeight: '600' },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionBtnPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  actionBtnTextPrimary: { color: 'white' },
  toast: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: COLORS.success,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 4,
  },
  toastText: { color: 'white', fontSize: 13, fontWeight: '500' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 12,
  },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  modalInput: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  modalHint: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 4,
  },
});
