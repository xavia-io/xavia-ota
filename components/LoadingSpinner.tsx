import { Box, BoxProps, Spinner, SpinnerProps } from '@chakra-ui/react';

export default function LoadingSpinner(props: BoxProps & SpinnerProps) {
  return (
    <Box className="flex justify-center items-center w-full h-full" {...props}>
      <Spinner size={props.size} {...props} />
    </Box>
  );
}
