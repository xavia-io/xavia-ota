import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Button,
  Flex,
  IconButton,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  Tooltip,
  SimpleGrid,
  Link,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiChevronDown, FiRefreshCw, FiRotateCcw } from 'react-icons/fi';

import CommitHash from '../../components/CommitHash';
import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/PageHeader';
import ProtectedRoute from '../../components/ProtectedRoute';
import {
  formatFileSize,
  Release,
  ReleasePublication,
  servedUpdateId,
} from '../../components/releases';
import { showToast } from '../../components/toast';
import { formatWatTimestamp } from '../../components/time';

interface RollbackPreview {
  runtimeVersion: string;
  current: { id: string; commitHash: string; updateId: string; timestamp: string };
  target: { commitHash: string; updateId: string | null; timestamp: string };
  estimatedAffectedInstallations: number;
  archiveAvailable: boolean;
  blockedReason: string | null;
}

interface RuntimeMetrics {
  iosInstalls: number;
  androidInstalls: number;
  uniqueInstallsThisMonth: number;
}

interface ReleasePlatformMetrics {
  platform: string;
  uniqueInstallations: number;
  manifestRequests: number;
  downloadAttempts: number;
  assetRequests: number;
  bytesTransferred: number;
  failedLaunches: number;
}

interface ReleaseMetricsState {
  rows?: ReleasePlatformMetrics[];
  loading?: boolean;
  error?: boolean;
}

// One line in a release's history: its own publications, plus rollbacks that moved Live away
// from it to another release.
type HistoryEvent =
  | { kind: 'publish' | 'rollback'; at: string; publication: ReleasePublication }
  | { kind: 'replaced'; at: string; byRelease: Release | undefined };

const historyDate = (value: string) => formatWatTimestamp(value, 'D MMM, HH:mm');

