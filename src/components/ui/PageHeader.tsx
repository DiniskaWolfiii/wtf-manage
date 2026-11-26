'use client';

import React from 'react';
import { Badge, Group, Title } from '@mantine/core';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

export function PageHeader({
  title,
  badge,
  badgeColor = 'gray',
  tooltip,
  actions,
}: {
  title: string;
  badge?: React.ReactNode;
  badgeColor?: string;
  tooltip?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
      <Group gap="xs" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
        <Title order={2} fz="xl" fw={700} c="var(--mantine-color-white)">
          {title}
        </Title>
        {badge !== undefined && badge !== null && (
          <Badge
            variant="light"
            color={badgeColor}
            size="sm"
            style={{ flexShrink: 0 }}
          >
            {badge}
          </Badge>
        )}
        {tooltip && <InfoTooltip label={tooltip} />}
      </Group>
      {actions && (
        <Group gap="xs" wrap="wrap">
          {actions}
        </Group>
      )}
    </Group>
  );
}
