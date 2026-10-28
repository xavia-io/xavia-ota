import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Link,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
} from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import moment from 'moment';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';

import CommitHash from '../components/CommitHash';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/PageHeader';
import ProtectedRoute from '../components/ProtectedRoute';
import {
  compareRuntimeVersionsDesc,
  formatFileSize,
  Release,
  servedUpdateId,
} from '../components/releases';
import { formatWatTimestamp } from '../components/time';

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(31,157,85,.55); }
  70% { box-shadow: 0 0 0 7px rgba(31,157,85,0); }
  100% { box-shadow: 0 0 0 0 rgba(31,157,85,0); }
`;

export default function Dashboard() {
  const [uniqueInstallations, setUniqueInstallations] = useState(0);
  const [iosInstallations, setIosInstallations] = useState(0);
  const [androidInstallations, setAndroidInstallations] = useState(0);
  const [totalReleases, setTotalReleases] = useState(0);
  const [monthlyInstallations, setMonthlyInstallations] = useState(0);
  const [activeReleases, setActiveReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [response, monthlyResponse, releasesResponse] = await Promise.all([
        fetch('/api/tracking/summary'),
        fetch('/api/tracking/monthly'),
        fetch('/api/releases'),
      ]);
      if (!response.ok || !monthlyResponse.ok || !releasesResponse.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const data = await response.json();
      const monthlyData = await monthlyResponse.json();
      const releasesData = await releasesResponse.json();
      const currentMonth = moment().utcOffset(60).format('YYYY-MM');
      setMonthlyInstallations(
        monthlyData.installations?.find(
          (item: { month: string; count: number }) => item.month === currentMonth
        )?.count ?? 0
      );

      const releases: Release[] = releasesData.releases ?? [];
      setActiveReleases(
        releases
          .filter((release) => release.status === 'active')
          .sort((a, b) => compareRuntimeVersionsDesc(a.runtimeVersion, b.runtimeVersion))
      );
      setUniqueInstallations(data.uniqueInstallations);
      setIosInstallations(data.iosInstallations);
      setAndroidInstallations(data.androidInstallations);
      setTotalReleases(releases.length);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = [
    { label: 'Releases published', value: totalReleases, detail: '' },
    {
      label: 'Unique installs reached',
      value: uniqueInstallations,
      detail: 'App installations offered an OTA across all releases.',
    },
    {
      label: 'iOS installs reached',
      value: iosInstallations,
      detail: 'Unique iOS installations offered an OTA.',
    },
    {
      label: 'Android installs reached',
      value: androidInstallations,
      detail: 'Unique Android installations offered an OTA.',
    },
    {
      label: 'Installs reached this month',
      value: monthlyInstallations,
      detail: 'Unique installations offered an OTA this month.',
    },
  ];
  // The highest runtime is the one current app builds use, even if an older runtime was pushed
  // to more recently.
  const latestRelease = activeReleases[0] ?? null;

  return (
    <ProtectedRoute>
      <Layout>
        <PageHeader title="Dashboard" />

        {isLoading ? (
          <LoadingSpinner py={24} />
        ) : hasError ? (
          <Box bg="panel" border="1px solid" borderColor="line" borderRadius="14px" p={8}>
            <Text>Couldn’t load dashboard data. Check the database connection and try again.</Text>
            <Button mt={4} colorScheme="gray" onClick={fetchData}>
              Retry
            </Button>
          </Box>
        ) : (
          <>
            <Box
              position="relative"
              bg="panel"
              border="1px solid"
              borderColor="line"
              borderRadius="14px"
              overflow="hidden"
              p={{ base: 6, md: 8 }}
              _before={{
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                h: '2px',
                bgGradient: 'linear(to-r, primary.500, rgba(200,30,44,.25) 45%, transparent)',
              }}>
              {latestRelease ? (
                <>
                  <Flex justify="space-between" align="center" gap={4} wrap="wrap">
                    <Flex align="center" gap={2.5}>
                      <Box
                        boxSize="7px"
                        borderRadius="full"
                        bg="verified.dot"
                        animation={`${pulse} 2.4s ease-out infinite`}
                      />
                      <Text fontSize="sm" fontWeight={500} color="verified.text">
                        Latest live OTA
                      </Text>
                    </Flex>
                    <Text fontSize="sm" color="muted">
                      Shipped {moment(latestRelease.timestamp).fromNow()}
                    </Text>
                  </Flex>

                  <Flex align="baseline" gap={3} mt={6} wrap="wrap">
                    <Text fontSize="sm" color="muted">
                      Runtime
                    </Text>
                    <Heading as="p" fontSize={{ base: '4xl', md: '5xl' }} lineHeight={1}>
                      {latestRelease.runtimeVersion}
                    </Heading>
                  </Flex>

                  <Text mt={4} fontSize="lg" noOfLines={2} maxW="68ch">
                    {latestRelease.commitMessage || 'No commit message'}
                  </Text>

                  <Flex
                    mt={8}
                    pt={5}
                    borderTop="1px solid"
                    borderColor="line"
                    justify="space-between"
                    align="center"
                    gap={4}
                    wrap="wrap">
                    <Flex gap={5} fontFamily="mono" fontSize="xs" color="muted" wrap="wrap">
                      <CommitHash
                        hash={latestRelease.commitHash}
                        repositoryUrl={latestRelease.repositoryUrl}
                      />
                      <Text>{formatFileSize(latestRelease.size)}</Text>
                      <Text>{formatWatTimestamp(latestRelease.timestamp, 'MMM D, HH:mm')}</Text>
                    </Flex>
                    <Button
                      as={NextLink}
                      href="/releases"
                      variant="ghost"
                      colorScheme="gray"
                      size="sm"
                      ml={{ base: -3, md: 0 }}
                      rightIcon={<FiArrowRight />}>
                      Manage releases
                    </Button>
                  </Flex>
                </>
              ) : (
                <Heading as="p" fontSize="xl">
                  No active releases
                </Heading>
              )}
            </Box>

            {activeReleases.length > 1 && (
              <Box
                mt={4}
                bg="panel"
                border="1px solid"
                borderColor="line"
                borderRadius="14px"
                overflowX="auto"
                p={{ base: 4, md: 6 }}>
                <Heading as="h2" fontSize="md" mb={2}>
                  Live OTA for each runtime
                </Heading>
                <Table size="sm" variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Runtime</Th>
                      <Th>Live commit</Th>
                      <Th>Update ID</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {activeReleases.map((release) => (
                      <Tr key={release.id} _last={{ td: { borderBottom: 'none' } }}>
                        <Td>
                          <Link
                            as={NextLink}
                            href={`/releases/${encodeURIComponent(release.runtimeVersion)}`}
                            fontFamily="mono">
                            {release.runtimeVersion}
                          </Link>
                        </Td>
                        <Td fontFamily="mono">
                          <CommitHash
                            hash={release.commitHash}
                            repositoryUrl={release.repositoryUrl}
                          />
                        </Td>
                        <Td fontFamily="mono" fontSize="xs" color="muted">
                          {servedUpdateId(release) || 'Pending'}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}

            <Grid
              mt={4}
              templateColumns={{ base: '1fr', lg: 'repeat(5, 1fr)' }}
              gap="1px"
              bg="line"
              border="1px solid"
              borderColor="line"
              borderRadius="14px"
              overflow="hidden">
              {stats.map((stat) => (
                <Box key={stat.label} bg="panel" px={5} py={5}>
                  <Tooltip label={stat.detail} isDisabled={!stat.detail}>
                    <Text fontSize="xs" color="muted" cursor={stat.detail ? 'help' : 'default'}>
                      {stat.label}
                    </Text>
                  </Tooltip>
                  <Text
                    mt={2}
                    fontFamily="mono"
                    fontSize="2xl"
                    fontWeight={500}
                    sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {stat.value.toLocaleString()}
                  </Text>
                </Box>
              ))}
            </Grid>
          </>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
