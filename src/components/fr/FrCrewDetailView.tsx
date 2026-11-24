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
  Text,
  Textarea,
  TextInput,
  Timeline,
} from '@mantine/core';
import {
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
import { getSafeAvatarUrl } from '@/lib/validation';
import {
  DARK_MODAL_STYLES,
  type CrewLifecycleEvent,
  type CrewProfile,
  type CrewRoleItem,
  type CrewSkillItem,
  type CrewStatus,
  type DepartmentItem,
  type FrStatusMessage,
  type SkillCatalogItem,
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
  const [statusMessage, setStatusMessage] = useState<FrStatusMessage | null>(null);

  const [isCrew, setIsCrew] = useState(false);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [crewProfile, setCrewProfile] = useState<CrewProfile | null>(null);
  const [lifecycleEvents, setLifecycleEvents] = useState<CrewLifecycleEvent[]>([]);
  const [roles, setRoles] = useState<CrewRoleItem[]>([]);
  const [skills, setSkills] = useState<CrewSkillItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [skillsCatalog, setSkillsCatalog] = useState<SkillCatalogItem[]>([]);

  // Master-data form state
  const [formStatus, setFormStatus] = useState<CrewStatus>('active');
  const [formJoinedAt, setFormJoinedAt] = useState('');
  const [formOffboardedAt, setFormOffboardedAt] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [savingMaster, setSavingMaster] = useState(false);

  // Status / Offboard Modal state
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<CrewStatus>('on_leave');
  const [modalEffectiveAt, setModalEffectiveAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [modalReason, setModalReason] = useState('');
  const [savingModal, setSavingModal] = useState(false);

  // Roles & Skills Edit Modals
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
    setError(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load crew profile.');
        return;
      }
      setIsCrew(Boolean(data.isCrew));
      setProfile(data.profile ?? null);
      setCrewProfile(data.crewProfile ?? null);
      setLifecycleEvents(Array.isArray(data.lifecycleEvents) ? data.lifecycleEvents : []);
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
        if (!res.ok) {
          setError(data.error || 'Failed to load crew profile.');
          return;
        }
        setIsCrew(Boolean(data.isCrew));
        setProfile(data.profile ?? null);
        setCrewProfile(data.crewProfile ?? null);
        setLifecycleEvents(Array.isArray(data.lifecycleEvents) ? data.lifecycleEvents : []);
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

  const effectiveStatus: CrewStatus = crewProfile?.status ?? (isCrew ? 'active' : 'offboarded');
  const statusBadge = getStatusBadgeProps(effectiveStatus);
  const safeAvatar = getSafeAvatarUrl(profile?.avatarUrl);
  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    profile?.nickname ||
    profile?.username ||
    userId;

  const handleSaveMasterData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crewProfile) return;
    setSavingMaster(true);
    setStatusMessage(null);
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
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to save master data.',
        });
        return;
      }
      setCrewProfile(data.crewProfile);
      setLifecycleEvents(Array.isArray(data.lifecycleEvents) ? data.lifecycleEvents : []);
      syncFormFromMaster(data.crewProfile, isCrew);
      setStatusMessage({ type: 'success', text: 'Master data saved.' });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while saving master data.',
      });
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
    setStatusMessage(null);
    try {
      if (modalStatus === 'offboarded') {
        const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: modalReason.trim() || null }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatusMessage({
            type: 'error',
            text: data.error || 'Failed to offboard user.',
          });
          return;
        }
        setStatusModalOpen(false);
        setStatusMessage({
          type: 'success',
          text: 'Crew member offboarded.',
        });
        await loadDetail();
        return;
      }

      if (effectiveStatus === 'offboarded') {
        setStatusMessage({
          type: 'error',
          text: 'Offboarded crew members must be re-onboarded via "Re-Onboard" to restore wtf-crew access.',
        });
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
            offboardReason: modalStatus === 'on_leave' ? modalReason.trim() || null : null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to update status.',
        });
        return;
      }
      setStatusModalOpen(false);
      setCrewProfile(data.crewProfile);
      setLifecycleEvents(Array.isArray(data.lifecycleEvents) ? data.lifecycleEvents : []);
      syncFormFromMaster(data.crewProfile, isCrew);
      setStatusMessage({
        type: 'success',
        text: `Status updated to "${getStatusBadgeProps(modalStatus).label}".`,
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while updating status.',
      });
    } finally {
      setSavingModal(false);
    }
  };

  const handleReOnboard = async () => {
    setReboarding(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to re-onboard user.',
        });
        return;
      }
      setStatusMessage({
        type: 'success',
        text: 'Crew member re-onboarded to Crew (wtf-crew).',
      });
      await loadDetail();
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while re-onboarding user.',
      });
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
        setStatusMessage({
          type: 'error',
          text: 'Please select a department for each row.',
        });
        return;
      }
      const deptId = Number(row.departmentId);
      if (usedDeptIds.has(deptId)) {
        setStatusMessage({
          type: 'error',
          text: 'Duplicate department selected.',
        });
        return;
      }
      usedDeptIds.add(deptId);
      cleanAssignments.push({ departmentId: deptId, position: row.position.trim() });
    }

    setSavingRoles(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: cleanAssignments }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to update departments.',
        });
        return;
      }
      setRolesModalOpen(false);
      setStatusMessage({ type: 'success', text: 'Departments updated.' });
      await loadDetail();
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while updating departments.',
      });
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
        setStatusMessage({
          type: 'error',
          text: 'Please select a skill and level for each row.',
        });
        return;
      }
      const skillId = Number(row.skillId);
      if (usedSkillIds.has(skillId)) {
        setStatusMessage({
          type: 'error',
          text: 'Duplicate skill selected.',
        });
        return;
      }
      usedSkillIds.add(skillId);
      cleanSkills.push({ skillId, level: row.level });
    }

    setSavingSkills(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/fr/crew/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: cleanSkills }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to update skills.',
        });
        return;
      }
      setSkillsModalOpen(false);
      setStatusMessage({ type: 'success', text: 'Skills updated.' });
      await loadDetail();
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Network error while updating skills.',
      });
    } finally {
      setSavingSkills(false);
    }
  };

  if (loading) {
    return (
      <Paper
        p="xl"
        radius="md"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-4)',
        }}
      >
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
      <Stack gap={24}>
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
        <Alert color="red" title="Profile unavailable">
          {error || 'Could not load crew profile.'}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap={24}>
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

      {/* Profile Header */}
      <Paper
        p={24}
        radius="md"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-4)',
        }}
      >
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
            <Avatar src={safeAvatar} size={60} radius="xl" color="cyan">
              {(profile.username || '?')[0]?.toUpperCase()}
            </Avatar>
            <Group gap="sm" wrap="wrap" align="center" style={{ minWidth: 0 }}>
              <Text size="xl" fw={700} c="white">
                {displayName}
              </Text>
              <Text size="sm" c="dimmed">
                @{profile.username}
              </Text>
              <Badge color={statusBadge.color} variant="light" size="sm">
                {statusBadge.label}
              </Badge>
            </Group>
          </Group>

          <Group gap="sm" wrap="wrap">
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
                onClick={handleReOnboard}
              >
                Re-Onboard
              </Button>
            )}
          </Group>
        </Group>
      </Paper>

      {!crewProfile && (
        <Alert color="cyan" icon={<IconInfoCircle size={16} />}>
          No central master-data record exists for this crew member yet. Click{' '}
          <strong>&quot;Sync Keycloak&quot;</strong> in Crew Management to initialize master data
          and lifecycle history.
        </Alert>
      )}

      {/* 2-Column Content */}
      <Grid gap="md">
        {/* Left: Master Data & Contact */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper
            p={24}
            radius="md"
            withBorder
            h="100%"
            style={{
              backgroundColor: 'var(--mantine-color-dark-7)',
              borderColor: 'var(--mantine-color-dark-4)',
            }}
          >
            <Stack gap="md">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Master Data &amp; Contact
              </Text>
              <Divider color="var(--mantine-color-dark-4)" />

              <Grid gap="xs">
                <Grid.Col span={4}>
                  <Text size="xs" c="dimmed">
                    Name
                  </Text>
                </Grid.Col>
                <Grid.Col span={8}>
                  <Text size="sm" fw={600} c="white">
                    {[profile.firstName, profile.lastName].filter(Boolean).join(' ') || '—'}
                  </Text>
                </Grid.Col>

                <Grid.Col span={4}>
                  <Text size="xs" c="dimmed">
                    Email
                  </Text>
                </Grid.Col>
                <Grid.Col span={8}>
                  <Text size="sm" fw={600} c="white">
                    {profile.email || '—'}
                  </Text>
                </Grid.Col>

                <Grid.Col span={4}>
                  <Text size="xs" c="dimmed">
                    Telegram
                  </Text>
                </Grid.Col>
                <Grid.Col span={8}>
                  <Text size="sm" fw={600} c="white">
                    {profile.telegram || '—'}
                  </Text>
                </Grid.Col>

                <Grid.Col span={4}>
                  <Text size="xs" c="dimmed">
                    Pronouns / Species
                  </Text>
                </Grid.Col>
                <Grid.Col span={8}>
                  <Text size="sm" fw={600} c="white">
                    {[profile.pronouns, profile.species].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </Grid.Col>

                <Grid.Col span={4}>
                  <Text size="xs" c="dimmed">
                    Phone
                  </Text>
                </Grid.Col>
                <Grid.Col span={8}>
                  <Text size="sm" fw={600} c="white">
                    {profile.phone || '—'}
                  </Text>
                </Grid.Col>

                <Grid.Col span={4}>
                  <Text size="xs" c="dimmed">
                    Date of Birth
                  </Text>
                </Grid.Col>
                <Grid.Col span={8}>
                  <Text size="sm" fw={600} c="white">
                    {profile.dob || '—'}
                  </Text>
                </Grid.Col>

                <Grid.Col span={4}>
                  <Text size="xs" c="dimmed">
                    Address
                  </Text>
                </Grid.Col>
                <Grid.Col span={8}>
                  <Text size="sm" fw={600} c="white">
                    {[
                      profile.street,
                      [profile.zip, profile.city].filter(Boolean).join(' '),
                      profile.country,
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </Text>
                </Grid.Col>
              </Grid>

              <Divider color="var(--mantine-color-dark-4)" />

              <form onSubmit={handleSaveMasterData}>
                <Stack gap="sm">
                  <Grid gap="sm">
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <Select
                        label="Lifecycle Status"
                        size="xs"
                        disabled={!isFrAdmin || !crewProfile || effectiveStatus === 'offboarded'}
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
                    styles={{
                      input: {
                        backgroundColor: 'var(--mantine-color-dark-6)',
                        borderColor: 'var(--mantine-color-dark-4)',
                        color: 'var(--mantine-color-white)',
                      },
                    }}
                  />

                  {isFrAdmin && (
                    <Group justify="flex-end">
                      <Button
                        type="submit"
                        size="xs"
                        color="cyan"
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

        {/* Right: Departments & Skills */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper
            p={24}
            radius="md"
            withBorder
            h="100%"
            style={{
              backgroundColor: 'var(--mantine-color-dark-7)',
              borderColor: 'var(--mantine-color-dark-4)',
            }}
          >
            <Stack gap="md">
              <Group justify="space-between">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">
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
              <Divider color="var(--mantine-color-dark-4)" />

              {roles.length === 0 ? (
                <Text size="xs" c="dimmed">
                  No departments assigned yet.
                </Text>
              ) : (
                <Stack gap="xs">
                  {roles.map((r) => (
                    <Paper
                      key={r.departmentId}
                      p="xs"
                      withBorder
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-6)',
                        borderColor: 'var(--mantine-color-dark-4)',
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <div>
                          <Text size="sm" fw={600} c="white">
                            {r.departmentName}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {r.position || 'Crew Member'}
                          </Text>
                        </div>
                        <Badge variant="light" color="cyan" size="xs">
                          #{r.sortOrder}
                        </Badge>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}

              <Divider color="var(--mantine-color-dark-4)" />

              <Group justify="space-between">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">
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
          <Group justify="space-between">
            <Group gap="xs">
              <IconHistory size={16} color="var(--mantine-color-cyan-4)" />
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Lifecycle Timeline
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {lifecycleEvents.length}{' '}
              {lifecycleEvents.length === 1 ? 'entry' : 'entries'}
            </Text>
          </Group>
          <Divider color="var(--mantine-color-dark-4)" />

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
                        <Text size="sm" fw={600} c="white">
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
        centered
        styles={DARK_MODAL_STYLES}
      >
        <form onSubmit={handleConfirmStatusModal}>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              Crew member:{' '}
              <strong style={{ color: '#fff' }}>
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

            <Alert color="cyan" icon={<IconInfoCircle size={15} />}>
              <Text size="xs">
                Every status change is automatically recorded in the lifecycle timeline and
                audit log.
              </Text>
            </Alert>

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
        centered
        size="lg"
        styles={DARK_MODAL_STYLES}
      >
        <form onSubmit={handleSaveRoles}>
          <Stack gap="sm">
            {assignmentRows.map((row) => (
              <Group key={row.key} align="flex-end" wrap="nowrap">
                <Select
                  label="Department"
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
                  label="Position"
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
              <Button variant="default" size="xs" onClick={() => setRolesModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="xs" color="cyan" loading={savingRoles}>
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
        centered
        size="lg"
        styles={DARK_MODAL_STYLES}
      >
        <form onSubmit={handleSaveSkills}>
          <Stack gap="sm">
            {skillRows.map((row) => {
              const def = row.skillId ? skillCatalogMap.get(row.skillId) : undefined;
              const levelOptions = def?.levels ?? [];
              return (
                <Group key={row.key} align="flex-end" wrap="nowrap">
                  <Select
                    label="Skill"
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
                    label="Level"
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
              <Button variant="default" size="xs" onClick={() => setSkillsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="xs" color="cyan" loading={savingSkills}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
