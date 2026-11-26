'use client';

import React, { useState } from 'react';
import {
  Badge,
  Button,
  Divider,
  Grid,
  Group,
  Modal,
  Paper,
  Pill,
  Stack,
  Text,
} from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import type { UserCrewRole } from '@/lib/crew';
import type { UserCrewSkill } from '@/lib/skills';
import type { QuickLink } from '@/lib/portal-config';
import { getSafeExternalUrl } from '@/lib/validation';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

export function CrewDashboardWorkspace({
  nickname,
  quickLinks,
  crewRoles,
  crewSkills,
}: {
  nickname: string;
  quickLinks: QuickLink[];
  crewRoles: UserCrewRole[];
  crewSkills: UserCrewSkill[];
}) {
  const [ndaModalOpen, setNdaModalOpen] = useState(false);

  return (
    <>
      <Stack gap="lg">
        <PageHeader title="Crew Dashboard" />

        <Grid gap="lg" align="start">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="lg">
              <Paper p="lg" withBorder>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs">
                    <Text size="sm" fw={700}>
                      Volunteer Agreement (NDA)
                    </Text>
                    <Badge color="cyan" size="xs">
                      v2.1
                    </Badge>
                  </Group>
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => setNdaModalOpen(true)}
                  >
                    View
                  </Button>
                </Group>
              </Paper>

              <Paper p="lg" withBorder>
                <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="sm">
                  Quick Links
                </Text>
                {quickLinks.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    No quick links configured.
                  </Text>
                ) : (
                  <Group gap="xs">
                    {quickLinks.map((q) => {
                      const safeHref = getSafeExternalUrl(q.url);
                      if (!safeHref) return null;
                      return (
                        <Button
                          key={q.id}
                          component="a"
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="default"
                          size="xs"
                          radius="xl"
                          leftSection={<span style={{ fontSize: 13 }}>{q.icon}</span>}
                          rightSection={<IconExternalLink size={12} />}
                        >
                          {q.title}
                        </Button>
                      );
                    })}
                  </Group>
                )}
              </Paper>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <Paper p="lg" withBorder>
              <Stack gap="md">
                <div>
                  <Group gap={6} mb="xs">
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                      My Crew Roles
                    </Text>
                    <InfoTooltip label="Assigned and audited by Furry Resources (FR)." />
                  </Group>
                  {crewRoles.length > 0 ? (
                    <Group gap="xs">
                      {crewRoles.map((role) => (
                        <Pill key={role.departmentId} size="md">
                          {role.position
                            ? `${role.departmentName} · ${role.position}`
                            : role.departmentName}
                        </Pill>
                      ))}
                    </Group>
                  ) : (
                    <Text size="xs" c="dimmed">
                      No departments assigned yet.
                    </Text>
                  )}
                </div>

                <Divider />

                <div>
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="xs">
                    My Skills
                  </Text>
                  {crewSkills.length > 0 ? (
                    <Group gap="xs">
                      {crewSkills.map((skill) => (
                        <Pill key={skill.skillId} size="md">
                          {skill.skillName} · {skill.level}
                        </Pill>
                      ))}
                    </Group>
                  ) : (
                    <Text size="xs" c="dimmed">
                      No skills assigned yet.
                    </Text>
                  )}
                </div>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      </Stack>

      <Modal
        opened={ndaModalOpen}
        onClose={() => setNdaModalOpen(false)}
        title="Volunteer Agreement & Confidentiality"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            <strong style={{ color: 'var(--mantine-color-white)' }}>1. Confidentiality:</strong>{' '}
            You agree to treat all attendee data, internal planning and event details strictly
            confidentially.
          </Text>
          <Text size="sm" c="dimmed">
            <strong style={{ color: 'var(--mantine-color-white)' }}>2. Data Protection:</strong>{' '}
            Personal data may only be accessed for your assigned tasks.
          </Text>
          <Text size="sm" c="dimmed">
            <strong style={{ color: 'var(--mantine-color-white)' }}>3. Code of Conduct:</strong>{' '}
            You represent WinterFur and adhere to all safety guidelines.
          </Text>
          <Divider my="xs" />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Signed by{' '}
              <strong style={{ color: 'var(--mantine-color-white)' }}>{nickname}</strong>
            </Text>
            <Button variant="default" size="xs" onClick={() => setNdaModalOpen(false)}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
