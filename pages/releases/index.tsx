import {
  Box,
  Button,
  Flex,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Link,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';
import { FiArrowRight, FiRefreshCw, FiSearch } from 'react-icons/fi';

import CommitHash from '../../components/CommitHash';
import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/PageHeader';
import ProtectedRoute from '../../components/ProtectedRoute';
import { formatWatTimestamp } from '../../components/time';

interface RuntimeSummary {
  version: string;
  releaseCount: number;
  latestPublishedAt: string;
  activeCommitHash: string | null;
  activeRepositoryUrl: string | null;
}

const PAGE_SIZE = 20;

export default function ReleasesPage() {
  const [runtimes, setRuntimes] = useState<RuntimeSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const query = new URLSearchParams({ search, page: String(page) });
          const response = await fetch(`/api/runtimes?${query}`, { signal: controller.signal });
          if (!response.ok) throw new Error('Failed to fetch runtimes');
          const data = await response.json();
          setRuntimes(data.runtimes);
          setTotal(data.total);
          setError(false);
        } catch {
          if (!controller.signal.aborted) setError(true);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      search ? 250 : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, page, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ProtectedRoute>
      <Layout>
        <PageHeader
          title="Runtime versions"
          actions={
            <IconButton
              aria-label="Refresh runtimes"
              onClick={() => setRefreshKey((key) => key + 1)}
              variant="solid"
              colorScheme="gray"
              size="sm"
              icon={<FiRefreshCw />}
            />
          }
        />
        {loading && <LoadingSpinner py={24} />}
        {error && (
          <Text color="primary.300" fontSize="sm">
            Couldn&apos;t load runtime versions. Please refresh.
          </Text>
        )}
        {!loading && !error && total === 0 && !search && (
          <Box bg="panel" border="1px solid" borderColor="line" borderRadius="14px" p={8}>
            <Text fontWeight={600}>No runtime versions yet</Text>
            <Text color="muted" fontSize="sm" mt={1}>
              Published OTAs will appear here.
            </Text>
          </Box>
        )}
        {!error && (total > 0 || search) && (
          <>
            <Flex align="center" justify="space-between" gap={4} mb={4} wrap="wrap">
              <Text color="muted" fontSize="sm">
                {total} {total === 1 ? 'runtime' : 'runtimes'}
              </Text>
              <InputGroup w={{ base: 'full', sm: '18rem' }}>
                <InputLeftElement pointerEvents="none" color="muted">
                  <FiSearch />
                </InputLeftElement>
                <Input
                  aria-label="Search runtime versions"
                  placeholder="Search runtime versions"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  bg="field"
                  borderColor="line"
                />
              </InputGroup>
            </Flex>
            <Box
              bg="panel"
              border="1px solid"
              borderColor="line"
              borderRadius="14px"
              overflowX="auto">
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th>Runtime</Th>
                    <Th isNumeric>OTA releases</Th>
                    <Th>Live OTA</Th>
                    <Th>Last published</Th>
                    <Th />
                  </Tr>
                </Thead>
                <Tbody>
                  {runtimes.map((runtime) => (
                    <Tr
                      key={runtime.version}
                      _hover={{ bg: 'tray' }}
                      _last={{ td: { borderBottom: 'none' } }}>
                      <Td>
                        <Link
                          as={NextLink}
                          href={`/releases/${encodeURIComponent(runtime.version)}`}
                          fontFamily="mono"
                          fontWeight={600}>
                          {runtime.version}
                        </Link>
                      </Td>
                      <Td isNumeric fontFamily="mono">
                        {runtime.releaseCount}
                      </Td>
                      <Td>
                        {runtime.activeCommitHash ? (
                          <CommitHash
                            hash={runtime.activeCommitHash}
                            repositoryUrl={runtime.activeRepositoryUrl}
                            fontFamily="mono"
                            fontSize="sm"
                          />
                        ) : (
                          <Text color="muted">—</Text>
                        )}
                      </Td>
                      <Td whiteSpace="nowrap" color="muted">
                        {formatWatTimestamp(runtime.latestPublishedAt)}
                      </Td>
                      <Td textAlign="right">
                        <Link
                          as={NextLink}
                          href={`/releases/${encodeURIComponent(runtime.version)}`}
                          color="muted"
                          display="inline-flex"
                          alignItems="center"
                          gap={2}
                          fontSize="sm"
                          whiteSpace="nowrap">
                          View OTAs <FiArrowRight />
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {!loading && total === 0 && (
                <Text color="muted" py={10} textAlign="center">
                  No runtimes match “{search}”.
                </Text>
              )}
            </Box>
            {pageCount > 1 && (
              <Flex justify="space-between" align="center" mt={4} gap={4}>
                <Text color="muted" fontSize="sm">
                  Page {page} of {pageCount}
                </Text>
                <Flex gap={2}>
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={page === 1}
                    onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={page === pageCount}
                    onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </Flex>
              </Flex>
            )}
          </>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
