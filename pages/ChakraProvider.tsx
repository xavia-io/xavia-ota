'use client';

import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { archivo, jetbrainsMono } from '../styles/fonts';

// The brand palette is dark-only, so ignore any stored or system preference.
const darkOnly = {
  type: 'localStorage' as const,
  ssr: false,
  get: () => 'dark' as const,
  set: () => {},
};

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  fonts: {
    heading: archivo.style.fontFamily,
    body: archivo.style.fontFamily,
    mono: jetbrainsMono.style.fontFamily,
  },
  colors: {
    background: '#0B0B0D',
    panel: '#141416',
    tray: '#18181B',
    field: '#0F0F11',
    line: '#26262A',
    muted: '#9A9AA0',
    primary: {
      DEFAULT: '#C81E2C',
      50: '#FFF1F2',
      100: '#FFD9DB',
      200: '#FFB0B4',
      300: '#FF8B8F',
      400: '#E0414D',
      500: '#C81E2C',
      600: '#A5121F',
      700: '#860E19',
      800: '#660A13',
      900: '#46060C',
    },
    verified: {
      dot: '#1F9D55',
      border: '#2F6B4F',
      bg: 'rgba(47,107,79,.14)',
      text: '#A8CDB8',
    },
    warning: {
      border: '#E0B400',
      text: '#F0CF5A',
      bg: 'rgba(224,180,0,.08)',
      hover: 'rgba(224,180,0,.12)',
      onSolid: '#2A1F00',
    },
  },
  shadows: {
    outline: '0 0 0 2px rgba(200,30,44,.7)',
  },
  styles: {
    global: {
      'html, body': {
        bg: 'background',
        color: 'white',
        WebkitFontSmoothing: 'antialiased',
      },
      '::selection': {
        bg: 'primary.500',
        color: 'white',
      },
      '@media (prefers-reduced-motion: reduce)': {
        '*, *::before, *::after': {
          animationDuration: '0.01ms !important',
          transitionDuration: '0.01ms !important',
        },
      },
    },
  },
  components: {
    Heading: {
      baseStyle: {
        fontStretch: '125%',
        fontWeight: 600,
        letterSpacing: '-0.01em',
      },
    },
    Button: {
      baseStyle: {
        fontWeight: 500,
      },
      variants: {
        solid: (props: { colorScheme: string }) =>
          props.colorScheme === 'primary'
            ? {
                bg: 'primary.500',
                color: 'white',
                _hover: { bg: 'primary.600', _disabled: { bg: 'primary.500' } },
                _active: { bg: 'primary.600' },
              }
            : props.colorScheme === 'gray'
            ? {
                bg: '#1F1F22',
                color: 'white',
                border: '1px solid',
                borderColor: 'line',
                _hover: { bg: '#2A2A2E' },
                _active: { bg: '#2A2A2E' },
              }
            : {},
        ghost: (props: { colorScheme: string }) =>
          props.colorScheme === 'gray'
            ? {
                color: 'muted',
                _hover: { bg: 'rgba(255,255,255,.06)', color: 'white' },
                _active: { bg: 'rgba(255,255,255,.1)' },
              }
            : {},
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: 'panel',
          borderColor: 'line',
          borderRadius: '12px',
          boxShadow: 'none',
        },
      },
    },
    Table: {
      variants: {
        simple: {
          th: {
            borderColor: 'line',
            color: 'muted',
            fontFamily: 'body',
            fontWeight: 500,
            fontSize: '11px',
            letterSpacing: '0.06em',
          },
          td: { borderColor: 'line', fontSize: 'sm' },
        },
      },
    },
    Input: {
      variants: {
        outline: {
          field: {
            bg: 'field',
            borderColor: 'line',
            _hover: { borderColor: '#3A3A3D' },
            _focusVisible: { borderColor: 'primary.500', boxShadow: '0 0 0 1px #C81E2C' },
          },
        },
      },
    },
    Modal: {
      baseStyle: {
        overlay: { bg: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' },
        dialog: { bg: 'tray', border: '1px solid', borderColor: 'line', borderRadius: '14px' },
      },
    },
    Tooltip: {
      baseStyle: {
        bg: 'tray',
        color: 'white',
        border: '1px solid',
        borderColor: 'line',
        fontFamily: 'mono',
        fontSize: 'xs',
      },
    },
    Spinner: {
      baseStyle: { color: 'primary.500' },
    },
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider theme={theme} colorModeManager={darkOnly}>
      {children}
    </ChakraProvider>
  );
}
