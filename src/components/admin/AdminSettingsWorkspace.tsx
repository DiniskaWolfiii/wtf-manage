'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ActionIcon,
  Alert,
  Button,
  Grid,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconLink,
  IconPlus,
  IconSettings,
  IconShieldLock,
  IconTrash,
} from '@tabler/icons-react';
import {
  type IdentityDisplayConfig,
  type PortalSettings,
  type QuickLink,
} from '@/lib/portal-config';
import { getSafeExternalUrl } from '@/lib/validation';
import { notifyError, notifySuccess } from '@/lib/notify';
import { PageHeader } from '@/components/ui/PageHeader';
import { AdminDepartmentMapping } from '@/components/AdminDepartmentMapping';
import { AdminPermissionsMapping } from '@/components/AdminPermissionsMapping';

export function AdminSettingsWorkspace({
  conventionName,
  quickLinks,
  identityConfig,
  onSettingsUpdated,
}: {
  conventionName: string;
  quickLinks: QuickLink[];
  identityConfig?: IdentityDisplayConfig;
  onSettingsUpdated: (updated: PortalSettings) => void;
}) {
  const router = useRouter();
  const [nameInput, setNameInput] = useState(conventionName);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [newQl, setNewQl] = useState({ icon: '🔗', title: '', url: '' });
  const [quickLinkUrlError, setQuickLinkUrlError] = useState<string | null>(null);

  const persistSettings = async (
    payload: Partial<PortalSettings>,
    successText: string
  ) => {
    setIsSavingSettings(true);
    setSettingsError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setSettingsError('Failed to save portal settings.');
        notifyError('Failed to save portal settings.');
        return false;
      }
      const updated = (await res.json()) as PortalSettings;
      setNameInput(updated.conventionName);
      onSettingsUpdated(updated);
      notifySuccess(successText);
      router.refresh();
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSettingsError('Error saving portal settings.');
      notifyError('Error saving portal settings.');
      return false;
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    await persistSettings(
      { conventionName: nameInput.trim() },
      'General configuration saved.'
    );
  };

  const handleAddQuickLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQl.title.trim()) return;
    const safeUrl = getSafeExternalUrl(newQl.url);
    if (!safeUrl) {
      setQuickLinkUrlError('Please enter a valid URL starting with https:// or http://');
      return;
    }
    setQuickLinkUrlError(null);
    const nextLinks = [
      ...quickLinks,
      {
        id: Date.now(),
        icon: newQl.icon || '🔗',
        title: newQl.title.trim(),
        url: safeUrl,
      },
    ];
    const ok = await persistSettings({ quickLinks: nextLinks }, 'Quick link added.');
    if (ok) {
      setNewQl({ icon: '🔗', title: '', url: '' });
      setAddLinkOpen(false);
    }
  };

  const handleRemoveQuickLink = async (id: number) => {
    const nextLinks = quickLinks.filter((q) => q.id !== id);
    await persistSettings({ quickLinks: nextLinks }, 'Quick link removed.');
  };

  const handleMoveQuickLink = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= quickLinks.length) return;
    const nextLinks = [...quickLinks];
    const [moved] = nextLinks.splice(index, 1);
    nextLinks.splice(targetIndex, 0, moved);
    await persistSettings({ quickLinks: nextLinks }, 'Quick links order updated.');
  };

  return (
    <>
      <Stack gap="lg">
        <PageHeader title="Portal Settings" />

        <Tabs defaultValue="general">
          <Tabs.List
            mb="lg"
            style={{ flexWrap: 'nowrap', overflowX: 'auto' }}
          >
            <Tabs.Tab value="general" leftSection={<IconSettings size={15} />}>
              General &amp; Quick Links
            </Tabs.Tab>
            <Tabs.Tab value="departments" leftSection={<IconLink size={15} />}>
              Department Mapping
            </Tabs.Tab>
            <Tabs.Tab value="permissions" leftSection={<IconShieldLock size={15} />}>
              Permissions
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="general">
            <Stack gap="md">
              {settingsError && (
                <Alert color="red" icon={<IconAlertCircle size={16} />}>
                  {settingsError}
                </Alert>
              )}

              <Grid gap="lg" align="start">
                <Grid.Col span={{ base: 12, md: 5 }}>
                  <Paper
                    component="form"
                    onSubmit={handleSaveGeneralSettings}
                    p="lg"
                    withBorder
                  >
                    <Text size="sm" fw={700} mb="md">
                      General Configuration
                    </Text>
                    <Stack gap="md">
                      <TextInput
                        label="Convention Name"
                        required
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                      />
                      <TextInput
                        label="Identity Server"
                        value={
                          identityConfig?.issuerUrl ?? 'https://identity.winterfur.org'
                        }
                        disabled
                      />
                      <TextInput
                        label="Realm"
                        value={identityConfig?.realm ?? 'winterfur'}
                        disabled
                      />
                      <Group justify="flex-end">
                        <Button size="xs" type="submit" loading={isSavingSettings}>
                          Save Configuration
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 7 }}>
                  <Paper p="lg" withBorder>
                    <Group justify="space-between" mb="md">
                      <Text size="sm" fw={700}>
                        Quick Links
                      </Text>
                      <Button
                        size="xs"
                        leftSection={<IconPlus size={14} />}
                        onClick={() => {
                          setQuickLinkUrlError(null);
                          setAddLinkOpen(true);
                        }}
                      >
                        Add Link
                      </Button>
                    </Group>

                    {quickLinks.length === 0 ? (
                      <Text size="xs" c="dimmed" py="sm">
                        No quick links configured.
                      </Text>
                    ) : (
                      <Table.ScrollContainer minWidth={420}>
                        <Table>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Link</Table.Th>
                              <Table.Th>URL</Table.Th>
                              <Table.Th ta="right">Actions</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {quickLinks.map((q, index) => (
                              <Table.Tr key={q.id}>
                                <Table.Td>
                                  <Text size="sm" fw={600}>
                                    {q.icon} {q.title}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs" c="dimmed" truncate maw={260}>
                                    {q.url}
                                  </Text>
                                </Table.Td>
                                <Table.Td ta="right">
                                  <Group gap={4} justify="flex-end" wrap="nowrap">
                                    <ActionIcon
                                      variant="subtle"
                                      color="gray"
                                      size="sm"
                                      aria-label="Move quick link up"
                                      disabled={index === 0 || isSavingSettings}
                                      onClick={() => void handleMoveQuickLink(index, -1)}
                                    >
                                      <IconArrowUp size={14} />
                                    </ActionIcon>
                                    <ActionIcon
                                      variant="subtle"
                                      color="gray"
                                      size="sm"
                                      aria-label="Move quick link down"
                                      disabled={
                                        index === quickLinks.length - 1 || isSavingSettings
                                      }
                                      onClick={() => void handleMoveQuickLink(index, 1)}
                                    >
                                      <IconArrowDown size={14} />
                                    </ActionIcon>
                                    <ActionIcon
                                      variant="subtle"
                                      color="red"
                                      size="sm"
                                      aria-label="Remove quick link"
                                      loading={isSavingSettings}
                                      onClick={() => void handleRemoveQuickLink(q.id)}
                                    >
                                      <IconTrash size={14} />
                                    </ActionIcon>
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    )}
                  </Paper>
                </Grid.Col>
              </Grid>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="departments">
            <AdminDepartmentMapping />
          </Tabs.Panel>

          <Tabs.Panel value="permissions">
            <AdminPermissionsMapping />
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <Modal
        opened={addLinkOpen}
        onClose={() => setAddLinkOpen(false)}
        title="Add Quick Link"
      >
        <form onSubmit={handleAddQuickLink}>
          <Stack gap="sm">
            <Group gap="xs" grow>
              <TextInput
                label="Icon"
                placeholder="🔗"
                value={newQl.icon}
                onChange={(e) => setNewQl({ ...newQl, icon: e.target.value })}
              />
              <TextInput
                label="Title"
                required
                placeholder="e.g. Wiki"
                value={newQl.title}
                onChange={(e) => setNewQl({ ...newQl, title: e.target.value })}
              />
            </Group>
            <TextInput
              label="URL"
              required
              placeholder="https://..."
              value={newQl.url}
              error={quickLinkUrlError}
              onChange={(e) => {
                setNewQl({ ...newQl, url: e.target.value });
                if (quickLinkUrlError) setQuickLinkUrlError(null);
              }}
            />
            <Group justify="flex-end" gap="xs" mt="xs">
              <Button
                variant="default"
                size="xs"
                onClick={() => {
                  setAddLinkOpen(false);
                  setQuickLinkUrlError(null);
                }}
              >
                Cancel
              </Button>
              <Button size="xs" type="submit" loading={isSavingSettings}>
                Add Link
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
