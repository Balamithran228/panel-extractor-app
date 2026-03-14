import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Dimensions,
  Share,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors } from '@/utils/theme';
import { api, FolderDetail, FolderData, ImageData } from '@/utils/api';

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = 10;
const COLUMNS = 2;
const THUMB_W = (SCREEN_W - 32 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

export default function FolderViewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [folder, setFolder] = useState<FolderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPanel, setSelectedPanel] = useState<ImageData | null>(null);

  // Selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPanels, setSelectedPanels] = useState<Set<string>>(new Set());

  // Modals
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; isFolderRename: boolean } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderPickerAction, setFolderPickerAction] = useState<'move' | 'copy'>('move');
  const [availableFolders, setAvailableFolders] = useState<FolderData[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [pendingDeleteFn, setPendingDeleteFn] = useState<(() => Promise<void>) | null>(null);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [deleteFolderMode, setDeleteFolderMode] = useState(false);

  const loadFolder = useCallback(async () => {
    if (!id) return;
    try {
      const f = await api.getFolder(id);
      setFolder(f);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadFolder(); }, [loadFolder]));

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedPanels(new Set());
  };

  const togglePanelSelect = (panelId: string) => {
    setSelectedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId); else next.add(panelId);
      return next;
    });
  };

  const enterSelectWith = (panel: ImageData) => {
    setSelectMode(true);
    setSelectedPanels(new Set([panel.id]));
  };

  /* ── Share ── */
  const sharePanel = async (panel: ImageData) => {
    try {
      await Share.share({ message: api.getImageUrl(panel.id), title: panel.filename });
    } catch (_) {}
  };

  const shareAll = async () => {
    if (!folder) return;
    const urls = folder.panels.map((p) => api.getImageUrl(p.id)).join('\n');
    try {
      await Share.share({ message: `${folder.name}\n\n${urls}`, title: folder.name });
    } catch (_) {}
  };

  const handleShareSelected = async () => {
    const urls = Array.from(selectedPanels).map((pid) => api.getImageUrl(pid)).join('\n');
    try {
      await Share.share({ message: urls });
    } catch (_) {}
  };

  /* ── Delete panels (selection) ── */
  const handleDeletePanels = () => {
    const count = selectedPanels.size;
    setDeleteMessage(`Delete ${count} panel${count > 1 ? 's' : ''}? This cannot be undone.`);
    setDeleteFolderMode(false);
    setPendingDeleteFn(() => async () => {
      await api.bulkDelete(Array.from(selectedPanels), []);
      exitSelectMode();
      await loadFolder();
    });
    setConfirmDelete(true);
  };

  /* ── Delete folder ── */
  const deleteThisFolder = () => {
    if (!folder) return;
    setDeleteMessage(`Delete "${folder.name}" and all ${folder.panels.length} panels? This cannot be undone.`);
    setDeleteFolderMode(true);
    setPendingDeleteFn(() => async () => {
      await api.deleteFolder(folder.id);
    });
    setConfirmDelete(true);
  };

  const executeDelete = async () => {
    setConfirmDelete(false);
    try {
      await pendingDeleteFn?.();
      setPendingDeleteFn(null);
      setShowDeleteSuccess(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const onDeleteSuccessOK = () => {
    setShowDeleteSuccess(false);
    if (deleteFolderMode) {
      router.replace('/');
    }
  };

  /* ── Rename ── */
  const handleRenameAction = () => {
    if (selectedPanels.size !== 1) {
      Alert.alert('Rename', 'Select exactly one panel to rename.');
      return;
    }
    const pid = Array.from(selectedPanels)[0];
    const panel = folder?.panels.find((p) => p.id === pid);
    if (panel) {
      setRenameName(panel.filename);
      setRenameTarget({ id: panel.id, name: panel.filename, isFolderRename: false });
    }
  };

  const openFolderRename = () => {
    if (!folder) return;
    setRenameName(folder.name);
    setRenameTarget({ id: folder.id, name: folder.name, isFolderRename: true });
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) return;
    try {
      if (renameTarget.isFolderRename) {
        await api.renameFolder(renameTarget.id, name);
      } else {
        await api.renameImage(renameTarget.id, name);
      }
      setRenameTarget(null);
      setRenameName('');
      exitSelectMode();
      await loadFolder();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  /* ── Move / Copy ── */
  const openFolderPicker = async (action: 'move' | 'copy') => {
    if (selectedPanels.size === 0) return;
    try {
      const folders = await api.listFolders();
      setAvailableFolders(folders);
      setFolderPickerAction(action);
      setShowFolderPicker(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handlePickFolder = async (targetFolderId: string | null) => {
    setShowFolderPicker(false);
    const ids = Array.from(selectedPanels);
    try {
      if (folderPickerAction === 'move') {
        await api.moveItems(ids, targetFolderId);
      } else {
        await api.copyItems(ids, targetFolderId);
      }
      exitSelectMode();
      await loadFolder();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  /* ── Render panel card ── */
  const renderPanel = ({ item, index }: { item: ImageData; index: number }) => {
    const imageUrl = api.getImageUrl(item.id);
    const thumbH = (item.height / item.width) * THUMB_W;
    const clampedH = Math.min(thumbH, THUMB_W * 2);
    const isSelected = selectedPanels.has(item.id);

    return (
      <TouchableOpacity
        testID={`panel-card-${index}`}
        style={[styles.panelCard, { width: THUMB_W }, isSelected && styles.panelCardSelected]}
        onPress={() => {
          if (selectMode) togglePanelSelect(item.id);
          else setSelectedPanel(item);
        }}
        onLongPress={() => enterSelectWith(item)}
        activeOpacity={0.8}
      >
        {selectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Feather name="check" size={12} color="#fff" />}
          </View>
        )}
        <Image
          source={{ uri: imageUrl }}
          style={{ width: THUMB_W - 2, height: clampedH, borderRadius: 8 }}
          contentFit="cover"
        />
        <Text style={styles.panelLabel}>{item.filename}</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!folder) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Folder not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.rootWrap}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* ─── Header ─── */}
        {selectMode ? (
          <View style={styles.selectHeader}>
            <TouchableOpacity testID="exit-select-btn" onPress={exitSelectMode} style={styles.headerBtn}>
              <Feather name="x" size={24} color={colors.textMain} />
            </TouchableOpacity>
            <Text style={styles.selectCount}>{selectedPanels.size} selected</Text>
            <View style={{ flex: 1 }} />
          </View>
        ) : (
          <View style={styles.header}>
            <TouchableOpacity testID="folder-back-btn" onPress={() => router.back()} style={styles.headerBtn}>
              <Feather name="chevron-left" size={24} color={colors.textMain} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>{folder.name}</Text>
              <Text style={styles.headerSub}>{folder.panels.length} panels</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity testID="rename-folder-btn" onPress={openFolderRename} style={styles.headerBtn}>
                <Feather name="edit-3" size={19} color={colors.textMain} />
              </TouchableOpacity>
              <TouchableOpacity testID="share-all-btn" onPress={shareAll} style={styles.headerBtn}>
                <Feather name="share-2" size={20} color={colors.textMain} />
              </TouchableOpacity>
              <TouchableOpacity testID="delete-folder-btn" onPress={deleteThisFolder} style={styles.headerBtn}>
                <Feather name="trash-2" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── Panels grid ─── */}
        {folder.panels.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="image" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>No panels extracted</Text>
          </View>
        ) : (
          <FlatList
            testID="panels-grid"
            data={folder.panels}
            renderItem={renderPanel}
            keyExtractor={(p) => p.id}
            numColumns={COLUMNS}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
          />
        )}

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
            <TouchableOpacity testID="sel-share-btn" style={styles.selAction} onPress={handleShareSelected}>
              <Feather name="share-2" size={20} color={colors.textMain} />
              <Text style={styles.selActionText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="sel-delete-btn" style={styles.selAction} onPress={handleDeletePanels}>
              <Feather name="trash-2" size={20} color={colors.primary} />
              <Text style={[styles.selActionText, { color: colors.primary }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Full screen preview ─── */}
        {selectedPanel && (
          <View style={styles.previewOverlay}>
            <SafeAreaView style={styles.previewSafe}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>{selectedPanel.filename}</Text>
                <View style={styles.previewActions}>
                  <TouchableOpacity testID="preview-share-btn" onPress={() => sharePanel(selectedPanel)} style={styles.previewBtn}>
                    <Feather name="share-2" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity testID="preview-close-btn" onPress={() => setSelectedPanel(null)} style={styles.previewBtn}>
                    <Feather name="x" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.previewBody}>
                <Image
                  source={{ uri: api.getImageUrl(selectedPanel.id) }}
                  style={styles.previewImage}
                  contentFit="contain"
                />
              </View>
            </SafeAreaView>
          </View>
        )}
      </SafeAreaView>

      {/* ═══ Modal Dialogs ═══ */}

      {/* Delete Confirmation Modal */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{deleteFolderMode ? 'Delete Folder' : 'Delete Panels'}</Text>
            <Text style={styles.modalMessage}>{deleteMessage}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity testID="cancel-delete-btn" style={styles.modalBtnSecondary} onPress={() => setConfirmDelete(false)}>
                <Text style={styles.modalBtnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="confirm-delete-btn" style={styles.modalBtnDestructive} onPress={executeDelete}>
                <Text style={styles.modalBtnPrimText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Success Modal */}
      <Modal visible={showDeleteSuccess} transparent animationType="fade" onRequestClose={onDeleteSuccessOK}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Deleted successfully</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity testID="delete-success-ok-btn" style={styles.modalBtnPrimary} onPress={onDeleteSuccessOK}>
                <Text style={styles.modalBtnPrimText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setRenameTarget(null); setRenameName(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Rename {renameTarget?.isFolderRename ? 'Folder' : 'Panel'}
            </Text>
            <TextInput
              testID="rename-input"
              style={styles.modalInput}
              placeholder="New name"
              placeholderTextColor={colors.muted}
              value={renameName}
              onChangeText={setRenameName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                testID="cancel-rename-btn"
                style={styles.modalBtnSecondary}
                onPress={() => { setRenameTarget(null); setRenameName(''); }}
              >
                <Text style={styles.modalBtnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-rename-btn"
                style={styles.modalBtnPrimary}
                onPress={handleRename}
              >
                <Text style={styles.modalBtnPrimText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Folder Picker Modal */}
      <Modal
        visible={showFolderPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFolderPicker(false)}
      >
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
            <FlatList
              data={availableFolders}
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
              ListEmptyComponent={<Text style={styles.pickerEmpty}>No folders available</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrap: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },

  /* ── Headers ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, paddingLeft: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textMain },
  headerSub: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 2 },

  selectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  selectCount: { fontSize: 17, fontWeight: '700', color: colors.textMain, marginLeft: 8 },

  /* ── Grid ── */
  gridContent: { padding: 16, paddingBottom: 100 },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },

  /* ── Panel card ── */
  panelCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
  },
  panelCardSelected: { borderColor: colors.primary, backgroundColor: 'rgba(239,68,68,0.06)' },
  panelLabel: { fontSize: 11, color: colors.mutedForeground, paddingVertical: 8, fontWeight: '500' },

  checkbox: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.muted,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },

  /* ── Selection toolbar ── */
  selToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
    paddingBottom: 24,
  },
  selAction: { alignItems: 'center', gap: 4, minWidth: 56 },
  selActionText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },

  /* ── Empty / Error ── */
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 16, color: colors.muted },
  errorText: { color: colors.muted, fontSize: 16, textAlign: 'center', marginTop: 80 },

  /* ── Preview overlay ── */
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 100,
  },
  previewSafe: { flex: 1 },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  previewTitle: { fontSize: 16, fontWeight: '600', color: '#fff', flex: 1, marginRight: 8 },
  previewActions: { flexDirection: 'row', gap: 8 },
  previewBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  previewBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  previewImage: { width: '100%', height: '100%' },

  /* ── Modals ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: SCREEN_W - 48,
    backgroundColor: '#27272a',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#52525b',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textMain, marginBottom: 16 },
  modalMessage: { fontSize: 14, color: colors.mutedForeground, marginBottom: 4, lineHeight: 20 },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.textMain,
    backgroundColor: colors.background,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  modalBtnSecondary: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.surfaceHighlight },
  modalBtnSecText: { color: colors.textMain, fontWeight: '600', fontSize: 14 },
  modalBtnPrimary: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.primary },
  modalBtnDestructive: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: '#7f1d1d' },
  modalBtnPrimText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 14 },

  /* ── Folder picker ── */
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: colors.textMain },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerRowText: { flex: 1, fontSize: 15, color: colors.textMain },
  pickerRowMeta: { fontSize: 13, color: colors.mutedForeground },
  pickerEmpty: { padding: 24, textAlign: 'center', color: colors.muted, fontSize: 14 },
});
