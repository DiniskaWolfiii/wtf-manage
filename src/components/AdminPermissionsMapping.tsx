'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconRefresh } from '@tabler/icons-react';
import {
  DEFAULT_PERMISSION_MAPPINGS,
  PERMISSION_DEFINITIONS,
  PERMISSION_SECTIONS,
  normalizeGroupIdentifier,
  type PermissionMappings,
  type PortalPermission,
} from '@/lib/permission-types';
import { notifySuccess } from '@/lib/notify';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

interface KeycloakGroupItem {
  id: string;
  name: string;
  path: string;
}

export function AdminPermissionsMapping() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mappings, setMappings] = useState<PermissionMappings>(
    DEFAULT_PERMISSION_MAPPINGS
  );
  const [savedMappings, setSavedMappings] = useState<PermissionMappings>(
    DEFAULT_PERMISSION_MAPPINGS
  );
  const [crewGroup, setCrewGroup] = useState<string | null>(null);
  const [savedCrewGroup, setSavedCrewGroup] = useState<string | null>(null);
  const [adminGroup, setAdminGroup] = useState<string | null>(null);
  const [keycloakGroups, setKeycloakGroups] = useState<KeycloakGroupItem[]>([]);
  const [keycloakGroupsAvailable, setKeycloakGroupsAvailable] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/permissions', { cache: 'no-store' });
      const data = await res.json();
      setErrorMessage(null);
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to load permission mappings.');
        return;
      }

      if (data.mappings) {
        setMappings(data.mappings);
        setSavedMappings(data.mappings);
      }
      const nextCrewGroup =
        typeof data.crewGroup === 'string' && data.crewGroup ? data.crewGroup : null;
      setCrewGroup(nextCrewGroup);
      setSavedCrewGroup(nextCrewGroup);
      setAdminGroup(
        typeof data.adminGroup === 'string' && data.adminGroup ? data.adminGroup : null
      );
      setKeycloakGroups(Array.isArray(data.keycloakGroups) ? data.keycloakGroups : []);
      setKeycloakGroupsAvailable(Boolean(data.keycloakGroupsAvailable));
    } catch {
      setErrorMessage('Network error while loading permission mappings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/permissions', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        setErrorMessage(null);
        if (!res.ok) {
          setErrorMessage(data.error || 'Failed to load permission mappings.');
          return;
        }
        if (data.mappings) {
          setMappings(data.mappings);
          setSavedMappings(data.mappings);
        }
        const nextCrewGroup =
          typeof data.crewGroup === 'string' && data.crewGroup ? data.crewGroup : null;
        setCrewGroup(nextCrewGroup);
        setSavedCrewGroup(nextCrewGroup);
        setAdminGroup(
          typeof data.adminGroup === 'string' && data.adminGroup ? data.adminGroup : null
        );
        setKeycloakGroups(Array.isArray(data.keycloakGroups) ? data.keycloakGroups : []);
        setKeycloakGroupsAvailable(Boolean(data.keycloakGroupsAvailable));
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Network error while loading permission mappings.');
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

  const groupOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of keycloakGroups) {
      const normalized = normalizeGroupIdentifier(g.path || g.name);
      if (normalized) {
        map.set(normalized, g.path || `/${normalized}`);
      }
    }
    if (crewGroup) {
      const normalized = normalizeGroupIdentifier(crewGroup);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, `/${normalized}`);
      }
    }
    for (const list of Object.values(mappings)) {
      for (const item of list) {
        const normalized = normalizeGroupIdentifier(item);
        if (normalized && !map.has(normalized)) {
          map.set(normalized, `/${normalized}`);
        }
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, label]) => ({ value, label }));
  }, [keycloakGroups, mappings, crewGroup]);

  const hasChanges = useMemo(
    () =>
      JSON.stringify(mappings) !== JSON.stringify(savedMappings) ||
      crewGroup !== savedCrewGroup,
    [mappings, savedMappings, crewGroup, savedCrewGroup]
  );

  const handleChangePermissionGroups = (
    permission: PortalPermission,
    values: string[]
  ) => {
    setMappings((prev) => ({
      ...prev,
      [permission]: values.map(normalizeGroupIdentifier).filter(Boolean),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings, crewGroup }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to save permission mappings.');
        return;
      }
      if (data.mappings) {
        setMappings(data.mappings);
        setSavedMappings(data.mappings);
      }
      const nextCrewGroup =
        typeof data.crewGroup === 'string' && data.crewGroup ? data.crewGroup : null;
      setCrewGroup(nextCrewGroup);
      setSavedCrewGroup(nextCrewGroup);
      notifySuccess('Permission mappings saved.');
    } catch {
      setErrorMessage('Network error while saving permission mappings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper p="lg" withBorder>
      <Stack gap="lg">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Group gap="xs" wrap="wrap">
            <Text fw={700} size="sm">
              Permissions &amp; Keycloak Groups
            </Text>
            <InfoTooltip label="Map Keycloak groups to portal permissions. The configured ADMIN_GROUP always retains full access." />
            {adminGroup ? (
              <Badge color="cyan" size="xs">
                Super Admin: /{adminGroup}
              </Badge>
            ) : !loading ? (
              <Badge color="yellow" size="xs">
                ADMIN_GROUP not set
              </Badge>
            ) : null}
          </Group>

          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                setLoading(true);
                void loadPermissions();
              }}
              disabled={loading || saving}
            >
              Reload Groups
            </Button>
            <Button
              size="xs"
              leftSection={<IconCheck size={14} />}
              loading={saving}
              disabled={!hasChanges || loading}
              onClick={() => void handleSave()}
            >
              Save Permissions
            </Button>
          </Group>
        </Group>

        {!loading && !adminGroup && (
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            ADMIN_GROUP is not configured in environment variables. Ensure at least one
            group is assigned to <code>admin.portal.manage</code> before logging out.
          </Alert>
        )}

        {!keycloakGroupsAvailable && (
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            Keycloak groups could not be loaded. Existing mappings remain intact.
          </Alert>
        )}

        {errorMessage && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {errorMessage}
          </Alert>
        )}

        {loading ? (
          <Group py="lg" justify="center">
            <Loader size="sm" color="cyan" />
            <Text size="sm" c="dimmed">
              Loading permissions...
            </Text>
          </Group>
        ) : (
          <Stack gap="xl">
            <div>
              <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="xs">
                Crew Onboarding
              </Text>
              <Table.ScrollContainer minWidth={560}>
                <Table withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w="45%">Setting</Table.Th>
                      <Table.Th>Keycloak Group</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" fw={600}>
                            Crew Base Group
                          </Text>
                          <Code fz="xs">crewGroup</Code>
                          <InfoTooltip label="Keycloak group assigned when promoting a user to Crew and removed on offboarding." />
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          aria-label="Crew Onboarding Keycloak Group"
                          placeholder="Select Keycloak group…"
                          data={groupOptions}
                          value={crewGroup}
                          onChange={(val) =>
                            setCrewGroup(val ? normalizeGroupIdentifier(val) : null)
                          }
                          searchable
                          clearable
                          nothingFoundMessage="No matching group found"
                          size="xs"
                        />
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </div>

            {PERMISSION_SECTIONS.map((section) => {
              const items = PERMISSION_DEFINITIONS.filter((d) => d.section === section);
              return (
                <div key={section}>
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="xs">
                    {section}
                  </Text>
                  <Table.ScrollContainer minWidth={560}>
                    <Table withTableBorder>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th w="45%">Permission</Table.Th>
                          <Table.Th>Keycloak Groups</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {items.map((def) => (
                          <Table.Tr key={def.key}>
                            <Table.Td>
                              <Group gap={6} wrap="wrap">
                                <Text size="sm" fw={600}>
                                  {def.label}
                                </Text>
                                <Code fz="xs">{def.key}</Code>
                                <InfoTooltip label={def.description} />
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <MultiSelect
                                aria-label={`Keycloak groups for ${def.label}`}
                                placeholder="Select Keycloak groups…"
                                data={groupOptions}
                                value={mappings[def.key] || []}
                                onChange={(vals) =>
                                  handleChangePermissionGroups(def.key, vals)
                                }
                                searchable
                                clearable
                                nothingFoundMessage="No matching group found"
                                size="xs"
                              />
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </div>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
