import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'cyan',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  defaultRadius: 'sm',
  components: {
    Pill: {
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-dark-6)',
          border: '1px solid var(--mantine-color-dark-4)',
          color: 'var(--mantine-color-dark-0)',
          fontWeight: '500',
        },
      },
    },
  },
});

