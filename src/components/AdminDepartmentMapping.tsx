'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { IconLink, IconRefresh } from '@tabler/icons-react';

interface AdminDepartmentRow {
  id: number;
  name: string;
  keycloakGroupId: string | null;
  keycloakGroupName: string | null;
  memberCount: number;
}

interface KeycloakGroupItem {
  id: string;
  name: string;
  path: string;
}

export function AdminDepartmentMapping() {
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<AdminDepartmentRow[]>([]);
  const [keycloakGroups, setKeycloakGroups] = useState<KeycloakGroupItem[]>([]);
  const [keycloakGroupsAvailable, setKeycloakGroupsAvailable] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<Record<number, string | null>>({});
  const [syncMembers, setSyncMembers] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadMappings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/departments', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setStatus({
          type: 'error',
          text: data.error || 'Failed to load department mappings.',
        });
        return;
      }
      const depts: AdminDepartmentRow[] = Array.isArray(data.departments)
        ? data.departments
        : [];
      setDepartments(depts);
      setKeycloakGroups(Array.isArray(data.keycloakGroups) ? data.keycloakGroups : []);
      setKeycloakGroupsAvailable(Boolean(data.keycloakGroupsAvailable));

      const initialSelections: Record<number, string | null> = {};
      for (const d of depts) {
        initialSelections[d.id] = d.keycloakGroupId;
      }
      setSelectedGroups(initialSelections);
    } catch {
      setStatus({
        type: 'error',
        text: 'Network error while loading department mappings.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/departments', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus({
            type: 'error',
            text: data.error || 'Failed to load department mappings.',
          });
          return;
        }
        const depts: AdminDepartmentRow[] = Array.isArray(data.departments)
          ? data.departments
          : [];
        setDepartments(depts);
        setKeycloakGroups(Array.isArray(data.keycloakGroups) ? data.keycloakGroups : []);
        setKeycloakGroupsAvailable(Boolean(data.keycloakGroupsAvailable));

        const initialSelections: Record<number, string | null> = {};
        for (const d of depts) {
          initialSelections[d.id] = d.keycloakGroupId;
        }
        setSelectedGroups(initialSelections);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({
            type: 'error',
            text: 'Network error while loading department mappings.',
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

  const groupOptions = useMemo(
    () =>
      keycloakGroups.map((g) => ({
        value: g.id,
        label: `${g.name} (${g.path})`,
      })),
    [keycloakGroups]
  );

  const handleSaveMapping = async (dept: AdminDepartmentRow) => {
    setSavingId(dept.id);
    setStatus(null);
    const chosenGroupId = selectedGroups[dept.id] ?? null;
    try {
      const res = await fetch(`/api/admin/departments/${dept.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keycloakGroupId: chosenGroupId,
          syncMembers: Boolean(chosenGroupId && syncMembers),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({
          type: 'error',
          text: data.error || 'Failed to save mapping.',
        });
        return;
      }

      const syncedInfo =
        chosenGroupId && syncMembers
          ? ` (${data.syncedCount ?? 0} existing members synced)`
          : '';
      setStatus({
        type: 'success',
        text: chosenGroupId
          ? `Department "${dept.name}" mapped to "${data.department?.keycloakGroupName}"${syncedInfo}.`
          : `Keycloak mapping removed for "${dept.name}".`,
      });
      await loadMappings();
    } catch {
      setStatus({
        type: 'error',
        text: 'Network error while saving mapping.',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
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
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <div>
            <Group gap="xs">
              <IconLink size={18} color="var(--mantine-color-cyan-4)" />
              <Text size="sm" fw={700} c="white">
                Department ↔ Keycloak Group Mapping
              </Text>
            </Group>
            <Text size="xs" c="dimmed" mt={2}>
              Compare all FR-created departments against Keycloak groups and link them as needed
            </Text>
          </div>
          <Group gap="sm">
            <Checkbox
              size="xs"
              label="Sync existing members when linking"
              checked={syncMembers}
              onChange={(e) => setSyncMembers(e.currentTarget.checked)}
            />
            <Button
              variant="default"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                setLoading(true);
                void loadMappings();
              }}
              loading={loading}
            >
              Refresh
            </Button>
          </Group>
        </Group>

        {!keycloakGroupsAvailable && !loading && (
          <Text size="xs" c="red.4">
            Could not load Keycloak groups (verify service account role{' '}
            <code>query-groups</code>).
          </Text>
        )}

        {status && (
          <Paper
            p="sm"
            radius="sm"
            withBorder
            style={{
              backgroundColor:
                status.type === 'success'
                  ? 'rgba(18, 184, 134, 0.1)'
                  : 'rgba(250, 82, 82, 0.1)',
              borderColor:
                status.type === 'success'
                  ? 'rgba(18, 184, 134, 0.35)'
                  : 'rgba(250, 82, 82, 0.35)',
            }}
          >
            <Text size="xs" fw={600} c={status.type === 'success' ? 'teal.4' : 'red.4'}>
              {status.text}
            </Text>
          </Paper>
        )}

        {loading ? (
          <Group justify="center" gap="sm" py="md">
            <Loader size="sm" color="cyan" />
            <Text size="sm" c="dimmed">
              Loading department mappings...
            </Text>
          </Group>
        ) : departments.length === 0 ? (
          <Text size="xs" c="dimmed">
            No departments have been created in the FR tab yet.
          </Text>
        ) : (
          <Stack gap="xs">
            {departments.map((dept) => {
              const currentSelection = selectedGroups[dept.id] ?? null;
              const isChanged = currentSelection !== dept.keycloakGroupId;
              return (
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
                  <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                    <div style={{ minWidth: 180 }}>
                      <Group gap="xs">
                        <Text size="sm" fw={600} c="white">
                          {dept.name}
                        </Text>
                        <Badge size="xs" variant="light" color="gray">
                          {dept.memberCount} Crew
                        </Badge>
                        {dept.keycloakGroupName ? (
                          <Badge size="xs" variant="light" color="teal">
                            KC: {dept.keycloakGroupName}
                          </Badge>
                        ) : (
                          <Badge size="xs" variant="light" color="yellow">
                            No Keycloak Group
                          </Badge>
                        )}
                      </Group>
                    </div>

                    <Group gap="xs" wrap="nowrap" style={{ flex: 1, maxWidth: 460 }}>
                      <Select
                        placeholder="No Keycloak group (DB only)"
                        data={groupOptions}
                        value={currentSelection}
                        onChange={(val) =>
                          setSelectedGroups((prev) => ({
                            ...prev,
                            [dept.id]: val,
                          }))
                        }
                        clearable
                        searchable
                        size="xs"
                        style={{ flex: 1 }}
                      />
                      <Button
                        size="xs"
                        color="cyan"
                        loading={savingId === dept.id}
                        disabled={!isChanged && !currentSelection}
                        onClick={() => handleSaveMapping(dept)}
                      >
                        Save
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
  );
}
