import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
  TextInput,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/utils/theme';
import { api, FolderData, ImageData } from '@/utils/api';

const { width: SCREEN_W } = Dimensions.get('window');

/* ────────────────────────────── types ── */
type SelectableItem =
  | { kind: 'folder'; data: FolderData }
  | { kind: 'image'; data: ImageData };

/* ────────────────────────────── component ── */
export default function FileManagerScreen() {
  const router = useRouter();

  /* data */
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [sources, setSources] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  /* selection */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  /* modals */
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<FolderData | null>(null);
  const [renameName, setRenameName] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderPickerAction, setFolderPickerAction] = useState<'move' | 'copy'>('move');

  const totalSelected = selectedFolders.size + selectedImages.size;

  /* ── data loading ── */
  const loadData = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([api.listFolders(), api.listImages('source')]);
      setFolders(f);
      setSources(s);
    } catch (e: any) {
      console.error('Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedFolders(new Set());
    setSelectedImages(new Set());
  };

  /* ── import ── */
  const importScreenshot = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please grant media library access.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) { Alert.alert('Error', 'Failed to read image data.'); return; }

      setUploading(true);
      const uploaded = await api.uploadImage(asset.base64, asset.fileName || 'screenshot.png');
      setUploading(false);
      router.push({ pathname: '/editor', params: { imageId: uploaded.id } });
    } catch (e: any) {
      setUploading(false);
      Alert.alert('Upload Error', e.message);
    }
  };

  /* ── selection toggle ── */
  const toggleFolderSelect = (id: string) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleImageSelect = (id: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const enterSelectWithItem = (item: SelectableItem) => {
    setSelectMode(true);
    if (item.kind === 'folder') setSelectedFolders(new Set([item.data.id]));
    else setSelectedImages(new Set([item.data.id]));
  };

  /* ── actions ── */
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await api.createFolder(name);
    setShowCreateFolder(false);
    setNewFolderName('');
    loadData();
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) return;
    await api.renameFolder(renameTarget.id, name);
    setRenameTarget(null);
    setRenameName('');
    loadData();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Selected',
      `Delete ${totalSelected} item${totalSelected > 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await api.bulkDelete(
              Array.from(selectedImages),
              Array.from(selectedFolders),
            );
            exitSelectMode();
            loadData();
          },
        },
      ],
    );
  };

  const openFolderPicker = (action: 'move' | 'copy') => {
    if (selectedImages.size === 0) {
      Alert.alert('Info', 'Only images can be moved/copied. Select images.');
      return;
    }
    setFolderPickerAction(action);
    setShowFolderPicker(true);
  };

  const handlePickFolder = async (targetFolderId: string | null) => {
    setShowFolderPicker(false);
    const ids = Array.from(selectedImages);
    if (folderPickerAction === 'move') {
      await api.moveItems(ids, targetFolderId);
    } else {
      await api.copyItems(ids);
    }
    exitSelectMode();
    loadData();
  };

  const handleShare = async () => {
    const urls: string[] = [];
    selectedImages.forEach((id) => urls.push(api.getImageUrl(id)));
    selectedFolders.forEach((fid) => {
      const f = folders.find((x) => x.id === fid);
      if (f) urls.push(`Folder: ${f.name}`);
    });
    try {
      await Share.share({ message: urls.join('\n'), title: 'Panel Extractor' });
    } catch (_e) { /* user cancelled */ }
  };

  const handleRenameAction = () => {
    if (selectedFolders.size !== 1 || selectedImages.size > 0) {
      Alert.alert('Rename', 'Select exactly one folder to rename.');
      return;
    }
    const fid = Array.from(selectedFolders)[0];
    const f = folders.find((x) => x.id === fid);
    if (f) { setRenameName(f.name); setRenameTarget(f); }
  };

  /* ── list data ── */
  type ListItem =
    | { kind: 'section'; title: string; key: string }
    | { kind: 'folder'; data: FolderData; key: string }
    | { kind: 'image'; data: ImageData; key: string }
    | { kind: 'empty'; message: string; key: string };

  const listItems: ListItem[] = [];
  listItems.push({ kind: 'section', title: 'Extracted Panels', key: 'sec-folders' });
  if (folders.length === 0) listItems.push({ kind: 'empty', message: 'No extracted panels yet', key: 'empty-f' });
  folders.forEach((f) => listItems.push({ kind: 'folder', data: f, key: `f-${f.id}` }));
  listItems.push({ kind: 'section', title: 'Source Screenshots', key: 'sec-sources' });
  if (sources.length === 0) listItems.push({ kind: 'empty', message: 'Import a screenshot to get started', key: 'empty-s' });
  sources.forEach((s) => listItems.push({ kind: 'image', data: s, key: `i-${s.id}` }));

  /* ── render items ── */
  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'section') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
          <View style={styles.sectionLine} />
        </View>
      );
    }
    if (item.kind === 'empty') {
      return (
        <View style={styles.emptyRow}>
          <Feather name="inbox" size={20} color={colors.muted} />
          <Text style={styles.emptyText}>{item.message}</Text>
        </View>
      );
    }

    if (item.kind === 'folder') {
      const f = item.data;
      const selected = selectedFolders.has(f.id);
      return (
        <TouchableOpacity
          testID={`folder-card-${f.id}`}
          style={[styles.card, selected && styles.cardSelected]}
          onPress={() => {
            if (selectMode) toggleFolderSelect(f.id);
            else router.push({ pathname: '/folder/[id]', params: { id: f.id } });
          }}
          onLongPress={() => enterSelectWithItem({ kind: 'folder', data: f })}
          activeOpacity={0.7}
        >
          {selectMode && (
            <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
              {selected && <Feather name="check" size={14} color="#fff" />}
            </View>
          )}
          <View style={styles.cardThumb}>
            {f.thumbnail_id ? (
              <Image source={{ uri: api.getImageUrl(f.thumbnail_id) }} style={styles.thumbImage} contentFit="cover" />
            ) : (
              <Feather name="folder" size={28} color={colors.muted} />
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{f.name}</Text>
            <Text style={styles.cardMeta}>{f.panel_count} panels</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.muted} style={{ marginRight: 12 }} />
        </TouchableOpacity>
      );
    }

    if (item.kind === 'image') {
      const img = item.data;
      const selected = selectedImages.has(img.id);
      return (
        <TouchableOpacity
          testID={`source-card-${img.id}`}
          style={[styles.card, selected && styles.cardSelected]}
          onPress={() => {
            if (selectMode) toggleImageSelect(img.id);
            else router.push({ pathname: '/editor', params: { imageId: img.id } });
          }}
          onLongPress={() => enterSelectWithItem({ kind: 'image', data: img })}
          activeOpacity={0.7}
        >
          {selectMode && (
            <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
              {selected && <Feather name="check" size={14} color="#fff" />}
            </View>
          )}
          <View style={styles.cardThumb}>
            <Image source={{ uri: api.getImageUrl(img.id) }} style={styles.thumbImage} contentFit="cover" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{img.filename}</Text>
            <Text style={styles.cardMeta}>{img.width} x {img.height}</Text>
          </View>
        </TouchableOpacity>
      );
    }
    return null;
  };

  /* ── loading state ── */
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── Header ─── */}
      {selectMode ? (
        <View style={styles.selectHeader}>
          <TouchableOpacity testID="exit-select-btn" onPress={exitSelectMode} style={styles.headerBtn}>
            <Feather name="x" size={24} color={colors.textMain} />
          </TouchableOpacity>
          <Text style={styles.selectCount}>{totalSelected} selected</Text>
          <View style={{ flex: 1 }} />
        </View>
      ) : (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Feather name="scissors" size={22} color={colors.primary} />
            <Text style={styles.headerTitle}>Panel Extractor</Text>
          </View>
          <TouchableOpacity testID="create-folder-btn" onPress={() => setShowCreateFolder(true)} style={styles.headerBtn}>
            <Feather name="folder-plus" size={22} color={colors.textMain} />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── List ─── */}
      <FlatList
        testID="file-manager-list"
        data={listItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      />

      {/* ─── Selection toolbar ─── */}
      {selectMode && (
        <View style={styles.selToolbar}>
          <TouchableOpacity testID="sel-move-btn" style={styles.selAction} onPress={() => openFolderPicker('move')}>
            <Feather name="corner-right-down" size={20} color={colors.textMain} />
            <Text style={styles.selActionText}>Move</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="sel-copy-btn" style={styles.selAction} onPress={() => openFolderPicker('copy')}>
            <Feather name="copy" size={20} color={colors.textMain} />
            <Text style={styles.selActionText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="sel-rename-btn" style={styles.selAction} onPress={handleRenameAction}>
            <Feather name="edit-3" size={20} color={colors.textMain} />
            <Text style={styles.selActionText}>Rename</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="sel-share-btn" style={styles.selAction} onPress={handleShare}>
            <Feather name="share-2" size={20} color={colors.textMain} />
            <Text style={styles.selActionText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="sel-delete-btn" style={styles.selAction} onPress={handleDelete}>
            <Feather name="trash-2" size={20} color={colors.primary} />
            <Text style={[styles.selActionText, { color: colors.primary }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Import FAB ─── */}
      {!selectMode && (
        <TouchableOpacity
          testID="import-screenshot-btn"
          style={styles.fab}
          onPress={importScreenshot}
          activeOpacity={0.8}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Feather name="plus" size={22} color={colors.primaryForeground} />
              <Text style={styles.fabText}>Import</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* ═══════ Modals ═══════ */}

      {/* Create Folder Modal */}
      <Modal visible={showCreateFolder} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Folder</Text>
            <TextInput
              testID="new-folder-input"
              style={styles.modalInput}
              placeholder="Folder name"
              placeholderTextColor={colors.muted}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity testID="cancel-create-btn" style={styles.modalBtnSecondary} onPress={() => { setShowCreateFolder(false); setNewFolderName(''); }}>
                <Text style={styles.modalBtnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="confirm-create-btn" style={styles.modalBtnPrimary} onPress={handleCreateFolder}>
                <Text style={styles.modalBtnPrimText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Rename Folder Modal */}
      <Modal visible={renameTarget !== null} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename Folder</Text>
            <TextInput
              testID="rename-folder-input"
              style={styles.modalInput}
              placeholder="New name"
              placeholderTextColor={colors.muted}
              value={renameName}
              onChangeText={setRenameName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity testID="cancel-rename-btn" style={styles.modalBtnSecondary} onPress={() => { setRenameTarget(null); setRenameName(''); }}>
                <Text style={styles.modalBtnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="confirm-rename-btn" style={styles.modalBtnPrimary} onPress={handleRename}>
                <Text style={styles.modalBtnPrimText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Folder Picker Modal (for move / copy) */}
      <Modal visible={showFolderPicker} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {folderPickerAction === 'move' ? 'Move to' : 'Copy to'}
              </Text>
              <TouchableOpacity testID="close-picker-btn" onPress={() => setShowFolderPicker(false)}>
                <Feather name="x" size={22} color={colors.textMain} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              testID="pick-root-btn"
              style={styles.pickerRow}
              onPress={() => handlePickFolder(null)}
            >
              <Feather name="home" size={20} color={colors.textMain} />
              <Text style={styles.pickerRowText}>Root (no folder)</Text>
            </TouchableOpacity>

            <FlatList
              data={folders}
              keyExtractor={(f) => f.id}
              renderItem={({ item: f }) => (
                <TouchableOpacity
                  testID={`pick-folder-${f.id}`}
                  style={styles.pickerRow}
                  onPress={() => handlePickFolder(f.id)}
                >
                  <Feather name="folder" size={20} color={colors.primary} />
                  <Text style={styles.pickerRowText}>{f.name}</Text>
                  <Text style={styles.pickerRowMeta}>{f.panel_count}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmpty}>No folders available</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ══════════════════════════════ styles ══════════════════════════════ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  /* ── headers ── */
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textMain, letterSpacing: 0.5 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  selectHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.primary,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  selectCount: { fontSize: 17, fontWeight: '700', color: colors.textMain, marginLeft: 8 },

  /* ── list ── */
  listContent: { paddingHorizontal: 18, paddingBottom: 120 },
  sectionHeader: { marginTop: 24, marginBottom: 14 },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: colors.mutedForeground,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8,
  },
  sectionLine: { height: 1, backgroundColor: colors.border },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, paddingHorizontal: 4 },
  emptyText: { fontSize: 14, color: colors.muted },

  /* ── cards ── */
  card: {
    backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: 'rgba(239,68,68,0.06)' },
  cardThumb: {
    width: 72, height: 72, backgroundColor: colors.surfaceHighlight, alignItems: 'center', justifyContent: 'center',
  },
  thumbImage: { width: 72, height: 72 },
  cardInfo: { flex: 1, paddingHorizontal: 14, justifyContent: 'center' },
  cardName: { fontSize: 14, fontWeight: '600', color: colors.textMain, marginBottom: 3 },
  cardMeta: { fontSize: 12, color: colors.mutedForeground },

  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.muted,
    marginLeft: 12, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },

  /* ── selection toolbar ── */
  selToolbar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    paddingVertical: 10, paddingBottom: 24,
  },
  selAction: { alignItems: 'center', gap: 4, minWidth: 56 },
  selActionText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },

  /* ── FAB ── */
  fab: {
    position: 'absolute', bottom: 28, right: 20, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 28,
    elevation: 8, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  fabText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 15 },

  /* ── modals ── */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    width: SCREEN_W - 48, backgroundColor: colors.surface, borderRadius: 16,
    padding: 24, borderWidth: 1, borderColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textMain, marginBottom: 16 },
  modalInput: {
    height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, fontSize: 15, color: colors.textMain, backgroundColor: colors.background,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  modalBtnSecondary: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.surfaceHighlight },
  modalBtnSecText: { color: colors.textMain, fontWeight: '600', fontSize: 14 },
  modalBtnPrimary: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.primary },
  modalBtnPrimText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 14 },

  /* ── folder picker ── */
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerCard: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '60%', paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: colors.textMain },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickerRowText: { flex: 1, fontSize: 15, color: colors.textMain },
  pickerRowMeta: { fontSize: 13, color: colors.mutedForeground },
  pickerEmpty: { padding: 24, textAlign: 'center', color: colors.muted, fontSize: 14 },
});
