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
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
  IconEdit,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { getSafeAvatarUrl } from '@/lib/validation';
import {
  DARK_MODAL_STYLES,
  type DepartmentItem,
  type FrStatusMessage,
  type FrUserItem,
} from '@/components/fr/types';

export function FrDepartmentsSection({
  loading,
  departments,
  users,
  isFrAdmin,
  onRefresh,
  onStatusMessage,
}: {
  loading: boolean;
  departments: DepartmentItem[];
  users: FrUserItem[];
  isFrAdmin: boolean;
  onRefresh: () => Promise<void>;
  onStatusMessage: (msg: FrStatusMessage | null) => void;
}) {
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentParentId, setNewDepartmentParentId] = useState<string | null>(null);
  const [creatingDepartment, setCreatingDepartment] = useState(false);

  const [editDeptTarget, setEditDeptTarget] = useState<DepartmentItem | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptParentId, setEditDeptParentId] = useState<string | null>(null);
  const [savingDeptEdit, setSavingDeptEdit] = useState(false);

  const [deleteDeptTarget, setDeleteDeptTarget] = useState<DepartmentItem | null>(null);
  const [deletingDept, setDeletingDept] = useState(false);

  const [rankDeptTarget, setRankDeptTarget] = useState<DepartmentItem | null>(null);
  const [rankedMembers, setRankedMembers] = useState<
    Array<{ userId: string; username: string; avatarUrl?: string; position: string }>
  >([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const departmentSelectOptions = useMemo(
    () => departments.map((d) => ({ value: String(d.id), label: d.name })),
    [departments]
  );

  const departmentNameById = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments]
  );

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDepartmentName.trim();
    if (!trimmed) return;
    setCreatingDepartment(true);
    onStatusMessage(null);
    try {
      const res = await fetch('/api/fr/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          parentDepartmentId: newDepartmentParentId ? Number(newDepartmentParentId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to create department.',
        });
        return;
      }
      setNewDepartmentName('');
      setNewDepartmentParentId(null);
      onStatusMessage({
        type: 'success',
        text: `Department "${data.department.name}" created.`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while creating department.',
      });
    } finally {
      setCreatingDepartment(false);
    }
  };

  const handleSaveDepartmentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDeptTarget) return;
    const trimmed = editDeptName.trim();
    if (!trimmed) return;
    setSavingDeptEdit(true);
    onStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/departments/${editDeptTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          parentDepartmentId: editDeptParentId ? Number(editDeptParentId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to update department.',
        });
        return;
      }
      setEditDeptTarget(null);
      onStatusMessage({
        type: 'success',
        text: `Department "${data.department.name}" updated.`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while updating department.',
      });
    } finally {
      setSavingDeptEdit(false);
    }
  };

  const handleDeleteDepartment = async () => {
    if (!deleteDeptTarget) return;
    setDeletingDept(true);
    onStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/departments/${deleteDeptTarget.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to delete department.',
        });
        return;
      }
      const deletedName = deleteDeptTarget.name;
      setDeleteDeptTarget(null);
      onStatusMessage({
        type: 'success',
        text: `Department "${deletedName}" deleted.`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while deleting department.',
      });
    } finally {
      setDeletingDept(false);
    }
  };

  const openRankEditor = (dept: DepartmentItem) => {
    const members: Array<{
      userId: string;
      username: string;
      avatarUrl?: string;
      position: string;
      sortOrder: number;
    }> = [];

    for (const u of users) {
      if (!u.isCrew) continue;
      const role = u.roles.find((r) => r.departmentId === dept.id);
      if (role) {
        members.push({
          userId: u.id,
          username: u.username,
          avatarUrl: u.avatarUrl,
          position: role.position,
          sortOrder: role.sortOrder ?? 0,
        });
      }
    }

    members.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.username.localeCompare(b.username);
    });

    setRankDeptTarget(dept);
    setRankedMembers(
      members.map(({ userId, username, avatarUrl, position }) => ({
        userId,
        username,
        avatarUrl,
        position,
      }))
    );
  };

  const moveRankedMember = (index: number, delta: -1 | 1) => {
    setRankedMembers((prev) => {
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const handleSaveOrder = async () => {
    if (!rankDeptTarget) return;
    setSavingOrder(true);
    onStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/departments/${rankDeptTarget.id}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: rankedMembers.map((m) => m.userId) }),
      });
      const data = await res.json();
      if (!res.ok) {
        onStatusMessage({
          type: 'error',
          text: data.error || 'Failed to save member ranking.',
        });
        return;
      }
      const deptName = rankDeptTarget.name;
      setRankDeptTarget(null);
      onStatusMessage({
        type: 'success',
        text: `Member ranking updated for "${deptName}".`,
      });
      await onRefresh();
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'Network error while saving member ranking.',
      });
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <>
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
                Departments
              </Text>
              <Badge size="xs" variant="light" color="gray">
                {departments.length}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              {isFrAdmin
                ? 'Create and manage departments available for crew role assignments'
                : 'View departments and rank assigned crew members'}
            </Text>
          </div>

          {isFrAdmin && (
            <>
              <form onSubmit={handleCreateDepartment}>
                <Group gap="sm" align="flex-end" wrap="wrap">
                  <TextInput
                    label="Department Name"
                    placeholder="e.g. ConOps"
                    value={newDepartmentName}
                    onChange={(e) => setNewDepartmentName(e.target.value)}
                    style={{ flex: 1, minWidth: 200 }}
                    maxLength={80}
                  />
                  <Select
                    label="Parent Department (Optional)"
                    placeholder="None (Top Level)"
                    data={departmentSelectOptions}
                    value={newDepartmentParentId}
                    onChange={setNewDepartmentParentId}
                    clearable
                    searchable
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  <Button
                    type="submit"
                    color="cyan"
                    leftSection={<IconPlus size={14} />}
                    loading={creatingDepartment}
                    disabled={!newDepartmentName.trim()}
                  >
                    Create Department
                  </Button>
                </Group>
              </form>

              <Divider color="var(--mantine-color-dark-4)" />
            </>
          )}

          {loading ? (
            <Group justify="center" gap="sm" py="md">
              <Loader size="sm" color="cyan" />
              <Text size="sm" c="dimmed">
                Loading departments...
              </Text>
            </Group>
          ) : departments.length === 0 ? (
            <Text size="xs" c="dimmed">
              No departments created yet. Add your first department above.
            </Text>
          ) : (
            <Stack gap="xs">
              {departments.map((dept) => (
                <Paper
                  key={dept.id}
                  p="sm"
                  radius="sm"
                  withBorder
                  style={{
                    backgroundColor: 'var(--mantine-color-dark-6)',
                    borderColor: 'var(--mantine-color-dark-4)',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Group gap="sm" wrap="wrap" style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} c="white" truncate>
                        {dept.name}
                      </Text>
                      {dept.parentDepartmentId &&
                        departmentNameById.has(dept.parentDepartmentId) && (
                          <Badge size="xs" variant="light" color="cyan">
                            Under: {departmentNameById.get(dept.parentDepartmentId)}
                          </Badge>
                        )}
                      <Badge
                        size="xs"
                        variant="light"
                        color={dept.keycloakGroupName ? 'teal' : 'gray'}
                      >
                        {dept.keycloakGroupName
                          ? `KC: ${dept.keycloakGroupName}`
                          : 'Database Only'}
                      </Badge>
                    </Group>
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon
                        variant="subtle"
                        color="cyan"
                        size="sm"
                        title="Rank members"
                        aria-label="Rank members"
                        onClick={() => openRankEditor(dept)}
                      >
                        <IconArrowsSort size={14} />
                      </ActionIcon>
                      {isFrAdmin && (
                        <>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            title="Edit"
                            aria-label="Edit department"
                            onClick={() => {
                              setEditDeptTarget(dept);
                              setEditDeptName(dept.name);
                              setEditDeptParentId(
                                dept.parentDepartmentId
                                  ? String(dept.parentDepartmentId)
                                  : null
                              );
                            }}
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            title="Delete"
                            aria-label="Delete department"
                            onClick={() => setDeleteDeptTarget(dept)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </>
                      )}
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Modal: Edit Department */}
      <Modal
        opened={Boolean(editDeptTarget)}
        onClose={() => setEditDeptTarget(null)}
        title="Edit Department"
        centered
        styles={DARK_MODAL_STYLES}
      >
        <form onSubmit={handleSaveDepartmentEdit}>
          <Stack gap="md">
            <TextInput
              label="Department Name"
              required
              maxLength={80}
              value={editDeptName}
              onChange={(e) => setEditDeptName(e.target.value)}
            />
            <Select
              label="Parent Department (Optional)"
              placeholder="None (Top Level)"
              data={departmentSelectOptions.filter(
                (opt) => opt.value !== String(editDeptTarget?.id)
              )}
              value={editDeptParentId}
              onChange={setEditDeptParentId}
              clearable
              searchable
            />
            <Group justify="flex-end" gap="xs">
              <Button variant="default" size="xs" onClick={() => setEditDeptTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" color="cyan" size="xs" loading={savingDeptEdit}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal: Delete Department */}
      <Modal
        opened={Boolean(deleteDeptTarget)}
        onClose={() => setDeleteDeptTarget(null)}
        title="Delete Department"
        centered
        styles={DARK_MODAL_STYLES}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Are you sure you want to delete the department{' '}
            <strong style={{ color: '#fff' }}>{deleteDeptTarget?.name}</strong>? All associated
            crew assignments will also be removed.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={() => setDeleteDeptTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              size="xs"
              loading={deletingDept}
              onClick={handleDeleteDepartment}
            >
              Delete Permanently
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal: Rank Members in Department */}
      <Modal
        opened={Boolean(rankDeptTarget)}
        onClose={() => setRankDeptTarget(null)}
        title={`Rank Members: ${rankDeptTarget?.name ?? ''}`}
        centered
        styles={DARK_MODAL_STYLES}
      >
        <Stack gap="md">
          <Text size="xs" c="dimmed">
            Order members from top to bottom as they should appear in the Org Chart (independent
            of position title).
          </Text>

          {rankedMembers.length === 0 ? (
            <Text size="sm" c="dimmed" py="sm" ta="center">
              No members assigned to this department yet.
            </Text>
          ) : (
            <Stack gap="xs">
              {rankedMembers.map((member, index) => {
                const safeAvatar = getSafeAvatarUrl(member.avatarUrl);
                return (
                  <Paper
                    key={member.userId}
                    p="sm"
                    radius="sm"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-6)',
                      borderColor: 'var(--mantine-color-dark-4)',
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <Group gap="sm" style={{ minWidth: 0, flex: 1 }}>
                        <Badge size="xs" variant="light" color="cyan">
                          #{index + 1}
                        </Badge>
                        <Avatar
                          src={safeAvatar ?? undefined}
                          radius="xl"
                          size="sm"
                          color="cyan"
                        >
                          {member.username.slice(0, 2).toUpperCase()}
                        </Avatar>
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} c="white" truncate>
                            {member.username}
                          </Text>
                          {member.position && (
                            <Text size="xs" c="dimmed" truncate>
                              {member.position}
                            </Text>
                          )}
                        </div>
                      </Group>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          aria-label="Move up"
                          disabled={index === 0 || savingOrder}
                          onClick={() => moveRankedMember(index, -1)}
                        >
                          <IconArrowUp size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          aria-label="Move down"
                          disabled={index === rankedMembers.length - 1 || savingOrder}
                          onClick={() => moveRankedMember(index, 1)}
                        >
                          <IconArrowDown size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          )}

          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={() => setRankDeptTarget(null)}>
              Cancel
            </Button>
            <Button
              color="cyan"
              size="xs"
              loading={savingOrder}
              disabled={rankedMembers.length < 2}
              onClick={handleSaveOrder}
            >
              Save Order
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
