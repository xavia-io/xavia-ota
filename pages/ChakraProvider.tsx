'use client';

import { ChakraProvider, extendTheme } from '@chakra-ui/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  const theme = extendTheme({
    colors: {
      background: '#F7F8FA',
      primary: {
        DEFAULT: '#5655D7', // Primary color
        100: '#DDDDF7',
        200: '#BBBBEF',
        300: '#9A99E7',
        400: '#7877DF',
        500: '#5655D7',
        600: '#4D4CC1',
        700: '#4948B7',
        800: '#4544AC',
        900: '#4040A1',
      },
    },
  });
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}
