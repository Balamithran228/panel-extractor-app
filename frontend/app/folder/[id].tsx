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
  TextInput,
  Share,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors } from '@/utils/theme';
import { db, FolderDetail, ImageData, FolderData, getImageUri } from '@/utils/db';

const { width: SCREEN_W } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_W - 48) / 3;

export default function FolderScreen() {
  const router = useRouter();
  const { id: folderId } = useLocalSearchParams<{ id: string }>();

  const [folderDetail, setFolderDetail] = useState<FolderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPanels, setSelectedPanels] = useState<Set<string>>(new Set());

  /* modals */
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderPickerAction, setFolderPickerAction] = useState<'move' | 'copy'>('move');
  const [availableFolders, setAvailableFolders] = useState<FolderData[]>([]);
  const [previewPanel, setPreviewPanel] = useState<ImageData | null>(null);

  /* panel context menu */
  const [contextPanel, setContextPanel] = useState<ImageData | null>(null);
  const [ctxConfirmDelete, setCtxConfirmDelete] = useState(false);
  const [ctxFolderPicker, setCtxFolderPicker] = useState(false);
  const [ctxFolderAction, setCtxFolderAction] = useState<'move' | 'copy'>('copy');
  const [ctxAvailableFolders, setCtxAvailableFolders] = useState<FolderData[]>([]);
  const [ctxRenameTarget, setCtxRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [ctxRenameName, setCtxRenameName] = useState('');

  const totalSelected = selectedPanels.size;

  /* ── Load data ── */
  const loadFolder = useCallback(async () => {
    if (!folderId) return;
    try {
      const detail = await db.getFolder(folderId);
      setFolderDetail(detail);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [folderId]);

  useFocusEffect(useCallback(() => { loadFolder(); }, [loadFolder]));

  const onRefresh = () => { setRefreshing(true); loadFolder(); };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedPanels(new Set());
  };

  const togglePanel = (id: string) => {
    setSelectedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const enterSelectWith = (item: ImageData) => {
    setSelectMode(true);
    setSelectedPanels(new Set([item.id]));
  };

  /* ── Panel context menu ── */
  const openPanelContextMenu = (panel: ImageData) => {
    setContextPanel(panel);
  };

  const closePanelContextMenu = () => setContextPanel(null);

  const ctxRename = () => {
    if (!contextPanel) return;
    setCtxRenameName(contextPanel.filename);
    setCtxRenameTarget({ id: contextPanel.id, name: contextPanel.filename });
    closePanelContextMenu();
  };

  const handleCtxRename = async () => {
    if (!ctxRenameTarget) return;
    const name = ctxRenameName.trim();
    if (!name) return;
    try {
      await db.renameImage(ctxRenameTarget.id, name);
      setCtxRenameTarget(null);
      setCtxRenameName('');
      loadFolder();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const ctxDelete = () => {
    setCtxConfirmDelete(true);
  };

  const executeCtxDelete = async () => {
    setCtxConfirmDelete(false);
    if (!contextPanel) return;
    try {
      await db.deleteImage(contextPanel.id);
      setContextPanel(null);
      loadFolder();
      setShowDeleteSuccess(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const ctxCopyTo = async () => {
    try {
      const folders = await db.listFolders();
      setCtxAvailableFolders(folders);
      setCtxFolderAction('copy');
      setCtxFolderPicker(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const ctxMoveTo = async () => {
    try {
      const folders = await db.listFolders();
      setCtxAvailableFolders(folders);
      setCtxFolderAction('move');
      setCtxFolderPicker(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleCtxPickFolder = async (targetFolderId: string | null) => {
    setCtxFolderPicker(false);
    if (!contextPanel) return;
    try {
      if (ctxFolderAction === 'move') {
        await db.moveItems([contextPanel.id], targetFolderId);
      } else {
        await db.copyItems([contextPanel.id], targetFolderId);
      }
      setContextPanel(null);
      loadFolder();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const ctxSelect = () => {
    if (!contextPanel) return;
    enterSelectWith(contextPanel);
    closePanelContextMenu();
  };

  /* ── Multi-select actions ── */
  const handleDeletePanels = () => { setConfirmDelete(true); };

  const executeDelete = async () => {
    setConfirmDelete(false);
    try {
      await db.bulkDelete(Array.from(selectedPanels), []);
      exitSelectMode();
      loadFolder();
      setShowDeleteSuccess(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleRenameAction = () => {
    if (selectedPanels.size !== 1) {
      Alert.alert('Rename', 'Select exactly one panel to rename.');
      return;
    }
    const pid = Array.from(selectedPanels)[0];
    const panel = folderDetail?.panels.find((p) => p.id === pid);
    if (panel) {
      setRenameName(panel.filename);
      setRenameTarget({ id: panel.id, name: panel.filename });
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) return;
    try {
      await db.renameImage(renameTarget.id, name);
      setRenameTarget(null);
      setRenameName('');
      exitSelectMode();
      loadFolder();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const openFolderPicker = async (action: 'move' | 'copy') => {
    if (selectedPanels.size === 0) return;
    try {
      const folders = await db.listFolders();
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
        await db.moveItems(ids, targetFolderId);
      } else {
        await db.copyItems(ids, targetFolderId);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    exitSelectMode();
    loadFolder();
  };

  const handleShare = async () => {
    const urls: string[] = [];
    for (const id of selectedPanels) {
      const panel = folderDetail?.panels.find((p) => p.id === id);
      if (panel) urls.push(getImageUri(panel.id, panel.stored_filename, panel.image_type, panel.folder_id));
    }
    try {
      await Share.share({ message: urls.join('\n'), title: 'Panel Extractor' });
    } catch (_e) { /* user cancelled */ }
  };

  /* ── render panel cell ── */
  const renderPanel = ({ item }: { item: ImageData }) => {
    const selected = selectedPanels.has(item.id);
    const panelUri = getImageUri(item.id, item.stored_filename, item.image_type, item.folder_id);
    return (
      <TouchableOpacity
        testID={`panel-card-${item.id}`}
        style={[styles.panelCell, selected && styles.panelCellSelected]}
        onPress={() => {
          if (selectMode) togglePanel(item.id);
          else setPreviewPanel(item);
        }}
        onLongPress={() => openPanelContextMenu(item)}
        activeOpacity={0.7}
      >
        {selectMode && (
          <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
            {selected && <Feather name="check" size={14} color="#fff" />}
          </View>
        )}
        <Image source={{ uri: panelUri }} style={styles.panelThumb} contentFit="cover" />
        <View style={styles.panelLabel}>
          <Text style={styles.panelLabelText} numberOfLines={1}>{item.filename}</Text>
        </View>
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

  if (!folderDetail) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 80 }}>Folder not found</Text>
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
            <Text style={styles.selectCount}>{totalSelected} selected</Text>
            <View style={{ flex: 1 }} />
          </View>
        ) : (
          <View style={styles.header}>
            <TouchableOpacity testID="folder-back-btn" onPress={() => router.back()} style={styles.headerBtn}>
              <Feather name="chevron-left" size={24} color={colors.textMain} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>{folderDetail.name}</Text>
              <Text style={styles.headerSub}>{folderDetail.panels.length} panels</Text>
            </View>
          </View>
        )}

        {/* ─── FlatList grid ─── */}
        <FlatList
          testID="panels-grid"
          data={folderDetail.panels}
          numColumns={3}
          renderItem={renderPanel}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.gridContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="image" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>No panels yet</Text>
            </View>
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
            <TouchableOpacity testID="sel-delete-btn" style={styles.selAction} onPress={handleDeletePanels}>
              <Feather name="trash-2" size={20} color={colors.primary} />
              <Text style={[styles.selActionText, { color: colors.primary }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* ═══════ Modal Dialogs ═══════ */}

      {/* Delete Confirmation */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Panels</Text>
            <Text style={styles.modalMessage}>
              Delete {totalSelected} panel{totalSelected > 1 ? 's' : ''}? This cannot be undone.
            </Text>
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

      {/* Delete Success */}
      <Modal visible={showDeleteSuccess} transparent animationType="fade" onRequestClose={() => setShowDeleteSuccess(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Deleted successfully</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity testID="delete-success-ok-btn" style={styles.modalBtnPrimary} onPress={() => setShowDeleteSuccess(false)}>
                <Text style={styles.modalBtnPrimText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={renameTarget !== null} transparent animationType="fade" onRequestClose={() => { setRenameTarget(null); setRenameName(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename Panel</Text>
            <TextInput
              testID="rename-panel-input"
              style={styles.modalInput}
              placeholder="New name"
              placeholderTextColor={colors.muted}
              value={renameName}
              onChangeText={setRenameName}
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
        </View>
      </Modal>

      {/* Folder Picker */}
      <Modal visible={showFolderPicker} transparent animationType="slide" onRequestClose={() => setShowFolderPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{folderPickerAction === 'move' ? 'Move to' : 'Copy to'}</Text>
              <TouchableOpacity testID="close-picker-btn" onPress={() => setShowFolderPicker(false)}>
                <Feather name="x" size={22} color={colors.textMain} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={availableFolders}
              keyExtractor={(f) => f.id}
              renderItem={({ item: f }) => (
                <TouchableOpacity testID={`pick-folder-${f.id}`} style={styles.pickerRow} onPress={() => handlePickFolder(f.id)}>
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

      {/* Panel Preview */}
      <Modal visible={previewPanel !== null} transparent animationType="fade" onRequestClose={() => setPreviewPanel(null)}>
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setPreviewPanel(null)}>
          {previewPanel && (
            <Image
              source={{ uri: getImageUri(previewPanel.id, previewPanel.stored_filename, previewPanel.image_type, previewPanel.folder_id) }}
              style={styles.previewImage}
              contentFit="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>

      {/* Panel Context Menu */}
      <Modal visible={contextPanel !== null && !ctxConfirmDelete && !ctxFolderPicker} transparent animationType="fade" onRequestClose={closePanelContextMenu}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closePanelContextMenu}>
          <View style={styles.contextCard}>
            <Text style={styles.contextTitle} numberOfLines={1}>{contextPanel?.filename}</Text>
            <TouchableOpacity testID="ctx-rename-btn" style={styles.contextRow} onPress={ctxRename}>
              <Feather name="edit-3" size={18} color={colors.textMain} />
              <Text style={styles.contextRowText}>Rename</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="ctx-copy-btn" style={styles.contextRow} onPress={ctxCopyTo}>
              <Feather name="copy" size={18} color={colors.textMain} />
              <Text style={styles.contextRowText}>Copy To</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="ctx-move-btn" style={styles.contextRow} onPress={ctxMoveTo}>
              <Feather name="corner-right-down" size={18} color={colors.textMain} />
              <Text style={styles.contextRowText}>Move To</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="ctx-select-btn" style={styles.contextRow} onPress={ctxSelect}>
              <Feather name="check-square" size={18} color={colors.textMain} />
              <Text style={styles.contextRowText}>Select</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="ctx-delete-btn" style={[styles.contextRow, styles.contextRowLast]} onPress={ctxDelete}>
              <Feather name="trash-2" size={18} color={colors.primary} />
              <Text style={[styles.contextRowText, { color: colors.primary }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Context Delete Confirmation */}
      <Modal visible={ctxConfirmDelete} transparent animationType="fade" onRequestClose={() => setCtxConfirmDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Panel</Text>
            <Text style={styles.modalMessage}>
              Delete "{contextPanel?.filename}"? This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity testID="ctx-cancel-delete-btn" style={styles.modalBtnSecondary} onPress={() => { setCtxConfirmDelete(false); setContextPanel(null); }}>
                <Text style={styles.modalBtnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="ctx-confirm-delete-btn" style={styles.modalBtnDestructive} onPress={executeCtxDelete}>
                <Text style={styles.modalBtnPrimText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Context Rename */}
      <Modal visible={ctxRenameTarget !== null} transparent animationType="fade" onRequestClose={() => { setCtxRenameTarget(null); setCtxRenameName(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename Panel</Text>
            <TextInput
              testID="ctx-rename-input"
              style={styles.modalInput}
              placeholder="New name"
              placeholderTextColor={colors.muted}
              value={ctxRenameName}
              onChangeText={setCtxRenameName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity testID="ctx-cancel-rename-btn" style={styles.modalBtnSecondary} onPress={() => { setCtxRenameTarget(null); setCtxRenameName(''); }}>
                <Text style={styles.modalBtnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="ctx-confirm-rename-btn" style={styles.modalBtnPrimary} onPress={handleCtxRename}>
                <Text style={styles.modalBtnPrimText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Context Folder Picker */}
      <Modal visible={ctxFolderPicker} transparent animationType="slide" onRequestClose={() => setCtxFolderPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{ctxFolderAction === 'move' ? 'Move to' : 'Copy to'}</Text>
              <TouchableOpacity testID="ctx-close-picker-btn" onPress={() => { setCtxFolderPicker(false); setContextPanel(null); }}>
                <Feather name="x" size={22} color={colors.textMain} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={ctxAvailableFolders}
              keyExtractor={(f) => f.id}
              renderItem={({ item: f }) => (
                <TouchableOpacity testID={`ctx-pick-folder-${f.id}`} style={styles.pickerRow} onPress={() => handleCtxPickFolder(f.id)}>
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

/* ══════════════════════════════ styles ══════════════════════════════ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  rootWrap: { flex: 1, backgroundColor: colors.background },

  /* ── headers ── */
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, paddingHorizontal: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textMain },
  headerSub: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },

  selectHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.primary,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  selectCount: { fontSize: 17, fontWeight: '700', color: colors.textMain, marginLeft: 8 },

  /* ── grid ── */
  gridContent: { padding: 12, paddingBottom: 100 },
  panelCell: {
    width: THUMB_SIZE, height: THUMB_SIZE + 32, margin: 4,
    backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  panelCellSelected: { borderColor: colors.primary, borderWidth: 2 },
  panelThumb: { width: '100%', height: THUMB_SIZE },
  panelLabel: { paddingHorizontal: 6, paddingVertical: 6 },
  panelLabelText: { fontSize: 11, color: colors.mutedForeground },

  checkbox: {
    position: 'absolute', top: 6, left: 6, zIndex: 5,
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { color: colors.muted, fontSize: 16, marginTop: 12 },

  /* ── selection toolbar ── */
  selToolbar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    paddingVertical: 10, paddingBottom: 24,
  },
  selAction: { alignItems: 'center', gap: 4, minWidth: 56 },
  selActionText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },

  /* ── modals ── */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    width: SCREEN_W - 48, backgroundColor: '#27272a', borderRadius: 16,
    padding: 24, borderWidth: 1, borderColor: '#52525b', elevation: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textMain, marginBottom: 12 },
  modalMessage: { fontSize: 14, color: colors.mutedForeground, marginBottom: 4, lineHeight: 20 },
  modalInput: {
    backgroundColor: '#3f3f46', borderRadius: 8, padding: 14,
    fontSize: 15, color: colors.textMain, borderWidth: 1, borderColor: '#52525b', marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  modalBtnPrimary: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.primary,
  },
  modalBtnSecondary: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: '#3f3f46',
  },
  modalBtnDestructive: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: '#dc2626',
  },
  modalBtnPrimText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBtnSecText: { color: colors.mutedForeground, fontWeight: '600', fontSize: 14 },

  /* ── context menu ── */
  contextCard: {
    width: SCREEN_W - 64, backgroundColor: '#27272a', borderRadius: 14,
    paddingVertical: 8, borderWidth: 1, borderColor: '#52525b', elevation: 20,
  },
  contextTitle: {
    fontSize: 15, fontWeight: '700', color: colors.textMain,
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#3f3f46',
  },
  contextRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#3f3f46',
  },
  contextRowLast: { borderBottomWidth: 0 },
  contextRowText: { fontSize: 15, color: colors.textMain, fontWeight: '500' },

  /* ── folder picker ── */
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerCard: {
    backgroundColor: '#27272a', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '60%', borderWidth: 1, borderColor: '#52525b',
  },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#3f3f46',
  },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: colors.textMain },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#3f3f46',
  },
  pickerRowText: { flex: 1, fontSize: 15, color: colors.textMain },
  pickerRowMeta: { fontSize: 13, color: colors.mutedForeground },
  pickerEmpty: { padding: 20, textAlign: 'center', color: colors.muted, fontSize: 14 },

  /* ── preview ── */
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: SCREEN_W, height: '80%' },
});
