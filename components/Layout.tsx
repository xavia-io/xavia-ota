import {
  Box,
  Flex,
  VStack,
  Button,
  FlexProps,
  Icon,
  Text,
  Divider,
  useColorModeValue,
  HStack,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { FiLogOut, FiHome, FiPackage } from 'react-icons/fi';
import Image from 'next/image';

export default function Layout({ children, ...props }: { children: React.ReactNode } & FlexProps) {
  const router = useRouter();

  const sidebarBg = useColorModeValue('white', 'gray.800');
  const sidebarBorder = useColorModeValue('gray.200', 'gray.700');
  const headerBg = useColorModeValue('white', 'gray.800');

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: FiHome },
    { name: 'Releases', path: '/releases', icon: FiPackage },
  ];

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    router.push('/');
  };

  return (
    <Flex height="100vh" overflow="hidden" bg={useColorModeValue('gray.50', 'gray.900')} {...props}>
      {/* Sidebar */}
      <Box
        w="280px"
        bg={sidebarBg}
        borderRightWidth="1px"
        borderColor={sidebarBorder}
        display="flex"
        flexDirection="column"
        boxShadow="sm"
        height="100vh"
        overflowY="auto">
        {/* Logo Section */}
        <Box
          p={6}
          bg={headerBg}
          borderBottomWidth="1px"
          borderColor={sidebarBorder}
          display="flex"
          alignItems="center"
          justifyContent="center"
          minH="100px">
          <Image
            src="/xavia_logo.png"
            width={180}
            height={60}
            style={{ objectFit: 'contain' }}
            alt="Xavia Logo"
          />
        </Box>

        {/* Navigation */}
        <VStack spacing={2} align="stretch" p={4} flex={1}>
          <Text fontSize="xs" fontWeight="bold" color="gray.500" px={3} mb={2}>
            NAVIGATION
          </Text>
          {navItems.map((item) => {
            const isActive = router.pathname === item.path;
            return (
              <Button
                key={item.path}
                onClick={() => router.push(item.path)}
                variant="ghost"
                justifyContent="flex-start"
                px={4}
                py={6}
                bg={isActive ? 'blue.50' : 'transparent'}
                color={isActive ? 'blue.600' : 'gray.700'}
                borderLeftWidth="3px"
                borderLeftColor={isActive ? 'blue.600' : 'transparent'}
                borderRadius="md"
                fontWeight={isActive ? 'semibold' : 'medium'}
                _hover={{
                  bg: isActive ? 'blue.100' : 'gray.100',
                  transform: 'translateX(2px)',
                }}
                _active={{
                  transform: 'translateX(0)',
                }}
                transition="all 0.2s">
                <HStack spacing={3} w="full">
                  <Icon as={item.icon} boxSize={5} />
                  <Text>{item.name}</Text>
                </HStack>
              </Button>
            );
          })}
        </VStack>

        {/* Logout Section */}
        <Box p={4}>
          <Divider mb={4} />
          <Button
            onClick={handleLogout}
            variant="ghost"
            colorScheme="red"
            justifyContent="flex-start"
            px={4}
            py={6}
            w="full"
            fontWeight="medium"
            _hover={{
              bg: 'red.50',
              transform: 'translateX(2px)',
            }}
            transition="all 0.2s">
            <HStack spacing={3} w="full">
              <Icon as={FiLogOut} boxSize={5} />
              <Text>Logout</Text>
            </HStack>
          </Button>
        </Box>
      </Box>

      {/* Main Content */}
      <Box flex={1} height="100vh" overflowY="auto" overflowX="hidden">
        <Box minH="100%" p={8}>
          {children}
        </Box>
      </Box>
    </Flex>
  );
}
