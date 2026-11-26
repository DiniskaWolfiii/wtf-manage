'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCode,
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react';
import { PageHeader } from '@/components/ui/PageHeader';

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

  const defaultCategory =
    allowedCategories.length > 1 ? 'all' : (allowedCategories[0] ?? 'fr');

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
  const [metadataLog, setMetadataLog] = useState<AuditLogItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchLogs = useCallback(
    async (targetPage: number) => {
      const params = new URLSearchParams();
      params.set('category', category);
      params.set('action', action);
      if (debouncedSearchQuery.trim()) params.set('q', debouncedSearchQuery.trim());
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('page', String(targetPage));
      params.set('pageSize', String(pageSize));

      try {
        const res = await fetch(`/api/logs?${params.toString()}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        setErrorMessage(null);
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
    [category, action, debouncedSearchQuery, fromDate, toDate, pageSize]
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
        setErrorMessage(null);
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

  return (
    <>
      <Stack gap="lg">
        <PageHeader
          title="Audit Logs"
          badge={`${total} total`}
          actions={
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
          }
        />

        <Paper p="md" withBorder>
          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select
              label="Category"
              size="xs"
              data={categoryOptions}
              value={category}
              onChange={(val) => {
                setCategory(val || defaultCategory);
                setPage(1);
              }}
              disabled={categoryOptions.length <= 1}
              miw={170}
            />
            <Select
              label="Action"
              size="xs"
              data={actionOptions}
              value={action}
              onChange={(val) => {
                setAction(val || 'all');
                setPage(1);
              }}
              searchable
              miw={190}
            />
            <TextInput
              label="Search"
              size="xs"
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
              size="xs"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              miw={135}
            />
            <TextInput
              label="To"
              size="xs"
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              miw={135}
            />
          </Group>
        </Paper>

        {errorMessage && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {errorMessage}
          </Alert>
        )}

        <Paper p="lg" withBorder>
          {loading ? (
            <Group justify="center" gap="sm" py="xl">
              <Loader size="sm" color="cyan" />
              <Text size="sm" c="dimmed">
                Loading audit logs...
              </Text>
            </Group>
          ) : logs.length === 0 ? (
            <Text size="sm" c="dimmed" py="lg" ta="center">
              No audit log entries match your current filters.
            </Text>
          ) : (
            <Stack gap="md">
              <Table.ScrollContainer minWidth={780}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Time</Table.Th>
                      <Table.Th>Category</Table.Th>
                      <Table.Th>Action</Table.Th>
                      <Table.Th>Summary</Table.Th>
                      <Table.Th>Actor / Target</Table.Th>
                      <Table.Th ta="right">Metadata</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {logs.map((log) => {
                      const hasMetadata = Boolean(
                        log.metadata && Object.keys(log.metadata).length > 0
                      );
                      return (
                        <Table.Tr key={log.id}>
                          <Table.Td style={{ whiteSpace: 'nowrap' }}>
                            <Text size="xs" c="dimmed">
                              {new Date(log.createdAt).toLocaleString()}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              size="xs"
                              color={CATEGORY_COLORS[log.category] || 'gray'}
                            >
                              {log.category.toUpperCase()}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Code fz="xs">{log.action}</Code>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{log.summary}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs">
                              {log.actorUsername || log.actorUserId || 'System'}
                            </Text>
                            {log.targetLabel && (
                              <Text size="xs" c="dimmed">
                                → {log.targetLabel}
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td ta="right">
                            {hasMetadata ? (
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="View metadata"
                                title="View metadata"
                                onClick={() => setMetadataLog(log)}
                              >
                                <IconCode size={14} />
                              </ActionIcon>
                            ) : (
                              <Text size="xs" c="dimmed">
                                —
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>

              {total > pageSize && (
                <Group justify="space-between" align="center" wrap="wrap">
                  <Text size="xs" c="dimmed">
                    Page {page} of {totalPages}
                  </Text>
                  <Pagination
                    total={totalPages}
                    value={page}
                    onChange={setPage}
                    size="sm"
                    disabled={loading}
                  />
                </Group>
              )}
            </Stack>
          )}
        </Paper>
      </Stack>

      <Modal
        opened={Boolean(metadataLog)}
        onClose={() => setMetadataLog(null)}
        title={`Event Metadata — ${metadataLog?.action ?? ''}`}
        size="lg"
      >
        {metadataLog?.metadata && (
          <Code block fz="xs">
            {JSON.stringify(metadataLog.metadata, null, 2)}
          </Code>
        )}
      </Modal>
    </>
  );
}
