'use client';

import React from 'react';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';

export function notifySuccess(message: string, title = 'Saved') {
  notifications.show({
    title,
    message,
    color: 'teal',
    icon: <IconCheck size={16} />,
    autoClose: 3500,
  });
}

export function notifyError(message: string, title = 'Error') {
  notifications.show({
    title,
    message,
    color: 'red',
    icon: <IconAlertCircle size={16} />,
    autoClose: 5000,
  });
}
