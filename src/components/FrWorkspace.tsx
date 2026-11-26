'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Stack } from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { FrCrewDetailView } from '@/components/fr/FrCrewDetailView';
import { FrCrewSection } from '@/components/fr/FrCrewSection';
import { FrDepartmentsSection } from '@/components/fr/FrDepartmentsSection';
import { FrSkillsSection } from '@/components/fr/FrSkillsSection';
import { PageHeader } from '@/components/ui/PageHeader';
import { notifyError, notifySuccess } from '@/lib/notify';
import type {
  DepartmentItem,
  FrSection,
  FrStatusMessage,
  FrUserItem,
  SkillCatalogItem,
} from '@/components/fr/types';

const SECTION_TITLES: Record<FrSection, string> = {
  crew: 'Crew Management',
  departments: 'Departments',
  skills: 'Skills',
};

export function FrWorkspace({
  currentUserId,
  isFrAdmin = false,
  canWriteDepartments,
  canWriteSkills,
  section = 'crew',
  detailUserId,
}: {
  currentUserId?: string;
  isFrAdmin?: boolean;
  canWriteDepartments?: boolean;
  canWriteSkills?: boolean;
  section?: FrSection;
  detailUserId?: string;
}) {
  const effectiveCanWriteDepartments = canWriteDepartments ?? isFrAdmin;
  const effectiveCanWriteSkills = canWriteSkills ?? isFrAdmin;
  const [loading, setLoading] = useState(true);
  const [crewGroupConfigured, setCrewGroupConfigured] = useState(true);
  const [users, setUsers] = useState<FrUserItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [skillsCatalog, setSkillsCatalog] = useState<SkillCatalogItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStatusMessage = useCallback((msg: FrStatusMessage | null) => {
    if (!msg) {
      setErrorMessage(null);
      return;
    }
    if (msg.type === 'success') {
      setErrorMessage(null);
      notifySuccess(msg.text);
    } else {
      setErrorMessage(msg.text);
      notifyError(msg.text);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (detailUserId) {
      return;
    }
    try {
      const res = await fetch('/api/fr/crew', { cache: 'no-store' });
      const data = await res.json();
      setErrorMessage(null);
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to load FR crew data.');
        return;
      }
      setCrewGroupConfigured(Boolean(data.crewGroupConfigured));
      setUsers(Array.isArray(data.users) ? data.users : []);
      setDepartments(Array.isArray(data.departments) ? data.departments : []);
      setSkillsCatalog(Array.isArray(data.skillsCatalog) ? data.skillsCatalog : []);
    } catch {
      setErrorMessage('Network error while loading FR crew data.');
    } finally {
      setLoading(false);
    }
  }, [detailUserId]);

  useEffect(() => {
    if (detailUserId) return;
    let cancelled = false;
    fetch('/api/fr/crew', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        setErrorMessage(null);
        if (!res.ok) {
          setErrorMessage(data.error || 'Failed to load FR crew data.');
          return;
        }
        setCrewGroupConfigured(Boolean(data.crewGroupConfigured));
        setUsers(Array.isArray(data.users) ? data.users : []);
        setDepartments(Array.isArray(data.departments) ? data.departments : []);
        setSkillsCatalog(Array.isArray(data.skillsCatalog) ? data.skillsCatalog : []);
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Network error while loading FR crew data.');
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
  }, [detailUserId]);

  if (section === 'crew' && detailUserId) {
    return (
      <FrCrewDetailView
        userId={detailUserId}
        isFrAdmin={isFrAdmin}
        currentUserId={currentUserId}
      />
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title={`Furry Resources — ${SECTION_TITLES[section]}`}
        tooltip={
          section !== 'skills'
            ? 'Changes to Crew status (wtf-crew) or Keycloak-mapped departments take effect for the affected user after a re-login.'
            : undefined
        }
        actions={
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
        }
      />

      {!crewGroupConfigured && !loading && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          Keycloak group <code>wtf-crew</code> was not found. Verify in Keycloak Admin
          that the group exists and the service account has <code>query-groups</code>,{' '}
          <code>view-users</code>, and <code>manage-users</code>.
        </Alert>
      )}

      {errorMessage && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {errorMessage}
        </Alert>
      )}

      {section === 'crew' && !detailUserId && (
        <FrCrewSection
          loading={loading}
          crewGroupConfigured={crewGroupConfigured}
          users={users}
          departments={departments}
          skillsCatalog={skillsCatalog}
          currentUserId={currentUserId}
          isFrAdmin={isFrAdmin}
          onRefresh={loadData}
          onStatusMessage={handleStatusMessage}
        />
      )}

      {section === 'departments' && (
        <FrDepartmentsSection
          loading={loading}
          departments={departments}
          users={users}
          isFrAdmin={effectiveCanWriteDepartments}
          onRefresh={loadData}
          onStatusMessage={handleStatusMessage}
        />
      )}

      {section === 'skills' && (
        <FrSkillsSection
          loading={loading}
          skillsCatalog={skillsCatalog}
          users={users}
          canWrite={effectiveCanWriteSkills}
          onRefresh={loadData}
          onStatusMessage={handleStatusMessage}
        />
      )}
    </Stack>
  );
}
