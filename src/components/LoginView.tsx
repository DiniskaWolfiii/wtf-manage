'use client';

import React, { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Box, Button, Center, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { IconLogin, IconPaw } from '@tabler/icons-react';

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
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--mantine-color-dark-8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <Paper
        p={24}
        radius="md"
        withBorder
        style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-4)',
        }}
      >
        <Stack gap="lg">
          <Group gap="sm">
            <Box
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--mantine-radius-sm)',
                backgroundColor: 'rgba(21, 170, 191, 0.15)',
                border: '1px solid rgba(21, 170, 191, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconPaw size={18} color="var(--mantine-color-cyan-4)" />
            </Box>
            <div>
              <Text size="md" fw={700} c="white">
                WinterFur Manage
              </Text>
              <div className="uppercase-label">WinterFur Identity</div>
            </div>
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
          ) : (
            <Stack gap="xs">
              <Text size="lg" fw={700} c="white">
                {error ? 'Authentication failed' : 'Signed out'}
              </Text>
              <Text size="sm" c="dimmed">
                {error
                  ? 'Could not complete sign-in with WinterFur Identity. Please try again.'
                  : 'You have been signed out of WinterFur Manage and WinterFur Identity.'}
              </Text>
            </Stack>
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
    </Box>
  );
}
