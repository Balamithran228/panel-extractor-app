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
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/utils/theme';
import { db, FolderData, ImageData, getImageUri } from '@/utils/db';

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
  const [renameTarget, setRenameTarget] = useState<{type: 'folder' | 'image'; id: string; name: string} | null>(null);
  const [renameName, setRenameName] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderPickerAction, setFolderPickerAction] = useState<'move' | 'copy'>('move');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);

  /* context menu */
  const [contextItem, setContextItem] = useState<SelectableItem | null>(null);
  const [contextFolderPicker, setContextFolderPicker] = useState(false);
  const [contextFolderAction, setContextFolderAction] = useState<'move' | 'copy'>('copy');
  const [contextConfirmDelete, setContextConfirmDelete] = useState(false);
  const [contextRenameTarget, setContextRenameTarget] = useState<{type: 'folder' | 'image'; id: string; name: string} | null>(null);
  const [contextRenameName, setContextRenameName] = useState('');

  const totalSelected = selectedFolders.size + selectedImages.size;

  /* ── data loading ── */
  const loadData = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([db.listFolders(), db.listImages('source')]);
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
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setUploading(true);
      const uploaded = await db.uploadImage(
        asset.uri,
        asset.fileName || 'screenshot.png',
        asset.width || 1080,
        asset.height || 1920,
      );
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

  /* ── context menu actions ── */
  const openContextMenu = (item: SelectableItem) => {
    setContextItem(item);
  };

  const closeContextMenu = () => setContextItem(null);

  const contextMenuRename = () => {
    if (!contextItem) return;
    if (contextItem.kind === 'folder') {
      setContextRenameName(contextItem.data.name);
      setContextRenameTarget({ type: 'folder', id: contextItem.data.id, name: contextItem.data.name });
    } else {
      setContextRenameName(contextItem.data.filename);
      setContextRenameTarget({ type: 'image', id: contextItem.data.id, name: contextItem.data.filename });
    }
    closeContextMenu();
  };

  const handleContextRename = async () => {
    if (!contextRenameTarget) return;
    const name = contextRenameName.trim();
    if (!name) return;
    try {
      if (contextRenameTarget.type === 'folder') {
        await db.renameFolder(contextRenameTarget.id, name);
      } else {
        await db.renameImage(contextRenameTarget.id, name);
      }
      setContextRenameTarget(null);
      setContextRenameName('');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const contextMenuDelete = () => {
    setContextConfirmDelete(true);
  };

  const executeContextDelete = async () => {
    setContextConfirmDelete(false);
    if (!contextItem) return;
    try {
      if (contextItem.kind === 'folder') {
        await db.deleteFolder(contextItem.data.id);
      } else {
        await db.deleteImage(contextItem.data.id);
      }
      setContextItem(null);
      loadData();
      setShowDeleteSuccess(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const contextMenuCopyTo = () => {
    setContextFolderAction('copy');
    setContextFolderPicker(true);
  };

  const contextMenuMoveTo = () => {
    if (!contextItem || contextItem.kind === 'folder') {
      Alert.alert('Info', 'Only images can be moved.');
      return;
    }
    setContextFolderAction('move');
    setContextFolderPicker(true);
  };

  const handleContextPickFolder = async (targetFolderId: string | null) => {
    setContextFolderPicker(false);
    if (!contextItem) return;
    const itemId = contextItem.data.id;
    try {
      if (contextFolderAction === 'move') {
        await db.moveItems([itemId], targetFolderId);
      } else {
        await db.copyItems([itemId], targetFolderId);
      }
      setContextItem(null);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const contextMenuSelect = () => {
    if (!contextItem) return;
    enterSelectWithItem(contextItem);
    closeContextMenu();
  };

  const contextMenuShare = async () => {
    if (!contextItem) return;
    try {
      const urls: string[] = [];
      if (contextItem.kind === 'folder') {
        const detail = await db.getFolder(contextItem.data.id);
        for (const p of detail.panels) {
          urls.push(getImageUri(p.id, p.stored_filename, p.image_type, p.folder_id));
        }
      } else {
        const img = contextItem.data;
        urls.push(getImageUri(img.id, img.stored_filename, img.image_type, img.folder_id));
      }
      if (urls.length === 0) {
        Alert.alert('Info', 'Nothing to share.');
      } else {
        await Share.share({ message: urls.join('\n'), title: 'Panel Extractor' });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    closeContextMenu();
  };

  /* ── actions ── */
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await db.createFolder(name);
    setShowCreateFolder(false);
    setNewFolderName('');
    loadData();
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) return;
    try {
      if (renameTarget.type === 'folder') {
        await db.renameFolder(renameTarget.id, name);
      } else {
        await db.renameImage(renameTarget.id, name);
      }
      setRenameTarget(null);
      setRenameName('');
      exitSelectMode();
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDelete = () => {
    setConfirmDelete(true);
  };

  const executeDelete = async () => {
    setConfirmDelete(false);
    try {
      await db.bulkDelete(
        Array.from(selectedImages),
        Array.from(selectedFolders),
      );
      exitSelectMode();
      loadData();
      setShowDeleteSuccess(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
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
    loadData();
  };

  const handleShare = async () => {
    const urls: string[] = [];
    for (const id of selectedImages) {
      const img = sources.find((s) => s.id === id);
      if (img) urls.push(getImageUri(id, img.stored_filename, img.image_type, img.folder_id));
    }
    try {
      await Share.share({ message: urls.join('\n'), title: 'Panel Extractor' });
    } catch (_e) { /* user cancelled */ }
  };

  const handleRenameAction = () => {
    const totalSel = selectedFolders.size + selectedImages.size;
    if (totalSel !== 1) {
      Alert.alert('Rename', 'Select exactly one item to rename.');
      return;
    }
    if (selectedFolders.size === 1) {
      const fid = Array.from(selectedFolders)[0];
      const f = folders.find((x) => x.id === fid);
      if (f) { setRenameName(f.name); setRenameTarget({ type: 'folder', id: f.id, name: f.name }); }
    } else {
      const iid = Array.from(selectedImages)[0];
      const img = sources.find((x) => x.id === iid);
      if (img) { setRenameName(img.filename); setRenameTarget({ type: 'image', id: img.id, name: img.filename }); }
    }
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
          onLongPress={() => openContextMenu({ kind: 'folder', data: f })}
          activeOpacity={0.7}
        >
          {selectMode && (
            <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
              {selected && <Feather name="check" size={14} color="#fff" />}
            </View>
          )}
          <View style={styles.cardThumb}>
            {f.thumbnail_id ? (
              <ThumbnailImage imageId={f.thumbnail_id} />
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
      const imgUri = getImageUri(img.id, img.stored_filename, img.image_type, img.folder_id);
      return (
        <TouchableOpacity
          testID={`source-card-${img.id}`}
          style={[styles.card, selected && styles.cardSelected]}
          onPress={() => {
            if (selectMode) toggleImageSelect(img.id);
            else router.push({ pathname: '/editor', params: { imageId: img.id } });
          }}
          onLongPress={() => openContextMenu({ kind: 'image', data: img })}
          activeOpacity={0.7}
        >
          {selectMode && (
            <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
              {selected && <Feather name="check" size={14} color="#fff" />}
            </View>
          )}
          <View style={styles.cardThumb}>
            <Image source={{ uri: imgUri }} style={styles.thumbImage} contentFit="cover" />
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
      </SafeAreaView>

      {/* ═══════ Modal Dialogs ═══════ */}

      {/* Delete Confirmation Modal */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Selected</Text>
            <Text style={styles.modalMessage}>
              Delete {totalSelected} item{totalSelected > 1 ? 's' : ''}? This cannot be undone.
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

      {/* Delete Success Modal */}
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

      {/* Create Folder Modal */}
      <Modal visible={showCreateFolder} transparent animationType="fade" onRequestClose={() => { setShowCreateFolder(false); setNewFolderName(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Folder</Text>
            <TextInput
              testID="new-folder-input"
              style={styles.modalInput}
              placeholder="Folder name"
              placeholderTextColor={colors.muted}
              value={newFolderName}
              onChangeText={setNewFolderName}
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
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={renameTarget !== null} transparent animationType="fade" onRequestClose={() => { setRenameTarget(null); setRenameName(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename {renameTarget?.type === 'image' ? 'File' : 'Folder'}</Text>
            <TextInput
              testID="rename-folder-input"
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

      {/* Folder Picker Modal */}
      <Modal visible={showFolderPicker} transparent animationType="slide" onRequestClose={() => setShowFolderPicker(false)}>
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
            <TouchableOpacity testID="pick-root-btn" style={styles.pickerRow} onPress={() => handlePickFolder(null)}>
              <Feather name="home" size={20} color={colors.textMain} />
              <Text style={styles.pickerRowText}>Root (no folder)</Text>
            </TouchableOpacity>
            <FlatList
              data={folders}
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
      {/* Context Menu Modal */}
      <Modal visible={contextItem !== null && !contextConfirmDelete && !contextFolderPicker} transparent animationType="fade" onRequestClose={closeContextMenu}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeContextMenu}>
          <View style={styles.contextCard}>
            <Text style={styles.contextTitle} numberOfLines={1}>
              {contextItem?.kind === 'folder' ? contextItem.data.name : (contextItem as any)?.data?.filename}
            </Text>
            <TouchableOpacity testID="ctx-rename-btn" style={styles.contextRow} onPress={contextMenuRename}>
              <Feather name="edit-3" size={18} color={colors.textMain} />
              <Text style={styles.contextRowText}>Rename</Text>
            </TouchableOpacity>
            {contextItem?.kind === 'image' && (
              <TouchableOpacity testID="ctx-copy-btn" style={styles.contextRow} onPress={contextMenuCopyTo}>
                <Feather name="copy" size={18} color={colors.textMain} />
                <Text style={styles.contextRowText}>Copy To</Text>
              </TouchableOpacity>
            )}
            {contextItem?.kind === 'image' && (
              <TouchableOpacity testID="ctx-move-btn" style={styles.contextRow} onPress={contextMenuMoveTo}>
                <Feather name="corner-right-down" size={18} color={colors.textMain} />
                <Text style={styles.contextRowText}>Move To</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity testID="ctx-select-btn" style={styles.contextRow} onPress={contextMenuSelect}>
              <Feather name="check-square" size={18} color={colors.textMain} />
              <Text style={styles.contextRowText}>Select</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="ctx-share-btn" style={styles.contextRow} onPress={contextMenuShare}>
              <Feather name="share-2" size={18} color={colors.textMain} />
              <Text style={styles.contextRowText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="ctx-delete-btn" style={[styles.contextRow, styles.contextRowLast]} onPress={contextMenuDelete}>
              <Feather name="trash-2" size={18} color={colors.primary} />
              <Text style={[styles.contextRowText, { color: colors.primary }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Context Delete Confirmation Modal */}
      <Modal visible={contextConfirmDelete} transparent animationType="fade" onRequestClose={() => setContextConfirmDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete {contextItem?.kind === 'folder' ? 'Folder' : 'Image'}</Text>
            <Text style={styles.modalMessage}>
              Delete "{contextItem?.kind === 'folder' ? contextItem.data.name : (contextItem as any)?.data?.filename}"? This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity testID="ctx-cancel-delete-btn" style={styles.modalBtnSecondary} onPress={() => { setContextConfirmDelete(false); setContextItem(null); }}>
                <Text style={styles.modalBtnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="ctx-confirm-delete-btn" style={styles.modalBtnDestructive} onPress={executeContextDelete}>
                <Text style={styles.modalBtnPrimText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Context Rename Modal */}
      <Modal visible={contextRenameTarget !== null} transparent animationType="fade" onRequestClose={() => { setContextRenameTarget(null); setContextRenameName(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename {contextRenameTarget?.type === 'image' ? 'File' : 'Folder'}</Text>
            <TextInput
              testID="ctx-rename-input"
              style={styles.modalInput}
              placeholder="New name"
              placeholderTextColor={colors.muted}
              value={contextRenameName}
              onChangeText={setContextRenameName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity testID="ctx-cancel-rename-btn" style={styles.modalBtnSecondary} onPress={() => { setContextRenameTarget(null); setContextRenameName(''); }}>
                <Text style={styles.modalBtnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="ctx-confirm-rename-btn" style={styles.modalBtnPrimary} onPress={handleContextRename}>
                <Text style={styles.modalBtnPrimText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Context Folder Picker Modal */}
      <Modal visible={contextFolderPicker} transparent animationType="slide" onRequestClose={() => setContextFolderPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {contextFolderAction === 'move' ? 'Move to' : 'Copy to'}
              </Text>
              <TouchableOpacity testID="ctx-close-picker-btn" onPress={() => { setContextFolderPicker(false); setContextItem(null); }}>
                <Feather name="x" size={22} color={colors.textMain} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity testID="ctx-pick-root-btn" style={styles.pickerRow} onPress={() => handleContextPickFolder(null)}>
              <Feather name="home" size={20} color={colors.textMain} />
              <Text style={styles.pickerRowText}>Root (no folder)</Text>
            </TouchableOpacity>
            <FlatList
              data={folders}
              keyExtractor={(f) => f.id}
              renderItem={({ item: f }) => (
                <TouchableOpacity testID={`ctx-pick-folder-${f.id}`} style={styles.pickerRow} onPress={() => handleContextPickFolder(f.id)}>
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

/* ── Thumbnail component that resolves local URI ── */
function ThumbnailImage({ imageId }: { imageId: string }) {
  const [uri, setUri] = useState<string>('');
  useCallback(() => {
    db.getImageUriById(imageId).then(setUri).catch(() => {});
  }, [imageId]);

  // Load on mount
  React.useEffect(() => {
    db.getImageUriById(imageId).then(setUri).catch(() => {});
  }, [imageId]);

  if (!uri) return <Feather name="image" size={28} color={colors.muted} />;
  return <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" />;
}

/* ══════════════════════════════ styles ══════════════════════════════ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  rootWrap: { flex: 1, backgroundColor: colors.background },

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
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, overflow: 'hidden',
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: 'rgba(239,68,68,0.06)' },
  cardThumb: {
    width: 56, height: 56, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceHighlight, marginLeft: 12, borderRadius: 8, overflow: 'hidden',
  },
  thumbImage: { width: 56, height: 56 },
  cardInfo: { flex: 1, paddingHorizontal: 12, paddingVertical: 14 },
  cardName: { fontSize: 15, fontWeight: '600', color: colors.textMain },
  cardMeta: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },

  checkbox: {
    position: 'absolute', left: 8, top: '50%', marginTop: -11,
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.muted,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 5,
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
    position: 'absolute', bottom: 24, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 28,
    elevation: 6, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8,
  },
  fabText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 15 },

  /* ── modals ── */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center',
  },
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
});
