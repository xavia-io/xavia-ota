import { Box, BoxProps } from '@chakra-ui/react';
import Image from 'next/image';

export default function LoadingSpinner({ size = 100, ...props }: BoxProps & { size?: number }) {
  return (
    <Box
      role="status"
      aria-label="Loading"
      className="flex justify-center items-center w-full h-full"
      {...props}>
      <Image src="/go_loader.gif" width={size} height={size} alt="" unoptimized priority />
    </Box>
  );
}
