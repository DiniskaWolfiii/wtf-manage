'use client';

import React from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';

export function InfoTooltip({
  label,
  ariaLabel = 'More information',
}: {
  label: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <Tooltip label={label} multiline maw={320} withArrow position="top">
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={ariaLabel}
        style={{ flexShrink: 0 }}
      >
        <IconInfoCircle size={15} />
      </ActionIcon>
    </Tooltip>
  );
}