export default function RuntimeReleasesPage() {
  const router = useRouter();
  const runtimeVersion =
    typeof router.query.runtimeVersion === 'string' ? router.query.runtimeVersion : '';
  const [metrics, setMetrics] = useState<RuntimeMetrics | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [expandedReleaseId, setExpandedReleaseId] = useState<string | null>(null);
  const [releaseMetrics, setReleaseMetrics] = useState<Record<string, ReleaseMetricsState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<RollbackPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const fetchReleases = useCallback(async () => {
    if (!runtimeVersion) return;
    setLoading(true);
    try {
      const [releasesResponse, metricsResponse] = await Promise.all([
        fetch('/api/releases'),
        fetch(`/api/runtimes/${encodeURIComponent(runtimeVersion)}`),
      ]);
      if (!releasesResponse.ok || !metricsResponse.ok) {
        throw new Error('Failed to fetch runtime releases');
      }
      const [releaseData, metricData] = await Promise.all([
        releasesResponse.json(),
        metricsResponse.json(),
      ]);
      setReleases(
        releaseData.releases.filter((release: Release) => release.runtimeVersion === runtimeVersion)
      );
      setMetrics(metricData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch runtime releases');
    } finally {
      setLoading(false);
    }
  }, [runtimeVersion]);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  const toggleRelease = async (releaseId: string, retry = false) => {
    if (expandedReleaseId === releaseId && !retry) {
      setExpandedReleaseId(null);
      return;
    }
    setExpandedReleaseId(releaseId);
    if (!retry && (releaseMetrics[releaseId]?.rows || releaseMetrics[releaseId]?.loading)) return;

    setReleaseMetrics((current) => ({ ...current, [releaseId]: { loading: true } }));
    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/metrics`);
      if (!response.ok) throw new Error('Failed to fetch release metrics');
      const data = await response.json();
      setReleaseMetrics((current) => ({ ...current, [releaseId]: { rows: data.metrics } }));
    } catch {
      setReleaseMetrics((current) => ({ ...current, [releaseId]: { error: true } }));
    }
  };

  const rollBack = async () => {
    if (!selectedRelease || !rollbackPreview || rollbackPreview.blockedReason) return;
    setIsRollingBack(true);
    try {
      const response = await fetch('/api/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: selectedRelease.path,
          runtimeVersion: selectedRelease.runtimeVersion,
          expectedActiveReleaseId: rollbackPreview.current.id,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Rollback failed');
      }

      showToast('Rolled back. Phones get this release on their next update check.', 'success');
      fetchReleases();
      setIsOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Rollback failed', 'error');
      if (selectedRelease) openRollback(selectedRelease);
    } finally {
      setIsRollingBack(false);
    }
  };

  const openRollback = async (release: Release) => {
    setSelectedRelease(release);
    setRollbackPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    setIsOpen(true);
    try {
      const query = new URLSearchParams({
        path: release.path,
        runtimeVersion: release.runtimeVersion,
      });
      const response = await fetch(`/api/rollback?${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not check rollback');
      setRollbackPreview(result);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Could not check rollback');
    } finally {
      setPreviewLoading(false);
    }
  };

  const sortedReleases = [...releases].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const activeRelease = releases.find((release) => release.status === 'active');
  const activePublication = activeRelease?.publications[0];
  const releaseById = new Map(releases.map((release) => [release.id, release]));

  const historyFor = (release: Release): HistoryEvent[] => {
    const own: HistoryEvent[] = release.publications.map((publication) => ({
      kind: publication.kind,
      // The row shows the release's publish time, so the history uses the same one.
      at: publication.kind === 'publish' ? release.timestamp : publication.publishedAt,
      publication,
    }));
    const replaced: HistoryEvent[] = releases.flatMap((other) =>
      other.publications
        .filter((publication) => publication.rolledBackFromReleaseId === release.id)
        .map((publication) => ({
          kind: 'replaced' as const,
          at: publication.publishedAt,
          byRelease: other,
        }))
    );
    return [...own, ...replaced].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
  };

  const showRelease = (releaseId: string) => {
    if (expandedReleaseId !== releaseId) toggleRelease(releaseId);
    requestAnimationFrame(() =>
      document
        .getElementById(`release-row-${releaseId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
  };

  // Jumps to another row, which is where it can be rolled back to (again).
  const releaseLink = (releaseId: string | null, fallbackHash: string | null) => {
    const release = releaseId ? releaseById.get(releaseId) : undefined;
    const hash = release?.commitHash ?? fallbackHash;
    const label = hash ? hash.slice(0, 7) : 'an earlier release';
    if (!release) {
      return (
        <Text as="span" fontFamily={hash ? 'mono' : undefined}>
          {label}
        </Text>
      );
    }
    return (
      <Button
        variant="link"
        color="white"
        fontFamily={hash ? 'mono' : undefined}
        fontSize="inherit"
        fontWeight="normal"
        verticalAlign="baseline"
        textDecoration="underline"
        textDecorationColor="rgba(255,255,255,.2)"
        textUnderlineOffset="3px"
        _hover={{ textDecorationColor: 'primary.500' }}
        aria-label={`Show release ${label}`}
        onClick={() => showRelease(release.id)}>
        {label}
      </Button>
    );
  };

  return (
    <ProtectedRoute>
      <Layout>
        <PageHeader
          title={`Runtime ${runtimeVersion}`}
          actions={
            <IconButton
              aria-label="Refresh releases"
              onClick={fetchReleases}
              variant="solid"
              colorScheme="gray"
              size="sm"
              icon={<FiRefreshCw />}
            />
          }
        />

        <Link
          as={NextLink}
          href="/releases"
          display="inline-flex"
          alignItems="center"
          gap={2}
          color="muted"
          fontSize="sm"
          mb={6}>
          <FiArrowLeft /> All runtime versions
        </Link>

        {!loading && !error && metrics && (
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={8}>
            {(
              [
                ['iOS installations offered', metrics.iosInstalls],
                ['Android installations offered', metrics.androidInstalls],
                ['Releases published', releases.length],
                ['Unique installations offered this month', metrics.uniqueInstallsThisMonth],
              ] as const
            ).map(([label, value]) => (
              <Box
                key={label}
                bg="panel"
                border="1px solid"
                borderColor="line"
                borderRadius="14px"
                p={5}>
                <Text color="muted" fontSize="sm">
                  {label}
                </Text>
                <Text fontFamily="mono" fontSize="2xl" mt={2}>
                  {value.toLocaleString()}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        )}

        {!loading && !error && activeRelease && (
          <Box bg="panel" border="1px solid" borderColor="line" borderRadius="14px" p={5} mb={6}>
            <Flex align="center" gap={2} color="verified.text" fontSize="xs" mb={3}>
              <Box boxSize="6px" borderRadius="full" bg="verified.dot" />
              Live OTA
            </Flex>
            <Flex gap={{ base: 4, md: 10 }} wrap="wrap" align="start">
              <Box>
                <Text color="muted" fontSize="xs">
                  Commit
                </Text>
                <Box mt={1} fontFamily="mono" fontSize="sm">
                  <CommitHash
                    hash={activeRelease.commitHash}
                    repositoryUrl={activeRelease.repositoryUrl}
                  />
                </Box>
              </Box>
              <Box minW={0}>
                <Text color="muted" fontSize="xs">
                  Update ID
                </Text>
                <Text mt={1} fontFamily="mono" fontSize="xs" wordBreak="break-all">
                  {servedUpdateId(activeRelease) || 'Unavailable'}
                </Text>
              </Box>
              <Box>
                <Text color="muted" fontSize="xs">
                  Published
                </Text>
                <Text mt={1} fontSize="sm">
                  {formatWatTimestamp(activeRelease.timestamp)}
                </Text>
              </Box>
            </Flex>
            {activePublication?.kind === 'rollback' && (
              <Text fontSize="sm" color="muted" mt={4}>
                Rolled back to this on {historyDate(activePublication.publishedAt)}, away from{' '}
                {releaseLink(
                  activePublication.rolledBackFromReleaseId,
                  activePublication.rolledBackFromCommitHash
                )}
                .
              </Text>
            )}
          </Box>
        )}

        {loading && <LoadingSpinner py={24} />}
        {error && (
          <Text color="primary.300" fontSize="sm">
            Couldn't load this runtime. Please refresh.
          </Text>
        )}

        {!loading && !error && sortedReleases.length === 0 && (
          <Box bg="panel" border="1px solid" borderColor="line" borderRadius="14px" p={8}>
            <Text fontWeight={600}>No OTA releases for this runtime</Text>
          </Box>
        )}

        {!loading && !error && sortedReleases.length > 0 && (
          <Box
            bg="panel"
            border="1px solid"
            borderColor="line"
            borderRadius="14px"
            overflowX="auto">
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Release</Th>
                  <Th>Commit</Th>
                  <Th>Message</Th>
                  <Th>Published</Th>
                  <Th isNumeric>Size</Th>
                  <Th />
                </Tr>
              </Thead>
              <Tbody>
                {sortedReleases.map((release) => (
                  <Fragment key={release.id}>
                    <Tr
                      id={`release-row-${release.id}`}
                      transition="background .15s"
                      _hover={{ bg: 'rgba(255,255,255,.02)' }}
                      _last={{ td: { borderBottom: 'none' } }}>
                      <Td>
                        <Tooltip label={release.path}>
                          <Button
                            variant="link"
                            color="white"
                            fontFamily="mono"
                            fontSize="xs"
                            fontWeight="normal"
                            maxW="12rem"
                            rightIcon={<FiChevronDown />}
                            iconSpacing={2}
                            aria-expanded={expandedReleaseId === release.id}
                            aria-controls={`release-metrics-${release.id}`}
                            onClick={() => toggleRelease(release.id)}
                            sx={{
                              svg: {
                                transform:
                                  expandedReleaseId === release.id ? 'rotate(180deg)' : 'none',
                              },
                            }}>
                            <Text as="span" isTruncated>
                              {release.path.split('/').pop()}
                            </Text>
                          </Button>
                        </Tooltip>
                      </Td>
                      <Td>
                        <Tooltip label={release.commitHash} isDisabled={!release.commitHash}>
                          <Box as="span" display="inline-block">
                            <CommitHash
                              hash={release.commitHash}
                              repositoryUrl={release.repositoryUrl}
                              fontFamily="mono"
                              fontSize="xs"
                              color="muted"
                            />
                          </Box>
                        </Tooltip>
                      </Td>
                      <Td>
                        <Tooltip label={release.commitMessage} isDisabled={!release.commitMessage}>
                          <Text isTruncated maxW="16rem">
                            {release.commitMessage || '—'}
                          </Text>
                        </Tooltip>
                      </Td>
                      <Td whiteSpace="nowrap" color="muted">
                        {formatWatTimestamp(release.timestamp, 'MMM D, HH:mm')}
                        {release.publications.some(({ kind }) => kind === 'rollback') && (
                          <Tooltip
                            label={`Rolled back to on ${release.publications
                              .filter(({ kind }) => kind === 'rollback')
                              .map(({ publishedAt }) => historyDate(publishedAt))
                              .join(', ')}`}>
                            <Box
                              as="span"
                              display="inline-flex"
                              verticalAlign="middle"
                              ml={2}
                              color="muted"
                              aria-label="Rolled back to">
                              <FiRotateCcw size={12} />
                            </Box>
                          </Tooltip>
                        )}
                      </Td>
                      <Td
                        isNumeric
                        fontFamily="mono"
                        fontSize="xs"
                        color="muted"
                        whiteSpace="nowrap">
                        {formatFileSize(release.size)}
                      </Td>
                      <Td textAlign="right">
                        {release.status === 'active' ? (
                          <Flex
                            display="inline-flex"
                            align="center"
                            gap={2}
                            px={2.5}
                            h="26px"
                            borderRadius="full"
                            bg="verified.bg"
                            border="1px solid"
                            borderColor="verified.border"
                            color="verified.text"
                            fontSize="xs"
                            fontWeight={500}>
                            <Box boxSize="6px" borderRadius="full" bg="verified.dot" />
                            Live
                          </Flex>
                        ) : (
                          <Button
                            variant="outline"
                            size="xs"
                            h="26px"
                            px={2.5}
                            color="warning.text"
                            borderColor="rgba(224,180,0,.45)"
                            leftIcon={<FiRotateCcw />}
                            _hover={{ bg: 'warning.hover', borderColor: 'warning.border' }}
                            _active={{ bg: 'warning.hover' }}
                            onClick={() => openRollback(release)}>
                            Roll back
                          </Button>
                        )}
                      </Td>
                    </Tr>
                    {expandedReleaseId === release.id && (
                      <Tr>
                        <Td colSpan={6} bg="field" px={{ base: 4, md: 6 }} py={5}>
                          <Box id={`release-metrics-${release.id}`}>
                            {release.publications.length === 0 ? (
                              <Text color="muted" fontSize="xs" mb={4}>
                                Update ID:{' '}
                                <Text
                                  as="span"
                                  color="white"
                                  fontFamily="mono"
                                  wordBreak="break-all">
                                  {release.updateId || 'Unavailable'}
                                </Text>
                              </Text>
                            ) : (
                              <Box mb={6} maxW="44rem">
                                <Box
                                  as="ol"
                                  listStyleType="none"
                                  ml="3px"
                                  pl={5}
                                  borderLeft="1px solid"
                                  borderColor="line">
                                  {historyFor(release).map((event, index) => {
                                    const live =
                                      release.status === 'active' &&
                                      event.kind !== 'replaced' &&
                                      event.publication === release.publications[0];
                                    return (
                                      <Box
                                        as="li"
                                        key={`${event.kind}-${event.at}-${index}`}
                                        position="relative"
                                        _notLast={{ pb: 4 }}>
                                        <Box
                                          position="absolute"
                                          left="calc(-1.25rem - 4px)"
                                          top="7px"
                                          boxSize="7px"
                                          borderRadius="full"
                                          bg={
                                            live
                                              ? 'verified.dot'
                                              : event.kind === 'publish'
                                              ? 'muted'
                                              : 'warning.border'
                                          }
                                          boxShadow="0 0 0 3px var(--chakra-colors-field)"
                                        />
                                        <Text fontSize="sm">
                                          {event.kind === 'publish' && (
                                            <>Published on {historyDate(event.at)}</>
                                          )}
                                          {event.kind === 'rollback' && (
                                            <>
                                              Rolled back to this on {historyDate(event.at)}, away
                                              from{' '}
                                              {releaseLink(
                                                event.publication.rolledBackFromReleaseId,
                                                event.publication.rolledBackFromCommitHash
                                              )}
                                            </>
                                          )}
                                          {event.kind === 'replaced' && (
                                            <Text as="span" color="muted">
                                              Rolled back away from this on {historyDate(event.at)},
                                              to{' '}
                                              {releaseLink(
                                                event.byRelease?.id ?? null,
                                                event.byRelease?.commitHash ?? null
                                              )}
                                            </Text>
                                          )}
                                          {live && (
                                            <Text as="span" color="verified.text" ml={2}>
                                              Live
                                            </Text>
                                          )}
                                        </Text>
                                        {event.kind !== 'replaced' && (
                                          <Text
                                            color="muted"
                                            fontFamily="mono"
                                            fontSize="xs"
                                            mt={1}
                                            wordBreak="break-all">
                                            {event.publication.updateId}
                                          </Text>
                                        )}
                                      </Box>
                                    );
                                  })}
                                </Box>
                                {release.status === 'inactive' && (
                                  <Text color="muted" fontSize="xs" mt={4}>
                                    Phones aren’t offered this release now.{' '}
                                    <Button
                                      variant="link"
                                      fontSize="inherit"
                                      fontWeight="normal"
                                      color="warning.text"
                                      verticalAlign="baseline"
                                      onClick={() => openRollback(release)}>
                                      Roll back to it
                                    </Button>{' '}
                                    to make it Live again. Phones get it as a new update.
                                  </Text>
                                )}
                              </Box>
                            )}
                            {releaseMetrics[release.id]?.loading && (
                              <Text color="muted" fontSize="sm">
                                Loading metrics…
                              </Text>
                            )}
                            {releaseMetrics[release.id]?.error && (
                              <Button
                                size="sm"
                                variant="ghost"
                                colorScheme="gray"
                                onClick={() => toggleRelease(release.id, true)}>
                                Couldn’t load metrics. Try again.
                              </Button>
                            )}
                            {releaseMetrics[release.id]?.rows && (
                              <Box overflowX="auto">
                                <Table size="sm" variant="simple">
                                  <Thead>
                                    <Tr>
                                      <Th>Platform</Th>
                                      <Th isNumeric>Unique installations offered</Th>
                                      <Th isNumeric>Manifest requests</Th>
                                      <Th isNumeric>Download attempts</Th>
                                      <Th isNumeric>Asset requests</Th>
                                      <Th isNumeric>Bytes transferred</Th>
                                      <Th isNumeric>
                                        <Tooltip label="Installations where this release crashed before its first screen, so the phone went back to its previous version.">
                                          Failed launches
                                        </Tooltip>
                                      </Th>
                                    </Tr>
                                  </Thead>
                                  <Tbody>
                                    {releaseMetrics[release.id].rows?.map((row) => (
                                      <Tr
                                        key={row.platform}
                                        _last={{ td: { borderBottom: 'none' } }}>
                                        <Td>{row.platform === 'ios' ? 'iOS' : 'Android'}</Td>
                                        <Td isNumeric fontFamily="mono">
                                          {row.uniqueInstallations.toLocaleString()}
                                        </Td>
                                        <Td isNumeric fontFamily="mono">
                                          {row.manifestRequests.toLocaleString()}
                                        </Td>
                                        <Td isNumeric fontFamily="mono">
                                          {row.downloadAttempts.toLocaleString()}
                                        </Td>
                                        <Td isNumeric fontFamily="mono">
                                          {row.assetRequests.toLocaleString()}
                                        </Td>
                                        <Td isNumeric fontFamily="mono">
                                          {formatFileSize(row.bytesTransferred)}
                                        </Td>
                                        <Td
                                          isNumeric
                                          fontFamily="mono"
                                          color={
                                            row.failedLaunches > 0 ? 'warning.text' : undefined
                                          }>
                                          {row.failedLaunches.toLocaleString()}
                                        </Td>
                                      </Tr>
                                    ))}
                                  </Tbody>
                                </Table>
                              </Box>
                            )}
                          </Box>
                        </Td>
                      </Tr>
                    )}
                  </Fragment>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        <AlertDialog
          isOpen={isOpen}
          leastDestructiveRef={cancelRef}
          onClose={() => setIsOpen(false)}
          isCentered>
          <AlertDialogOverlay>
            <AlertDialogContent mx={4}>
              <AlertDialogHeader fontSize="lg" fontWeight={600}>
                Roll back to this release?
              </AlertDialogHeader>

              <AlertDialogBody>
                {previewLoading && <LoadingSpinner py={8} />}
                {previewError && <Text color="warning.text">{previewError}</Text>}
                {rollbackPreview && (
                  <Box>
                    <Text fontSize="sm" color="muted" mb={3}>
                      Runtime{' '}
                      <Text as="span" fontFamily="mono" color="white">
                        {rollbackPreview.runtimeVersion}
                      </Text>
                    </Text>
                    {(
                      [
                        ['Live now', rollbackPreview.current, rollbackPreview.current.updateId],
                        ['Roll back to', rollbackPreview.target, 'new ID on roll back'],
                      ] as const
                    ).map(([label, release, updateId]) => (
                      <Box
                        key={label}
                        bg="field"
                        border="1px solid"
                        borderColor="line"
                        borderRadius="10px"
                        px={4}
                        py={3}
                        mb={3}>
                        <Text fontSize="xs" color="muted" mb={2}>
                          {label}
                        </Text>
                        <Text fontSize="xs" fontFamily="mono" wordBreak="break-all">
                          Commit: {release.commitHash || 'unknown'}
                        </Text>
                        <Text fontSize="xs" fontFamily="mono" wordBreak="break-all">
                          Update ID: {updateId || 'unavailable'}
                        </Text>
                        <Text fontSize="xs" color="muted" mt={1}>
                          Published: {formatWatTimestamp(release.timestamp)}
                        </Text>
                      </Box>
                    ))}
                    <Text fontSize="sm" mb={3}>
                      Phones receive this bundle as a new update on their next update check and run
                      it the next time the app starts from closed. An open app keeps its current
                      bundle until then.
                    </Text>
                    <Text fontSize="sm">
                      Estimated affected installations:{' '}
                      <Text as="span" fontFamily="mono">
                        {rollbackPreview.estimatedAffectedInstallations}
                      </Text>
                    </Text>
                    <Text fontSize="xs" color="muted">
                      Based on tracked installations of the current release.
                    </Text>
                    <Text
                      fontSize="sm"
                      mt={2}
                      color={rollbackPreview.archiveAvailable ? 'verified.text' : 'warning.text'}>
                      Archive: {rollbackPreview.archiveAvailable ? 'Available' : 'Unavailable'}
                    </Text>
                    {rollbackPreview.blockedReason && (
                      <Box
                        mt={3}
                        bg="warning.bg"
                        border="1px solid"
                        borderColor="warning.border"
                        borderRadius="10px"
                        px={4}
                        py={3}
                        color="warning.text"
                        fontSize="sm">
                        {rollbackPreview.blockedReason}
                      </Box>
                    )}
                  </Box>
                )}
              </AlertDialogBody>

              <AlertDialogFooter gap={3}>
                <Button
                  ref={cancelRef}
                  variant="ghost"
                  colorScheme="gray"
                  onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button
                  colorScheme="primary"
                  isLoading={isRollingBack}
                  isDisabled={
                    previewLoading || !rollbackPreview || Boolean(rollbackPreview.blockedReason)
                  }
                  onClick={rollBack}>
                  Roll back
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>
      </Layout>
    </ProtectedRoute>
  );
}
