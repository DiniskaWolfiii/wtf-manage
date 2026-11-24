'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { IconCheck, IconRefresh, IconShieldLock } from '@tabler/icons-react';
import {
  DEFAULT_PERMISSION_MAPPINGS,
  PERMISSION_DEFINITIONS,
  PERMISSION_SECTIONS,
  normalizeGroupIdentifier,
  type PermissionMappings,
  type PortalPermission,
} from '@/lib/permission-types';

interface KeycloakGroupItem {
  id: string;
  name: string;
  path: string;
}

export function AdminPermissionsMapping() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mappings, setMappings] = useState<PermissionMappings>(DEFAULT_PERMISSION_MAPPINGS);
  const [savedMappings, setSavedMappings] = useState<PermissionMappings>(DEFAULT_PERMISSION_MAPPINGS);
  const [adminGroup, setAdminGroup] = useState('winterfur-admin');
  const [keycloakGroups, setKeycloakGroups] = useState<KeycloakGroupItem[]>([]);
  const [keycloakGroupsAvailable, setKeycloakGroupsAvailable] = useState(true);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/permissions', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setStatus({
          type: 'error',
          text: data.error || 'Failed to load permission mappings.',
        });
        return;
      }

      if (data.mappings) {
        setMappings(data.mappings);
        setSavedMappings(data.mappings);
      }
      if (typeof data.adminGroup === 'string' && data.adminGroup) {
        setAdminGroup(data.adminGroup);
      }
      setKeycloakGroups(Array.isArray(data.keycloakGroups) ? data.keycloakGroups : []);
      setKeycloakGroupsAvailable(Boolean(data.keycloakGroupsAvailable));
    } catch {
      setStatus({
        type: 'error',
        text: 'Network error while loading permission mappings.',
      });
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
        if (!res.ok) {
          setStatus({
            type: 'error',
            text: data.error || 'Failed to load permission mappings.',
          });
          return;
        }
        if (data.mappings) {
          setMappings(data.mappings);
          setSavedMappings(data.mappings);
        }
        if (typeof data.adminGroup === 'string' && data.adminGroup) {
          setAdminGroup(data.adminGroup);
        }
        setKeycloakGroups(Array.isArray(data.keycloakGroups) ? data.keycloakGroups : []);
        setKeycloakGroupsAvailable(Boolean(data.keycloakGroupsAvailable));
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({
            type: 'error',
            text: 'Network error while loading permission mappings.',
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

  const groupOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of keycloakGroups) {
      const normalized = normalizeGroupIdentifier(g.path || g.name);
      if (normalized) {
        map.set(normalized, g.path || `/${normalized}`);
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
  }, [keycloakGroups, mappings]);

  const hasChanges = useMemo(
    () => JSON.stringify(mappings) !== JSON.stringify(savedMappings),
    [mappings, savedMappings]
  );

  const handleChangePermissionGroups = (permission: PortalPermission, values: string[]) => {
    setMappings((prev) => ({
      ...prev,
      [permission]: values.map(normalizeGroupIdentifier).filter(Boolean),
    }));
    setStatus(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({
          type: 'error',
          text: data.error || 'Failed to save permission mappings.',
        });
        return;
      }
      if (data.mappings) {
        setMappings(data.mappings);
        setSavedMappings(data.mappings);
      }
      setStatus({
        type: 'success',
        text: 'Permission mappings saved and active immediately.',
      });
    } catch {
      setStatus({
        type: 'error',
        text: 'Network error while saving permission mappings.',
      });
    } finally {
      setSaving(false);
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
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Group gap="xs" mb={4}>
              <IconShieldLock size={18} color="var(--mantine-color-cyan-4)" />
              <Text fw={700} size="md" c="white">
                Permissions &amp; Keycloak Groups
              </Text>
              <Badge variant="light" color="cyan" size="xs">
                Super Admin: /{adminGroup}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Map Keycloak groups to portal pages and actions. The configured super-admin group
              (ADMIN_GROUP) always retains full access.
            </Text>
          </div>

          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                setLoading(true);
                setStatus(null);
                void loadPermissions();
              }}
              disabled={loading || saving}
            >
              Reload Groups
            </Button>
            <Button
              size="xs"
              color="cyan"
              leftSection={<IconCheck size={14} />}
              loading={saving}
              disabled={!hasChanges || loading}
              onClick={handleSave}
            >
              Save Permissions
            </Button>
          </Group>
        </Group>

        {!keycloakGroupsAvailable && (
          <Paper
            p="sm"
            radius="sm"
            withBorder
            style={{
              backgroundColor: 'rgba(250, 176, 5, 0.08)',
              borderColor: 'var(--mantine-color-yellow-7)',
            }}
          >
            <Text size="xs" c="yellow.3">
              Keycloak groups could not be loaded. Existing mappings remain intact.
            </Text>
          </Paper>
        )}

        {status && (
          <Paper
            p="sm"
            radius="sm"
            withBorder
            style={{
              backgroundColor:
                status.type === 'error' ? 'rgba(250, 82, 82, 0.1)' : 'rgba(18, 184, 134, 0.1)',
              borderColor:
                status.type === 'error'
                  ? 'var(--mantine-color-red-7)'
                  : 'var(--mantine-color-teal-7)',
            }}
          >
            <Text size="xs" c={status.type === 'error' ? 'red.3' : 'teal.3'}>
              {status.text}
            </Text>
          </Paper>
        )}

        {loading ? (
          <Group py="md" justify="center">
            <Loader size="sm" color="cyan" />
            <Text size="sm" c="dimmed">
              Loading permissions and Keycloak groups…
            </Text>
          </Group>
        ) : (
          <Stack gap="lg">
            {PERMISSION_SECTIONS.map((section, idx) => {
              const items = PERMISSION_DEFINITIONS.filter((d) => d.section === section);
              return (
                <Stack key={section} gap="sm">
                  {idx > 0 && <Divider color="var(--mantine-color-dark-4)" />}
                  <div className="uppercase-label">{section}</div>
                  <Stack gap="xs">
                    {items.map((def) => (
                      <Paper
                        key={def.key}
                        p="sm"
                        radius="sm"
                        withBorder
                        style={{
                          backgroundColor: 'var(--mantine-color-dark-6)',
                          borderColor: 'var(--mantine-color-dark-4)',
                        }}
                      >
                        <Group justify="space-between" align="center" wrap="wrap" gap="md">
                          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                            <Group gap="xs" mb={2}>
                              <Text size="sm" fw={600} c="white">
                                {def.label}
                              </Text>
                              <Badge variant="outline" color="gray" size="xs">
                                {def.key}
                              </Badge>
                            </Group>
                            <Text size="xs" c="dimmed">
                              {def.description}
                            </Text>
                          </div>

                          <MultiSelect
                            aria-label={`Keycloak groups for ${def.label}`}
                            placeholder="Select Keycloak groups…"
                            data={groupOptions}
                            value={mappings[def.key] || []}
                            onChange={(vals) => handleChangePermissionGroups(def.key, vals)}
                            searchable
                            clearable
                            nothingFoundMessage="No matching group found"
                            style={{ flex: '1 1 320px', minWidth: 240 }}
                            size="xs"
                          />
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
