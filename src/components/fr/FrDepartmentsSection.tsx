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
  Select,
  Stack,
  Table,
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
import type {
  DepartmentItem,
  FrStatusMessage,
  FrUserItem,
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
  const [createOpen, setCreateOpen] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentParentId, setNewDepartmentParentId] = useState<string | null>(
    null
  );
  const [creatingDepartment, setCreatingDepartment] = useState(false);

  const [editDeptTarget, setEditDeptTarget] = useState<DepartmentItem | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptParentId, setEditDeptParentId] = useState<string | null>(null);
  const [savingDeptEdit, setSavingDeptEdit] = useState(false);

  const [deleteDeptTarget, setDeleteDeptTarget] = useState<DepartmentItem | null>(
    null
  );
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
          parentDepartmentId: newDepartmentParentId
            ? Number(newDepartmentParentId)
            : null,
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
      setCreateOpen(false);
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
      <Paper p="lg" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Group gap="xs">
              <Text size="sm" fw={700}>
                Departments
              </Text>
              <Badge size="xs" color="gray">
                {departments.length}
              </Badge>
            </Group>

            {isFrAdmin && (
              <Button
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => setCreateOpen(true)}
              >
                Create Department
              </Button>
            )}
          </Group>

          {loading ? (
            <Group justify="center" gap="sm" py="lg">
              <Loader size="sm" color="cyan" />
              <Text size="sm" c="dimmed">
                Loading departments...
              </Text>
            </Group>
          ) : departments.length === 0 ? (
            <Text size="sm" c="dimmed" py="md" ta="center">
              No departments created yet.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={560}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Department</Table.Th>
                    <Table.Th>Parent</Table.Th>
                    <Table.Th>Keycloak Group</Table.Th>
                    {isFrAdmin && <Table.Th ta="right">Actions</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {departments.map((dept) => {
                    const parentName = dept.parentDepartmentId
                      ? departmentNameById.get(dept.parentDepartmentId)
                      : null;
                    return (
                      <Table.Tr key={dept.id}>
                        <Table.Td>
                          <Text size="sm" fw={600}>
                            {dept.name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {parentName ? (
                            <Badge size="xs" color="cyan">
                              {parentName}
                            </Badge>
                          ) : (
                            <Text size="xs" c="dimmed">
                              Top Level
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="xs"
                            color={dept.keycloakGroupName ? 'teal' : 'gray'}
                          >
                            {dept.keycloakGroupName
                              ? dept.keycloakGroupName
                              : 'Database Only'}
                          </Badge>
                        </Table.Td>
                        {isFrAdmin && (
                          <Table.Td ta="right">
                            <Group gap={4} justify="flex-end" wrap="nowrap">
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
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                title="Edit department"
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
                                title="Delete department"
                                aria-label="Delete department"
                                onClick={() => setDeleteDeptTarget(dept)}
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Group>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      </Paper>

      {/* Modal: Create Department */}
      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Department"
      >
        <form onSubmit={handleCreateDepartment}>
          <Stack gap="md">
            <TextInput
              label="Department Name"
              placeholder="e.g. ConOps"
              required
              maxLength={80}
              value={newDepartmentName}
              onChange={(e) => setNewDepartmentName(e.target.value)}
            />
            <Select
              label="Parent Department (Optional)"
              placeholder="None (Top Level)"
              data={departmentSelectOptions}
              value={newDepartmentParentId}
              onChange={setNewDepartmentParentId}
              clearable
              searchable
            />
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
                loading={creatingDepartment}
                disabled={!newDepartmentName.trim()}
              >
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal: Edit Department */}
      <Modal
        opened={Boolean(editDeptTarget)}
        onClose={() => setEditDeptTarget(null)}
        title="Edit Department"
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
              <Button
                variant="default"
                size="xs"
                onClick={() => setEditDeptTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="xs" loading={savingDeptEdit}>
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
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Delete{' '}
            <strong style={{ color: 'var(--mantine-color-white)' }}>
              {deleteDeptTarget?.name}
            </strong>
            ? All associated crew assignments will also be removed.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              size="xs"
              onClick={() => setDeleteDeptTarget(null)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              size="xs"
              loading={deletingDept}
              onClick={() => void handleDeleteDepartment()}
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
        title={`Rank Members — ${rankDeptTarget?.name ?? ''}`}
      >
        <Stack gap="md">
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
                    bg="var(--mantine-color-dark-6)"
                  >
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <Group gap="sm" style={{ minWidth: 0, flex: 1 }}>
                        <Badge size="xs" color="cyan">
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
                          <Text size="sm" fw={600} truncate>
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
                          disabled={
                            index === rankedMembers.length - 1 || savingOrder
                          }
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
            <Button
              variant="default"
              size="xs"
              onClick={() => setRankDeptTarget(null)}
            >
              Cancel
            </Button>
            <Button
              size="xs"
              loading={savingOrder}
              disabled={rankedMembers.length < 2}
              onClick={() => void handleSaveOrder()}
            >
              Save Order
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
