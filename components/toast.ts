import { createStandaloneToast } from '@chakra-ui/react';

export function showToast(message: string, type: 'success' | 'error') {
  const { toast } = createStandaloneToast();

  toast({
    title: type === 'success' ? 'Success' : 'Error',
    description: message,
    status: type,
    duration: 5000,
    isClosable: true,
    size: 'lg',
    position: 'bottom',
  });
}
