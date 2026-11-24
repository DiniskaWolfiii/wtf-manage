'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconHistory,
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react';

interface AuditLogItem {
  id: number;
  category: 'fr' | 'admin' | 'profile';
  action: string;
  actorUserId: string | null;
  actorUsername: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  fr: 'cyan',
  admin: 'teal',
  profile: 'gray',
};

export function AuditLogsWorkspace({
  canViewFr,
  canViewAdmin,
  canViewAll,
}: {
  canViewFr: boolean;
  canViewAdmin: boolean;
  canViewAll: boolean;
}) {
  const allowedCategories = useMemo(() => {
    if (canViewAll) {
      return ['fr', 'admin', 'profile'] as const;
    }
    const list: Array<'fr' | 'admin'> = [];
    if (canViewFr) list.push('fr');
    if (canViewAdmin) list.push('admin');
    return list;
  }, [canViewAll, canViewFr, canViewAdmin]);

  const defaultCategory = allowedCategories.length > 1 ? 'all' : (allowedCategories[0] ?? 'fr');

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [category, setCategory] = useState<string>(defaultCategory);
  const [action, setAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchLogs = useCallback(
    async (targetPage: number) => {
      setErrorMessage(null);
      const params = new URLSearchParams();
      params.set('category', category);
      params.set('action', action);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('page', String(targetPage));
      params.set('pageSize', String(pageSize));

      try {
        const res = await fetch(`/api/logs?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.error || 'Failed to load audit logs.');
          return;
        }
        setLogs(Array.isArray(data.logs) ? data.logs : []);
        setTotal(typeof data.total === 'number' ? data.total : 0);
        setAvailableActions(
          Array.isArray(data.availableActions) ? data.availableActions : []
        );
      } catch {
        setErrorMessage('Network error while loading audit logs.');
      } finally {
        setLoading(false);
      }
    },
    [category, action, searchQuery, fromDate, toDate, pageSize]
  );

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set('category', category);
    params.set('action', action);
    if (debouncedSearchQuery.trim()) params.set('q', debouncedSearchQuery.trim());
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    fetch(`/api/logs?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMessage(data.error || 'Failed to load audit logs.');
          return;
        }
        setLogs(Array.isArray(data.logs) ? data.logs : []);
        setTotal(typeof data.total === 'number' ? data.total : 0);
        setAvailableActions(
          Array.isArray(data.availableActions) ? data.availableActions : []
        );
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Network error while loading audit logs.');
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
  }, [category, action, debouncedSearchQuery, fromDate, toDate, page, pageSize]);

  const categoryOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    if (allowedCategories.length > 1) {
      opts.push({ value: 'all', label: 'All Permitted Categories' });
    }
    if (canViewAll || canViewFr) {
      opts.push({ value: 'fr', label: 'Furry Resources (FR)' });
    }
    if (canViewAll || canViewAdmin) {
      opts.push({ value: 'admin', label: 'Administration' });
    }
    if (canViewAll) {
      opts.push({ value: 'profile', label: 'Profile & Security' });
    }
    return opts;
  }, [allowedCategories.length, canViewAll, canViewFr, canViewAdmin]);

  const actionOptions = useMemo(
    () => [
      { value: 'all', label: 'All Actions' },
      ...availableActions.map((a) => ({ value: a, label: a })),
    ],
    [availableActions]
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleDetails = (id: number) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Stack gap={24}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Text size="xl" fw={700} c="white">
            Audit Logs
          </Text>
          <Text size="sm" c="dimmed">
            {canViewAll
              ? 'Complete activity history across FR, Administration, and Profile'
              : canViewFr && canViewAdmin
              ? 'Activity history for Furry Resources and Administration'
              : canViewAdmin
              ? 'Activity history for Administration and Portal Settings'
              : 'Activity history for Furry Resources (crew promotions, roles, and departments)'}
          </Text>
        </div>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconRefresh size={14} />}
          onClick={() => {
            setLoading(true);
            void fetchLogs(page);
          }}
          loading={loading}
        >
          Refresh
        </Button>
      </Group>

      {/* Filter Bar */}
      <Paper
        p={24}
        radius="md"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-4)',
        }}
      >
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Category"
            data={categoryOptions}
            value={category}
            onChange={(val) => {
              setCategory(val || defaultCategory);
              setPage(1);
            }}
            disabled={categoryOptions.length <= 1}
            style={{ minWidth: 180 }}
          />
          <Select
            label="Action"
            data={actionOptions}
            value={action}
            onChange={(val) => {
              setAction(val || 'all');
              setPage(1);
            }}
            searchable
            style={{ minWidth: 200 }}
          />
          <TextInput
            label="Search"
            placeholder="Actor, target, or summary..."
            leftSection={<IconSearch size={14} />}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            style={{ flex: 1, minWidth: 200 }}
          />
          <TextInput
            label="From"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: 140 }}
          />
          <TextInput
            label="To"
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: 140 }}
          />
        </Group>
      </Paper>

      {errorMessage && (
        <Paper
          p="sm"
          radius="sm"
          withBorder
          style={{
            backgroundColor: 'rgba(250, 82, 82, 0.1)',
            borderColor: 'rgba(250, 82, 82, 0.35)',
          }}
        >
          <Text size="xs" fw={600} c="red.4">
            {errorMessage}
          </Text>
        </Paper>
      )}

      {/* Logs List */}
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
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <IconHistory size={18} color="var(--mantine-color-cyan-4)" />
              <Text size="md" fw={700} c="white">
                Recorded Events
              </Text>
            </Group>
            <Badge color="cyan" variant="light">
              {total} total
            </Badge>
          </Group>

          {loading ? (
            <Group justify="center" gap="sm" py="xl">
              <Loader size="sm" color="cyan" />
              <Text size="sm" c="dimmed">
                Loading audit logs...
              </Text>
            </Group>
          ) : logs.length === 0 ? (
            <Text size="sm" c="dimmed" py="md" ta="center">
              No audit log entries match your current filters.
            </Text>
          ) : (
            <Stack gap="xs">
              {logs.map((log) => {
                const isExpanded = Boolean(expandedIds[log.id]);
                const hasMetadata = Boolean(
                  log.metadata && Object.keys(log.metadata).length > 0
                );
                const formattedTime = new Date(log.createdAt).toLocaleString();

                return (
                  <Paper
                    key={log.id}
                    p="sm"
                    radius="sm"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-6)',
                      borderColor: 'var(--mantine-color-dark-4)',
                    }}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                        <div style={{ flex: 1, minWidth: 240 }}>
                          <Group gap="xs" wrap="wrap" mb={4}>
                            <Badge
                              size="xs"
                              variant="light"
                              color={CATEGORY_COLORS[log.category] || 'gray'}
                            >
                              {log.category.toUpperCase()}
                            </Badge>
                            <Badge size="xs" variant="outline" color="gray">
                              {log.action}
                            </Badge>
                            <Text size="xs" c="dimmed">
                              {formattedTime}
                            </Text>
                          </Group>
                          <Text size="sm" fw={600} c="white">
                            {log.summary}
                          </Text>
                          <Text size="xs" c="dimmed" mt={2}>
                            Actor:{' '}
                            <strong style={{ color: '#fff' }}>
                              {log.actorUsername || log.actorUserId || 'System'}
                            </strong>
                            {log.targetLabel && (
                              <>
                                {' '}
                                • Target:{' '}
                                <strong style={{ color: '#fff' }}>
                                  {log.targetLabel}
                                </strong>
                              </>
                            )}
                          </Text>
                        </div>

                        {hasMetadata && (
                          <Button
                            size="xs"
                            variant="default"
                            rightSection={
                              isExpanded ? (
                                <IconChevronUp size={14} />
                              ) : (
                                <IconChevronDown size={14} />
                              )
                            }
                            onClick={() => toggleDetails(log.id)}
                          >
                            Details
                          </Button>
                        )}
                      </Group>

                      {hasMetadata && isExpanded && (
                        <Code block style={{ fontSize: 12 }}>
                          {JSON.stringify(log.metadata, null, 2)}
                        </Code>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}

          {/* Pagination */}
          {total > pageSize && (
            <Group justify="space-between" align="center" pt="xs">
              <Text size="xs" c="dimmed">
                Page {page} of {totalPages}
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </Group>
            </Group>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
