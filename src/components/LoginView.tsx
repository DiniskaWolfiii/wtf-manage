'use client';

import React, { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconInfoCircle, IconLogin, IconPaw } from '@tabler/icons-react';

interface LoginViewProps {
  callbackUrl: string;
  error?: string;
  loggedOut?: boolean;
}

export function LoginView({ callbackUrl, error, loggedOut }: LoginViewProps) {
  const autoStarted = useRef(false);
  const shouldAutoRedirect = !error && !loggedOut;
  const [isRedirecting, setIsRedirecting] = useState(shouldAutoRedirect);

  const handleSignIn = () => {
    setIsRedirecting(true);
    void signIn('keycloak', { callbackUrl });
  };

  useEffect(() => {
    if (!shouldAutoRedirect || autoStarted.current) {
      return;
    }
    autoStarted.current = true;
    void signIn('keycloak', { callbackUrl });
  }, [shouldAutoRedirect, callbackUrl]);

  return (
    <Box bg="var(--mantine-color-dark-8)" style={{ minHeight: '100vh' }}>
      <Center style={{ minHeight: '100vh', padding: 24 }}>
        <Paper p="xl" withBorder w="100%" maw={420}>
          <Stack gap="lg">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" color="cyan" size="lg" radius="sm">
                <IconPaw size={18} />
              </ThemeIcon>
              <Title order={3} fz="lg" fw={700}>
                WinterFur Manage
              </Title>
            </Group>

            {isRedirecting ? (
              <Center py="md">
                <Stack align="center" gap="sm">
                  <Loader size="sm" color="cyan" />
                  <Text size="sm" c="dimmed" ta="center">
                    Redirecting to WinterFur Identity…
                  </Text>
                </Stack>
              </Center>
            ) : error ? (
              <Alert color="red" icon={<IconAlertCircle size={16} />} title="Authentication failed">
                Could not complete sign-in with WinterFur Identity. Please try again.
              </Alert>
            ) : (
              <Alert color="cyan" icon={<IconInfoCircle size={16} />} title="Signed out">
                You have been signed out of WinterFur Manage.
              </Alert>
            )}

            <Button
              variant="filled"
              fullWidth
              leftSection={<IconLogin size={16} />}
              loading={isRedirecting}
              onClick={handleSignIn}
            >
              Sign in with WinterFur Identity
            </Button>
          </Stack>
        </Paper>
      </Center>
    </Box>
  );
}
