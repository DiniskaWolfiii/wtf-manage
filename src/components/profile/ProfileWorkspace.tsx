'use client';

import React, { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Divider,
  Grid,
  Group,
  Loader,
  Paper,
  Pill,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import type { UserProfileData } from '@/lib/keycloak';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_UPLOAD_BYTES,
  getSafeAvatarUrl,
} from '@/lib/validation';
import { PageHeader } from '@/components/ui/PageHeader';

export interface Passkey {
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

function ProfileField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={2}>
        {label}
      </Text>
      <Text size="sm" fw={600}>
        {value || '—'}
      </Text>
    </div>
  );
}

export function ProfileWorkspace({
  profile,
  onProfileChange,
  security,
  onSecurityChange,
  isLoadingProfile,
  isLoadingSecurity,
}: {
  profile: UserProfileData;
  onProfileChange: React.Dispatch<React.SetStateAction<UserProfileData>>;
  security: SecurityData;
  onSecurityChange: React.Dispatch<React.SetStateAction<SecurityData>>;
  isLoadingProfile: boolean;
  isLoadingSecurity: boolean;
}) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState<UserProfileData>({ ...profile });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isSendingVerifyEmail, setIsSendingVerifyEmail] = useState(false);

  const initials = (profile.nickname || profile.username || '?').slice(0, 2).toUpperCase();

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        emailChanged?: boolean;
        emailVerified?: boolean;
        message?: string;
        error?: string;
      } | null;

      if (res.ok && data?.success) {
        const nextEmailVerified = data.emailChanged
          ? false
          : typeof data.emailVerified === 'boolean'
          ? data.emailVerified
          : profile.emailVerified;
        const updatedProfile = { ...editForm, emailVerified: nextEmailVerified };
        onProfileChange(updatedProfile);
        setEditForm(updatedProfile);
        setIsEditingProfile(false);
        notifySuccess(data.message || 'Profile saved.');
      } else {
        setFormError(
          data?.error || data?.message || 'Could not sync changes to WinterFur Identity.'
        );
      }
    } catch (err) {
      console.error(err);
      setFormError('Error saving profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResendVerifyEmail = async () => {
    setIsSendingVerifyEmail(true);
    try {
      const res = await fetch('/api/profile/verify-email', { method: 'POST' });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        alreadyVerified?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        notifyError(data?.error || 'Could not send verification email.');
        return;
      }
      if (data?.alreadyVerified) {
        onProfileChange((prev) => ({ ...prev, emailVerified: true }));
        setEditForm((prev) => ({ ...prev, emailVerified: true }));
        notifySuccess('Your email address is already verified.');
      } else {
        notifySuccess('Verification email sent. Please check your inbox.');
      }
    } catch {
      notifyError('Network error while requesting verification email.');
    } finally {
      setIsSendingVerifyEmail(false);
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

      const data = (await res.json().catch(() => null)) as {
        avatarUrl?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.avatarUrl) {
        setAvatarError(data?.error || 'Failed to upload profile picture.');
        return;
      }

      const safeUrl = getSafeAvatarUrl(data.avatarUrl);
      if (safeUrl) {
        setEditForm((prev) => ({ ...prev, avatarUrl: safeUrl }));
        onProfileChange((prev) => ({ ...prev, avatarUrl: safeUrl }));
        notifySuccess('Profile picture updated.');
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
      onProfileChange((prev) => ({ ...prev, avatarUrl: '' }));
      notifySuccess('Profile picture removed.');
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
        onSecurityChange((prev) => ({
          ...prev,
          passkeys: prev.passkeys.filter((p) => p.id !== id),
        }));
        notifySuccess('Passkey removed.');
      } else {
        notifyError('Failed to remove passkey.');
      }
    } catch (err) {
      console.error('Failed to remove passkey:', err);
      notifyError('Network error while removing passkey.');
    }
  };

  return (
    <Grid gap="lg" align="start">
      {/* Left: Profile View / Edit */}
      <Grid.Col span={{ base: 12, md: 7 }}>
        <Stack gap="md">
          <PageHeader
            title="My Profile"
            actions={
              !isEditingProfile && (
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconEdit size={14} />}
                  onClick={() => {
                    setEditForm({ ...profile });
                    setFormError(null);
                    setIsEditingProfile(true);
                  }}
                >
                  Edit Profile
                </Button>
              )
            }
          />

          {formError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {formError}
            </Alert>
          )}

          {!isEditingProfile ? (
            isLoadingProfile ? (
              <Paper p="xl" withBorder>
                <Group justify="center" gap="sm" py="xl">
                  <Loader size="sm" color="cyan" />
                  <Text size="sm" c="dimmed">
                    Loading profile...
                  </Text>
                </Group>
              </Paper>
            ) : (
              <Paper p="lg" withBorder>
                <Stack gap="lg">
                  <Group gap="md">
                    <Avatar
                      src={getSafeAvatarUrl(profile.avatarUrl)}
                      size={56}
                      radius="xl"
                      color="cyan"
                    >
                      {initials}
                    </Avatar>
                    <div>
                      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                        Nickname
                      </Text>
                      <Title order={3} fz="lg">
                        {profile.nickname || profile.username}
                      </Title>
                    </div>
                  </Group>

                  <Divider />

                  <Grid gap="md">
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                      <ProfileField label="Species" value={profile.species} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                      <ProfileField label="Pronouns" value={profile.pronouns} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                      <ProfileField label="Telegram" value={profile.telegram} />
                    </Grid.Col>
                  </Grid>

                  <Divider />

                  <div>
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={6}>
                      Languages
                    </Text>
                    <Group gap="xs">
                      <Pill size="sm">German</Pill>
                      <Pill size="sm">English</Pill>
                    </Group>
                  </div>

                  <Divider />

                  <Grid gap="md">
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                      <ProfileField label="First Name" value={profile.firstName} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                      <ProfileField label="Last Name" value={profile.lastName} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                      <ProfileField label="Date of Birth" value={profile.dob} />
                    </Grid.Col>
                  </Grid>

                  <Divider />

                  <Grid gap="md">
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <Group gap="xs" align="center" mb={2}>
                        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                          Email Address
                        </Text>
                        {profile.email && (
                          <Badge
                            size="xs"
                            color={profile.emailVerified ? 'teal' : 'yellow'}
                          >
                            {profile.emailVerified ? 'Verified' : 'Unverified'}
                          </Badge>
                        )}
                      </Group>
                      <Text size="sm" fw={600}>
                        {profile.email || '—'}
                      </Text>
                      {profile.email && !profile.emailVerified && (
                        <Button
                          variant="default"
                          size="compact-xs"
                          mt={6}
                          loading={isSendingVerifyEmail}
                          onClick={() => void handleResendVerifyEmail()}
                        >
                          Resend Verification
                        </Button>
                      )}
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <ProfileField label="Phone Number" value={profile.phone} />
                    </Grid.Col>
                  </Grid>

                  <Divider />

                  <Grid gap="md">
                    <Grid.Col span={12}>
                      <ProfileField label="Street & House Number" value={profile.street} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <ProfileField
                        label="Postal Code & City"
                        value={
                          profile.zip ? `${profile.zip} ${profile.city}` : profile.city
                        }
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <ProfileField label="Country" value={profile.country} />
                    </Grid.Col>
                  </Grid>
                </Stack>
              </Paper>
            )
          ) : (
            <Paper component="form" onSubmit={handleSaveProfile} p="lg" withBorder>
              <Stack gap="md">
                <Group gap="md">
                  <Avatar
                    src={getSafeAvatarUrl(editForm.avatarUrl)}
                    size={48}
                    radius="xl"
                    color="cyan"
                  >
                    {initials}
                  </Avatar>
                  <div>
                    <Text size="sm" fw={600}>
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
                      <Text size="xs" c="red" mt={4}>
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

                <Divider />

                <Group justify="flex-end" gap="sm">
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => {
                      setIsEditingProfile(false);
                      setFormError(null);
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button size="xs" type="submit" loading={isSaving}>
                    Save Changes
                  </Button>
                </Group>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Grid.Col>

      {/* Right: Account Security */}
      <Grid.Col span={{ base: 12, md: 5 }}>
        <Stack gap="md">
          <PageHeader title="Account Security" />

          {isLoadingSecurity ? (
            <Paper p="xl" withBorder>
              <Group justify="center" gap="sm" py="lg">
                <Loader size="sm" color="cyan" />
                <Text size="sm" c="dimmed">
                  Loading security settings...
                </Text>
              </Group>
            </Paper>
          ) : (
            <Paper p="lg" withBorder>
              <Stack gap="lg">
                <Group justify="space-between" wrap="nowrap">
                  <div>
                    <Text size="sm" fw={600}>
                      Password
                    </Text>
                    <Text size="xs" c="dimmed">
                      {security.passwordUpdated || 'Configured'}
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

                <Divider />

                <Group justify="space-between" wrap="nowrap">
                  <div>
                    <Group gap="xs">
                      <Text size="sm" fw={600}>
                        2FA Authenticator
                      </Text>
                      <Badge
                        color={security.hasTotp ? 'teal' : 'gray'}
                        size="xs"
                      >
                        {security.hasTotp ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {security.hasTotp
                        ? security.totpLabel || 'TOTP active'
                        : 'Not configured'}
                    </Text>
                  </div>
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => handleTriggerAction('CONFIGURE_TOTP')}
                  >
                    {security.hasTotp ? 'Configure' : 'Set Up'}
                  </Button>
                </Group>

                <Divider />

                <div>
                  <Group justify="space-between" mb="xs" wrap="nowrap">
                    <Group gap="xs">
                      <Text size="sm" fw={600}>
                        Passkeys
                      </Text>
                      <Badge
                        color={security.passkeys.length > 0 ? 'teal' : 'gray'}
                        size="xs"
                      >
                        {security.passkeys.length}
                      </Badge>
                    </Group>
                    <Button
                      variant="default"
                      size="xs"
                      leftSection={<IconPlus size={14} />}
                      onClick={() =>
                        handleTriggerAction('webauthn-register-passwordless')
                      }
                    >
                      Add
                    </Button>
                  </Group>

                  {security.passkeys.length === 0 ? (
                    <Text size="xs" c="dimmed">
                      No passkeys registered.
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      {security.passkeys.map((p) => (
                        <Paper
                          key={p.id}
                          p="xs"
                          radius="sm"
                          withBorder
                          bg="var(--mantine-color-dark-6)"
                        >
                          <Group justify="space-between" wrap="nowrap">
                            <div style={{ minWidth: 0 }}>
                              <Text size="xs" fw={600} truncate>
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
                              aria-label="Remove passkey"
                              onClick={() => void handleRemovePasskey(p.id)}
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
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
