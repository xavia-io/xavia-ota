import {
  Card,
  CardHeader,
  Heading,
  CardBody,
  Box,
  Text,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Grid,
  GridItem,
  Divider,
  HStack,
  Icon,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import { useEffect, useState } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import { FiDownload, FiPackage, FiTrendingUp } from 'react-icons/fi';
import { SiAndroid, SiApple } from 'react-icons/si';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface TimeBasedStats {
  total: number;
  ios: number;
  android: number;
}

interface StatsResponse {
  today: TimeBasedStats;
  thisWeek: TimeBasedStats;
  thisMonth: TimeBasedStats;
  allTime: TimeBasedStats;
  totalReleases: number;
}

interface DailyData {
  date: string;
  ios: number;
  android: number;
  total: number;
}

interface PlatformData {
  name: string;
  value: number;
  color: string;
}

interface ChartDataResponse {
  dailyDownloads: DailyData[];
  platformDistribution: PlatformData[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [chartData, setChartData] = useState<ChartDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const chartBg = useColorModeValue('white', 'gray.800');

  const fetchData = async () => {
    try {
      const [statsResponse, chartResponse] = await Promise.all([
        fetch('/api/tracking/stats'),
        fetch('/api/tracking/chart-data'),
      ]);

      const statsData = (await statsResponse.json()) as StatsResponse;
      const chartsData = (await chartResponse.json()) as ChartDataResponse;

      setStats(statsData);
      setChartData(chartsData);
    } catch (error) {
      console.error('Failed to fetch tracking data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!stats) {
    return (
      <ProtectedRoute>
        <Layout alignItems="center">
          <Text>Failed to load statistics</Text>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout alignItems="center">
        <Box w="full" maxW="1400px" px={4}>
          <VStack spacing={6} align="stretch">
            <Box>
              <Heading size="lg" mb={2}>
                Dashboard
              </Heading>
              <Text color="gray.500">Application download statistics</Text>
            </Box>

            <Grid
              templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }}
              gap={4}>
              <GridItem>
                <Card
                  bg="blue.500"
                  color="white"
                  shadow="lg"
                  _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
                  transition="all 0.2s">
                  <CardBody>
                    <HStack justify="space-between" mb={2}>
                      <Icon as={FiPackage} boxSize={8} />
                      <Box bg="whiteAlpha.300" p={2} borderRadius="lg" backdropFilter="blur(10px)">
                        <Icon as={FiTrendingUp} boxSize={5} />
                      </Box>
                    </HStack>
                    <Stat>
                      <StatLabel fontSize="sm" fontWeight="medium" opacity={0.9}>
                        Total Releases
                      </StatLabel>
                      <StatNumber fontSize="3xl" fontWeight="bold">
                        {stats.totalReleases}
                      </StatNumber>
                      <StatHelpText color="whiteAlpha.900" mb={0}>
                        Active versions
                      </StatHelpText>
                    </Stat>
                  </CardBody>
                </Card>
              </GridItem>

              <GridItem>
                <Card
                  bg="purple.500"
                  color="white"
                  shadow="lg"
                  _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
                  transition="all 0.2s">
                  <CardBody>
                    <HStack justify="space-between" mb={2}>
                      <Icon as={FiDownload} boxSize={8} />
                      <Box bg="whiteAlpha.300" p={2} borderRadius="lg" backdropFilter="blur(10px)">
                        <Icon as={FiTrendingUp} boxSize={5} />
                      </Box>
                    </HStack>
                    <Stat>
                      <StatLabel fontSize="sm" fontWeight="medium" opacity={0.9}>
                        All Time
                      </StatLabel>
                      <StatNumber fontSize="3xl" fontWeight="bold">
                        {stats.allTime.total.toLocaleString()}
                      </StatNumber>
                      <StatHelpText color="whiteAlpha.900" mb={0}>
                        Total downloads
                      </StatHelpText>
                    </Stat>
                  </CardBody>
                </Card>
              </GridItem>

              <GridItem>
                <Card
                  bg="green.500"
                  color="white"
                  shadow="lg"
                  _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
                  transition="all 0.2s">
                  <CardBody>
                    <HStack justify="space-between" mb={2}>
                      <Icon as={SiApple} boxSize={8} />
                      <Box bg="whiteAlpha.300" p={2} borderRadius="lg" backdropFilter="blur(10px)">
                        <Text fontSize="xs" fontWeight="bold">
                          iOS
                        </Text>
                      </Box>
                    </HStack>
                    <Stat>
                      <StatLabel fontSize="sm" fontWeight="medium" opacity={0.9}>
                        iOS Downloads
                      </StatLabel>
                      <StatNumber fontSize="3xl" fontWeight="bold">
                        {stats.allTime.ios.toLocaleString()}
                      </StatNumber>
                      <StatHelpText color="whiteAlpha.900" mb={0}>
                        {((stats.allTime.ios / stats.allTime.total) * 100).toFixed(1)}% ratio
                      </StatHelpText>
                    </Stat>
                  </CardBody>
                </Card>
              </GridItem>

              <GridItem>
                <Card
                  bg="teal.500"
                  color="white"
                  shadow="lg"
                  _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
                  transition="all 0.2s">
                  <CardBody>
                    <HStack justify="space-between" mb={2}>
                      <Icon as={SiAndroid} boxSize={8} />
                      <Box bg="whiteAlpha.300" p={2} borderRadius="lg" backdropFilter="blur(10px)">
                        <Text fontSize="xs" fontWeight="bold">
                          AND
                        </Text>
                      </Box>
                    </HStack>
                    <Stat>
                      <StatLabel fontSize="sm" fontWeight="medium" opacity={0.9}>
                        Android Downloads
                      </StatLabel>
                      <StatNumber fontSize="3xl" fontWeight="bold">
                        {stats.allTime.android.toLocaleString()}
                      </StatNumber>
                      <StatHelpText color="whiteAlpha.900" mb={0}>
                        {((stats.allTime.android / stats.allTime.total) * 100).toFixed(1)}% ratio
                      </StatHelpText>
                    </Stat>
                  </CardBody>
                </Card>
              </GridItem>
            </Grid>

            <Grid templateColumns={{ base: '1fr', lg: 'repeat(3, 1fr)' }} gap={4}>
              <GridItem>
                <Card shadow="md" borderWidth="1px">
                  <CardHeader pb={2}>
                    <HStack>
                      <Icon as={FiDownload} color="orange.500" boxSize={5} />
                      <Heading size="md">Today</Heading>
                    </HStack>
                  </CardHeader>
                  <Divider />
                  <CardBody>
                    <VStack spacing={3} align="stretch">
                      <Box>
                        <Text fontSize="sm" color="gray.600" mb={1}>
                          Total Downloads
                        </Text>
                        <Text fontSize="2xl" fontWeight="bold" color="orange.600">
                          {stats.today.total.toLocaleString()}
                        </Text>
                      </Box>
                      <HStack justify="space-between">
                        <HStack>
                          <Icon as={SiApple} color="gray.600" />
                          <Text fontSize="sm" color="gray.600">
                            iOS
                          </Text>
                        </HStack>
                        <Text fontSize="lg" fontWeight="semibold">
                          {stats.today.ios.toLocaleString()}
                        </Text>
                      </HStack>
                      <HStack justify="space-between">
                        <HStack>
                          <Icon as={SiAndroid} color="gray.600" />
                          <Text fontSize="sm" color="gray.600">
                            Android
                          </Text>
                        </HStack>
                        <Text fontSize="lg" fontWeight="semibold">
                          {stats.today.android.toLocaleString()}
                        </Text>
                      </HStack>
                    </VStack>
                  </CardBody>
                </Card>
              </GridItem>

              <GridItem>
                <Card shadow="md" borderWidth="1px">
                  <CardHeader pb={2}>
                    <HStack>
                      <Icon as={FiDownload} color="blue.500" boxSize={5} />
                      <Heading size="md">This Week</Heading>
                    </HStack>
                  </CardHeader>
                  <Divider />
                  <CardBody>
                    <VStack spacing={3} align="stretch">
                      <Box>
                        <Text fontSize="sm" color="gray.600" mb={1}>
                          Total Downloads
                        </Text>
                        <Text fontSize="2xl" fontWeight="bold" color="blue.600">
                          {stats.thisWeek.total.toLocaleString()}
                        </Text>
                      </Box>
                      <HStack justify="space-between">
                        <HStack>
                          <Icon as={SiApple} color="gray.600" />
                          <Text fontSize="sm" color="gray.600">
                            iOS
                          </Text>
                        </HStack>
                        <Text fontSize="lg" fontWeight="semibold">
                          {stats.thisWeek.ios.toLocaleString()}
                        </Text>
                      </HStack>
                      <HStack justify="space-between">
                        <HStack>
                          <Icon as={SiAndroid} color="gray.600" />
                          <Text fontSize="sm" color="gray.600">
                            Android
                          </Text>
                        </HStack>
                        <Text fontSize="lg" fontWeight="semibold">
                          {stats.thisWeek.android.toLocaleString()}
                        </Text>
                      </HStack>
                    </VStack>
                  </CardBody>
                </Card>
              </GridItem>

              <GridItem>
                <Card shadow="md" borderWidth="1px">
                  <CardHeader pb={2}>
                    <HStack>
                      <Icon as={FiDownload} color="purple.500" boxSize={5} />
                      <Heading size="md">This Month</Heading>
                    </HStack>
                  </CardHeader>
                  <Divider />
                  <CardBody>
                    <VStack spacing={3} align="stretch">
                      <Box>
                        <Text fontSize="sm" color="gray.600" mb={1}>
                          Total Downloads
                        </Text>
                        <Text fontSize="2xl" fontWeight="bold" color="purple.600">
                          {stats.thisMonth.total.toLocaleString()}
                        </Text>
                      </Box>
                      <HStack justify="space-between">
                        <HStack>
                          <Icon as={SiApple} color="gray.600" />
                          <Text fontSize="sm" color="gray.600">
                            iOS
                          </Text>
                        </HStack>
                        <Text fontSize="lg" fontWeight="semibold">
                          {stats.thisMonth.ios.toLocaleString()}
                        </Text>
                      </HStack>
                      <HStack justify="space-between">
                        <HStack>
                          <Icon as={SiAndroid} color="gray.600" />
                          <Text fontSize="sm" color="gray.600">
                            Android
                          </Text>
                        </HStack>
                        <Text fontSize="lg" fontWeight="semibold">
                          {stats.thisMonth.android.toLocaleString()}
                        </Text>
                      </HStack>
                    </VStack>
                  </CardBody>
                </Card>
              </GridItem>
            </Grid>

            {chartData && (
              <Grid templateColumns={{ base: '1fr', lg: 'repeat(2, 1fr)' }} gap={4}>
                <GridItem>
                  <Card shadow="md" borderWidth="1px" bg={chartBg}>
                    <CardHeader>
                      <HStack>
                        <Icon as={FiTrendingUp} color="blue.500" boxSize={5} />
                        <Heading size="md">Last 7 Days Downloads</Heading>
                      </HStack>
                    </CardHeader>
                    <Divider />
                    <CardBody>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={chartData.dailyDownloads}>
                          <defs>
                            <linearGradient id="colorIos" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#48BB78" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#48BB78" stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id="colorAndroid" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#38B2AC" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#38B2AC" stopOpacity={0.1} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="date" style={{ fontSize: '12px' }} />
                          <YAxis style={{ fontSize: '12px' }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(255, 255, 255, 0.95)',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px',
                              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                            }}
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="ios"
                            stroke="#48BB78"
                            fillOpacity={1}
                            fill="url(#colorIos)"
                            name="iOS"
                          />
                          <Area
                            type="monotone"
                            dataKey="android"
                            stroke="#38B2AC"
                            fillOpacity={1}
                            fill="url(#colorAndroid)"
                            name="Android"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardBody>
                  </Card>
                </GridItem>

                <GridItem>
                  <Card shadow="md" borderWidth="1px" bg={chartBg}>
                    <CardHeader>
                      <HStack>
                        <Icon as={FiPackage} color="purple.500" boxSize={5} />
                        <Heading size="md">Platform Distribution</Heading>
                      </HStack>
                    </CardHeader>
                    <Divider />
                    <CardBody>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={chartData.platformDistribution}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value">
                            {chartData.platformDistribution.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(255, 255, 255, 0.95)',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px',
                              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                            }}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardBody>
                  </Card>
                </GridItem>
              </Grid>
            )}
          </VStack>
        </Box>
      </Layout>
    </ProtectedRoute>
  );
}
