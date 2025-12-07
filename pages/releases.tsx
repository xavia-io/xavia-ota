import {
  Box,
  Text,
  Heading,
  Button,
  Tag,
  HStack,
  IconButton,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  Flex,
  Tooltip,
  Card,
  CardBody,
  SimpleGrid,
  VStack,
  Badge,
  Icon,
  Divider,
} from '@chakra-ui/react';
import moment from 'moment';
import { useEffect, useRef, useState } from 'react';
import { SlRefresh } from 'react-icons/sl';
import { FiPackage, FiClock, FiGitCommit, FiHardDrive, FiCheckCircle } from 'react-icons/fi';

import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import { showToast } from '../components/toast';

interface Release {
  path: string;
  runtimeVersion: string;
  timestamp: string;
  size: number;
  commitHash: string | null;
  commitMessage: string | null;
}

export default function ReleasesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetchReleases();
  }, []);

  const fetchReleases = async () => {
    try {
      const response = await fetch('/api/releases');
      if (!response.ok) {
        throw new Error('Failed to fetch releases');
      }
      const data = await response.json();
      setReleases(data.releases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch releases');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <Box w="full" maxW="1400px" mx="auto" px={4}>
          <VStack spacing={6} align="stretch">
            <Flex justify="space-between" align="center">
              <Box>
                <Heading size="lg" mb={1}>
                  Releases
                </Heading>
                <Text color="gray.500" fontSize="sm">
                  Manage your application versions
                </Text>
              </Box>
              <IconButton
                aria-label="Refresh"
                onClick={fetchReleases}
                variant="solid"
                colorScheme="blue"
                size="lg"
                icon={<SlRefresh />}
                isLoading={loading}
              />
            </Flex>

            {error && (
              <Card bg="red.50" borderColor="red.200" borderWidth={1}>
                <CardBody>
                  <Text color="red.600">{error}</Text>
                </CardBody>
              </Card>
            )}

            {!loading && !error && (
              <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
                {releases
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((release, index) => (
                    <Card
                      key={index}
                      shadow="md"
                      borderWidth={index === 0 ? 2 : 1}
                      borderColor={index === 0 ? 'green.400' : 'gray.200'}
                      bg={index === 0 ? 'green.50' : 'white'}
                      position="relative"
                      _hover={{
                        shadow: 'lg',
                        transform: 'translateY(-2px)',
                      }}
                      transition="all 0.2s">
                      {index === 0 && (
                        <Badge
                          position="absolute"
                          top={3}
                          right={3}
                          colorScheme="green"
                          fontSize="xs"
                          px={2}
                          py={1}
                          borderRadius="md">
                          <HStack spacing={1}>
                            <Icon as={FiCheckCircle} />
                            <Text>Active</Text>
                          </HStack>
                        </Badge>
                      )}
                      <CardBody>
                        <VStack align="stretch" spacing={3}>
                          <HStack>
                            <Icon as={FiPackage} color="blue.500" boxSize={5} />
                            <Tooltip label={release.path}>
                              <Text fontWeight="bold" fontSize="lg" isTruncated maxW="250px">
                                {release.path}
                              </Text>
                            </Tooltip>
                          </HStack>

                          <Divider />

                          <Box>
                            <Text fontSize="xs" color="gray.500" mb={1}>
                              Runtime Version
                            </Text>
                            <Badge colorScheme="purple" fontSize="sm" px={2} py={1}>
                              {release.runtimeVersion}
                            </Badge>
                          </Box>

                          <Box>
                            <HStack mb={1}>
                              <Icon as={FiGitCommit} color="gray.500" boxSize={3} />
                              <Text fontSize="xs" color="gray.500">
                                Commit
                              </Text>
                            </HStack>
                            <Tooltip label={release.commitHash}>
                              <Text
                                fontSize="sm"
                                fontFamily="mono"
                                bg="gray.100"
                                px={2}
                                py={1}
                                borderRadius="md"
                                isTruncated>
                                {release.commitHash}
                              </Text>
                            </Tooltip>
                          </Box>

                          <Box>
                            <Text fontSize="xs" color="gray.500" mb={1}>
                              Commit Message
                            </Text>
                            <Tooltip label={release.commitMessage}>
                              <Text fontSize="sm" isTruncated>
                                {release.commitMessage}
                              </Text>
                            </Tooltip>
                          </Box>

                          <HStack spacing={4}>
                            <Box flex={1}>
                              <HStack mb={1}>
                                <Icon as={FiClock} color="gray.500" boxSize={3} />
                                <Text fontSize="xs" color="gray.500">
                                  Timestamp
                                </Text>
                              </HStack>
                              <Text fontSize="sm">
                                {moment(release.timestamp).utc().format('MMM DD, HH:mm')}
                              </Text>
                            </Box>
                            <Box>
                              <HStack mb={1}>
                                <Icon as={FiHardDrive} color="gray.500" boxSize={3} />
                                <Text fontSize="xs" color="gray.500">
                                  Size
                                </Text>
                              </HStack>
                              <Text fontSize="sm" fontWeight="semibold">
                                {formatFileSize(release.size)}
                              </Text>
                            </Box>
                          </HStack>

                          <Divider />

                          {index === 0 ? (
                            <Tag size="lg" colorScheme="green" justifyContent="center" py={2}>
                              <HStack>
                                <Icon as={FiCheckCircle} />
                                <Text fontWeight="semibold">Active Release</Text>
                              </HStack>
                            </Tag>
                          ) : (
                            <Button
                              variant="solid"
                              colorScheme="orange"
                              size="md"
                              width="full"
                              onClick={() => {
                                setIsOpen(true);
                                setSelectedRelease(release);
                              }}>
                              Rollback to this release
                            </Button>
                          )}
                        </VStack>
                      </CardBody>
                    </Card>
                  ))}
              </SimpleGrid>
            )}
          </VStack>
        </Box>

        <AlertDialog
          isOpen={isOpen}
          leastDestructiveRef={cancelRef}
          onClose={() => setIsOpen(false)}
          isCentered>
          <AlertDialogOverlay>
            <AlertDialogContent>
              <AlertDialogHeader fontSize="lg" fontWeight="bold">
                Rollback Release
              </AlertDialogHeader>

              <AlertDialogBody>
                <VStack align="stretch" spacing={3}>
                  <Text>Are you sure you want to rollback to this release?</Text>
                  <Card bg="blue.50" borderWidth={1} borderColor="blue.200">
                    <CardBody>
                      <VStack align="stretch" spacing={2}>
                        <HStack>
                          <Icon as={FiGitCommit} color="blue.600" />
                          <Text fontSize="sm" fontWeight="semibold" color="blue.700">
                            Commit Hash:
                          </Text>
                        </HStack>
                        <Text fontSize="sm" fontFamily="mono" color="blue.900">
                          {selectedRelease?.commitHash}
                        </Text>
                      </VStack>
                    </CardBody>
                  </Card>
                  <Card bg="orange.50" borderWidth={1} borderColor="orange.200">
                    <CardBody>
                      <Text fontSize="sm" color="orange.800">
                        This will promote this release to be the active release with a new
                        timestamp.
                      </Text>
                    </CardBody>
                  </Card>
                </VStack>
              </AlertDialogBody>

              <AlertDialogFooter>
                <Button ref={cancelRef} onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button
                  colorScheme="red"
                  onClick={async () => {
                    const response = await fetch('/api/rollback', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        path: selectedRelease?.path,
                        runtimeVersion: selectedRelease?.runtimeVersion,
                        commitHash: selectedRelease?.commitHash,
                        commitMessage: selectedRelease?.commitMessage,
                      }),
                    });

                    if (!response.ok) {
                      throw new Error('Rollback failed');
                    }

                    showToast('Rollback successful', 'success');
                    fetchReleases();
                    setIsOpen(false);
                  }}
                  ml={3}>
                  Rollback
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>
      </Layout>
    </ProtectedRoute>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
