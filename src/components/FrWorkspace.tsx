'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { FrCrewSection } from '@/components/fr/FrCrewSection';
import { FrDepartmentsSection } from '@/components/fr/FrDepartmentsSection';
import { FrSkillsSection } from '@/components/fr/FrSkillsSection';
import type {
  DepartmentItem,
  FrSection,
  FrStatusMessage,
  FrUserItem,
  SkillCatalogItem,
} from '@/components/fr/types';

const SECTION_META: Record<FrSection, { title: string; subtitle: string }> = {
  crew: {
    title: 'Crew Management',
    subtitle: 'Promote crew members, inspect profiles, and assign departments & skills',
  },
  departments: {
    title: 'Departments',
    subtitle: 'Organize departments, hierarchy, and member rankings for the Org Chart',
  },
  skills: {
    title: 'Skills & Catalog',
    subtitle: 'Define FR-managed skills with custom proficiency levels and find qualified crew',
  },
};

export function FrWorkspace({
  currentUserId,
  isFrAdmin = false,
  section = 'crew',
}: {
  currentUserId?: string;
  isFrAdmin?: boolean;
  section?: FrSection;
}) {
  const [loading, setLoading] = useState(true);
  const [crewGroupConfigured, setCrewGroupConfigured] = useState(true);
  const [users, setUsers] = useState<FrUserItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [skillsCatalog, setSkillsCatalog] = useState<SkillCatalogItem[]>([]);
  const [statusMessage, setStatusMessage] = useState<FrStatusMessage | null>(null);

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
      setSkillsCatalog(Array.isArray(data.skillsCatalog) ? data.skillsCatalog : []);
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
        setSkillsCatalog(Array.isArray(data.skillsCatalog) ? data.skillsCatalog : []);
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

  const meta = SECTION_META[section];

  return (
    <Stack gap={24}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Text size="xl" fw={700} c="white">
            Furry Resources — {meta.title}
          </Text>
          <Text size="sm" c="dimmed">
            {meta.subtitle}
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

      {/* Re-login info banner (relevant for Crew & Department Keycloak sync) */}
      {section !== 'skills' && (
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
      )}

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

      {section === 'crew' && (
        <FrCrewSection
          loading={loading}
          crewGroupConfigured={crewGroupConfigured}
          users={users}
          departments={departments}
          skillsCatalog={skillsCatalog}
          currentUserId={currentUserId}
          isFrAdmin={isFrAdmin}
          onRefresh={loadData}
          onStatusMessage={setStatusMessage}
        />
      )}

      {section === 'departments' && (
        <FrDepartmentsSection
          loading={loading}
          departments={departments}
          users={users}
          isFrAdmin={isFrAdmin}
          onRefresh={loadData}
          onStatusMessage={setStatusMessage}
        />
      )}

      {section === 'skills' && (
        <FrSkillsSection
          loading={loading}
          skillsCatalog={skillsCatalog}
          users={users}
          onRefresh={loadData}
          onStatusMessage={setStatusMessage}
        />
      )}
    </Stack>
  );
}
