import { Box, Button, Flex, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { FiGrid, FiLayers, FiLogOut } from 'react-icons/fi';
import Image from 'next/image';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: FiGrid },
  { name: 'Releases', path: '/releases', icon: FiLayers },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    router.push('/');
  };

  return (
    <Flex direction={{ base: 'column', md: 'row' }} minH="100vh" bg="background">
      <Flex
        as="aside"
        direction={{ base: 'row', md: 'column' }}
        align={{ base: 'center', md: 'stretch' }}
        gap={{ base: 3, md: 8 }}
        w={{ md: '232px' }}
        flexShrink={0}
        position={{ md: 'sticky' }}
        top={0}
        h={{ md: '100vh' }}
        px={4}
        py={{ base: 3, md: 6 }}
        borderRight={{ md: '1px solid #26262A' }}
        borderBottom={{ base: '1px solid #26262A', md: 'none' }}>
        <Flex as={NextLink} href="/dashboard" align="center" gap={3} px={{ md: 2 }}>
          <Image src="/go_logo.svg" width={50} height={32} alt="GO" priority />
          <Text
            display={{ base: 'none', sm: 'block' }}
            fontSize="xs"
            fontWeight={500}
            color="muted"
            letterSpacing="0.08em"
            textTransform="uppercase"
            pl={3}
            borderLeft="1px solid"
            borderColor="line">
            OTA updates
          </Text>
        </Flex>

        <Stack
          as="nav"
          direction={{ base: 'row', md: 'column' }}
          spacing={1}
          ml={{ base: 'auto', md: 0 }}>
          {navItems.map((item) => {
            const isActive = router.pathname === item.path;
            return (
              <Flex
                key={item.path}
                as={NextLink}
                href={item.path}
                aria-current={isActive ? 'page' : undefined}
                align="center"
                gap={3}
                px={3}
                h="36px"
                borderRadius="8px"
                position="relative"
                fontSize="sm"
                fontWeight={500}
                color={isActive ? 'white' : 'muted'}
                bg={isActive ? 'rgba(255,255,255,.06)' : 'transparent'}
                transition="background .15s, color .15s"
                _hover={{ color: 'white', bg: 'rgba(255,255,255,.04)' }}
                _focusVisible={{ boxShadow: 'outline', outline: 'none' }}
                _before={
                  isActive
                    ? {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: '9px',
                        bottom: '9px',
                        w: '2px',
                        borderRadius: 'full',
                        bg: 'primary.500',
                      }
                    : undefined
                }>
                <Box as={item.icon} boxSize="16px" flexShrink={0} />
                <Text display={{ base: 'none', sm: 'block' }}>{item.name}</Text>
              </Flex>
            );
          })}
        </Stack>

        <Button
          mt={{ md: 'auto' }}
          variant="ghost"
          colorScheme="gray"
          size="sm"
          h="36px"
          justifyContent="flex-start"
          leftIcon={<FiLogOut />}
          iconSpacing={3}
          px={3}
          _hover={{ bg: 'rgba(255,255,255,.04)', color: '#FF8B8F' }}
          onClick={handleLogout}>
          <Text display={{ base: 'none', md: 'block' }}>Log out</Text>
        </Button>
      </Flex>

      <Box as="main" flex={1} minW={0} px={{ base: 5, md: 10 }} py={{ base: 6, md: 10 }}>
        <Box maxW="1120px" mx="auto">
          {children}
        </Box>
      </Box>
    </Flex>
  );
}
