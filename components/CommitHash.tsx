import { ChakraProps, Link, Text } from '@chakra-ui/react';

export default function CommitHash({
  hash,
  repositoryUrl,
  ...props
}: { hash: string | null; repositoryUrl: string | null } & ChakraProps) {
  if (!hash) {
    return <Text {...props}>—</Text>;
  }
  if (!repositoryUrl) {
    return (
      <Text title={hash} {...props}>
        {hash.slice(0, 7)}
      </Text>
    );
  }
  return (
    <Link
      href={`${repositoryUrl}/commit/${hash}`}
      isExternal
      aria-label={`Open commit ${hash} on GitHub`}
      textDecoration="underline"
      textDecorationColor="rgba(255,255,255,.2)"
      textUnderlineOffset="3px"
      transition="color .15s, text-decoration-color .15s"
      _hover={{ color: 'white', textDecorationColor: 'primary.500' }}
      {...props}>
      {hash.slice(0, 7)}
    </Link>
  );
}
