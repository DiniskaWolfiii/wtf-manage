'use client';

import React, { useMemo, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Pill,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { IconEdit, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { getSafeAvatarUrl } from '@/lib/validation';
import {
  DARK_MODAL_STYLES,
  type FrStatusMessage,
  type FrUserItem,
  type SkillCatalogItem,
} from '@/components/fr/types';

const LEVEL_PRESETS: Array<{ label: string; levels: string[] }> = [
  { label: 'Basic / Intermediate / Advanced', levels: ['Basic', 'Intermediate', 'Advanced'] },
  { label: 'Language (A1–C2, Native)', levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'] },
  { label: 'Certified / Lead', levels: ['Trained', 'Certified', 'Lead'] },
];

export function FrSkillsSection({
  loading,
  skillsCatalog,
  users,
  onRefresh,
  onStatusMessage,
}: {
  loading: boolean;
  skillsCatalog: SkillCatalogItem[];
  users: FrUserItem[];
  onRefresh: () => Promise<void>;
  onStatusMessage: (msg: FrStatusMessage | null) => void;
}) {
  // Create Skill form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [newLevels, setNewLevels] = useState<string[]>(['Basic', 'Intermediate', 'Advanced']);
  const [creating, setCreating] = useState(false);

  // Edit Skill modal
  const [editTarget, setEditTarget] = useState<SkillCatalogItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editLevels, setEditLevels] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Skill modal
  const [deleteTarget, setDeleteTarget] = useState<SkillCatalogItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Skill Finder state
  const [finderSkillId, setFinderSkillId] = useState<string | null>(null);
  const [finderLevel, setFinderLevel] = useState<string | null>(null);
  const [finderSearch, setFinderSearch] = useState('');

  const skillOptions = useMemo(
    () =>
      skillsCatalog.map((s) => ({
        value: String(s.id),
        label: `${s.name} (${s.category})`,
      })),
    [skillsCatalog]
  );

  const selectedFinderSkill = useMemo(
    () => skillsCatalog.find((s) => String(s.id) === finderSkillId) ?? null,
    [skillsCatalog, finderSkillId]
  );

  const matchingCrew = useMemo(() => {
    const q = finderSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (!u.isCrew) return false;
      if (q && !u.username.toLowerCase().includes(q)) return false;
      if (finderSkillId) {
        const match = u.skills.find((s) => String(s.skillId) === finderSkillId);
        if (!match) return false;
        if (finderLevel && match.level !== finderLevel) return false;
      }
      return true;
    });
  }, [users, finderSearch, finderSkillId, finderLevel]);

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName || newLevels.length === 0) return;

    setCreating(true);
    onStatusMessage(null);
    try {
      const res = await fetch('/api/fr/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          category: newCategory.trim() || 'General',
          levels: newLevels,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to create skill.',
        });
        return;
      }
      setNewName('');
      onStatusMessage({
        type: 'success',
        text: `Skill "${data.skill.name}" created.`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while creating skill.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const trimmedName = editName.trim();
    if (!trimmedName || editLevels.length === 0) return;

    setSavingEdit(true);
    onStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/skills/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          category: editCategory.trim() || 'General',
          levels: editLevels,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to update skill.',
        });
        return;
      }
      setEditTarget(null);
      onStatusMessage({
        type: 'success',
        text: `Skill "${data.skill.name}" updated.`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while updating skill.',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    onStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/skills/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to delete skill.',
        });
        return;
      }
      const deletedName = deleteTarget.name;
      setDeleteTarget(null);
      if (finderSkillId === String(deleteTarget.id)) {
        setFinderSkillId(null);
        setFinderLevel(null);
      }
      onStatusMessage({
        type: 'success',
        text: `Skill "${deletedName}" deleted.`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while deleting skill.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Stack gap={24}>
        {/* Skill Catalog */}
        <Paper
          p={24}
          radius="md"
          withBorder
          style={{
            backgroundColor: 'var(--mantine-color-dark-7)',
            borderColor: 'var(--mantine-color-dark-4)',
          }}
        >
          <Stack gap="md">
            <div>
              <Group gap="xs">
                <Text size="md" fw={700} c="white">
                  Skill Catalog
                </Text>
                <Badge size="xs" variant="light" color="cyan">
                  {skillsCatalog.length}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                Define skills and their selectable proficiency levels for crew assignments
              </Text>
            </div>

            <form onSubmit={handleCreateSkill}>
              <Stack gap="sm">
                <Group gap="sm" align="flex-end" wrap="wrap">
                  <TextInput
                    label="Skill Name"
                    placeholder="e.g. First Aid, German, Radio Ops"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={80}
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  <TextInput
                    label="Category"
                    placeholder="e.g. Medical, Language, Ops"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    maxLength={60}
                    style={{ flex: 1, minWidth: 160 }}
                  />
                </Group>

                <TagsInput
                  label="Allowed Levels (press Enter to add)"
                  placeholder="Add level..."
                  value={newLevels}
                  onChange={setNewLevels}
                  clearable
                />

                <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                  <Group gap="xs" wrap="wrap">
                    <Text size="xs" c="dimmed">
                      Presets:
                    </Text>
                    {LEVEL_PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        size="compact-xs"
                        variant="default"
                        onClick={() => setNewLevels(preset.levels)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </Group>
                  <Button
                    type="submit"
                    color="cyan"
                    leftSection={<IconPlus size={14} />}
                    loading={creating}
                    disabled={!newName.trim() || newLevels.length === 0}
                  >
                    Create Skill
                  </Button>
                </Group>
              </Stack>
            </form>

            <Divider color="var(--mantine-color-dark-4)" />

            {loading ? (
              <Group justify="center" gap="sm" py="md">
                <Loader size="sm" color="cyan" />
                <Text size="sm" c="dimmed">
                  Loading skills...
                </Text>
              </Group>
            ) : skillsCatalog.length === 0 ? (
              <Text size="xs" c="dimmed">
                No skills defined yet. Add your first skill above.
              </Text>
            ) : (
              <Stack gap="xs">
                {skillsCatalog.map((skill) => (
                  <Paper
                    key={skill.id}
                    p="sm"
                    radius="sm"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-6)',
                      borderColor: 'var(--mantine-color-dark-4)',
                    }}
                  >
                    <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Group gap="xs" wrap="wrap">
                          <Text size="sm" fw={600} c="white">
                            {skill.name}
                          </Text>
                          <Badge size="xs" variant="light" color="gray">
                            {skill.category}
                          </Badge>
                        </Group>
                        <Group gap={6} mt={6}>
                          {skill.levels.map((lvl) => (
                            <Pill key={lvl} size="xs">
                              {lvl}
                            </Pill>
                          ))}
                        </Group>
                      </div>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          title="Edit skill"
                          aria-label="Edit skill"
                          onClick={() => {
                            setEditTarget(skill);
                            setEditName(skill.name);
                            setEditCategory(skill.category);
                            setEditLevels(skill.levels);
                          }}
                        >
                          <IconEdit size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          title="Delete skill"
                          aria-label="Delete skill"
                          onClick={() => setDeleteTarget(skill)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>

        {/* Skill Finder */}
        <Paper
          p={24}
          radius="md"
          withBorder
          style={{
            backgroundColor: 'var(--mantine-color-dark-7)',
            borderColor: 'var(--mantine-color-dark-4)',
          }}
        >
          <Stack gap="md">
            <div>
              <Text size="md" fw={700} c="white">
                Skill Finder
              </Text>
              <Text size="xs" c="dimmed">
                Filter active crew members by skill and proficiency level
              </Text>
            </div>

            <Group gap="sm" wrap="wrap">
              <Select
                placeholder="Filter by skill..."
                data={skillOptions}
                value={finderSkillId}
                onChange={(val) => {
                  setFinderSkillId(val);
                  setFinderLevel(null);
                }}
                clearable
                searchable
                style={{ flex: 1, minWidth: 200 }}
              />
              <Select
                placeholder="Any level"
                data={selectedFinderSkill?.levels ?? []}
                value={finderLevel}
                onChange={setFinderLevel}
                clearable
                disabled={!selectedFinderSkill}
                style={{ flex: 1, minWidth: 160 }}
              />
              <TextInput
                placeholder="Search username..."
                leftSection={<IconSearch size={14} />}
                value={finderSearch}
                onChange={(e) => setFinderSearch(e.target.value)}
                style={{ flex: 1, minWidth: 180 }}
              />
            </Group>

            {loading ? (
              <Group justify="center" gap="sm" py="md">
                <Loader size="sm" color="cyan" />
                <Text size="sm" c="dimmed">
                  Loading crew skills...
                </Text>
              </Group>
            ) : matchingCrew.length === 0 ? (
              <Text size="xs" c="dimmed" py="sm" ta="center">
                No crew members match the selected skill filter.
              </Text>
            ) : (
              <Stack gap="xs">
                {matchingCrew.map((u) => {
                  const safeAvatar = getSafeAvatarUrl(u.avatarUrl);
                  return (
                    <Paper
                      key={u.id}
                      p="sm"
                      radius="sm"
                      withBorder
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-6)',
                        borderColor: 'var(--mantine-color-dark-4)',
                      }}
                    >
                      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                        <Group gap="sm" style={{ minWidth: 180 }}>
                          <Avatar
                            src={safeAvatar ?? undefined}
                            radius="xl"
                            size="sm"
                            color="cyan"
                          >
                            {u.username.slice(0, 2).toUpperCase()}
                          </Avatar>
                          <Text size="sm" fw={600} c="white">
                            {u.username}
                          </Text>
                        </Group>
                        <Group gap={6} wrap="wrap">
                          {u.skills.length > 0 ? (
                            u.skills.map((s) => (
                              <Badge
                                key={s.skillId}
                                size="xs"
                                variant={
                                  finderSkillId === String(s.skillId) ? 'filled' : 'light'
                                }
                                color="cyan"
                              >
                                {s.skillName} - {s.level}
                              </Badge>
                            ))
                          ) : (
                            <Text size="xs" c="dimmed">
                              No skills assigned
                            </Text>
                          )}
                        </Group>
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </Paper>
      </Stack>

      {/* Modal: Edit Skill */}
      <Modal
        opened={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Edit Skill"
        centered
        styles={DARK_MODAL_STYLES}
      >
        <form onSubmit={handleSaveEdit}>
          <Stack gap="md">
            <TextInput
              label="Skill Name"
              required
              maxLength={80}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <TextInput
              label="Category"
              maxLength={60}
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            />
            <TagsInput
              label="Allowed Levels"
              placeholder="Add level..."
              value={editLevels}
              onChange={setEditLevels}
            />
            <Group justify="flex-end" gap="xs">
              <Button variant="default" size="xs" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                color="cyan"
                size="xs"
                loading={savingEdit}
                disabled={!editName.trim() || editLevels.length === 0}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal: Delete Skill */}
      <Modal
        opened={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Skill"
        centered
        styles={DARK_MODAL_STYLES}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Are you sure you want to delete the skill{' '}
            <strong style={{ color: '#fff' }}>{deleteTarget?.name}</strong>? All crew skill
            assignments for this skill will also be removed.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              size="xs"
              loading={deleting}
              onClick={handleDeleteSkill}
            >
              Delete Permanently
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
