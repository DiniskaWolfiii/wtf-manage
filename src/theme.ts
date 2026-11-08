import { createTheme, MantineColorsTuple } from '@mantine/core';

const winterfurBlue: MantineColorsTuple = [
  '#e7f5ff',
  '#d0ebff',
  '#a5d8ff',
  '#74c0fc',
  '#4dabf7',
  '#339af0',
  '#228be6',
  '#1c7ed6',
  '#1971c2',
  '#1864ab'
];

export const theme = createTheme({
  primaryColor: 'winterfurBlue',
  colors: {
    winterfurBlue,
  },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  defaultRadius: 'md',
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

