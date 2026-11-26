'use client';

import React, { useMemo, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Pill,
  Select,
  Stack,
  Table,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { IconEdit, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { getSafeAvatarUrl } from '@/lib/validation';
import type {
  FrStatusMessage,
  FrUserItem,
  SkillCatalogItem,
} from '@/components/fr/types';

const LEVEL_PRESETS: Array<{ label: string; levels: string[] }> = [
  {
    label: 'Basic / Intermediate / Advanced',
    levels: ['Basic', 'Intermediate', 'Advanced'],
  },
  {
    label: 'Language (A1–C2, Native)',
    levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'],
  },
  { label: 'Certified / Lead', levels: ['Trained', 'Certified', 'Lead'] },
];

export function FrSkillsSection({
  loading,
  skillsCatalog,
  users,
  canWrite = false,
  onRefresh,
  onStatusMessage,
}: {
  loading: boolean;
  skillsCatalog: SkillCatalogItem[];
  users: FrUserItem[];
  canWrite?: boolean;
  onRefresh: () => Promise<void>;
  onStatusMessage: (msg: FrStatusMessage | null) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [newLevels, setNewLevels] = useState<string[]>([
    'Basic',
    'Intermediate',
    'Advanced',
  ]);
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<SkillCatalogItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editLevels, setEditLevels] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SkillCatalogItem | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      setNewCategory('General');
      setCreateOpen(false);
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
      <Stack gap="lg">
        {/* Skill Catalog */}
        <Paper p="lg" withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Group gap="xs">
                <Text size="sm" fw={700}>
                  Skill Catalog
                </Text>
                <Badge size="xs" color="cyan">
                  {skillsCatalog.length}
                </Badge>
              </Group>

              {canWrite && (
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setCreateOpen(true)}
                >
                  Create Skill
                </Button>
              )}
            </Group>

            {loading ? (
              <Group justify="center" gap="sm" py="lg">
                <Loader size="sm" color="cyan" />
                <Text size="sm" c="dimmed">
                  Loading skills...
                </Text>
              </Group>
            ) : skillsCatalog.length === 0 ? (
              <Text size="sm" c="dimmed" py="md" ta="center">
                No skills defined yet.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={560}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Skill</Table.Th>
                      <Table.Th>Category</Table.Th>
                      <Table.Th>Levels</Table.Th>
                      {canWrite && <Table.Th ta="right">Actions</Table.Th>}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {skillsCatalog.map((skill) => (
                      <Table.Tr key={skill.id}>
                        <Table.Td>
                          <Text size="sm" fw={600}>
                            {skill.name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" color="gray">
                            {skill.category}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="wrap">
                            {skill.levels.map((lvl) => (
                              <Pill key={lvl} size="xs">
                                {lvl}
                              </Pill>
                            ))}
                          </Group>
                        </Table.Td>
                        {canWrite && (
                          <Table.Td ta="right">
                            <Group gap={4} justify="flex-end" wrap="nowrap">
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
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Paper>

        {/* Skill Finder */}
        <Paper p="lg" withBorder>
          <Stack gap="md">
            <Text size="sm" fw={700}>
              Skill Finder
            </Text>

            <Group gap="sm" wrap="wrap">
              <Select
                placeholder="Filter by skill..."
                size="xs"
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
                size="xs"
                data={selectedFinderSkill?.levels ?? []}
                value={finderLevel}
                onChange={setFinderLevel}
                clearable
                disabled={!selectedFinderSkill}
                style={{ flex: 1, minWidth: 160 }}
              />
              <TextInput
                placeholder="Search username..."
                size="xs"
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
              <Text size="sm" c="dimmed" py="md" ta="center">
                No crew members match the selected skill filter.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={480}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Member</Table.Th>
                      <Table.Th>Skills</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {matchingCrew.map((u) => {
                      const safeAvatar = getSafeAvatarUrl(u.avatarUrl);
                      return (
                        <Table.Tr key={u.id}>
                          <Table.Td>
                            <Group gap="sm" wrap="nowrap">
                              <Avatar
                                src={safeAvatar ?? undefined}
                                radius="xl"
                                size="sm"
                                color="cyan"
                              >
                                {u.username.slice(0, 2).toUpperCase()}
                              </Avatar>
                              <Text size="sm" fw={600}>
                                {u.username}
                              </Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            {u.skills.length > 0 ? (
                              <Group gap={4} wrap="wrap">
                                {u.skills.map((s) => (
                                  <Badge
                                    key={s.skillId}
                                    size="xs"
                                    variant={
                                      finderSkillId === String(s.skillId)
                                        ? 'filled'
                                        : 'light'
                                    }
                                    color="cyan"
                                  >
                                    {s.skillName} · {s.level}
                                  </Badge>
                                ))}
                              </Group>
                            ) : (
                              <Text size="xs" c="dimmed">
                                —
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Paper>
      </Stack>

      {/* Modal: Create Skill */}
      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Skill"
        size="lg"
      >
        <form onSubmit={handleCreateSkill}>
          <Stack gap="md">
            <Group gap="sm" grow>
              <TextInput
                label="Skill Name"
                placeholder="e.g. First Aid, German, Radio Ops"
                required
                maxLength={80}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <TextInput
                label="Category"
                placeholder="e.g. Medical, Language, Ops"
                maxLength={60}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
            </Group>

            <TagsInput
              label="Allowed Levels (press Enter to add)"
              placeholder="Add level..."
              value={newLevels}
              onChange={setNewLevels}
              clearable
            />

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

            <Group justify="flex-end" gap="xs">
              <Button
                variant="default"
                size="xs"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="xs"
                loading={creating}
                disabled={!newName.trim() || newLevels.length === 0}
              >
                Create Skill
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal: Edit Skill */}
      <Modal
        opened={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Edit Skill"
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
              <Button
                variant="default"
                size="xs"
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
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
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Delete skill{' '}
            <strong style={{ color: 'var(--mantine-color-white)' }}>
              {deleteTarget?.name}
            </strong>
            ? All crew skill assignments for this skill will also be removed.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              size="xs"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              size="xs"
              loading={deleting}
              onClick={() => void handleDeleteSkill()}
            >
              Delete Permanently
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
