'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  Burger,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconUser,
  IconPaw,
  IconSettings,
  IconExternalLink,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconPlus,
  IconCheck,
  IconKey,
  IconLock,
  IconShieldCheck,
  IconFileText,
  IconLogout,
  IconUsersGroup,
} from '@tabler/icons-react';
import type { UserProfileData } from '@/lib/keycloak';
import {
  DEFAULT_PORTAL_SETTINGS,
  type IdentityDisplayConfig,
  type PortalSettings,
  type QuickLink,
} from '@/lib/portal-config';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_UPLOAD_BYTES,
  getSafeAvatarUrl,
  getSafeExternalUrl,
} from '@/lib/validation';

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

export function PortalShell({
  sessionUser,
  initialProfile,
  initialSecurity,
  initialSettings,
  identityConfig,
}: {
  sessionUser?: SessionUser;
  initialProfile?: UserProfileData;
  initialSecurity?: SecurityData;
  initialSettings?: PortalSettings;
  identityConfig?: IdentityDisplayConfig;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = sessionUser?.roles?.includes('winterfur-admin') ?? false;
  const isCrew = sessionUser?.roles?.includes('crew') ?? false;
  const hasFurryResources = sessionUser?.roles?.includes('furry_ressources') ?? false;

  const activeTab: 'profile' | 'crew' | 'fr' | 'admin' = pathname.startsWith('/crew') && isCrew
    ? 'crew'
    : pathname.startsWith('/fr') && hasFurryResources
    ? 'fr'
    : pathname.startsWith('/admin') && isAdmin
    ? 'admin'
    : 'profile';

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [ndaModalOpen, setNdaModalOpen] = useState(false);
  const [mobileNavOpened, { toggle: toggleMobileNav, close: closeMobileNav }] = useDisclosure(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(!initialProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Live Security Data from Keycloak
  const [security, setSecurity] = useState<SecurityData>(
    initialSecurity || {
      hasPassword: true,
      passwordUpdated: 'Configured',
      hasTotp: false,
      passkeys: [],
    }
  );
  const [isLoadingSecurity, setIsLoadingSecurity] = useState(!initialSecurity);

  // Profile Form State initialized with server-fetched profile or session
  const [profile, setProfile] = useState<UserProfileData>(() => {
    if (initialProfile) return initialProfile;
    return {
      id: sessionUser?.id || '',
      username: sessionUser?.username || '',
      firstName: sessionUser?.name?.split(' ')[0] || '',
      lastName: sessionUser?.name?.split(' ').slice(1).join(' ') || '',
      email: sessionUser?.email || '',
      nickname: sessionUser?.name || sessionUser?.username || 'Kodiak',
      telegram: '@kodiak',
      species: 'Polar Bear',
      pronouns: 'he/him',
      phone: '',
      street: '',
      zip: '',
      city: '',
      country: 'Germany',
      dob: '',
      avatarUrl: sessionUser?.image || '',
    };
  });

  const [editForm, setEditForm] = useState({ ...profile });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Portal Settings & Quick Links State (loaded from MySQL via server props)
  const [conventionName, setConventionName] = useState(
    initialSettings?.conventionName ?? DEFAULT_PORTAL_SETTINGS.conventionName
  );
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(
    initialSettings?.quickLinks ?? DEFAULT_PORTAL_SETTINGS.quickLinks
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newQl, setNewQl] = useState({ icon: '🔗', title: '', url: '' });
  const [showAddQl, setShowAddQl] = useState(false);
  const [quickLinkUrlError, setQuickLinkUrlError] = useState<string | null>(null);

  // Clean up any lingering query parameters from OAuth/Keycloak callbacks
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
        if (data) {
          setSecurity(data);
        }
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

  const handleAvatarUpload = async (file: File) => {
    setAvatarError(null);
    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type) || file.size > MAX_AVATAR_UPLOAD_BYTES) {
      setAvatarError('Please select a PNG, JPEG, WEBP, or GIF image under 5 MB.');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json().catch(() => null)) as { avatarUrl?: string; error?: string } | null;
      if (!res.ok || !data?.avatarUrl) {
        setAvatarError(data?.error || 'Failed to upload profile picture.');
        return;
      }

      const safeUrl = getSafeAvatarUrl(data.avatarUrl);
      if (safeUrl) {
        setEditForm((prev) => ({ ...prev, avatarUrl: safeUrl }));
        setProfile((prev) => ({ ...prev, avatarUrl: safeUrl }));
        setSaveStatus('Profile picture updated!');
      }
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      setAvatarError('Network error while uploading profile picture.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setAvatarError(data?.error || 'Failed to remove profile picture.');
        return;
      }
      setEditForm((prev) => ({ ...prev, avatarUrl: '' }));
      setProfile((prev) => ({ ...prev, avatarUrl: '' }));
      setSaveStatus('Profile picture removed.');
    } catch (err) {
      console.error('Failed to remove avatar:', err);
      setAvatarError('Network error while removing profile picture.');
    } finally {
      setIsUploadingAvatar(false);
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

  const persistSettings = async (payload: Partial<PortalSettings>, successText: string) => {
    setIsSavingSettings(true);
    setSettingsStatus(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setSettingsStatus({ type: 'error', text: 'Failed to save portal settings.' });
        return false;
      }
      const updated = (await res.json()) as PortalSettings;
      setConventionName(updated.conventionName);
      setQuickLinks(updated.quickLinks);
      setSettingsStatus({ type: 'success', text: successText });
      router.refresh();
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSettingsStatus({ type: 'error', text: 'Error saving portal settings.' });
      return false;
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conventionName.trim()) return;
    await persistSettings({ conventionName: conventionName.trim() }, 'General configuration saved.');
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
      { id: Date.now(), icon: newQl.icon || '🔗', title: newQl.title.trim(), url: safeUrl },
    ];
    const ok = await persistSettings({ quickLinks: nextLinks }, 'Quick link added.');
    if (ok) {
      setNewQl({ icon: '🔗', title: '', url: '' });
      setShowAddQl(false);
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

  const initials = profile.nickname.slice(0, 2).toUpperCase();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !mobileNavOpened } }}
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
          height: 60,
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderBottom: '1px solid var(--mantine-color-dark-4)',
        }}
      >
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={mobileNavOpened}
              onClick={toggleMobileNav}
              hiddenFrom="sm"
              size="sm"
              aria-label="Toggle navigation"
            />
            <Box
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: 'rgba(21, 170, 191, 0.15)',
                color: '#66d9e8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              WTF
            </Box>
            <Text fw={700} c="white" size="md" style={{ letterSpacing: '-0.3px' }}>
              WinterFur Manage
            </Text>
          </Group>

          <Group gap="md">
            <Group gap="xs">
              <Avatar
                src={getSafeAvatarUrl(profile.avatarUrl)}
                radius="xl"
                size={32}
                style={{
                  backgroundColor: 'var(--mantine-primary-color-filled, #15aabf)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 12,
                }}
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
                onClick={async () => {
                  try {
                    const res = await fetch('/api/auth/logout', { method: 'POST' });
                    if (res.ok) {
                      const data = (await res.json()) as { logoutUrl?: string };
                      if (data.logoutUrl) {
                        window.location.href = data.logoutUrl;
                        return;
                      }
                    }
                  } catch {
                    // Fallback to local signout
                  }
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
        p="md"
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderRight: '1px solid var(--mantine-color-dark-4)',
        }}
      >
        <Stack gap="md">
          <div>
            <div className="uppercase-label" style={{ padding: '0 12px 6px' }}>
              Account
            </div>
            <NavLink
              label="My Profile"
              leftSection={<IconUser size={18} />}
              active={activeTab === 'profile'}
              onClick={() => {
                closeMobileNav();
                router.push('/profile');
              }}
            />
          </div>

          {isCrew && (
            <div>
              <div className="uppercase-label" style={{ padding: '0 12px 6px' }}>
                Crew
              </div>
              <NavLink
                label="Crew Dashboard"
                leftSection={<IconPaw size={18} />}
                active={activeTab === 'crew'}
                onClick={() => {
                  closeMobileNav();
                  router.push('/crew');
                }}
              />
            </div>
          )}

          {hasFurryResources && (
            <div>
              <div className="uppercase-label" style={{ padding: '0 12px 6px' }}>
                Furry Ressources
              </div>
              <NavLink
                label="FR Dashboard"
                leftSection={<IconUsersGroup size={18} />}
                active={activeTab === 'fr'}
                onClick={() => {
                  closeMobileNav();
                  router.push('/fr');
                }}
              />
            </div>
          )}

          {isAdmin && (
            <div>
              <div className="uppercase-label" style={{ padding: '0 12px 6px' }}>
                Administration
              </div>
              <NavLink
                label="Portal Settings"
                leftSection={<IconSettings size={18} />}
                active={activeTab === 'admin'}
                onClick={() => {
                  closeMobileNav();
                  router.push('/admin');
                }}
              />
            </div>
          )}
        </Stack>
      </AppShell.Navbar>

      {/* Main Content */}
      <AppShell.Main
        style={{
          backgroundColor: 'var(--mantine-color-dark-8)',
        }}
      >
        <Box style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
          {/* TAB 1: MY PROFILE */}
          {activeTab === 'profile' && (
            <Grid gap={24} align="start">
                {/* Left: Profile View / Edit (7 cols) */}
                <Grid.Col span={{ base: 12, md: 7 }}>
                  <Group justify="space-between" mb="md" style={{ minHeight: 40 }}>
                    <div>
                      <Text size="xl" fw={700} c="white">
                        My Profile
                      </Text>
                      <Text size="sm" c="dimmed">
                        Your personal details synced with WinterFur Identity
                      </Text>
                    </div>
                    {!isEditingProfile && (
                      <Button
                        variant="default"
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
                          borderColor: 'var(--mantine-color-dark-4)',
                          minHeight: 280,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Group gap="md">
                          <Loader size="sm" color="cyan" />
                          <Text size="sm" c="dimmed">
                            Syncing profile with WinterFur Identity...
                          </Text>
                        </Group>
                      </Paper>
                    ) : (
                      <Paper
                        p={24}
                        radius="md"
                        withBorder
                        style={{
                          backgroundColor: 'var(--mantine-color-dark-7)',
                          borderColor: 'var(--mantine-color-dark-4)',
                        }}
                      >
                        <Stack gap={20}>
                          {/* Avatar + Nickname */}
                          <Group gap="md">
                            <Avatar
                              src={getSafeAvatarUrl(profile.avatarUrl)}
                              size={64}
                              radius="xl"
                              style={{
                                backgroundColor: 'var(--mantine-primary-color-filled, #15aabf)',
                                color: '#ffffff',
                                border: '2px solid var(--mantine-color-dark-4)',
                                fontSize: 20,
                                fontWeight: 700,
                              }}
                            >
                              {initials}
                            </Avatar>
                            <div>
                              <div className="uppercase-label">Nickname</div>
                              <Text size="xl" fw={700} c="white">
                                {profile.nickname}
                              </Text>
                            </div>
                          </Group>

                          <Divider color="var(--mantine-color-dark-4)" />

                          {/* Fursona Info (3 cols) */}
                          <Grid gap={16}>
                            <Grid.Col span={{ base: 12, sm: 4 }}>
                              <div className="uppercase-label">Species</div>
                              <div className="profile-field-value">{profile.species || '—'}</div>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 4 }}>
                              <div className="uppercase-label">Pronouns</div>
                              <div className="profile-field-value">{profile.pronouns || '—'}</div>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 4 }}>
                              <div className="uppercase-label">Telegram Handle</div>
                              <div className="profile-field-value">{profile.telegram || '—'}</div>
                            </Grid.Col>
                          </Grid>

                          <Divider color="var(--mantine-color-dark-4)" />

                          {/* Languages */}
                          <div>
                            <div className="uppercase-label">Languages</div>
                            <Group gap={6} mt={6}>
                              <Pill size="sm">German</Pill>
                              <Pill size="sm">English</Pill>
                            </Group>
                          </div>

                          <Divider color="var(--mantine-color-dark-4)" />

                          {/* Real Identity (3 cols) */}
                          <Grid gap={16}>
                            <Grid.Col span={{ base: 12, sm: 4 }}>
                              <div className="uppercase-label">First Name</div>
                              <div className="profile-field-value">{profile.firstName || '—'}</div>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 4 }}>
                              <div className="uppercase-label">Last Name</div>
                              <div className="profile-field-value">{profile.lastName || '—'}</div>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 4 }}>
                              <div className="uppercase-label">Date of Birth</div>
                              <div className="profile-field-value">{profile.dob || '—'}</div>
                            </Grid.Col>
                          </Grid>

                          <Divider color="var(--mantine-color-dark-4)" />

                          {/* Contact (2 cols, badge removed) */}
                          <Grid gap={16}>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                              <div className="uppercase-label">Email Address</div>
                              <div className="profile-field-value">{profile.email || '—'}</div>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                              <div className="uppercase-label">Phone Number</div>
                              <div className="profile-field-value">{profile.phone || '—'}</div>
                            </Grid.Col>
                          </Grid>

                          <Divider color="var(--mantine-color-dark-4)" />

                          {/* Address */}
                          <Stack gap={12}>
                            <div>
                              <div className="uppercase-label">Street & House Number</div>
                              <div className="profile-field-value">{profile.street || '—'}</div>
                            </div>
                            <Grid gap={16}>
                              <Grid.Col span={{ base: 12, sm: 6 }}>
                                <div className="uppercase-label">Postal Code & City</div>
                                <div className="profile-field-value">
                                  {profile.zip ? `${profile.zip} ${profile.city}` : (profile.city || '—')}
                                </div>
                              </Grid.Col>
                              <Grid.Col span={{ base: 12, sm: 6 }}>
                                <div className="uppercase-label">Country</div>
                                <div className="profile-field-value">{profile.country || '—'}</div>
                              </Grid.Col>
                            </Grid>
                          </Stack>
                        </Stack>
                      </Paper>
                    )
                  ) : (
                  <Paper
                    component="form"
                    onSubmit={handleSaveProfile}
                    p={24}
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-4)',
                    }}
                  >
                    <Stack gap="md">
                      <Group gap="md">
                        <Avatar
                          src={getSafeAvatarUrl(editForm.avatarUrl)}
                          size={48}
                          radius="xl"
                          style={{
                            backgroundColor: 'var(--mantine-primary-color-filled, #15aabf)',
                            color: '#ffffff',
                            fontSize: 16,
                            fontWeight: 700,
                          }}
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
                              loading={isUploadingAvatar}
                              disabled={isUploadingAvatar}
                            >
                              Upload Image
                              <input
                                type="file"
                                hidden
                                disabled={isUploadingAvatar}
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file) return;
                                  void handleAvatarUpload(file);
                                }}
                              />
                            </Button>
                            {editForm.avatarUrl && (
                              <Button
                                variant="subtle"
                                color="red"
                                size="xs"
                                disabled={isUploadingAvatar}
                                onClick={() => void handleAvatarRemove()}
                              >
                                Remove
                              </Button>
                            )}
                          </Group>
                          {avatarError && (
                            <Text size="xs" c="red.4" mt={4}>
                              {avatarError}
                            </Text>
                          )}
                        </div>
                      </Group>

                      <Grid gap="md">
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <TextInput
                            label="Nickname / Fursona Name"
                            required
                            value={editForm.nickname}
                            onChange={(e) =>
                              setEditForm({ ...editForm, nickname: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <TextInput
                            label="Telegram Handle"
                            value={editForm.telegram}
                            onChange={(e) =>
                              setEditForm({ ...editForm, telegram: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
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
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <TextInput
                            label="Pronouns"
                            value={editForm.pronouns}
                            onChange={(e) =>
                              setEditForm({ ...editForm, pronouns: e.target.value })
                            }
                          />
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            label="First Name"
                            required
                            value={editForm.firstName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, firstName: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            label="Last Name"
                            required
                            value={editForm.lastName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, lastName: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
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

                        <Grid.Col span={{ base: 12, sm: 6 }}>
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
                        <Grid.Col span={{ base: 12, sm: 6 }}>
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

                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            label="Postal Code"
                            required
                            value={editForm.zip}
                            onChange={(e) =>
                              setEditForm({ ...editForm, zip: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            label="City"
                            required
                            value={editForm.city}
                            onChange={(e) =>
                              setEditForm({ ...editForm, city: e.target.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
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

                      <Divider color="var(--mantine-color-dark-4)" />

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
                          <Button color="cyan" type="submit" loading={isSaving}>
                            Save Changes
                          </Button>
                        </Group>
                      </Group>
                    </Stack>
                  </Paper>
                )}
              </Grid.Col>

              {/* Right: Account Security (5 cols) */}
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Box mb="md" style={{ minHeight: 40 }}>
                  <Text size="xl" fw={700} c="white">
                    Account Security
                  </Text>
                  <Text size="sm" c="dimmed">
                    Managed via WinterFur Identity
                  </Text>
                </Box>

                {isLoadingSecurity ? (
                  <Paper
                    p={24}
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-4)',
                      minHeight: 200,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Group gap="md">
                      <Loader size="sm" color="cyan" />
                      <Text size="sm" c="dimmed">
                        Loading security settings...
                      </Text>
                    </Group>
                  </Paper>
                ) : (
                <Paper
                  p={24}
                  radius="md"
                  withBorder
                  style={{
                    backgroundColor: 'var(--mantine-color-dark-7)',
                    borderColor: 'var(--mantine-color-dark-4)',
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
                          <Text size="xs" c="dimmed" mt={2}>
                            Last updated: {security.passwordUpdated || 'Configured'}
                          </Text>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleTriggerAction('UPDATE_PASSWORD')}
                        >
                          Change
                        </Button>
                      </Group>
                    </div>

                    <Divider color="var(--mantine-color-dark-4)" />

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
                            tt="uppercase"
                          >
                            {security.hasTotp ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed" mt={2}>
                          {security.hasTotp
                            ? security.totpLabel || 'TOTP 6-digit codes active'
                            : 'Not configured yet'}
                        </Text>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleTriggerAction('CONFIGURE_TOTP')}
                      >
                        {security.hasTotp ? 'Configure' : 'Set Up'}
                      </Button>
                    </Group>

                    <Divider color="var(--mantine-color-dark-4)" />

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
                              tt="uppercase"
                            >
                              {security.passkeys.length} Registered
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed" mt={2}>
                            Hardware Keys & Windows Hello
                          </Text>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleTriggerAction('webauthn-register-passwordless')}
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
                )}
              </Grid.Col>
            </Grid>
          )}

          {/* TAB 2: CREW DASHBOARD */}
          {activeTab === 'crew' && isCrew && (
            <Stack gap={24}>
              <div>
                <Text size="xl" fw={700} c="white">
                  Crew Dashboard
                </Text>
                <Text size="sm" c="dimmed">
                  Your volunteer agreement, quick links, and assigned crew roles
                </Text>
              </div>

              <Grid gap={24} align="start">
                {/* Left: NDA & Quick Links */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap={24}>
                    {/* NDA Card */}
                    <Paper
                      p={24}
                      radius="md"
                      withBorder
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        borderColor: 'var(--mantine-color-dark-4)',
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
                      p={24}
                      radius="md"
                      withBorder
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        borderColor: 'var(--mantine-color-dark-4)',
                      }}
                    >
                      <div className="uppercase-label" style={{ marginBottom: 12 }}>
                        Quick Links
                      </div>
                      <Group gap="xs">
                        {quickLinks.map((q) => {
                          const safeHref = getSafeExternalUrl(q.url);
                          if (!safeHref) return null;
                          return (
                            <a
                              key={q.id}
                              href={safeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="quick-link-pill"
                            >
                              <span style={{ fontSize: 14, lineHeight: 1 }}>{q.icon}</span>
                              <span>{q.title}</span>
                              <IconExternalLink size={12} style={{ opacity: 0.6 }} />
                            </a>
                          );
                        })}
                      </Group>
                    </Paper>
                  </Stack>
                </Grid.Col>

                {/* Right: Roles & Skills */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Paper
                    p={24}
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-4)',
                    }}
                  >
                    <Stack gap="md">
                      <div>
                        <div className="uppercase-label" style={{ marginBottom: 8 }}>
                          My Crew Roles
                        </div>
                        <Group gap="xs">
                          <Pill size="md">IT - Lead</Pill>
                          <Pill size="md">Venue Relation - Catering</Pill>
                          <Pill size="md">Con-Ops - Dispatcher</Pill>
                        </Group>
                      </div>

                      <Divider color="var(--mantine-color-dark-4)" />

                      <div>
                        <div className="uppercase-label" style={{ marginBottom: 8 }}>
                          My Skills (FR Managed)
                        </div>
                        <Group gap="xs">
                          <Pill size="md">German - Native</Pill>
                          <Pill size="md">English - B2</Pill>
                          <Pill size="md">Communication - Advanced</Pill>
                          <Pill size="md">First Aid - Basic</Pill>
                        </Group>
                      </div>

                      <Divider color="var(--mantine-color-dark-4)" />

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

          {/* TAB 3: FURRY RESSOURCES (FR) */}
          {activeTab === 'fr' && hasFurryResources && (
            <Stack gap={24}>
              <div>
                <Text size="xl" fw={700} c="white">
                  Furry Ressources (FR)
                </Text>
                <Text size="sm" c="dimmed">
                  Internal workspace for the Furry Ressources team
                </Text>
              </div>

              <Paper
                p={24}
                radius="md"
                withBorder
                style={{
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  borderColor: 'var(--mantine-color-dark-4)',
                }}
              >
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <IconUsersGroup size={18} color="var(--mantine-color-cyan-4)" />
                      <Text size="md" fw={700} c="white">
                        FR Workspace Placeholder
                      </Text>
                    </Group>
                    <Badge color="cyan" variant="light">
                      Coming Soon
                    </Badge>
                  </Group>
                  <Text size="sm" c="dimmed">
                    This page is reserved for Furry Ressources tools, crew role audits, and
                    resource management. Only accounts with the{' '}
                    <Text span fw={600} c="white">
                      furry_ressources
                    </Text>{' '}
                    role can access this area.
                  </Text>
                </Stack>
              </Paper>
            </Stack>
          )}

          {/* TAB 4: ADMIN PORTAL SETTINGS */}
          {activeTab === 'admin' && isAdmin && (
            <Stack gap={24}>
              <div>
                <Text size="xl" fw={700} c="white">
                  Portal Settings
                </Text>
                <Text size="sm" c="dimmed">
                  Configure WinterFur Manage portal defaults and quick links
                </Text>
              </div>

              {settingsStatus && (
                <Paper
                  p="sm"
                  radius="sm"
                  withBorder
                  style={{
                    backgroundColor:
                      settingsStatus.type === 'success'
                        ? 'rgba(18, 184, 134, 0.1)'
                        : 'rgba(250, 82, 82, 0.1)',
                    borderColor:
                      settingsStatus.type === 'success'
                        ? 'rgba(18, 184, 134, 0.35)'
                        : 'rgba(250, 82, 82, 0.35)',
                  }}
                >
                  <Text
                    size="xs"
                    fw={600}
                    c={settingsStatus.type === 'success' ? 'teal.4' : 'red.4'}
                  >
                    {settingsStatus.text}
                  </Text>
                </Paper>
              )}

              <Grid gap={24} align="start">
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Paper
                    component="form"
                    onSubmit={handleSaveGeneralSettings}
                    p={24}
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-4)',
                    }}
                  >
                    <Text size="sm" fw={700} c="white" mb="md">
                      General Configuration
                    </Text>
                    <Stack gap="md">
                      <TextInput
                        label="Convention Name"
                        required
                        value={conventionName}
                        onChange={(e) => setConventionName(e.target.value)}
                      />
                      <TextInput
                        label="Identity Server (WinterFur Identity)"
                        value={identityConfig?.issuerUrl ?? 'https://identity.winterfur.org'}
                        disabled
                      />
                      <TextInput
                        label="Realm"
                        value={identityConfig?.realm ?? 'winterfur'}
                        disabled
                      />
                      <Group justify="flex-end">
                        <Button color="cyan" size="xs" type="submit" loading={isSavingSettings}>
                          Save Configuration
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Paper
                    p={24}
                    radius="md"
                    withBorder
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      borderColor: 'var(--mantine-color-dark-4)',
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
                      <Paper
                        component="form"
                        onSubmit={handleAddQuickLink}
                        mb="md"
                        p="sm"
                        radius="sm"
                        withBorder
                        style={{
                          backgroundColor: 'var(--mantine-color-dark-6)',
                          borderColor: 'var(--mantine-color-dark-4)',
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
                                setShowAddQl(false);
                                setQuickLinkUrlError(null);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button color="cyan" size="xs" type="submit">
                              Save
                            </Button>
                          </Group>
                        </Stack>
                      </Paper>
                    )}

                    <Stack gap="xs">
                      {quickLinks.map((q, index) => (
                        <Paper
                          key={q.id}
                          p="xs"
                          withBorder
                          style={{
                            backgroundColor: 'var(--mantine-color-dark-6)',
                            borderColor: 'var(--mantine-color-dark-4)',
                          }}
                        >
                          <Group justify="space-between" wrap="nowrap">
                            <div style={{ minWidth: 0 }}>
                              <Text size="xs" fw={600} c="white" truncate>
                                {q.icon} {q.title}
                              </Text>
                              <Text size="xs" c="dimmed" truncate>
                                {q.url}
                              </Text>
                            </div>
                            <Group gap={4} wrap="nowrap">
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="Move quick link up"
                                title="Move up"
                                disabled={index === 0 || isSavingSettings}
                                onClick={() => handleMoveQuickLink(index, -1)}
                              >
                                <IconArrowUp size={14} />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="Move quick link down"
                                title="Move down"
                                disabled={index === quickLinks.length - 1 || isSavingSettings}
                                onClick={() => handleMoveQuickLink(index, 1)}
                              >
                                <IconArrowDown size={14} />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                size="sm"
                                aria-label="Remove quick link"
                                title="Remove quick link"
                                loading={isSavingSettings}
                                onClick={() => handleRemoveQuickLink(q.id)}
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Group>
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
          <Divider my="sm" color="var(--mantine-color-dark-4)" />
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
