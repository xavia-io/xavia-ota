'use client';

import { useState } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
} from '@chakra-ui/react';
import Image from 'next/image';
import { FiEye, FiEyeOff } from 'react-icons/fi';

export default function Home() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
    }
  };

  return (
    <Box display="flex" minHeight="100vh" alignItems="center" justifyContent="center" px={5}>
      <Box as="form" onSubmit={handleLogin} w="full" maxW="360px">
        <Box display="flex" justifyContent="center" mb={10}>
          <Image src="/go_logo.svg" width={80} height={52} alt="GO" priority />
        </Box>
        <FormControl isInvalid={!!error} mb={4}>
          <FormLabel fontSize="sm" color="muted" fontWeight={500}>
            Admin password
          </FormLabel>
          <InputGroup size="md">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              pr="3rem"
            />
            <InputRightElement h="full" w="3rem">
              <IconButton
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                icon={showPassword ? <FiEyeOff /> : <FiEye />}
                variant="ghost"
                color="muted"
                size="sm"
                onClick={() => setShowPassword((visible) => !visible)}
              />
            </InputRightElement>
          </InputGroup>
          {error && <FormErrorMessage>{error}</FormErrorMessage>}
        </FormControl>
        <Button type="submit" colorScheme="primary" width="full">
          Sign in
        </Button>
      </Box>
    </Box>
  );
}
