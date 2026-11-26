'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  Pill,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconAward,
  IconDotsVertical,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUser,
  IconUserMinus,
  IconUserPlus,
} from '@tabler/icons-react';
import { getSafeAvatarUrl } from '@/lib/validation';
import type {
  DepartmentItem,
  FrStatusMessage,
  FrUserItem,
  SkillCatalogItem,
} from '@/components/fr/types';

interface EditableAssignmentRow {
  key: string;
  departmentId: string | null;
  position: string;
}

interface EditableSkillRow {
  key: string;
  skillId: string | null;
  level: string | null;
}

export function FrCrewSection({
  loading,
  crewGroupConfigured,
  users,
  departments,
  skillsCatalog,
  currentUserId,
  isFrAdmin,
  onRefresh,
  onStatusMessage,
}: {
  loading: boolean;
  crewGroupConfigured: boolean;
  users: FrUserItem[];
  departments: DepartmentItem[];
  skillsCatalog: SkillCatalogItem[];
  currentUserId?: string;
  isFrAdmin: boolean;
  onRefresh: () => Promise<void>;
  onStatusMessage: (msg: FrStatusMessage | null) => void;
}) {
  const [onboardModalOpen, setOnboardModalOpen] = useState(false);
  const [selectedPromoteUserId, setSelectedPromoteUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'active' | 'on_leave' | 'offboarded' | 'all'
  >('active');
  const [syncingProfiles, setSyncingProfiles] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [demoteTarget, setDemoteTarget] = useState<FrUserItem | null>(null);

  const [editingRolesUser, setEditingRolesUser] = useState<FrUserItem | null>(null);
  const [assignmentRows, setAssignmentRows] = useState<EditableAssignmentRow[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const [editingSkillsUser, setEditingSkillsUser] = useState<FrUserItem | null>(null);
  const [skillRows, setSkillRows] = useState<EditableSkillRow[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);

  const nextRowKeyRef = useRef(0);

  const nonCrewOptions = useMemo(
    () =>
      users
        .filter((u) => !u.isCrew)
        .map((u) => ({
          value: u.id,
          label: u.id === currentUserId ? `${u.username} (You)` : u.username,
        })),
    [users, currentUserId]
  );

  const crewMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (!u.isCrew && !u.hasMasterProfile) return false;
      const effectiveStatus = u.status ?? (u.isCrew ? 'active' : 'offboarded');
      if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;
      if (q && !u.username.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, searchQuery, statusFilter]);

  const totalCrewCount = useMemo(
    () => users.filter((u) => u.isCrew).length,
    [users]
  );

  const handleSyncFromKeycloak = async () => {
    setSyncingProfiles(true);
    onStatusMessage(null);
    try {
      const res = await fetch('/api/fr/crew', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to sync crew profiles from Keycloak.',
        });
        return;
      }
      onStatusMessage({
        type: 'success',
        text: `Keycloak sync complete (${data.created ?? 0} created, ${data.updated ?? 0} updated).`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while syncing crew profiles.',
      });
    } finally {
      setSyncingProfiles(false);
    }
  };

  const departmentSelectOptions = useMemo(
    () => departments.map((d) => ({ value: String(d.id), label: d.name })),
    [departments]
  );

  const skillCatalogMap = useMemo(
    () => new Map(skillsCatalog.map((s) => [String(s.id), s])),
    [skillsCatalog]
  );

  const skillSelectOptions = useMemo(
    () =>
      skillsCatalog.map((s) => ({
        value: String(s.id),
        label: `${s.name} (${s.category})`,
      })),
    [skillsCatalog]
  );

  const handlePromoteSelectedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPromoteUserId) return;
    const targetUser = users.find((u) => u.id === selectedPromoteUserId);
    if (!targetUser) return;

    setBusyUserId(targetUser.id);
    onStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(targetUser.id)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to onboard user to Crew.',
        });
        return;
      }
      setSelectedPromoteUserId(null);
      setOnboardModalOpen(false);
      onStatusMessage({
        type: 'success',
        text: `"${targetUser.username}" onboarded to Crew (re-login required).`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while onboarding user.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleConfirmDemote = async () => {
    if (!demoteTarget) return;
    setBusyUserId(demoteTarget.id);
    onStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(demoteTarget.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to offboard user.',
        });
        return;
      }
      const username = demoteTarget.username;
      setDemoteTarget(null);
      onStatusMessage({
        type: 'success',
        text: `"${username}" offboarded (re-login required).`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while offboarding user.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const openRoleEditor = (user: FrUserItem) => {
    setEditingRolesUser(user);
    if (user.roles.length > 0) {
      setAssignmentRows(
        user.roles.map((r, idx) => ({
          key: `${r.departmentId}-${idx}`,
          departmentId: String(r.departmentId),
          position: r.position,
        }))
      );
    } else {
      nextRowKeyRef.current += 1;
      setAssignmentRows([
        {
          key: `new-${nextRowKeyRef.current}`,
          departmentId: departments[0] ? String(departments[0].id) : null,
          position: '',
        },
      ]);
    }
  };

  const handleAddRoleRow = () => {
    nextRowKeyRef.current += 1;
    setAssignmentRows((prev) => [
      ...prev,
      {
        key: `row-${nextRowKeyRef.current}`,
        departmentId: null,
        position: '',
      },
    ]);
  };

  const handleSaveRoles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRolesUser) return;

    const cleanAssignments: Array<{ departmentId: number; position: string }> = [];
    const usedDeptIds = new Set<number>();

    for (const row of assignmentRows) {
      if (!row.departmentId) {
        onStatusMessage({
          type: 'error',
          text: 'Please select a department for each row (or remove empty rows).',
        });
        return;
      }
      const deptId = Number(row.departmentId);
      if (usedDeptIds.has(deptId)) {
        onStatusMessage({
          type: 'error',
          text: 'Each department can only be assigned once per user.',
        });
        return;
      }
      usedDeptIds.add(deptId);
      cleanAssignments.push({ departmentId: deptId, position: row.position.trim() });
    }

    setSavingRoles(true);
    onStatusMessage(null);
    try {
      const res = await fetch(
        `/api/fr/crew/${encodeURIComponent(editingRolesUser.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignments: cleanAssignments }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to save crew roles.',
        });
        return;
      }
      const username = editingRolesUser.username;
      setEditingRolesUser(null);
      onStatusMessage({
        type: 'success',
        text: `Departments updated for "${username}".`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while saving crew roles.',
      });
    } finally {
      setSavingRoles(false);
    }
  };

  const openSkillEditor = (user: FrUserItem) => {
    setEditingSkillsUser(user);
    if (user.skills.length > 0) {
      setSkillRows(
        user.skills.map((s, idx) => ({
          key: `skill-${s.skillId}-${idx}`,
          skillId: String(s.skillId),
          level: s.level,
        }))
      );
    } else if (skillsCatalog.length > 0) {
      nextRowKeyRef.current += 1;
      const firstSkill = skillsCatalog[0];
      setSkillRows([
        {
          key: `skill-new-${nextRowKeyRef.current}`,
          skillId: String(firstSkill.id),
          level: firstSkill.levels[0] ?? null,
        },
      ]);
    } else {
      setSkillRows([]);
    }
  };

  const handleAddSkillRow = () => {
    nextRowKeyRef.current += 1;
    setSkillRows((prev) => [
      ...prev,
      {
        key: `skill-row-${nextRowKeyRef.current}`,
        skillId: null,
        level: null,
      },
    ]);
  };

  const handleSaveSkills = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSkillsUser) return;

    const cleanSkills: Array<{ skillId: number; level: string }> = [];
    const usedSkillIds = new Set<number>();

    for (const row of skillRows) {
      if (!row.skillId || !row.level) {
        onStatusMessage({
          type: 'error',
          text: 'Please select both a skill and a level for each row (or remove empty rows).',
        });
        return;
      }
      const skillId = Number(row.skillId);
      if (usedSkillIds.has(skillId)) {
        onStatusMessage({
          type: 'error',
          text: 'Each skill can only be assigned once per user.',
        });
        return;
      }
      usedSkillIds.add(skillId);
      cleanSkills.push({ skillId, level: row.level });
    }

    setSavingSkills(true);
    onStatusMessage(null);
    try {
      const res = await fetch(
        `/api/fr/crew/${encodeURIComponent(editingSkillsUser.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skills: cleanSkills }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to save crew skills.',
        });
        return;
      }
      const username = editingSkillsUser.username;
      setEditingSkillsUser(null);
      onStatusMessage({
        type: 'success',
        text: `Skills updated for "${username}".`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while saving crew skills.',
      });
    } finally {
      setSavingSkills(false);
    }
  };

  return (
    <>
      <Paper p="lg" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Group gap="xs">
              <Text size="sm" fw={700}>
                Crew Members
              </Text>
              <Badge size="xs" color="cyan">
                {crewMembers.length} / {totalCrewCount} active
              </Badge>
            </Group>

            <Group gap="xs" wrap="wrap">
              {isFrAdmin && (
                <>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconRefresh size={14} />}
                    loading={syncingProfiles}
                    disabled={loading || !crewGroupConfigured}
                    onClick={() => void handleSyncFromKeycloak()}
                  >
                    Sync Keycloak
                  </Button>
                  <Button
                    size="xs"
                    leftSection={<IconUserPlus size={14} />}
                    disabled={loading || !crewGroupConfigured}
                    onClick={() => setOnboardModalOpen(true)}
                  >
                    Add Member
                  </Button>
                </>
              )}
            </Group>
          </Group>

          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <TextInput
              placeholder="Filter by username..."
              leftSection={<IconSearch size={14} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="xs"
              w={{ base: '100%', sm: 240 }}
            />
            <SegmentedControl
              size="xs"
              style={{ maxWidth: '100%', overflowX: 'auto' }}
              value={statusFilter}
              onChange={(val) =>
                setStatusFilter(val as 'active' | 'on_leave' | 'offboarded' | 'all')
              }
              data={[
                { value: 'active', label: 'Active' },
                { value: 'on_leave', label: 'On Leave' },
                { value: 'offboarded', label: 'Offboarded' },
                { value: 'all', label: 'All' },
              ]}
            />
          </Group>

          {loading ? (
            <Group justify="center" gap="sm" py="xl">
              <Loader size="sm" color="cyan" />
              <Text size="sm" c="dimmed">
                Loading crew members...
              </Text>
            </Group>
          ) : crewMembers.length === 0 ? (
            <Text size="sm" c="dimmed" py="lg" ta="center">
              {totalCrewCount === 0
                ? 'No crew members onboarded yet.'
                : 'No crew members match your filter.'}
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={920}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th miw={190}>Member</Table.Th>
                    <Table.Th miw={220}>Departments &amp; Roles</Table.Th>
                    <Table.Th miw={190}>Skills</Table.Th>
                    <Table.Th miw={105}>Status</Table.Th>
                    <Table.Th ta="right" miw={130}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {crewMembers.map((u) => {
                    const safeAvatar = getSafeAvatarUrl(u.avatarUrl);
                    const isBusy = busyUserId === u.id;
                    return (
                      <Table.Tr key={u.id}>
                        <Table.Td>
                          <Group gap="sm" wrap="nowrap">
                            <Avatar
                              src={safeAvatar ?? undefined}
                              radius="xl"
                              size="sm"
                              color="cyan"
                              style={{ flexShrink: 0 }}
                            >
                              {u.username.slice(0, 2).toUpperCase()}
                            </Avatar>
                            <Group gap={6} wrap="nowrap">
                              <Text
                                component={Link}
                                href={`/fr/crew/${encodeURIComponent(u.id)}`}
                                size="sm"
                                fw={600}
                                c="var(--mantine-color-white)"
                                style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
                              >
                                {u.username}
                              </Text>
                              {u.id === currentUserId && (
                                <Badge
                                  size="xs"
                                  variant="outline"
                                  color="gray"
                                  style={{ flexShrink: 0 }}
                                >
                                  You
                                </Badge>
                              )}
                            </Group>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          {u.roles.length > 0 ? (
                            <Group gap={4} wrap="wrap">
                              {u.roles.map((r) => (
                                <Pill key={r.departmentId} size="sm">
                                  {r.position
                                    ? `${r.departmentName} · ${r.position}`
                                    : r.departmentName}
                                </Pill>
                              ))}
                            </Group>
                          ) : (
                            <Text size="xs" c="dimmed">
                              —
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {u.skills.length > 0 ? (
                            <Group gap={4} wrap="wrap">
                              {u.skills.map((s) => (
                                <Badge
                                  key={s.skillId}
                                  size="xs"
                                  color="cyan"
                                  style={{ flexShrink: 0 }}
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
                        <Table.Td>
                          <Badge
                            size="xs"
                            style={{ flexShrink: 0 }}
                            color={
                              u.status === 'on_leave'
                                ? 'yellow'
                                : u.status === 'offboarded'
                                ? 'gray'
                                : 'teal'
                            }
                          >
                            {u.status === 'on_leave'
                              ? 'On Leave'
                              : u.status === 'offboarded'
                              ? 'Offboarded'
                              : 'Active'}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Group gap="xs" justify="flex-end" wrap="nowrap">
                            <Button
                              component={Link}
                              href={`/fr/crew/${encodeURIComponent(u.id)}`}
                              size="xs"
                              variant="default"
                              leftSection={<IconUser size={13} />}
                              disabled={isBusy}
                            >
                              Profile
                            </Button>
                            {isFrAdmin && u.isCrew && (
                              <Menu position="bottom-end" withinPortal>
                                <Menu.Target>
                                  <ActionIcon
                                    variant="default"
                                    size="input-xs"
                                    aria-label={`Actions for ${u.username}`}
                                    loading={isBusy}
                                  >
                                    <IconDotsVertical size={14} />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Menu.Item
                                    leftSection={<IconEdit size={14} />}
                                    onClick={() => openRoleEditor(u)}
                                  >
                                    Edit Roles
                                  </Menu.Item>
                                  <Menu.Item
                                    leftSection={<IconAward size={14} />}
                                    onClick={() => openSkillEditor(u)}
                                  >
                                    Edit Skills
                                  </Menu.Item>
                                  <Menu.Divider />
                                  <Menu.Item
                                    color="red"
                                    leftSection={<IconUserMinus size={14} />}
                                    onClick={() => setDemoteTarget(u)}
                                  >
                                    Offboard
                                  </Menu.Item>
                                </Menu.Dropdown>
                              </Menu>
                            )}
                          </Group>
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

      {/* Modal: Onboard to Crew */}
      <Modal
        opened={onboardModalOpen}
        onClose={() => setOnboardModalOpen(false)}
        title="Add Crew Member"
      >
        <form onSubmit={handlePromoteSelectedUser}>
          <Stack gap="md">
            <Select
              label="User"
              placeholder="Select a user by username..."
              data={nonCrewOptions}
              value={selectedPromoteUserId}
              onChange={setSelectedPromoteUserId}
              searchable
              clearable
              nothingFoundMessage="No non-crew users found"
            />
            <Group justify="flex-end" gap="xs">
              <Button
                variant="default"
                size="xs"
                onClick={() => setOnboardModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="xs"
                leftSection={<IconUserPlus size={14} />}
                loading={Boolean(
                  selectedPromoteUserId && busyUserId === selectedPromoteUserId
                )}
                disabled={!selectedPromoteUserId}
              >
                Onboard to Crew
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal: Offboard Crew Member */}
      <Modal
        opened={Boolean(demoteTarget)}
        onClose={() => setDemoteTarget(null)}
        title="Offboard Crew Member"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Offboard{' '}
            <strong style={{ color: 'var(--mantine-color-white)' }}>
              {demoteTarget?.username}
            </strong>
            ? This removes <code>wtf-crew</code>, mapped Keycloak groups, and active
            assignments while keeping their master-data record.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              size="xs"
              onClick={() => setDemoteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              size="xs"
              loading={Boolean(demoteTarget && busyUserId === demoteTarget.id)}
              onClick={() => void handleConfirmDemote()}
            >
              Confirm Offboard
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal: Edit User Department Roles */}
      <Modal
        opened={Boolean(editingRolesUser)}
        onClose={() => setEditingRolesUser(null)}
        title={`Departments & Positions — ${editingRolesUser?.username ?? ''}`}
        size="lg"
      >
        <form onSubmit={handleSaveRoles}>
          <Stack gap="md">
            {departments.length === 0 ? (
              <Text size="sm" c="dimmed">
                No departments exist yet.
              </Text>
            ) : (
              <>
                <Stack gap="xs">
                  {assignmentRows.map((row, index) => (
                    <Group key={row.key} gap="xs" align="flex-end" wrap="nowrap">
                      <Select
                        label={index === 0 ? 'Department' : undefined}
                        placeholder="Select department"
                        data={departmentSelectOptions}
                        value={row.departmentId}
                        onChange={(val) =>
                          setAssignmentRows((prev) =>
                            prev.map((item) =>
                              item.key === row.key
                                ? { ...item, departmentId: val }
                                : item
                            )
                          )
                        }
                        searchable
                        style={{ flex: 1 }}
                      />
                      <TextInput
                        label={index === 0 ? 'Position (Optional)' : undefined}
                        placeholder="e.g. Lead, Dispatcher"
                        maxLength={120}
                        value={row.position}
                        onChange={(e) =>
                          setAssignmentRows((prev) =>
                            prev.map((item) =>
                              item.key === row.key
                                ? { ...item, position: e.target.value }
                                : item
                            )
                          )
                        }
                        style={{ flex: 1 }}
                      />
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="lg"
                        aria-label="Remove row"
                        onClick={() =>
                          setAssignmentRows((prev) =>
                            prev.filter((item) => item.key !== row.key)
                          )
                        }
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  ))}
                </Stack>

                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  w="fit-content"
                  onClick={handleAddRoleRow}
                >
                  Add Department
                </Button>
              </>
            )}

            <Divider />

            <Group justify="flex-end" gap="xs">
              <Button
                variant="default"
                size="xs"
                onClick={() => setEditingRolesUser(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="xs"
                loading={savingRoles}
                disabled={departments.length === 0}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal: Edit User Skills */}
      <Modal
        opened={Boolean(editingSkillsUser)}
        onClose={() => setEditingSkillsUser(null)}
        title={`Skills — ${editingSkillsUser?.username ?? ''}`}
        size="lg"
      >
        <form onSubmit={handleSaveSkills}>
          <Stack gap="md">
            {skillsCatalog.length === 0 ? (
              <Text size="sm" c="dimmed">
                No skills exist in the catalog yet.
              </Text>
            ) : (
              <>
                <Stack gap="xs">
                  {skillRows.map((row, index) => {
                    const selectedDef = row.skillId
                      ? skillCatalogMap.get(row.skillId)
                      : undefined;
                    const levelOptions = selectedDef?.levels ?? [];
                    return (
                      <Group key={row.key} gap="xs" align="flex-end" wrap="nowrap">
                        <Select
                          label={index === 0 ? 'Skill' : undefined}
                          placeholder="Select skill"
                          data={skillSelectOptions}
                          value={row.skillId}
                          onChange={(val) => {
                            const nextDef = val
                              ? skillCatalogMap.get(val)
                              : undefined;
                            setSkillRows((prev) =>
                              prev.map((item) =>
                                item.key === row.key
                                  ? {
                                      ...item,
                                      skillId: val,
                                      level: nextDef?.levels[0] ?? null,
                                    }
                                  : item
                              )
                            );
                          }}
                          searchable
                          style={{ flex: 1 }}
                        />
                        <Select
                          label={index === 0 ? 'Level' : undefined}
                          placeholder="Select level"
                          data={levelOptions}
                          value={row.level}
                          onChange={(val) =>
                            setSkillRows((prev) =>
                              prev.map((item) =>
                                item.key === row.key ? { ...item, level: val } : item
                              )
                            )
                          }
                          disabled={!row.skillId || levelOptions.length === 0}
                          style={{ flex: 1 }}
                        />
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="lg"
                          aria-label="Remove skill"
                          onClick={() =>
                            setSkillRows((prev) =>
                              prev.filter((item) => item.key !== row.key)
                            )
                          }
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    );
                  })}
                </Stack>

                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  w="fit-content"
                  onClick={handleAddSkillRow}
                >
                  Add Skill
                </Button>
              </>
            )}

            <Divider />

            <Group justify="flex-end" gap="xs">
              <Button
                variant="default"
                size="xs"
                onClick={() => setEditingSkillsUser(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="xs"
                loading={savingSkills}
                disabled={skillsCatalog.length === 0}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
