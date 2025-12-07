'use client';

import { useState } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  Input,
  VStack,
  Heading,
  Text,
  Card,
  CardBody,
  InputGroup,
  InputLeftElement,
  Icon,
  Alert,
  AlertIcon,
  Container,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiLock, FiShield } from 'react-icons/fi';

export default function Home() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const bgGradient = useColorModeValue(
    'linear(to-br, blue.400, purple.600)',
    'linear(to-br, blue.600, purple.800)'
  );
  const cardBg = useColorModeValue('white', 'gray.800');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error);
      } else {
        localStorage.setItem('isAuthenticated', 'true');
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Failed to login');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bgGradient={bgGradient}
      position="relative"
      overflow="hidden">
      <Box
        position="absolute"
        top="0"
        left="0"
        right="0"
        bottom="0"
        opacity={0.1}
        bgImage="radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 80%, white 1px, transparent 1px)"
        bgSize="50px 50px"
      />

      <Container maxW="md" position="relative" zIndex={1}>
        <Card shadow="2xl" borderRadius="xl" bg={cardBg}>
          <CardBody p={8}>
            <VStack spacing={6} align="stretch">
              <VStack spacing={2}>
                <Box
                  bg="blue.500"
                  p={4}
                  borderRadius="full"
                  mb={2}
                  boxShadow="0 0 30px rgba(66, 153, 225, 0.4)">
                  <Icon as={FiShield} boxSize={10} color="white" />
                </Box>
                <Heading size="xl" textAlign="center" bgGradient={bgGradient} bgClip="text">
                  Xavia OTA
                </Heading>
                <Text color="gray.600" textAlign="center" fontSize="sm">
                  Sign in to Admin Panel
                </Text>
              </VStack>

              {error && (
                <Alert status="error" borderRadius="md">
                  <AlertIcon />
                  {error}
                </Alert>
              )}

              <form onSubmit={handleLogin}>
                <VStack spacing={4}>
                  <FormControl isInvalid={!!error}>
                    <InputGroup size="lg">
                      <InputLeftElement pointerEvents="none">
                        <Icon as={FiLock} color="gray.400" />
                      </InputLeftElement>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter admin password"
                        focusBorderColor="blue.500"
                        bg={useColorModeValue('gray.50', 'gray.700')}
                        _hover={{
                          bg: useColorModeValue('white', 'gray.600'),
                        }}
                      />
                    </InputGroup>
                    {error && <FormErrorMessage>{error}</FormErrorMessage>}
                  </FormControl>

                  <Button
                    type="submit"
                    colorScheme="blue"
                    width="full"
                    size="lg"
                    isLoading={isLoading}
                    loadingText="Signing in..."
                    bgGradient={bgGradient}
                    _hover={{
                      bgGradient: 'linear(to-br, blue.500, purple.700)',
                      transform: 'translateY(-2px)',
                      shadow: 'lg',
                    }}
                    _active={{
                      transform: 'translateY(0)',
                    }}
                    transition="all 0.2s">
                    Sign In
                  </Button>
                </VStack>
              </form>

              <Box pt={4} borderTop="1px" borderColor="gray.200">
                <Text fontSize="xs" color="gray.500" textAlign="center">
                  Over-the-Air Update Management System
                </Text>
              </Box>
            </VStack>
          </CardBody>
        </Card>
      </Container>
    </Box>
  );
}
