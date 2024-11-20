import { Box, Flex, VStack, Button, FlexProps } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { FaSignOutAlt, FaTachometerAlt, FaTags } from 'react-icons/fa';
import Image from 'next/image';

export default function Layout({ children, ...props }: { children: React.ReactNode } & FlexProps) {
  const router = useRouter();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <FaTachometerAlt fontSize="1.25rem" /> },
    { name: 'Releases', path: '/releases', icon: <FaTags fontSize="1.25rem" /> },
  ];

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    router.push('/');
  };

  return (
    <Box className="w-full" height="100vh" {...props}>
      <Box
        w="full"
        p={4}
        className=" text-white h-[6rem] border-b-gray-200 border-b-2"
        display="flex"
        alignItems="center"
        justifyContent="center"
        position="relative">
        <Box>
          <Image
            src="/xavia_logo.png"
            width={200}
            height={200}
            style={{ objectFit: 'contain' }}
            alt="Xavia Logo"
          />
        </Box>
      </Box>
      <Flex className="h-[calc(100vh-6rem)] ">
        <Box
          w="250px"
          p={4}
          className="h-full border-r-gray-200 border-r-2"
          display="flex"
          flexDirection="column"
          justifyContent="space-between">
          <VStack spacing={4} align="stretch">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={router.pathname === item.path ? 'solid' : 'ghost'}
                colorScheme={router.pathname === item.path ? 'primary' : 'gray'}
                rightIcon={item.icon}
                onClick={() => router.push(item.path)}
                justifyContent="space-between">
                <Box flex="1" textAlign="left">
                  {item.name}
                </Box>
              </Button>
            ))}
          </VStack>
          <Button
            variant="outline"
            colorScheme="red"
            onClick={handleLogout}
            rightIcon={<FaSignOutAlt />}>
            Logout
          </Button>
        </Box>
        <Box flex={1} p={8}>
          {children}
        </Box>
      </Flex>
    </Box>
  );
}
