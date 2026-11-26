'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Divider,
  Grid,
  Group,
  Loader,
  Modal,
  Paper,
  Pill,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconEdit,
  IconHistory,
  IconInfoCircle,
  IconPlus,
  IconTrash,
  IconUserCheck,
  IconUserMinus,
} from '@tabler/icons-react';
import type { UserProfileData } from '@/lib/keycloak';
import { notifyError, notifySuccess } from '@/lib/notify';
import { getSafeAvatarUrl } from '@/lib/validation';
import type {
  CrewLifecycleEvent,
  CrewProfile,
  CrewRoleItem,
  CrewSkillItem,
  CrewStatus,
  DepartmentItem,
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

function formatDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function getStatusBadgeProps(status: CrewStatus | null | undefined): {
  label: string;
  color: string;
} {
  if (status === 'on_leave') return { label: 'On Leave', color: 'yellow' };
  if (status === 'offboarded') return { label: 'Offboarded', color: 'gray' };
  return { label: 'Active', color: 'teal' };
}

function getTimelineEventMeta(eventType: string): {
  title: string;
  color: string;
} {
  switch (eventType) {
    case 'joined':
      return { title: 'Joined Crew', color: 'teal' };
    case 'rejoined':
      return { title: 'Re-Onboarded to Crew', color: 'teal' };
    case 'on_leave':
      return { title: 'On Leave', color: 'yellow' };
    case 'returned':
      return { title: 'Returned to Active', color: 'teal' };
    case 'offboarded':
      return { title: 'Offboarded', color: 'red' };
    case 'roles_updated':
      return { title: 'Roles Updated', color: 'cyan' };
    case 'skills_updated':
      return { title: 'Skills Updated', color: 'cyan' };
    default:
      return { title: 'Master Data Note', color: 'gray' };
  }
}

export function FrCrewDetailView({
  userId,
  isFrAdmin,
  currentUserId,
}: {
  userId: string;
  isFrAdmin: boolean;
  currentUserId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isCrew, setIsCrew] = useState(false);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [crewProfile, setCrewProfile] = useState<CrewProfile | null>(null);
  const [lifecycleEvents, setLifecycleEvents] = useState<CrewLifecycleEvent[]>([]);
  const [roles, setRoles] = useState<CrewRoleItem[]>([]);
  const [skills, setSkills] = useState<CrewSkillItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [skillsCatalog, setSkillsCatalog] = useState<SkillCatalogItem[]>([]);

  const [formStatus, setFormStatus] = useState<CrewStatus>('active');
  const [formJoinedAt, setFormJoinedAt] = useState('');
  const [formOffboardedAt, setFormOffboardedAt] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [savingMaster, setSavingMaster] = useState(false);

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<CrewStatus>('on_leave');
  const [modalEffectiveAt, setModalEffectiveAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [modalReason, setModalReason] = useState('');
  const [savingModal, setSavingModal] = useState(false);

  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [assignmentRows, setAssignmentRows] = useState<EditableAssignmentRow[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [skillRows, setSkillRows] = useState<EditableSkillRow[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);

  const [reboarding, setReboarding] = useState(false);
  const nextRowKeyRef = useRef(0);

  const syncFormFromMaster = useCallback(
    (cp: CrewProfile | null, activeCrew: boolean) => {
      if (cp) {
        setFormStatus(cp.status);
        setFormJoinedAt(formatDateInput(cp.joinedAt));
        setFormOffboardedAt(formatDateInput(cp.offboardedAt));
        setFormReason(cp.offboardReason ?? '');
        setFormNotes(cp.internalNotes ?? '');
      } else {
        setFormStatus(activeCrew ? 'active' : 'offboarded');
        setFormJoinedAt('');
        setFormOffboardedAt('');
        setFormReason('');
        setFormNotes('');
      }
    },
    []
  );

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      setError(null);
      if (!res.ok) {
        setError(data.error || 'Failed to load crew profile.');
        return;
      }
      setIsCrew(Boolean(data.isCrew));
      setProfile(data.profile ?? null);
      setCrewProfile(data.crewProfile ?? null);
      setLifecycleEvents(
        Array.isArray(data.lifecycleEvents) ? data.lifecycleEvents : []
      );
      setRoles(Array.isArray(data.roles) ? data.roles : []);
      setSkills(Array.isArray(data.skills) ? data.skills : []);
      setDepartments(Array.isArray(data.departments) ? data.departments : []);
      setSkillsCatalog(Array.isArray(data.skillsCatalog) ? data.skillsCatalog : []);
      syncFormFromMaster(data.crewProfile ?? null, Boolean(data.isCrew));
    } catch {
      setError('Network error while loading crew profile.');
    } finally {
      setLoading(false);
    }
  }, [userId, syncFormFromMaster]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        setError(null);
        if (!res.ok) {
          setError(data.error || 'Failed to load crew profile.');
          return;
        }
        setIsCrew(Boolean(data.isCrew));
        setProfile(data.profile ?? null);
        setCrewProfile(data.crewProfile ?? null);
        setLifecycleEvents(
          Array.isArray(data.lifecycleEvents) ? data.lifecycleEvents : []
        );
        setRoles(Array.isArray(data.roles) ? data.roles : []);
        setSkills(Array.isArray(data.skills) ? data.skills : []);
        setDepartments(Array.isArray(data.departments) ? data.departments : []);
        setSkillsCatalog(Array.isArray(data.skillsCatalog) ? data.skillsCatalog : []);
        syncFormFromMaster(data.crewProfile ?? null, Boolean(data.isCrew));
      })
      .catch(() => {
        if (!cancelled) {
          setError('Network error while loading crew profile.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, syncFormFromMaster]);

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

  const effectiveStatus: CrewStatus =
    crewProfile?.status ?? (isCrew ? 'active' : 'offboarded');
  const statusBadge = getStatusBadgeProps(effectiveStatus);
  const safeAvatar = getSafeAvatarUrl(profile?.avatarUrl);
  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    profile?.nickname ||
    profile?.username ||
    userId;

  const reportActionError = useCallback((message: string) => {
    setActionError(message);
    notifyError(message);
  }, []);

  const handleSaveMasterData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crewProfile) return;
    setSavingMaster(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/fr/crew/${encodeURIComponent(userId)}/master-data`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: formStatus,
            joinedAt: formJoinedAt || null,
            offboardedAt: formOffboardedAt || null,
            offboardReason: formReason.trim() || null,
            internalNotes: formNotes,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        reportActionError(data.error || 'Failed to save master data.');
        return;
      }
      setCrewProfile(data.crewProfile);
      setLifecycleEvents(
        Array.isArray(data.lifecycleEvents) ? data.lifecycleEvents : []
      );
      syncFormFromMaster(data.crewProfile, isCrew);
      notifySuccess('Master data saved.');
    } catch {
      reportActionError('Network error while saving master data.');
    } finally {
      setSavingMaster(false);
    }
  };

  const openStatusModal = (preset: CrewStatus) => {
    setModalStatus(preset);
    setModalEffectiveAt(new Date().toISOString().slice(0, 10));
    setModalReason('');
    setStatusModalOpen(true);
  };

  const handleConfirmStatusModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingModal(true);
    setActionError(null);
    try {
      if (modalStatus === 'offboarded') {
        const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: modalReason.trim() || null }),
        });
        const data = await res.json();
        if (!res.ok) {
          reportActionError(data.error || 'Failed to offboard user.');
          return;
        }
        setStatusModalOpen(false);
        notifySuccess('Crew member offboarded.');
        await loadDetail();
        return;
      }

      if (effectiveStatus === 'offboarded') {
        reportActionError(
          'Offboarded crew members must be re-onboarded via "Re-Onboard" to restore wtf-crew access.'
        );
        return;
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const effectiveIso =
        !modalEffectiveAt || modalEffectiveAt === todayStr
          ? new Date().toISOString()
          : `${modalEffectiveAt}T12:00:00.000Z`;

      const res = await fetch(
        `/api/fr/crew/${encodeURIComponent(userId)}/master-data`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: modalStatus,
            effectiveAt: effectiveIso,
            eventNote: modalReason.trim() || null,
            offboardReason:
              modalStatus === 'on_leave' ? modalReason.trim() || null : null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        reportActionError(data.error || 'Failed to update status.');
        return;
      }
      setStatusModalOpen(false);
      setCrewProfile(data.crewProfile);
      setLifecycleEvents(
        Array.isArray(data.lifecycleEvents) ? data.lifecycleEvents : []
      );
      syncFormFromMaster(data.crewProfile, isCrew);
      notifySuccess(`Status updated to "${getStatusBadgeProps(modalStatus).label}".`);
    } catch {
      reportActionError('Network error while updating status.');
    } finally {
      setSavingModal(false);
    }
  };

  const handleReOnboard = async () => {
    setReboarding(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        reportActionError(data.error || 'Failed to re-onboard user.');
        return;
      }
      notifySuccess('Crew member re-onboarded to Crew (wtf-crew).');
      await loadDetail();
    } catch {
      reportActionError('Network error while re-onboarding user.');
    } finally {
      setReboarding(false);
    }
  };

  const openRoleEditor = () => {
    if (roles.length > 0) {
      setAssignmentRows(
        roles.map((r, idx) => ({
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
    setRolesModalOpen(true);
  };

  const handleSaveRoles = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAssignments: Array<{ departmentId: number; position: string }> = [];
    const usedDeptIds = new Set<number>();

    for (const row of assignmentRows) {
      if (!row.departmentId) {
        reportActionError('Please select a department for each row.');
        return;
      }
      const deptId = Number(row.departmentId);
      if (usedDeptIds.has(deptId)) {
        reportActionError('Duplicate department selected.');
        return;
      }
      usedDeptIds.add(deptId);
      cleanAssignments.push({ departmentId: deptId, position: row.position.trim() });
    }

    setSavingRoles(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: cleanAssignments }),
      });
      const data = await res.json();
      if (!res.ok) {
        reportActionError(data.error || 'Failed to update departments.');
        return;
      }
      setRolesModalOpen(false);
      notifySuccess('Departments updated.');
      await loadDetail();
    } catch {
      reportActionError('Network error while updating departments.');
    } finally {
      setSavingRoles(false);
    }
  };

  const openSkillEditor = () => {
    if (skills.length > 0) {
      setSkillRows(
        skills.map((s, idx) => ({
          key: `${s.skillId}-${idx}`,
          skillId: String(s.skillId),
          level: s.level,
        }))
      );
    } else {
      const firstSkill = skillsCatalog[0];
      nextRowKeyRef.current += 1;
      setSkillRows([
        {
          key: `skill-${nextRowKeyRef.current}`,
          skillId: firstSkill ? String(firstSkill.id) : null,
          level: firstSkill?.levels[0] ?? null,
        },
      ]);
    }
    setSkillsModalOpen(true);
  };

  const handleSaveSkills = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSkills: Array<{ skillId: number; level: string }> = [];
    const usedSkillIds = new Set<number>();

    for (const row of skillRows) {
      if (!row.skillId || !row.level) {
        reportActionError('Please select a skill and level for each row.');
        return;
      }
      const skillId = Number(row.skillId);
      if (usedSkillIds.has(skillId)) {
        reportActionError('Duplicate skill selected.');
        return;
      }
      usedSkillIds.add(skillId);
      cleanSkills.push({ skillId, level: row.level });
    }

    setSavingSkills(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: cleanSkills }),
      });
      const data = await res.json();
      if (!res.ok) {
        reportActionError(data.error || 'Failed to update skills.');
        return;
      }
      setSkillsModalOpen(false);
      notifySuccess('Skills updated.');
      await loadDetail();
    } catch {
      reportActionError('Network error while updating skills.');
    } finally {
      setSavingSkills(false);
    }
  };

  if (loading) {
    return (
      <Paper p="xl" withBorder>
        <Group justify="center" gap="sm" py="md">
          <Loader size="sm" color="cyan" />
          <Text size="sm" c="dimmed">
            Loading crew profile...
          </Text>
        </Group>
      </Paper>
    );
  }

  if (error || !profile) {
    return (
      <Stack gap="lg">
        <Button
          component={Link}
          href="/fr/crew"
          variant="subtle"
          color="gray"
          size="xs"
          leftSection={<IconArrowLeft size={14} />}
          w="fit-content"
        >
          Back to Crew Management
        </Button>
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Profile unavailable">
          {error || 'Could not load crew profile.'}
        </Alert>
      </Stack>
    );
  }

  const addressDisplay =
    [
      profile.street,
      [profile.zip, profile.city].filter(Boolean).join(' '),
      profile.country,
    ]
      .filter(Boolean)
      .join(', ') || '—';

  return (
    <Stack gap="lg">
      <Button
        component={Link}
        href="/fr/crew"
        variant="subtle"
        color="gray"
        size="xs"
        leftSection={<IconArrowLeft size={14} />}
        w="fit-content"
      >
        Back to Crew Management
      </Button>

      {actionError && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {actionError}
        </Alert>
      )}

      {/* Profile Header */}
      <Paper p="lg" withBorder>
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
            <Avatar src={safeAvatar} size={56} radius="xl" color="cyan">
              {(profile.username || '?')[0]?.toUpperCase()}
            </Avatar>
            <Group gap="sm" wrap="wrap" align="center" style={{ minWidth: 0 }}>
              <Title order={2} fz="xl" fw={700} c="var(--mantine-color-white)">
                {displayName}
              </Title>
              <Text size="sm" c="dimmed">
                @{profile.username}
              </Text>
              <Badge color={statusBadge.color} size="sm">
                {statusBadge.label}
              </Badge>
            </Group>
          </Group>

          <Group gap="xs" wrap="wrap">
            {isFrAdmin && effectiveStatus !== 'offboarded' && crewProfile && (
              <Button
                variant="default"
                size="xs"
                leftSection={<IconEdit size={14} />}
                onClick={() =>
                  openStatusModal(effectiveStatus === 'active' ? 'on_leave' : 'active')
                }
              >
                Change Status
              </Button>
            )}
            {isFrAdmin && effectiveStatus !== 'offboarded' && isCrew && (
              <Button
                variant="light"
                color="red"
                size="xs"
                leftSection={<IconUserMinus size={14} />}
                disabled={userId === currentUserId}
                onClick={() => openStatusModal('offboarded')}
              >
                Offboard
              </Button>
            )}
            {isFrAdmin && effectiveStatus === 'offboarded' && (
              <Button
                color="teal"
                size="xs"
                leftSection={<IconUserCheck size={14} />}
                loading={reboarding}
                onClick={() => void handleReOnboard()}
              >
                Re-Onboard
              </Button>
            )}
          </Group>
        </Group>
      </Paper>

      {!crewProfile && (
        <Alert color="cyan" icon={<IconInfoCircle size={16} />}>
          No central master-data record exists yet. Use <strong>Sync Keycloak</strong> in
          Crew Management to initialize master data.
        </Alert>
      )}

      {/* 2-Column Content */}
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="lg" withBorder h="100%">
            <Stack gap="md">
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                Master Data &amp; Contact
              </Text>

              <Table.ScrollContainer minWidth={360}>
                <Table withTableBorder>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td c="dimmed" w="36%">
                        Name
                      </Table.Td>
                      <Table.Td fw={600}>
                        {[profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
                          '—'}
                      </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">Email</Table.Td>
                      <Table.Td fw={600}>{profile.email || '—'}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">Telegram</Table.Td>
                      <Table.Td fw={600}>{profile.telegram || '—'}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">Pronouns / Species</Table.Td>
                      <Table.Td fw={600}>
                        {[profile.pronouns, profile.species].filter(Boolean).join(' · ') ||
                          '—'}
                      </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">Phone</Table.Td>
                      <Table.Td fw={600}>{profile.phone || '—'}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">Date of Birth</Table.Td>
                      <Table.Td fw={600}>{profile.dob || '—'}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">Address</Table.Td>
                      <Table.Td fw={600}>{addressDisplay}</Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>

              <Divider />

              <form onSubmit={handleSaveMasterData}>
                <Stack gap="sm">
                  <Grid gap="sm">
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <Select
                        label="Lifecycle Status"
                        size="xs"
                        disabled={
                          !isFrAdmin || !crewProfile || effectiveStatus === 'offboarded'
                        }
                        value={formStatus}
                        onChange={(val) =>
                          setFormStatus((val as CrewStatus) || 'active')
                        }
                        data={
                          effectiveStatus === 'offboarded'
                            ? [{ value: 'offboarded', label: 'Offboarded' }]
                            : [
                                { value: 'active', label: 'Active (this season)' },
                                { value: 'on_leave', label: 'On Leave (paused)' },
                              ]
                        }
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <TextInput
                        label="Joined Date"
                        type="date"
                        size="xs"
                        disabled={!isFrAdmin || !crewProfile}
                        value={formJoinedAt}
                        onChange={(e) => setFormJoinedAt(e.currentTarget.value)}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <TextInput
                        label="Offboarded Date"
                        type="date"
                        size="xs"
                        disabled={!isFrAdmin || !crewProfile}
                        value={formOffboardedAt}
                        onChange={(e) => setFormOffboardedAt(e.currentTarget.value)}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <TextInput
                        label="Reason / Season Note"
                        placeholder="e.g. Sitting out Con 2026"
                        size="xs"
                        disabled={!isFrAdmin || !crewProfile}
                        value={formReason}
                        onChange={(e) => setFormReason(e.currentTarget.value)}
                      />
                    </Grid.Col>
                  </Grid>

                  <Textarea
                    label="Internal FR Notes"
                    placeholder="Internal notes for Furry Resources..."
                    size="xs"
                    minRows={3}
                    autosize
                    disabled={!isFrAdmin || !crewProfile}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.currentTarget.value)}
                  />

                  {isFrAdmin && (
                    <Group justify="flex-end">
                      <Button
                        type="submit"
                        size="xs"
                        leftSection={<IconCheck size={14} />}
                        loading={savingMaster}
                        disabled={!crewProfile}
                      >
                        Save Master Data
                      </Button>
                    </Group>
                  )}
                </Stack>
              </form>
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper p="lg" withBorder h="100%">
            <Stack gap="md">
              <Group justify="space-between">
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  Departments &amp; Positions
                </Text>
                {isFrAdmin && isCrew && (
                  <Button
                    variant="default"
                    size="compact-xs"
                    leftSection={<IconEdit size={12} />}
                    onClick={openRoleEditor}
                  >
                    Edit
                  </Button>
                )}
              </Group>

              {roles.length === 0 ? (
                <Text size="xs" c="dimmed">
                  No departments assigned yet.
                </Text>
              ) : (
                <Table.ScrollContainer minWidth={300}>
                  <Table withTableBorder>
                    <Table.Tbody>
                      {roles.map((r) => (
                        <Table.Tr key={r.departmentId}>
                          <Table.Td>
                            <Text size="sm" fw={600}>
                              {r.departmentName}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {r.position || 'Crew Member'}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Badge color="cyan" size="xs">
                              #{r.sortOrder}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}

              <Divider />

              <Group justify="space-between">
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  Skills &amp; Qualifications
                </Text>
                {isFrAdmin && isCrew && (
                  <Button
                    variant="default"
                    size="compact-xs"
                    leftSection={<IconEdit size={12} />}
                    onClick={openSkillEditor}
                  >
                    Edit
                  </Button>
                )}
              </Group>

              {skills.length === 0 ? (
                <Text size="xs" c="dimmed">
                  No skills assigned yet.
                </Text>
              ) : (
                <Group gap="xs">
                  {skills.map((s) => (
                    <Pill key={s.skillId} size="sm">
                      {s.skillName} · {s.level}
                    </Pill>
                  ))}
                </Group>
              )}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Lifecycle Timeline */}
      <Paper p="lg" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <IconHistory size={16} color="var(--mantine-color-cyan-4)" />
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                Lifecycle Timeline
              </Text>
            </Group>
            <Badge size="xs" color="gray">
              {lifecycleEvents.length}{' '}
              {lifecycleEvents.length === 1 ? 'entry' : 'entries'}
            </Badge>
          </Group>

          <Divider />

          {lifecycleEvents.length === 0 ? (
            <Text size="xs" c="dimmed">
              No lifecycle events recorded yet.
            </Text>
          ) : (
            <Timeline active={lifecycleEvents.length} bulletSize={18} lineWidth={2}>
              {lifecycleEvents.map((ev) => {
                const meta = getTimelineEventMeta(ev.eventType);
                return (
                  <Timeline.Item
                    key={ev.id}
                    color={meta.color}
                    title={
                      <Group gap="xs" wrap="wrap">
                        <Text size="xs" c="dimmed" ff="monospace">
                          {formatDateDisplay(ev.effectiveAt)}
                        </Text>
                        <Text size="sm" fw={600}>
                          {meta.title}
                        </Text>
                      </Group>
                    }
                  >
                    {ev.note && (
                      <Text size="xs" c="gray.3" mt={2}>
                        {ev.note}
                      </Text>
                    )}
                    {ev.actorUsername && (
                      <Text size="xs" c="dimmed" mt={2}>
                        Triggered by @{ev.actorUsername}
                      </Text>
                    )}
                  </Timeline.Item>
                );
              })}
            </Timeline>
          )}
        </Stack>
      </Paper>

      {/* Status / Offboarding Modal */}
      <Modal
        opened={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title="Change Status / Offboard"
      >
        <form onSubmit={handleConfirmStatusModal}>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              Crew member:{' '}
              <strong style={{ color: 'var(--mantine-color-white)' }}>
                {displayName} (@{profile.username})
              </strong>
            </Text>

            <Select
              label="New Status"
              size="xs"
              value={modalStatus}
              onChange={(val) => setModalStatus((val as CrewStatus) || 'on_leave')}
              data={[
                { value: 'active', label: 'Active' },
                { value: 'on_leave', label: 'On Leave (Paused)' },
                ...(isFrAdmin && userId !== currentUserId
                  ? [
                      {
                        value: 'offboarded',
                        label: 'Offboarded (removes wtf-crew)',
                      },
                    ]
                  : []),
              ]}
            />

            {modalStatus !== 'offboarded' && (
              <TextInput
                label="Effective Date"
                type="date"
                size="xs"
                value={modalEffectiveAt}
                onChange={(e) => setModalEffectiveAt(e.currentTarget.value)}
              />
            )}

            <TextInput
              label="Reason / Timeline Note"
              placeholder="e.g. Sitting out this season"
              size="xs"
              value={modalReason}
              onChange={(e) => setModalReason(e.currentTarget.value)}
            />

            <Group justify="flex-end" mt="xs">
              <Button
                variant="default"
                size="xs"
                onClick={() => setStatusModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="xs"
                color={modalStatus === 'offboarded' ? 'red' : 'cyan'}
                loading={savingModal}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Roles Edit Modal */}
      <Modal
        opened={rolesModalOpen}
        onClose={() => setRolesModalOpen(false)}
        title={`Edit Departments — @${profile.username}`}
        size="lg"
      >
        <form onSubmit={handleSaveRoles}>
          <Stack gap="sm">
            {assignmentRows.map((row, index) => (
              <Group key={row.key} align="flex-end" wrap="nowrap">
                <Select
                  label={index === 0 ? 'Department' : undefined}
                  size="xs"
                  style={{ flex: 1 }}
                  data={departmentSelectOptions}
                  value={row.departmentId}
                  onChange={(val) =>
                    setAssignmentRows((prev) =>
                      prev.map((r) =>
                        r.key === row.key ? { ...r, departmentId: val } : r
                      )
                    )
                  }
                />
                <TextInput
                  label={index === 0 ? 'Position' : undefined}
                  placeholder="e.g. Lead, Staff"
                  size="xs"
                  style={{ flex: 1 }}
                  value={row.position}
                  onChange={(e) => {
                    const nextPos = e.currentTarget.value;
                    setAssignmentRows((prev) =>
                      prev.map((r) =>
                        r.key === row.key ? { ...r, position: nextPos } : r
                      )
                    );
                  }}
                />
                <ActionIcon
                  color="red"
                  variant="subtle"
                  size="lg"
                  onClick={() =>
                    setAssignmentRows((prev) => prev.filter((r) => r.key !== row.key))
                  }
                  aria-label="Remove department row"
                >
                  <IconTrash size={15} />
                </ActionIcon>
              </Group>
            ))}

            <Button
              variant="default"
              size="xs"
              leftSection={<IconPlus size={14} />}
              w="fit-content"
              onClick={() => {
                nextRowKeyRef.current += 1;
                setAssignmentRows((prev) => [
                  ...prev,
                  {
                    key: `row-${nextRowKeyRef.current}`,
                    departmentId: null,
                    position: '',
                  },
                ]);
              }}
            >
              Add Department
            </Button>

            <Group justify="flex-end" mt="sm">
              <Button
                variant="default"
                size="xs"
                onClick={() => setRolesModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="xs" loading={savingRoles}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Skills Edit Modal */}
      <Modal
        opened={skillsModalOpen}
        onClose={() => setSkillsModalOpen(false)}
        title={`Edit Skills — @${profile.username}`}
        size="lg"
      >
        <form onSubmit={handleSaveSkills}>
          <Stack gap="sm">
            {skillRows.map((row, index) => {
              const def = row.skillId ? skillCatalogMap.get(row.skillId) : undefined;
              const levelOptions = def?.levels ?? [];
              return (
                <Group key={row.key} align="flex-end" wrap="nowrap">
                  <Select
                    label={index === 0 ? 'Skill' : undefined}
                    size="xs"
                    style={{ flex: 1 }}
                    data={skillSelectOptions}
                    value={row.skillId}
                    onChange={(val) => {
                      const nextDef = val ? skillCatalogMap.get(val) : undefined;
                      setSkillRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key
                            ? {
                                ...r,
                                skillId: val,
                                level: nextDef?.levels[0] ?? null,
                              }
                            : r
                        )
                      );
                    }}
                  />
                  <Select
                    label={index === 0 ? 'Level' : undefined}
                    size="xs"
                    style={{ flex: 1 }}
                    data={levelOptions}
                    value={row.level}
                    onChange={(val) =>
                      setSkillRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key ? { ...r, level: val } : r
                        )
                      )
                    }
                  />
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    size="lg"
                    onClick={() =>
                      setSkillRows((prev) => prev.filter((r) => r.key !== row.key))
                    }
                    aria-label="Remove skill row"
                  >
                    <IconTrash size={15} />
                  </ActionIcon>
                </Group>
              );
            })}

            <Button
              variant="default"
              size="xs"
              leftSection={<IconPlus size={14} />}
              w="fit-content"
              onClick={() => {
                nextRowKeyRef.current += 1;
                setSkillRows((prev) => [
                  ...prev,
                  {
                    key: `skill-${nextRowKeyRef.current}`,
                    skillId: null,
                    level: null,
                  },
                ]);
              }}
            >
              Add Skill
            </Button>

            <Group justify="flex-end" mt="sm">
              <Button
                variant="default"
                size="xs"
                onClick={() => setSkillsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="xs" loading={savingSkills}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
