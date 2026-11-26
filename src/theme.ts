import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'cyan',
  cursorType: 'pointer',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  defaultRadius: 'sm',
  components: {
    Paper: {
      defaultProps: {
        radius: 'md',
      },
    },
    Modal: {
      defaultProps: {
        centered: true,
        radius: 'md',
      },
    },
    Alert: {
      defaultProps: {
        variant: 'light',
        radius: 'sm',
      },
    },
    Badge: {
      defaultProps: {
        variant: 'light',
        radius: 'sm',
      },
    },
    Table: {
      defaultProps: {
        highlightOnHover: true,
        verticalSpacing: 'sm',
        horizontalSpacing: 'md',
      },
    },
    NavLink: {
      defaultProps: {
        variant: 'light',
      },
    },
  },
});
