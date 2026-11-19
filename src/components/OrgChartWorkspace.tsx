'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconBuilding,
  IconFocusCentered,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSitemap,
  IconUsersGroup,
} from '@tabler/icons-react';
import { getSafeAvatarUrl } from '@/lib/validation';

interface OrgChartMember {
  userId: string;
  username: string;
  avatarUrl?: string;
  position: string;
  isLead: boolean;
}

interface OrgChartDepartment {
  id: number;
  name: string;
  parentDepartmentId: number | null;
  members: OrgChartMember[];
}

interface OrgTreeNode extends OrgChartDepartment {
  children: OrgTreeNode[];
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 1.8;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function buildDepartmentTree(departments: OrgChartDepartment[]): OrgTreeNode[] {
  const nodeMap = new Map<number, OrgTreeNode>();
  for (const d of departments) {
    nodeMap.set(d.id, { ...d, children: [] });
  }

  const wouldCycle = (childId: number, parentId: number): boolean => {
    const seen = new Set<number>([childId]);
    let curr: number | null = parentId;
    while (curr !== null) {
      if (seen.has(curr)) return true;
      seen.add(curr);
      curr = nodeMap.get(curr)?.parentDepartmentId ?? null;
    }
    return false;
  };

  const roots: OrgTreeNode[] = [];
  for (const d of departments) {
    const node = nodeMap.get(d.id)!;
    if (
      d.parentDepartmentId &&
      nodeMap.has(d.parentDepartmentId) &&
      !wouldCycle(d.id, d.parentDepartmentId)
    ) {
      nodeMap.get(d.parentDepartmentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function filterTree(nodes: OrgTreeNode[], query: string): OrgTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const result: OrgTreeNode[] = [];
  for (const node of nodes) {
    const deptMatches = node.name.toLowerCase().includes(q);
    const matchingMembers = node.members.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        m.position.toLowerCase().includes(q)
    );
    const filteredChildren = filterTree(node.children, query);

    if (deptMatches || matchingMembers.length > 0 || filteredChildren.length > 0) {
      result.push({
        ...node,
        members: deptMatches
          ? node.members
          : matchingMembers.length > 0
          ? matchingMembers
          : node.members,
        children:
          deptMatches && filteredChildren.length === 0 ? node.children : filteredChildren,
      });
    }
  }
  return result;
}

function OrgDepartmentBranch({
  node,
  depth = 0,
}: {
  node: OrgTreeNode;
  depth?: number;
}) {
  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {/* Vertical connector from parent */}
      <Box
        style={{
          width: 2,
          height: 20,
          backgroundColor: 'var(--mantine-color-dark-4)',
        }}
      />

      <Paper
        p={20}
        radius="md"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor:
            depth === 0 ? 'var(--mantine-color-cyan-8)' : 'var(--mantine-color-dark-4)',
          width: 300,
        }}
      >
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="xs" style={{ minWidth: 0 }}>
              <IconBuilding size={16} color="var(--mantine-color-cyan-4)" />
              <Text size="md" fw={700} c="white" truncate>
                {node.name}
              </Text>
            </Group>
            <Badge size="xs" variant="light" color="gray">
              <Group gap={4} wrap="nowrap">
                <IconUsersGroup size={12} />
                <span>{node.members.length}</span>
              </Group>
            </Badge>
          </Group>

          {node.members.length === 0 ? (
            <Text size="xs" c="dimmed">
              No members assigned yet.
            </Text>
          ) : (
            <Stack gap="xs">
              {node.members.map((member) => {
                const safeAvatar = getSafeAvatarUrl(member.avatarUrl);
                return (
                  <Paper
                    key={member.userId}
                    p="sm"
                    radius="sm"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-6)',
                      borderColor: member.isLead
                        ? 'rgba(21, 170, 191, 0.45)'
                        : 'var(--mantine-color-dark-4)',
                    }}
                  >
                    <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                      <Group gap="sm" style={{ minWidth: 0, flex: 1 }}>
                        <Avatar
                          src={safeAvatar ?? undefined}
                          radius="xl"
                          size="sm"
                          color="cyan"
                        >
                          {member.username.slice(0, 2).toUpperCase()}
                        </Avatar>
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} c="white" truncate>
                            {member.username}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {member.position}
                          </Text>
                        </div>
                      </Group>
                      {member.isLead && (
                        <Badge size="xs" variant="light" color="cyan">
                          Lead
                        </Badge>
                      )}
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Render child departments recursively underneath */}
      {node.children.length > 0 && (
        <Box
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Box
            style={{
              width: 2,
              height: 20,
              backgroundColor: 'var(--mantine-color-dark-4)',
            }}
          />
          {node.children.length > 1 && (
            <Box
              style={{
                width: 'calc(100% - 300px)',
                minWidth: 120,
                height: 2,
                backgroundColor: 'var(--mantine-color-dark-4)',
              }}
            />
          )}
          <Box
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              justifyContent: 'center',
              alignItems: 'flex-start',
              gap: 24,
            }}
          >
            {node.children.map((child) => (
              <OrgDepartmentBranch key={child.id} node={child} depth={depth + 1} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export function OrgChartWorkspace() {
  const [loading, setLoading] = useState(true);
  const [conventionName, setConventionName] = useState('WinterFur');
  const [totalCrewMembers, setTotalCrewMembers] = useState(0);
  const [departments, setDepartments] = useState<OrgChartDepartment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Interactive pan & zoom state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 24, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const loadOrgChart = useCallback(async () => {
    setErrorMessage(null);
    try {
      const res = await fetch('/api/crew/org-chart', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to load org chart.');
        return;
      }
      if (typeof data.conventionName === 'string' && data.conventionName) {
        setConventionName(data.conventionName);
      }
      setTotalCrewMembers(typeof data.totalCrewMembers === 'number' ? data.totalCrewMembers : 0);
      setDepartments(Array.isArray(data.departments) ? data.departments : []);
    } catch {
      setErrorMessage('Network error while loading org chart.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/crew/org-chart', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMessage(data.error || 'Failed to load org chart.');
          return;
        }
        if (typeof data.conventionName === 'string' && data.conventionName) {
          setConventionName(data.conventionName);
        }
        setTotalCrewMembers(
          typeof data.totalCrewMembers === 'number' ? data.totalCrewMembers : 0
        );
        setDepartments(Array.isArray(data.departments) ? data.departments : []);
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Network error while loading org chart.');
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

  const filteredTree = useMemo(() => {
    const fullTree = buildDepartmentTree(departments);
    return filterTree(fullTree, searchQuery);
  }, [departments, searchQuery]);

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const cRect = container.getBoundingClientRect();
    const contentW = content.scrollWidth;
    const contentH = content.scrollHeight;
    if (cRect.width <= 0 || cRect.height <= 0 || contentW <= 0 || contentH <= 0) {
      return;
    }

    const padding = 40;
    const availW = Math.max(100, cRect.width - padding * 2);
    const availH = Math.max(100, cRect.height - padding * 2);
    const nextScale = clampScale(Math.min(1, availW / contentW, availH / contentH));

    const scaledW = contentW * nextScale;
    const scaledH = contentH * nextScale;
    const nextX = (cRect.width - scaledW) / 2;
    const nextY = Math.max(24, (cRect.height - scaledH) / 2);

    setTransform({ x: nextX, y: nextY, scale: nextScale });
  }, []);

  // Auto-fit when data loads or search changes
  useEffect(() => {
    if (loading || departments.length === 0) return;
    const frame = requestAnimationFrame(() => {
      fitToView();
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, departments.length, filteredTree, fitToView]);

  // Refit on window resize
  useEffect(() => {
    const onResize = () => fitToView();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitToView]);

  // Non-passive wheel listener for smooth mouse-wheel zoom toward cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

      setTransform((prev) => {
        const nextScale = clampScale(prev.scale * factor);
        const ratio = nextScale / prev.scale;
        return {
          scale: nextScale,
          x: cursorX - (cursorX - prev.x) * ratio,
          y: cursorY - (cursorY - prev.y) * ratio,
        };
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [loading, departments.length]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Do not hijack clicks on buttons inside the floating toolbar
    if ((e.target as HTMLElement).closest('button')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: transform.x,
      originY: transform.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setTransform((prev) => ({
      ...prev,
      x: drag.originX + dx,
      y: drag.originY + dy,
    }));
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const zoomBy = (factor: number) => {
    const container = containerRef.current;
    if (!container) {
      setTransform((prev) => ({ ...prev, scale: clampScale(prev.scale * factor) }));
      return;
    }
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setTransform((prev) => {
      const nextScale = clampScale(prev.scale * factor);
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
  };

  return (
    <Stack gap={20}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Text size="xl" fw={700} c="white">
            Org Chart
          </Text>
          <Text size="sm" c="dimmed">
            Drag to pan, scroll to zoom, or fit to window
          </Text>
        </div>
        <Group gap="xs" wrap="wrap">
          <TextInput
            placeholder="Search department, user, or role..."
            leftSection={<IconSearch size={14} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="xs"
            style={{ minWidth: 220 }}
          />
          <Button
            variant="default"
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={() => {
              setLoading(true);
              void loadOrgChart();
            }}
            loading={loading}
          >
            Refresh
          </Button>
        </Group>
      </Group>

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

      {loading ? (
        <Paper
          p={24}
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
              Loading org chart...
            </Text>
          </Group>
        </Paper>
      ) : departments.length === 0 ? (
        <Paper
          p={24}
          radius="md"
          withBorder
          style={{
            backgroundColor: 'var(--mantine-color-dark-7)',
            borderColor: 'var(--mantine-color-dark-4)',
          }}
        >
          <Text size="sm" c="dimmed" ta="center">
            No departments have been created yet.
          </Text>
        </Paper>
      ) : (
        <Paper
          ref={containerRef}
          radius="md"
          withBorder
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
          style={{
            position: 'relative',
            overflow: 'hidden',
            height: 'calc(100vh - 188px)',
            minHeight: 440,
            backgroundColor: 'var(--mantine-color-dark-8)',
            borderColor: 'var(--mantine-color-dark-4)',
            backgroundImage:
              'radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          {/* Floating Zoom & Fit Toolbar */}
          <Paper
            p={6}
            radius="sm"
            withBorder
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 10,
              backgroundColor: 'var(--mantine-color-dark-7)',
              borderColor: 'var(--mantine-color-dark-4)',
            }}
          >
            <Group gap={4} wrap="nowrap">
              <Tooltip label="Zoom out">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Zoom out"
                  onClick={() => zoomBy(1 / 1.2)}
                >
                  <IconMinus size={14} />
                </ActionIcon>
              </Tooltip>
              <Text size="xs" fw={600} c="dimmed" style={{ minWidth: 42, textAlign: 'center' }}>
                {Math.round(transform.scale * 100)}%
              </Text>
              <Tooltip label="Zoom in">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Zoom in"
                  onClick={() => zoomBy(1.2)}
                >
                  <IconPlus size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Fit to window">
                <ActionIcon
                  variant="subtle"
                  color="cyan"
                  size="sm"
                  aria-label="Fit to window"
                  onClick={fitToView}
                >
                  <IconFocusCentered size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Paper>

          {/* Transformable Org Tree Canvas */}
          <Box
            ref={contentRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transformOrigin: '0 0',
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
              transition: isDragging ? 'none' : 'transform 120ms ease-out',
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 16,
            }}
          >
            {/* Root Node */}
            <Paper
              p="md"
              px="xl"
              radius="md"
              withBorder
              style={{
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderColor: 'var(--mantine-color-cyan-7)',
                minWidth: 260,
                textAlign: 'center',
              }}
            >
              <Group justify="center" gap="xs" mb={4}>
                <IconSitemap size={18} color="var(--mantine-color-cyan-4)" />
                <Text size="md" fw={700} c="white">
                  {conventionName} Crew
                </Text>
              </Group>
              <Group justify="center" gap="xs">
                <Badge size="xs" variant="light" color="cyan">
                  {departments.length} Departments
                </Badge>
                <Badge size="xs" variant="light" color="teal">
                  {totalCrewMembers} Assigned Crew
                </Badge>
              </Group>
            </Paper>

            {filteredTree.length === 0 ? (
              <Paper
                p={24}
                mt={24}
                radius="md"
                withBorder
                style={{
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  borderColor: 'var(--mantine-color-dark-4)',
                  minWidth: 300,
                }}
              >
                <Text size="sm" c="dimmed" ta="center">
                  No departments or members match &ldquo;{searchQuery.trim()}&rdquo;.
                </Text>
              </Paper>
            ) : (
              <Box
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <Box
                  style={{
                    width: 2,
                    height: 20,
                    backgroundColor: 'var(--mantine-color-dark-4)',
                  }}
                />
                {filteredTree.length > 1 && (
                  <Box
                    style={{
                      width: 'calc(100% - 300px)',
                      minWidth: 120,
                      height: 2,
                      backgroundColor: 'var(--mantine-color-dark-4)',
                    }}
                  />
                )}
                <Box
                  style={{
                    display: 'flex',
                    flexWrap: 'nowrap',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    gap: 24,
                  }}
                >
                  {filteredTree.map((rootNode) => (
                    <OrgDepartmentBranch key={rootNode.id} node={rootNode} depth={0} />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Paper>
      )}
    </Stack>
  );
}
