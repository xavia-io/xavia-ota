import { Flex, Heading } from '@chakra-ui/react';

export default function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <Flex align="center" justify="space-between" gap={4} mb={8} wrap="wrap">
      <Heading as="h1" fontSize={{ base: '2xl', md: '3xl' }}>
        {title}
      </Heading>
      {actions}
    </Flex>
  );
}
