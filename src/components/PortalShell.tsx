'use client';

import React, { useState, useEffect } from 'react';
import {
  AppShell,
  Group,
  Text,
  Badge,
  Avatar,
  NavLink,
  Box,
  Paper,
  Button,
  Grid,
  TextInput,
  Select,
  Modal,
  Divider,
  ActionIcon,
  Stack,
  Pill,
  Loader,
} from '@mantine/core';
import {
  IconUser,
  IconPaw,
  IconSettings,
  IconExternalLink,
  IconTrash,
  IconPlus,
  IconCheck,
  IconKey,
  IconLock,
  IconShieldCheck,
  IconFileText,
  IconLogout,
} from '@tabler/icons-react';

interface QuickLink {
  id: number;
  icon: string;
  title: string;
  url: string;
}

interface Passkey {
  id: string;
  name: string;
  date: string;
}

export interface SecurityData {
  hasPassword: boolean;
  passwordUpdated?: string;
  hasTotp: boolean;
  totpLabel?: string;
  passkeys: Passkey[];
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string;
  image: string;
  roles: string[];
}

export function PortalShell({ sessionUser }: { sessionUser?: SessionUser }) {
  const [activeTab, setActiveTab] = useState<'profile' | 'crew' | 'admin'>('profile');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [ndaModalOpen, setNdaModalOpen] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Live Security Data from Keycloak
  const [security, setSecurity] = useState<SecurityData>({
    hasPassword: true,
    passwordUpdated: 'Configured',
    hasTotp: false,
    passkeys: [],
  });
  const [isLoadingSecurity, setIsLoadingSecurity] = useState(true);

  // Profile Form State initialized with session user or defaults
  const [profile, setProfile] = useState({
    nickname: sessionUser?.username || sessionUser?.name || 'Kodiak',
    telegram: '@KodiakPolar',
    species: 'Polar Bear',
    pronouns: 'he/him',
    firstName: sessionUser?.name?.split(' ')[0] || 'Lukas',
    lastName: sessionUser?.name?.split(' ').slice(1).join(' ') || 'Winterstein',
    dob: '1998-02-14',
    email: sessionUser?.email || 'lukas.winterstein@example.com',
    phone: '+49 170 9823411',
    street: 'Schneegipfelweg 42',
    zip: '80331',
    city: 'München',
    country: 'Germany',
    avatarUrl: sessionUser?.image || '',
  });

  const [editForm, setEditForm] = useState({ ...profile });

  // Quick Links State
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([
    { id: 1, icon: '💬', title: 'Telegram Crew Chat', url: 'https://t.me/joinchat/example' },
    { id: 2, icon: '📁', title: 'Nextcloud Con-Drive', url: 'https://cloud.winterfur.org' },
    { id: 3, icon: '📋', title: 'Shift Schedule (Ops)', url: 'https://shifts.winterfur.org' },
  ]);

  const [newQl, setNewQl] = useState({ icon: '🔗', title: '', url: '' });
  const [showAddQl, setShowAddQl] = useState(false);

  useEffect(() => {
    // 1. Fetch Profile
    fetch('/api/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setProfile(data);
          setEditForm(data);
        }
      })
      .catch((err) => console.error('Failed to load profile:', err))
      .finally(() => setIsLoadingProfile(false));

    // 2. Fetch Live Security Credentials from Keycloak
    fetch('/api/profile/security')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSecurity(data);
      })
      .catch((err) => console.error('Failed to load security info:', err))
      .finally(() => setIsLoadingSecurity(false));
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setProfile({ ...editForm });
        setIsEditingProfile(false);
        setSaveStatus('Profile saved and synced with WinterFur Identity!');
      } else {
        setSaveStatus('Could not sync changes to WinterFur Identity.');
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('Error saving profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerAction = (action: string) => {
    window.location.href = `/api/auth/action?action=${encodeURIComponent(action)}`;
  };

  const handleRemovePasskey = async (id: string) => {
    try {
      const res = await fetch(`/api/profile/security?credentialId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSecurity((prev) => ({
          ...prev,
          passkeys: prev.passkeys.filter((p) => p.id !== id),
        }));
      }
    } catch (err) {
      console.error('Failed to remove passkey:', err);
    }
  };

  const handleAddQuickLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQl.title.trim() || !newQl.url.trim()) return;
    setQuickLinks([
      ...quickLinks,
      { id: Date.now(), icon: newQl.icon || '🔗', title: newQl.title.trim(), url: newQl.url.trim() },
    ]);
    setNewQl({ icon: '🔗', title: '', url: '' });
    setShowAddQl(false);
  };

  const handleRemoveQuickLink = (id: number) => {
    setQuickLinks(quickLinks.filter((q) => q.id !== id));
  };

  const initials = profile.nickname.slice(0, 2).toUpperCase();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: 'sm' }}
      padding="md"
      styles={{
        main: {
          backgroundColor: 'var(--mantine-color-dark-8)',
          minHeight: '100vh',
        },
      }}
    >
      {/* Header */}
      <AppShell.Header
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderBottom: '1px solid var(--mantine-color-dark-4)',
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Box
              style={{
                width: 34,
                height: 34,
                borderRadius: 6,
                backgroundColor: 'var(--mantine-color-blue-9)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              WTF
            </Box>
            <Text fw={700} c="white" size="md">
              WinterFur Manage
            </Text>
          </Group>

          <Group gap="md">
            <Group gap="xs">
              <Avatar
                src={profile.avatarUrl || null}
                radius="xl"
                size="sm"
                color="blue"
              >
                {initials}
              </Avatar>
              <Text size="sm" fw={600} c="white">
                {profile.nickname}
              </Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                title="Sign out of WinterFur Manage"
                onClick={() => {
                  window.location.href = '/api/auth/signout';
                }}
              >
                <IconLogout size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </Group>
      </AppShell.Header>

      {/* Navbar */}
      <AppShell.Navbar
        p="sm"
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderRight: '1px solid var(--mantine-color-dark-4)',
        }}
      >
        <Stack gap="xs">
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="xs">
            Account
          </Text>
          <NavLink
            label="My Profile"
            leftSection={<IconUser size={18} />}
            active={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            style={{ borderRadius: 6 }}
          />

          <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="xs" mt="sm">
            Crew
          </Text>
          <NavLink
            label="Crew Dashboard"
            leftSection={<IconPaw size={18} />}
            active={activeTab === 'crew'}
            onClick={() => setActiveTab('crew')}
            style={{ borderRadius: 6 }}
          />

          <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="xs" mt="sm">
            Administration
          </Text>
          <NavLink
            label="Portal Settings"
            leftSection={<IconSettings size={18} />}
            active={activeTab === 'admin'}
            onClick={() => setActiveTab('admin')}
            style={{ borderRadius: 6 }}
          />
        </Stack>
      </AppShell.Navbar>

      {/* Main Content */}
      <AppShell.Main>
        <Box style={{ maxWidth: 1200, margin: '0 auto' }} py="md">
          {/* TAB 1: MY PROFILE */}
          {activeTab === 'profile' && (
            <Grid gap="xl">
              {/* Left: Profile View / Edit */}
              <Grid.Col span={{ base: 12, md: 7 }}>
                <Group justify="space-between" mb="md" h={40}>
                  <div>
                    <Text size="xl" fw={700} c="white">
                      My Profile
                    </Text>
                    <Text size="xs" c="dimmed">
                      Your personal details synced with WinterFur Identity
                    </Text>
                  </div>
                  {!isEditingProfile && (
                    <Button
                      variant="filled"
                      size="sm"
                      onClick={() => {
                        setEditForm({ ...profile });
                        setIsEditingProfile(true);
                      }}
                    >
                      Edit Profile
                    </Button>
                  )}
                </Group>

                {!isEditingProfile ? (
                  isLoadingProfile ? (
                    <Paper
                      p="xl"
                      radius="md"
                      withBorder
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        borderColor: 'var(--mantine-color-dark-5)',
                        minHeight: 280,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Group gap="md">
                        <Loader size="sm" color="blue" />
                        <Text size="sm" c="dimmed">
                          Syncing profile with WinterFur Identity...
                        </Text>
                      </Group>
                    </Paper>
                  ) : (
                  <Paper
                    p="lg"
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-5)',
                    }}
                  >
                    <Group gap="lg" mb="xl">
                      <Avatar
                        src={profile.avatarUrl || null}
                        size={84}
                        radius="md"
                        color="blue"
                      >
                        {initials}
                      </Avatar>
                      <div>
                        <Text size="xl" fw={700} c="white">
                          {profile.nickname}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {profile.species} • {profile.pronouns}
                        </Text>
                      </div>
                    </Group>

                    <Divider my="md" />

                    <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="sm">
                      Attendee Information
                    </Text>
                    <Grid gap="md" mb="lg">
                      <Grid.Col span={6}>
                        <Text size="xs" c="dimmed">
                          Telegram
                        </Text>
                        <Text size="sm" fw={600} c="white">
                          {profile.telegram || '—'}
                        </Text>
                      </Grid.Col>
                      <Grid.Col span={6}>
                        <Text size="xs" c="dimmed">
                          Languages
                        </Text>
                        <Group gap={6} mt={4}>
                          <Pill size="sm">German</Pill>
                          <Pill size="sm">English</Pill>
                        </Group>
                      </Grid.Col>
                    </Grid>

                    <Divider my="md" />

                    <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="sm">
                      Legal & Contact
                    </Text>
                    <Grid gap="md">
                      <Grid.Col span={6}>
                        <Text size="xs" c="dimmed">
                          Legal Name
                        </Text>
                        <Text size="sm" fw={600} c="white">
                          {profile.firstName} {profile.lastName}
                        </Text>
                      </Grid.Col>
                      <Grid.Col span={6}>
                        <Text size="xs" c="dimmed">
                          Date of Birth
                        </Text>
                        <Text size="sm" fw={600} c="white">
                          {profile.dob}
                        </Text>
                      </Grid.Col>
                      <Grid.Col span={6}>
                        <Text size="xs" c="dimmed">
                          Email Address
                        </Text>
                        <Text size="sm" fw={600} c="white">
                          {profile.email}
                        </Text>
                      </Grid.Col>
                      <Grid.Col span={6}>
                        <Text size="xs" c="dimmed">
                          Phone Number
                        </Text>
                        <Text size="sm" fw={600} c="white">
                          {profile.phone}
                        </Text>
                      </Grid.Col>
                      <Grid.Col span={12}>
                        <Text size="xs" c="dimmed">
                          Residential Address
                        </Text>
                        <Text size="sm" fw={600} c="white">
                          {profile.street}, {profile.zip} {profile.city}, {profile.country}
                        </Text>
                      </Grid.Col>
                    </Grid>
                  </Paper>
                  )
                ) : (
                  <Paper
                    component="form"
                    onSubmit={handleSaveProfile}
                    p="lg"
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-5)',
                    }}
                  >
                    <Stack gap="md">
                      <Group gap="md">
                        <Avatar
                          src={editForm.avatarUrl || null}
                          size={64}
                          radius="md"
                          color="blue"
                        >
                          {initials}
                        </Avatar>
                        <div>
                          <Text size="sm" fw={600} c="white">
                            Profile Picture
                          </Text>
                          <Group gap="xs" mt={4}>
                            <Button
                              variant="default"
                              size="xs"
                              component="label"
                            >
                              Upload Image
                              <input
                                type="file"
                                hidden
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                      setEditForm({
                                        ...editForm,
                                        avatarUrl: ev.target?.result as string,
                                      });
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </Button>
                            {editForm.avatarUrl && (
                              <Button
                                variant="subtle"
                                color="red"
                                size="xs"
                                onClick={() => setEditForm({ ...editForm, avatarUrl: '' })}
                              >
                                Remove
                              </Button>
                            )}
                          </Group>
                        </div>
                      </Group>

                      <Grid gap="md">
                        <Grid.Col span={6}>
                          <TextInput
                            label="Nickname / Fursona Name"
                            required
                            value={editForm.nickname}
                            onChange={(e) =>
                              setEditForm({ ...editForm, nickname: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <TextInput
                            label="Telegram Handle"
                            value={editForm.telegram}
                            onChange={(e) =>
                              setEditForm({ ...editForm, telegram: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Select
                            label="Species"
                            data={[
                              'Polar Bear',
                              'Wolf',
                              'Fox',
                              'Husky / Dog',
                              'Snow Leopard',
                              'Cat / Feline',
                              'Dragon',
                              'Deer / Cervine',
                              'Other',
                            ]}
                            value={editForm.species}
                            onChange={(val) =>
                              setEditForm({ ...editForm, species: val || 'Other' })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <TextInput
                            label="Pronouns"
                            value={editForm.pronouns}
                            onChange={(e) =>
                              setEditForm({ ...editForm, pronouns: e.target.value })
                            }
                          />
                        </Grid.Col>

                        <Grid.Col span={4}>
                          <TextInput
                            label="First Name"
                            required
                            value={editForm.firstName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, firstName: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={4}>
                          <TextInput
                            label="Last Name"
                            required
                            value={editForm.lastName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, lastName: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={4}>
                          <TextInput
                            label="Date of Birth"
                            type="date"
                            required
                            value={editForm.dob}
                            onChange={(e) =>
                              setEditForm({ ...editForm, dob: e.target.value })
                            }
                          />
                        </Grid.Col>

                        <Grid.Col span={6}>
                          <TextInput
                            label="Email Address"
                            type="email"
                            required
                            value={editForm.email}
                            onChange={(e) =>
                              setEditForm({ ...editForm, email: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <TextInput
                            label="Phone Number"
                            type="tel"
                            required
                            value={editForm.phone}
                            onChange={(e) =>
                              setEditForm({ ...editForm, phone: e.target.value })
                            }
                          />
                        </Grid.Col>

                        <Grid.Col span={12}>
                          <TextInput
                            label="Street & House Number"
                            required
                            value={editForm.street}
                            onChange={(e) =>
                              setEditForm({ ...editForm, street: e.target.value })
                            }
                          />
                        </Grid.Col>

                        <Grid.Col span={4}>
                          <TextInput
                            label="Postal Code"
                            required
                            value={editForm.zip}
                            onChange={(e) =>
                              setEditForm({ ...editForm, zip: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={4}>
                          <TextInput
                            label="City"
                            required
                            value={editForm.city}
                            onChange={(e) =>
                              setEditForm({ ...editForm, city: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={4}>
                          <Select
                            label="Country"
                            required
                            data={[
                              'Germany',
                              'Austria',
                              'Switzerland',
                              'Netherlands',
                              'Belgium',
                              'France',
                              'United Kingdom',
                              'Poland',
                              'Czech Republic',
                              'Denmark',
                              'Sweden',
                              'Norway',
                              'Finland',
                              'Italy',
                              'Spain',
                              'United States',
                              'Other',
                            ]}
                            value={editForm.country}
                            onChange={(val) =>
                              setEditForm({ ...editForm, country: val || 'Germany' })
                            }
                          />
                        </Grid.Col>
                      </Grid>

                      <Divider />

                      <Group justify="space-between">
                        {saveStatus ? (
                          <Text
                            size="xs"
                            c={saveStatus.includes('saved') ? 'teal' : 'red'}
                          >
                            {saveStatus}
                          </Text>
                        ) : <div />}
                        <Group gap="sm">
                          <Button
                            variant="default"
                            onClick={() => setIsEditingProfile(false)}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                          <Button variant="filled" type="submit" loading={isSaving}>
                            Save Changes
                          </Button>
                        </Group>
                      </Group>
                    </Stack>
                  </Paper>
                )}
              </Grid.Col>

              {/* Right: Account Security */}
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Box mb="md" h={40}>
                  <Text size="xl" fw={700} c="white">
                    Account Security
                  </Text>
                  <Text size="xs" c="dimmed">
                    Managed via WinterFur Identity
                  </Text>
                </Box>

                <Paper
                  p="lg"
                  radius="md"
                  withBorder
                  style={{
                    backgroundColor: 'var(--mantine-color-dark-7)',
                    borderColor: 'var(--mantine-color-dark-5)',
                  }}
                >
                  <Stack gap="lg">
                    {/* Password */}
                    <div>
                      <Group justify="space-between">
                        <div>
                          <Text size="sm" fw={600} c="white">
                            Password
                          </Text>
                          <Text size="xs" c="dimmed">
                            Last updated: {security.passwordUpdated || 'Configured'}
                          </Text>
                        </div>
                        <Button
                          variant="default"
                          size="xs"
                          onClick={() => handleTriggerAction('UPDATE_PASSWORD')}
                        >
                          Change
                        </Button>
                      </Group>
                    </div>

                    <Divider />

                    {/* 2FA */}
                    <Group justify="space-between">
                      <div>
                        <Group gap="xs">
                          <Text size="sm" fw={600} c="white">
                            2FA Authenticator
                          </Text>
                          <Badge
                            color={security.hasTotp ? 'teal' : 'gray'}
                            variant="light"
                            size="sm"
                          >
                            {security.hasTotp ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {security.hasTotp
                            ? security.totpLabel || 'TOTP 6-digit codes active'
                            : 'Not configured yet'}
                        </Text>
                      </div>
                      <Button
                        variant="default"
                        size="xs"
                        onClick={() => handleTriggerAction('CONFIGURE_TOTP')}
                      >
                        {security.hasTotp ? 'Reconfigure' : 'Set Up'}
                      </Button>
                    </Group>

                    <Divider />

                    {/* Passkeys */}
                    <div>
                      <Group justify="space-between" mb="xs">
                        <div>
                          <Group gap="xs">
                            <Text size="sm" fw={600} c="white">
                              Passkeys & Keys
                            </Text>
                            <Badge
                              color={security.passkeys.length > 0 ? 'teal' : 'gray'}
                              variant="light"
                              size="sm"
                            >
                              {security.passkeys.length} Registered
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed">
                            Hardware Keys & Windows Hello
                          </Text>
                        </div>
                        <Button
                          variant="default"
                          size="xs"
                          onClick={() => handleTriggerAction('webauthn-register')}
                        >
                          + Add
                        </Button>
                      </Group>

                      {security.passkeys.length === 0 ? (
                        <Text size="xs" c="dimmed" fs="italic">
                          No passkeys registered yet. Click &quot;+ Add&quot; to register a YubiKey or Touch ID / Windows Hello.
                        </Text>
                      ) : (
                        <Stack gap="xs">
                          {security.passkeys.map((p) => (
                            <Paper
                              key={p.id}
                              p="xs"
                              withBorder
                              style={{
                                backgroundColor: 'var(--mantine-color-dark-6)',
                                borderColor: 'var(--mantine-color-dark-4)',
                              }}
                            >
                              <Group justify="space-between">
                                <div>
                                  <Text size="xs" fw={600} c="white">
                                    {p.name}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {p.date}
                                  </Text>
                                </div>
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  size="sm"
                                  title="Remove passkey"
                                  onClick={() => handleRemovePasskey(p.id)}
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              </Group>
                            </Paper>
                          ))}
                        </Stack>
                      )}
                    </div>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          )}

          {/* TAB 2: CREW DASHBOARD */}
          {activeTab === 'crew' && (
            <Stack gap="xl">
              <Text size="xl" fw={700} c="white">
                Crew Dashboard
              </Text>

              <Grid gap="xl">
                {/* Left: NDA & Quick Links */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="md">
                    {/* NDA Card */}
                    <Paper
                      p="md"
                      radius="md"
                      withBorder
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        borderColor: 'var(--mantine-color-dark-5)',
                      }}
                    >
                      <Group justify="space-between">
                        <div>
                          <Group gap="xs">
                            <Text size="md" fw={700} c="white">
                              Volunteer Agreement (NDA)
                            </Text>
                            <Badge color="teal" variant="light">
                              Signed
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed" mt={4}>
                            Signed Oct 12, 2026 • Version 2.1
                          </Text>
                        </div>
                        <Button
                          variant="default"
                          size="xs"
                          onClick={() => setNdaModalOpen(true)}
                        >
                          View
                        </Button>
                      </Group>
                    </Paper>

                    {/* Quick Links */}
                    <Paper
                      p="md"
                      radius="md"
                      withBorder
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        borderColor: 'var(--mantine-color-dark-5)',
                      }}
                    >
                      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="sm">
                        Quick Links
                      </Text>
                      <Group gap="xs">
                        {quickLinks.map((q) => (
                          <a
                            key={q.id}
                            href={q.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none' }}
                          >
                            <Pill style={{ cursor: 'pointer', padding: '6px 12px' }}>
                              <Group gap={6}>
                                <span>{q.icon}</span>
                                <span>{q.title}</span>
                                <IconExternalLink size={12} style={{ opacity: 0.6 }} />
                              </Group>
                            </Pill>
                          </a>
                        ))}
                      </Group>
                    </Paper>
                  </Stack>
                </Grid.Col>

                {/* Right: Roles & Skills */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Paper
                    p="lg"
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-5)',
                    }}
                  >
                    <Stack gap="md">
                      <div>
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="xs">
                          My Crew Roles
                        </Text>
                        <Group gap="xs">
                          <Pill>IT - Lead</Pill>
                          <Pill>Venue Relation - Catering</Pill>
                          <Pill>Con-Ops - Dispatcher</Pill>
                        </Group>
                      </div>

                      <Divider />

                      <div>
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="xs">
                          My Skills (FR Managed)
                        </Text>
                        <Group gap="xs">
                          <Pill>German - Native</Pill>
                          <Pill>English - B2</Pill>
                          <Pill>Communication - Advanced</Pill>
                          <Pill>First Aid - Basic</Pill>
                        </Group>
                      </div>

                      <Divider />

                      <Text size="xs" c="dimmed">
                        Roles and skills are assigned and audited by{' '}
                        <strong style={{ color: '#fff' }}>FR (Furry Resources)</strong>.
                      </Text>
                    </Stack>
                  </Paper>
                </Grid.Col>
              </Grid>
            </Stack>
          )}

          {/* TAB 3: ADMIN PORTAL SETTINGS */}
          {activeTab === 'admin' && (
            <Stack gap="xl">
              <Text size="xl" fw={700} c="white">
                Portal Settings
              </Text>

              <Grid gap="xl">
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Paper
                    p="lg"
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-5)',
                    }}
                  >
                    <Text size="sm" fw={700} c="white" mb="md">
                      General Configuration
                    </Text>
                    <Stack gap="md">
                      <TextInput
                        label="Convention Name"
                        defaultValue="WinterFur 2026"
                      />
                      <TextInput
                        label="Identity Server (WinterFur Identity)"
                        defaultValue="https://identity.winterfur.org"
                        disabled
                      />
                      <TextInput
                        label="Realm"
                        defaultValue="winterfur"
                        disabled
                      />
                    </Stack>
                  </Paper>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Paper
                    p="lg"
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-5)',
                    }}
                  >
                    <Group justify="space-between" mb="md">
                      <Text size="sm" fw={700} c="white">
                        Manage Quick Links
                      </Text>
                      <Button
                        variant="default"
                        size="xs"
                        onClick={() => setShowAddQl(!showAddQl)}
                      >
                        + Add Link
                      </Button>
                    </Group>

                    {showAddQl && (
                      <Box
                        component="form"
                        onSubmit={handleAddQuickLink}
                        mb="md"
                        p="sm"
                        style={{
                          backgroundColor: 'var(--mantine-color-dark-6)',
                          borderRadius: 6,
                        }}
                      >
                        <Stack gap="xs">
                          <Group gap="xs" grow>
                            <TextInput
                              label="Icon"
                              placeholder="🔗"
                              value={newQl.icon}
                              onChange={(e) =>
                                setNewQl({ ...newQl, icon: e.target.value })
                              }
                            />
                            <TextInput
                              label="Title"
                              required
                              placeholder="e.g. Wiki"
                              value={newQl.title}
                              onChange={(e) =>
                                setNewQl({ ...newQl, title: e.target.value })
                              }
                            />
                          </Group>
                          <TextInput
                            label="URL"
                            required
                            placeholder="https://..."
                            value={newQl.url}
                            onChange={(e) =>
                              setNewQl({ ...newQl, url: e.target.value })
                            }
                          />
                          <Group justify="flex-end" gap="xs" mt="xs">
                            <Button
                              variant="default"
                              size="xs"
                              onClick={() => setShowAddQl(false)}
                            >
                              Cancel
                            </Button>
                            <Button variant="filled" size="xs" type="submit">
                              Save
                            </Button>
                          </Group>
                        </Stack>
                      </Box>
                    )}

                    <Stack gap="xs">
                      {quickLinks.map((q) => (
                        <Paper
                          key={q.id}
                          p="xs"
                          withBorder
                          style={{
                            backgroundColor: 'var(--mantine-color-dark-6)',
                            borderColor: 'var(--mantine-color-dark-4)',
                          }}
                        >
                          <Group justify="space-between">
                            <div>
                              <Text size="xs" fw={600} c="white">
                                {q.icon} {q.title}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {q.url}
                              </Text>
                            </div>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="sm"
                              onClick={() => handleRemoveQuickLink(q.id)}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  </Paper>
                </Grid.Col>
              </Grid>
            </Stack>
          )}
        </Box>
      </AppShell.Main>

      {/* NDA Modal */}
      <Modal
        opened={ndaModalOpen}
        onClose={() => setNdaModalOpen(false)}
        title="Volunteer Agreement & Confidentiality"
        centered
        styles={{
          content: { backgroundColor: 'var(--mantine-color-dark-7)' },
          header: { backgroundColor: 'var(--mantine-color-dark-7)', color: '#fff' },
        }}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            <strong style={{ color: '#fff' }}>1. Confidentiality:</strong> You agree
            to treat all attendee data, internal planning and event details strictly
            confidentially.
          </Text>
          <Text size="sm" c="dimmed">
            <strong style={{ color: '#fff' }}>2. Data Protection:</strong> Personal
            data may only be accessed for your assigned tasks.
          </Text>
          <Text size="sm" c="dimmed">
            <strong style={{ color: '#fff' }}>3. Code of Conduct:</strong> You
            represent WinterFur and adhere to all safety guidelines.
          </Text>
          <Divider my="sm" />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Signed by <strong style={{ color: '#fff' }}>{profile.nickname}</strong>
            </Text>
            <Button variant="default" size="xs" onClick={() => setNdaModalOpen(false)}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppShell>
  );
}
