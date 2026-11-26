'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { notifySuccess } from '@/lib/notify';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMappings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/departments', { cache: 'no-store' });
      const data = await res.json();
      setErrorMessage(null);
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to load department mappings.');
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
      setErrorMessage('Network error while loading department mappings.');
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
        setErrorMessage(null);
        if (!res.ok) {
          setErrorMessage(data.error || 'Failed to load department mappings.');
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
          setErrorMessage('Network error while loading department mappings.');
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
    setErrorMessage(null);
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
        setErrorMessage(data.error || 'Failed to save mapping.');
        return;
      }

      const syncedInfo =
        chosenGroupId && syncMembers
          ? ` (${data.syncedCount ?? 0} existing members synced)`
          : '';
      notifySuccess(
        chosenGroupId
          ? `Department "${dept.name}" mapped to "${data.department?.keycloakGroupName}"${syncedInfo}.`
          : `Keycloak mapping removed for "${dept.name}".`
      );
      await loadMappings();
    } catch {
      setErrorMessage('Network error while saving mapping.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Paper p="lg" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Group gap="xs">
            <Text size="sm" fw={700}>
              Department Mapping
            </Text>
            <InfoTooltip label="Link FR departments to Keycloak groups and optionally sync existing members on save." />
          </Group>

          <Group gap="sm" wrap="wrap">
            <Checkbox
              size="xs"
              label="Sync existing members"
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
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            Could not load Keycloak groups (verify service account role{' '}
            <code>query-groups</code>).
          </Alert>
        )}

        {errorMessage && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {errorMessage}
          </Alert>
        )}

        {loading ? (
          <Group justify="center" gap="sm" py="lg">
            <Loader size="sm" color="cyan" />
            <Text size="sm" c="dimmed">
              Loading department mappings...
            </Text>
          </Group>
        ) : departments.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No departments created yet.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={620}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Department</Table.Th>
                  <Table.Th>Crew</Table.Th>
                  <Table.Th>Keycloak Group</Table.Th>
                  <Table.Th ta="right">Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {departments.map((dept) => {
                  const currentSelection = selectedGroups[dept.id] ?? null;
                  const isChanged = currentSelection !== dept.keycloakGroupId;
                  return (
                    <Table.Tr key={dept.id}>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Text size="sm" fw={600}>
                            {dept.name}
                          </Text>
                          {!dept.keycloakGroupName && (
                            <Badge size="xs" color="yellow">
                              Unlinked
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" color="gray">
                          {dept.memberCount}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
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
                          maw={340}
                        />
                      </Table.Td>
                      <Table.Td ta="right">
                        <Button
                          size="xs"
                          variant={isChanged ? 'filled' : 'default'}
                          loading={savingId === dept.id}
                          disabled={!isChanged && !currentSelection}
                          onClick={() => void handleSaveMapping(dept)}
                        >
                          Save
                        </Button>
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
  );
}
