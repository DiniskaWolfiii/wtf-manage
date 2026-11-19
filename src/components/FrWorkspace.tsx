'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
  IconBuilding,
  IconEdit,
  IconInfoCircle,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUserMinus,
  IconUserPlus,
  IconUsersGroup,
} from '@tabler/icons-react';
import { getSafeAvatarUrl } from '@/lib/validation';

interface DepartmentItem {
  id: number;
  name: string;
  parentDepartmentId: number | null;
  keycloakGroupId: string | null;
  keycloakGroupName: string | null;
}

interface CrewRoleItem {
  departmentId: number;
  departmentName: string;
  position: string;
  sortOrder: number;
}

interface FrUserItem {
  id: string;
  username: string;
  avatarUrl?: string;
  isCrew: boolean;
  roles: CrewRoleItem[];
}

interface EditableAssignmentRow {
  key: string;
  departmentId: string | null;
  position: string;
}

const DARK_MODAL_STYLES = {
  content: { backgroundColor: 'var(--mantine-color-dark-7)' },
  header: { backgroundColor: 'var(--mantine-color-dark-7)', color: '#fff' },
};

export function FrWorkspace({ currentUserId }: { currentUserId?: string }) {
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<string>('crew');
  const [crewGroupConfigured, setCrewGroupConfigured] = useState(true);
  const [users, setUsers] = useState<FrUserItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [selectedPromoteUserId, setSelectedPromoteUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Department CRUD state
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentParentId, setNewDepartmentParentId] = useState<string | null>(null);
  const [creatingDepartment, setCreatingDepartment] = useState(false);
  const [editDeptTarget, setEditDeptTarget] = useState<DepartmentItem | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptParentId, setEditDeptParentId] = useState<string | null>(null);
  const [savingDeptEdit, setSavingDeptEdit] = useState(false);
  const [deleteDeptTarget, setDeleteDeptTarget] = useState<DepartmentItem | null>(null);
  const [deletingDept, setDeletingDept] = useState(false);

  // Department member ranking modal state
  const [rankDeptTarget, setRankDeptTarget] = useState<DepartmentItem | null>(null);
  const [rankedMembers, setRankedMembers] = useState<
    Array<{ userId: string; username: string; avatarUrl?: string; position: string }>
  >([]);
  const [savingOrder, setSavingOrder] = useState(false);

  // User promotion / demotion / role edit state
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [demoteTarget, setDemoteTarget] = useState<FrUserItem | null>(null);
  const [editingUser, setEditingUser] = useState<FrUserItem | null>(null);
  const [assignmentRows, setAssignmentRows] = useState<EditableAssignmentRow[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);
  const nextRowKeyRef = useRef(0);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/fr/crew', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to load FR crew data.',
        });
        return;
      }
      setCrewGroupConfigured(Boolean(data.crewGroupConfigured));
      setUsers(Array.isArray(data.users) ? data.users : []);
      setDepartments(Array.isArray(data.departments) ? data.departments : []);
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while loading FR crew data.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/fr/crew', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatusMessage({
            type: 'error',
            text: data.error || 'Failed to load FR crew data.',
          });
          return;
        }
        setCrewGroupConfigured(Boolean(data.crewGroupConfigured));
        setUsers(Array.isArray(data.users) ? data.users : []);
        setDepartments(Array.isArray(data.departments) ? data.departments : []);
      })
      .catch(() => {
        if (!cancelled) {
          setStatusMessage({
            type: 'error',
            text: 'Network error while loading FR crew data.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (!u.isCrew) return false;
      if (q && !u.username.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, searchQuery]);

  const totalCrewCount = useMemo(
    () => users.filter((u) => u.isCrew).length,
    [users]
  );

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
    setStatusMessage(null);
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
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to create department.',
        });
        return;
      }
      setNewDepartmentName('');
      setNewDepartmentParentId(null);
      setStatusMessage({
        type: 'success',
        text: `Department "${data.department.name}" created.`,
      });
      await loadData();
    } catch {
      setStatusMessage({
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
    setStatusMessage(null);
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
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to update department.',
        });
        return;
      }
      setEditDeptTarget(null);
      setStatusMessage({
        type: 'success',
        text: `Department "${data.department.name}" updated.`,
      });
      await loadData();
    } catch {
      setStatusMessage({
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
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/departments/${deleteDeptTarget.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to delete department.',
        });
        return;
      }
      const deletedName = deleteDeptTarget.name;
      setDeleteDeptTarget(null);
      setStatusMessage({
        type: 'success',
        text: `Department "${deletedName}" deleted.`,
      });
      await loadData();
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while deleting department.',
      });
    } finally {
      setDeletingDept(false);
    }
  };

  const handlePromoteSelectedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPromoteUserId) return;
    const targetUser = users.find((u) => u.id === selectedPromoteUserId);
    if (!targetUser) return;

    setBusyUserId(targetUser.id);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(targetUser.id)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to promote user to Crew.',
        });
        return;
      }
      setSelectedPromoteUserId(null);
      setStatusMessage({
        type: 'success',
        text: `"${targetUser.username}" has been promoted to Crew (wtf-crew). Please inform them that a re-login is required.`,
      });
      await loadData();
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while promoting user.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleConfirmDemote = async () => {
    if (!demoteTarget) return;
    setBusyUserId(demoteTarget.id);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(demoteTarget.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to demote user.',
        });
        return;
      }
      const username = demoteTarget.username;
      setDemoteTarget(null);
      setStatusMessage({
        type: 'success',
        text: `"${username}" has been demoted. Crew group, mapped Keycloak groups, and all department assignments were removed (re-login required).`,
      });
      await loadData();
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while demoting user.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const openRoleEditor = (user: FrUserItem) => {
    setEditingUser(user);
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
    if (!editingUser) return;

    const cleanAssignments: Array<{ departmentId: number; position: string }> = [];
    const usedDeptIds = new Set<number>();

    for (const row of assignmentRows) {
      if (!row.departmentId) {
        setStatusMessage({
          type: 'error',
          text: 'Please select a department for each row (or remove empty rows).',
        });
        return;
      }
      const deptId = Number(row.departmentId);
      if (usedDeptIds.has(deptId)) {
        setStatusMessage({
          type: 'error',
          text: 'Each department can only be assigned once per user.',
        });
        return;
      }
      const pos = row.position.trim();
      usedDeptIds.add(deptId);
      cleanAssignments.push({ departmentId: deptId, position: pos });
    }

    setSavingRoles(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(editingUser.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: cleanAssignments }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to save crew roles.',
        });
        return;
      }
      const username = editingUser.username;
      setEditingUser(null);
      setStatusMessage({
        type: 'success',
        text: `Departments & positions updated for "${username}".`,
      });
      await loadData();
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while saving crew roles.',
      });
    } finally {
      setSavingRoles(false);
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
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/departments/${rankDeptTarget.id}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: rankedMembers.map((m) => m.userId) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to save member ranking.',
        });
        return;
      }
      const deptName = rankDeptTarget.name;
      setRankDeptTarget(null);
      setStatusMessage({
        type: 'success',
        text: `Member ranking updated for "${deptName}".`,
      });
      await loadData();
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while saving member ranking.',
      });
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <Stack gap={24}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Text size="xl" fw={700} c="white">
            Furry Resources (FR)
          </Text>
          <Text size="sm" c="dimmed">
            Promote crew members, manage departments, and assign positions
          </Text>
        </div>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconRefresh size={14} />}
          onClick={() => {
            setLoading(true);
            void loadData();
          }}
          loading={loading}
        >
          Refresh
        </Button>
      </Group>

      {/* Re-login info banner */}
      <Paper
        p="sm"
        radius="sm"
        withBorder
        style={{
          backgroundColor: 'rgba(21, 170, 191, 0.08)',
          borderColor: 'rgba(21, 170, 191, 0.35)',
        }}
      >
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <IconInfoCircle
            size={18}
            color="var(--mantine-color-cyan-4)"
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <Text size="xs" c="cyan.2">
            <strong>Re-login Notice:</strong> Changes to Crew status (group{' '}
            <code>wtf-crew</code>) or Keycloak-mapped departments only take effect for the
            affected user after a <strong>re-login</strong> (or token refresh). Please pass this
            on after making changes.
          </Text>
        </Group>
      </Paper>

      {!crewGroupConfigured && !loading && (
        <Paper
          p="sm"
          radius="sm"
          withBorder
          style={{
            backgroundColor: 'rgba(250, 82, 82, 0.1)',
            borderColor: 'rgba(250, 82, 82, 0.35)',
          }}
        >
          <Group gap="xs" wrap="nowrap">
            <IconAlertCircle size={18} color="var(--mantine-color-red-4)" />
            <Text size="xs" fw={600} c="red.4">
              Keycloak group <code>wtf-crew</code> was not found. Please verify in Keycloak Admin
              that the group exists and the service account has <code>query-groups</code>,{' '}
              <code>view-users</code>, and <code>manage-users</code>.
            </Text>
          </Group>
        </Paper>
      )}

      {statusMessage && (
        <Paper
          p="sm"
          radius="sm"
          withBorder
          style={{
            backgroundColor:
              statusMessage.type === 'success'
                ? 'rgba(18, 184, 134, 0.1)'
                : 'rgba(250, 82, 82, 0.1)',
            borderColor:
              statusMessage.type === 'success'
                ? 'rgba(18, 184, 134, 0.35)'
                : 'rgba(250, 82, 82, 0.35)',
          }}
        >
          <Text
            size="xs"
            fw={600}
            c={statusMessage.type === 'success' ? 'teal.4' : 'red.4'}
          >
            {statusMessage.text}
          </Text>
        </Paper>
      )}

      {/* FR Sub-navigation */}
      <Tabs
        value={activeSubTab}
        onChange={(val) => setActiveSubTab(val || 'crew')}
        color="cyan"
        variant="pills"
      >
        <Tabs.List mb="lg">
          <Tabs.Tab
            value="crew"
            leftSection={<IconUsersGroup size={16} />}
            rightSection={
              <Badge size="xs" variant="light" color="cyan">
                {totalCrewCount}
              </Badge>
            }
          >
            Crew Management
          </Tabs.Tab>
          <Tabs.Tab
            value="departments"
            leftSection={<IconBuilding size={16} />}
            rightSection={
              <Badge size="xs" variant="light" color="gray">
                {departments.length}
              </Badge>
            }
          >
            Departments
          </Tabs.Tab>
        </Tabs.List>

        {/* SUB-TAB 1: CREW MANAGEMENT */}
        <Tabs.Panel value="crew">
          <Stack gap={24}>
            {/* Promote User via Searchable Dropdown */}
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
                    Promote User to Crew
                  </Text>
                  <Text size="xs" c="dimmed">
                    Search by username in the dropdown to add a user to the{' '}
                    <code>wtf-crew</code> group
                  </Text>
                </div>

                <form onSubmit={handlePromoteSelectedUser}>
                  <Group gap="sm" align="flex-end" wrap="wrap">
                    <Select
                      placeholder="Select a user by username..."
                      data={nonCrewOptions}
                      value={selectedPromoteUserId}
                      onChange={setSelectedPromoteUserId}
                      searchable
                      clearable
                      nothingFoundMessage="No non-crew users found"
                      disabled={loading || !crewGroupConfigured}
                      style={{ flex: 1, minWidth: 240 }}
                    />
                    <Button
                      type="submit"
                      color="cyan"
                      leftSection={<IconUserPlus size={14} />}
                      loading={Boolean(
                        selectedPromoteUserId && busyUserId === selectedPromoteUserId
                      )}
                      disabled={
                        !selectedPromoteUserId || !crewGroupConfigured || loading
                      }
                    >
                      Promote to Crew
                    </Button>
                  </Group>
                </form>
              </Stack>
            </Paper>

            {/* Active Crew List */}
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
                <Group justify="space-between" wrap="wrap" gap="sm">
                  <div>
                    <Text size="md" fw={700} c="white">
                      Active Crew Members
                    </Text>
                    <Text size="xs" c="dimmed">
                      Only username and profile picture are displayed
                    </Text>
                  </div>
                  <TextInput
                    placeholder="Filter crew..."
                    leftSection={<IconSearch size={14} />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    size="xs"
                    style={{ minWidth: 220 }}
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
                  <Text size="sm" c="dimmed" py="md" ta="center">
                    {totalCrewCount === 0
                      ? 'No crew members promoted yet. Use the dropdown above to promote someone.'
                      : 'No crew members match your filter.'}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {crewMembers.map((u) => {
                      const safeAvatar = getSafeAvatarUrl(u.avatarUrl);
                      const isBusy = busyUserId === u.id;
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
                            <Group gap="sm" style={{ minWidth: 200, flex: 1 }}>
                              <Avatar
                                src={safeAvatar ?? undefined}
                                radius="xl"
                                size="md"
                                color="cyan"
                              >
                                {u.username.slice(0, 2).toUpperCase()}
                              </Avatar>
                              <div style={{ minWidth: 0 }}>
                                <Group gap={6} wrap="nowrap">
                                  <Text size="sm" fw={600} c="white" truncate>
                                    {u.username}
                                  </Text>
                                  {u.id === currentUserId && (
                                    <Badge size="xs" variant="outline" color="gray">
                                      You
                                    </Badge>
                                  )}
                                  <Badge size="xs" variant="light" color="teal">
                                    Crew
                                  </Badge>
                                </Group>
                                <Group gap={6} mt={6}>
                                  {u.roles.length > 0 ? (
                                    u.roles.map((r) => (
                                      <Pill key={r.departmentId} size="sm">
                                        {r.position
                                          ? `${r.departmentName} · ${r.position}`
                                          : r.departmentName}
                                      </Pill>
                                    ))
                                  ) : (
                                    <Text size="xs" c="dimmed">
                                      No departments assigned yet
                                    </Text>
                                  )}
                                </Group>
                              </div>
                            </Group>

                            <Group gap="xs" wrap="nowrap">
                              <Button
                                size="xs"
                                variant="default"
                                leftSection={<IconEdit size={14} />}
                                disabled={isBusy}
                                onClick={() => openRoleEditor(u)}
                              >
                                Edit Roles
                              </Button>
                              <Button
                                size="xs"
                                color="red"
                                variant="light"
                                leftSection={<IconUserMinus size={14} />}
                                loading={isBusy}
                                onClick={() => setDemoteTarget(u)}
                              >
                                Demote
                              </Button>
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
        </Tabs.Panel>

        {/* SUB-TAB 2: DEPARTMENTS */}
        <Tabs.Panel value="departments">
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
                  Departments
                </Text>
                <Text size="xs" c="dimmed">
                  Create and manage departments available for crew role assignments
                </Text>
              </div>

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
                                dept.parentDepartmentId ? String(dept.parentDepartmentId) : null
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
                            onClick={() => setDeleteDeptTarget(dept)}
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
        </Tabs.Panel>
      </Tabs>

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

      {/* Modal: Demote User */}
      <Modal
        opened={Boolean(demoteTarget)}
        onClose={() => setDemoteTarget(null)}
        title="Demote User"
        centered
        styles={DARK_MODAL_STYLES}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Are you sure you want to demote{' '}
            <strong style={{ color: '#fff' }}>{demoteTarget?.username}</strong>? This will remove
            the <code>wtf-crew</code> group, all mapped department groups in Keycloak, and all
            department assignments in the database.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={() => setDemoteTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              size="xs"
              loading={Boolean(demoteTarget && busyUserId === demoteTarget.id)}
              onClick={handleConfirmDemote}
            >
              Confirm Demote
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal: Edit User Department Roles */}
      <Modal
        opened={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title={`Departments & Positions: ${editingUser?.username ?? ''}`}
        size="lg"
        centered
        styles={DARK_MODAL_STYLES}
      >
        <form onSubmit={handleSaveRoles}>
          <Stack gap="md">
            {departments.length === 0 ? (
              <Text size="sm" c="dimmed">
                No departments exist yet. Create a department in the Departments tab first.
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
                              item.key === row.key ? { ...item, departmentId: val } : item
                            )
                          )
                        }
                        searchable
                        style={{ flex: 1 }}
                      />
                      <TextInput
                        label={index === 0 ? 'Position (Optional)' : undefined}
                        placeholder="Optional (e.g. Lead, Dispatcher)"
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
                        title="Remove row"
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

                <Group justify="space-between">
                  <Button
                    variant="default"
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    onClick={handleAddRoleRow}
                  >
                    Add Department
                  </Button>
                </Group>
              </>
            )}

            <Divider color="var(--mantine-color-dark-4)" />

            <Group justify="flex-end" gap="xs">
              <Button variant="default" size="xs" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                color="cyan"
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
    </Stack>
  );
}
